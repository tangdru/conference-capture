import AVFoundation
import Capacitor
import Speech

/// Native counterpart of src/hooks/useAmbientTranscription.ts: records the
/// room continuously and transcribes it with Apple's Speech framework instead
/// of the web build's WASM Whisper worker. Segments are cut at natural pauses
/// in speech (or after a minute without one), and emitted to JS as `segment`
/// events with the same shape as the web hook's (text, absolute start time,
/// duration). While a segment is still being heard, its words so far are sent
/// as `partial` events so the app can show transcription as it happens. The `audio` background mode
/// in Info.plist keeps capture running while the phone is locked.
@objc(AmbientTranscriptionPlugin)
public class AmbientTranscriptionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AmbientTranscriptionPlugin"
    public let jsName = "AmbientTranscription"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    // A segment ends once the speaker pauses this long, as long as it's at
    // least minSegmentSeconds old (so a quick "yes." doesn't become its own
    // entry), and always by maxSegmentSeconds so nothing long goes unsaved.
    private static let pauseSeconds: TimeInterval = 1.8
    private static let minSegmentSeconds: TimeInterval = 8
    private static let maxSegmentSeconds: TimeInterval = 60
    private static let boundaryCheckSeconds: TimeInterval = 0.5
    // Safety cap on how long stop() waits for the trailing segment's result
    // before releasing the mic anyway -- mirrors FLUSH_TIMEOUT_MS on web.
    private static let flushTimeoutSeconds: TimeInterval = 15

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var segmentTimer: Timer?
    private var running = false

    // The tap callback runs on an audio thread and appends to whichever
    // request is current, so swaps of `currentRequest` go through this lock.
    private let requestLock = NSLock()
    private var currentRequest: SFSpeechAudioBufferRecognitionRequest?
    // Main-thread state for the current segment's pause detection.
    private var segmentStartedAt = Date()
    private var lastTextChangeAt: Date?
    private var currentText = ""
    // Segments whose audio has ended but whose final result hasn't arrived.
    private var inFlight = 0
    private var stopWaiters: [() -> Void] = []
    // A failing recognizer (e.g. the on-device model isn't installed) fails
    // every segment the same way -- tell JS once per run, not every 30s.
    private var reportedFailure = false
    // kAFAssistantErrorDomain 1110: "No speech detected" -- just a silent segment.
    private static let noSpeechErrorCode = 1110

    @objc func start(_ call: CAPPluginCall) {
        if running {
            call.resolve()
            return
        }
        requestPermissions { [weak self] error in
            guard let self else { return }
            if let error {
                call.reject(error)
                return
            }
            DispatchQueue.main.async {
                do {
                    try self.beginCapture()
                    call.resolve()
                } catch {
                    self.teardown()
                    call.reject("Couldn’t start the microphone: \(error.localizedDescription)")
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.running else {
                call.resolve()
                return
            }
            self.running = false
            self.segmentTimer?.invalidate()
            self.segmentTimer = nil
            self.audioEngine.inputNode.removeTap(onBus: 0)
            self.audioEngine.stop()
            // Flush the trailing partial segment through recognition instead
            // of dropping it, then release the audio session once it's back.
            self.finishCurrentSegment(startNext: false)

            var settled = false
            let settle = {
                if settled { return }
                settled = true
                self.teardown()
                call.resolve()
            }
            if self.inFlight == 0 {
                settle()
            } else {
                self.stopWaiters.append(settle)
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.flushTimeoutSeconds, execute: settle)
            }
        }
    }

    private func requestPermissions(_ completion: @escaping (String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                completion("Speech recognition permission was denied — enable it in Settings.")
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                completion(granted ? nil : "Microphone permission was denied — enable it in Settings.")
            }
        }
    }

    private func beginCapture() throws {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), recognizer.isAvailable else {
            throw NSError(domain: "AmbientTranscription", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Speech recognition isn’t available on this device.",
            ])
        }
        self.recognizer = recognizer
        reportedFailure = false

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.requestLock.lock()
            self.currentRequest?.append(buffer)
            self.requestLock.unlock()
        }
        audioEngine.prepare()
        try audioEngine.start()
        running = true

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification, object: session)

        startSegment()
        segmentTimer = Timer.scheduledTimer(withTimeInterval: Self.boundaryCheckSeconds, repeats: true) { [weak self] _ in
            self?.checkSegmentBoundary()
        }
    }

    /// Cuts the segment at a pause in speech, or once it hits the max length.
    private func checkSegmentBoundary() {
        requestLock.lock()
        let hasRequest = currentRequest != nil
        requestLock.unlock()
        guard running, hasRequest else { return }

        let now = Date()
        let age = now.timeIntervalSince(segmentStartedAt)
        let paused = lastTextChangeAt.map { now.timeIntervalSince($0) >= Self.pauseSeconds } ?? false
        if age >= Self.maxSegmentSeconds || (paused && age >= Self.minSegmentSeconds) {
            finishCurrentSegment(startNext: true)
        }
    }

    private func handlePartial(_ text: String, for request: SFSpeechAudioBufferRecognitionRequest) {
        requestLock.lock()
        let isCurrent = currentRequest === request
        requestLock.unlock()
        // A finished segment can still report words after the next one began.
        guard isCurrent, !text.isEmpty, text != currentText else { return }
        currentText = text
        lastTextChangeAt = Date()
        notifyListeners("partial", data: ["text": text])
    }

    private func startSegment() {
        guard let recognizer else { return }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        if #available(iOS 16, *) {
            request.addsPunctuation = true
        }
        let startedAt = Date()
        segmentStartedAt = startedAt
        lastTextChangeAt = nil
        currentText = ""

        requestLock.lock()
        currentRequest = request
        requestLock.unlock()

        var reported = false
        recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self, !reported else { return }
            if let result, !result.isFinal, error == nil {
                let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                DispatchQueue.main.async { self.handlePartial(text, for: request) }
                return
            }
            guard error != nil || result?.isFinal == true else { return }
            reported = true
            let text = result?.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            // Silent segments and one-off failures are dropped -- ambient
            // transcription is best-effort, same as the web hook. A real
            // recognizer failure is surfaced once so it isn't invisible.
            if let error = error as NSError?, error.code != Self.noSpeechErrorCode {
                DispatchQueue.main.async {
                    guard !self.reportedFailure else { return }
                    self.reportedFailure = true
                    self.notifyListeners("error", data: [
                        "message": "Transcription isn’t working on this device (\(error.localizedDescription)). Notes and photos still save.",
                    ])
                }
            }
            if !text.isEmpty {
                // Whole milliseconds -- duration_ms is an integer column, and a
                // fractional value makes the insert fail.
                self.notifyListeners("segment", data: [
                    "text": text,
                    "startedAt": Int((startedAt.timeIntervalSince1970 * 1000).rounded()),
                    "durationMs": Int((Date().timeIntervalSince(startedAt) * 1000).rounded()),
                ])
            }
            DispatchQueue.main.async { self.segmentSettled() }
        }
    }

    /// Ends the current request's audio so its final result comes back, and
    /// (while still running) immediately starts the next segment so no audio
    /// falls between the two.
    private func finishCurrentSegment(startNext: Bool) {
        requestLock.lock()
        let finished = currentRequest
        currentRequest = nil
        requestLock.unlock()

        if let finished {
            inFlight += 1
            finished.endAudio()
        }
        if startNext && running {
            startSegment()
        }
    }

    private func segmentSettled() {
        inFlight = max(0, inFlight - 1)
        if inFlight == 0 && !running {
            let waiters = stopWaiters
            stopWaiters.removeAll()
            waiters.forEach { $0() }
        }
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw)
        else { return }
        DispatchQueue.main.async {
            guard self.running else { return }
            switch type {
            case .began:
                // A phone call etc. took the mic -- close out what we have.
                self.finishCurrentSegment(startNext: false)
            case .ended:
                do {
                    try AVAudioSession.sharedInstance().setActive(true)
                    if !self.audioEngine.isRunning { try self.audioEngine.start() }
                    self.startSegment()
                } catch {
                    self.notifyListeners("error", data: [
                        "message": "Recording stopped after an interruption — pause and resume the session to restart it.",
                    ])
                }
            @unknown default:
                break
            }
        }
    }

    private func teardown() {
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
        segmentTimer?.invalidate()
        segmentTimer = nil
        if audioEngine.isRunning {
            audioEngine.inputNode.removeTap(onBus: 0)
            audioEngine.stop()
        }
        requestLock.lock()
        currentRequest = nil
        requestLock.unlock()
        running = false
        recognizer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
