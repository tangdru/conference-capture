import AVFoundation
import Speech

/// Ambient transcription on Apple's long-form speech engine (SpeechAnalyzer,
/// iOS 26+), which AmbientTranscriptionPlugin prefers over SFSpeechRecognizer.
/// One analyzer runs for the whole recording -- no request restarts between
/// segments, so no audio falls in the gaps -- and its results are grouped
/// into the same `partial` / `segment` events the old engine produced:
/// segments end at a pause in speech once they're at least
/// `minSegmentSeconds` old, and always by `maxSegmentSeconds`.
@available(iOS 26.0, *)
final class SpeechAnalyzerTranscriber {
    struct Segment {
        let text: String
        let startedAt: Date
        let duration: TimeInterval
    }

    var onPartial: ((String) -> Void)?
    var onSegment: ((Segment) -> Void)?
    var onError: ((String) -> Void)?

    private static let pauseSeconds: TimeInterval = 1.8
    private static let minSegmentSeconds: TimeInterval = 8
    private static let maxSegmentSeconds: TimeInterval = 60
    private static let boundaryCheckSeconds: TimeInterval = 0.5
    private static let flushTimeoutSeconds: TimeInterval = 15

    private let audioEngine = AVAudioEngine()
    private var analyzer: SpeechAnalyzer?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var resultsTask: Task<Void, Never>?
    private var segmentTimer: Timer?

    // Audio thread only: converts the mic's format to the analyzer's.
    private var analyzerFormat: AVAudioFormat?
    private var converter: AVAudioConverter?

    // Main-thread segment state. `finalText` is what the engine has settled
    // on for this segment; `volatileText` its current guess at what follows.
    private var finalText = ""
    private var volatileText = ""
    private var segmentStartedAt: Date?
    private var lastTextChangeAt: Date?
    private var reportedFailure = false

    /// Throws if the engine can't run here (no model for the language, or it
    /// couldn't be downloaded) -- the caller falls back to the old engine.
    func start() async throws {
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else {
            throw Self.failure("English speech recognition isn’t supported on this device.")
        }
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        // The model ships separately from the OS; the first run downloads it.
        if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await install.downloadAndInstall()
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
        let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzer = analyzer
        self.inputBuilder = inputBuilder

        resultsTask = Task { [weak self] in
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                    let spoken = result.range.duration.seconds.isFinite ? result.range.duration.seconds : 0
                    let isFinal = result.isFinal
                    await MainActor.run { self?.handle(text: text, isFinal: isFinal, spokenSeconds: spoken) }
                }
            } catch {
                await MainActor.run { self?.report(error) }
            }
        }
        try await analyzer.start(inputSequence: inputSequence)

        try await MainActor.run { try self.startAudio() }
    }

    /// Stops listening, lets the engine finish what it has heard, and calls
    /// `completion` once the last segment has been emitted.
    func stop(completion: @escaping () -> Void) {
        segmentTimer?.invalidate()
        segmentTimer = nil
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        inputBuilder?.finish()

        var settled = false
        let settle = {
            if settled { return }
            settled = true
            self.emitSegment(includingVolatile: true)
            completion()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.flushTimeoutSeconds, execute: settle)
        Task {
            try? await analyzer?.finalizeAndFinishThroughEndOfInput()
            await resultsTask?.value
            await MainActor.run { settle() }
        }
    }

    /// A phone call or another app took the mic.
    func interruptionBegan() {
        emitSegment(includingVolatile: true)
    }

    func interruptionEnded() throws {
        try AVAudioSession.sharedInstance().setActive(true)
        if !audioEngine.isRunning { try audioEngine.start() }
    }

    // MARK: - Audio

    private func startAudio() throws {
        let input = audioEngine.inputNode
        input.installTap(onBus: 0, bufferSize: 4096, format: input.outputFormat(forBus: 0)) { [weak self] buffer, _ in
            guard let self, let converted = self.convert(buffer) else { return }
            self.inputBuilder?.yield(AnalyzerInput(buffer: converted))
        }
        audioEngine.prepare()
        try audioEngine.start()

        segmentTimer = Timer.scheduledTimer(withTimeInterval: Self.boundaryCheckSeconds, repeats: true) { [weak self] _ in
            self?.checkSegmentBoundary()
        }
    }

    private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let target = analyzerFormat else { return nil }
        if buffer.format == target { return buffer }
        if converter == nil || converter?.inputFormat != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: target)
            converter?.primeMethod = .none
        }
        guard let converter else { return nil }
        let ratio = target.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return nil }
        var supplied = false
        var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, inputStatus in
            if supplied {
                inputStatus.pointee = .noDataNow
                return nil
            }
            supplied = true
            inputStatus.pointee = .haveData
            return buffer
        }
        return status == .error || output.frameLength == 0 ? nil : output
    }

    // MARK: - Results into segments

    private func handle(text: String, isFinal: Bool, spokenSeconds: TimeInterval) {
        if segmentStartedAt == nil, !text.isEmpty {
            // Back-date to when this stretch of speech began.
            segmentStartedAt = Date().addingTimeInterval(-spokenSeconds)
        }
        if isFinal {
            if !text.isEmpty { finalText = finalText.isEmpty ? text : "\(finalText) \(text)" }
            volatileText = ""
        } else {
            volatileText = text
        }
        lastTextChangeAt = Date()
        let shown = [finalText, volatileText].filter { !$0.isEmpty }.joined(separator: " ")
        if !shown.isEmpty { onPartial?(shown) }
    }

    private func checkSegmentBoundary() {
        guard let startedAt = segmentStartedAt, !finalText.isEmpty else { return }
        let now = Date()
        let age = now.timeIntervalSince(startedAt)
        let paused = lastTextChangeAt.map { now.timeIntervalSince($0) >= Self.pauseSeconds } ?? false
        if age >= Self.maxSegmentSeconds || (paused && age >= Self.minSegmentSeconds) {
            emitSegment(includingVolatile: false)
        }
    }

    /// Sends what's settled as a segment. Words still being worked out carry
    /// over into the next one, unless this is the end of the recording.
    private func emitSegment(includingVolatile: Bool) {
        let text = (includingVolatile ? [finalText, volatileText] : [finalText])
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        if let startedAt = segmentStartedAt, !text.isEmpty {
            onSegment?(Segment(text: text, startedAt: startedAt, duration: Date().timeIntervalSince(startedAt)))
        }
        finalText = ""
        if includingVolatile { volatileText = "" }
        segmentStartedAt = volatileText.isEmpty ? nil : Date()
        lastTextChangeAt = nil
    }

    private func report(_ error: Error) {
        guard !reportedFailure else { return }
        reportedFailure = true
        onError?("Transcription isn’t working on this device (\(error.localizedDescription)). Notes and photos still save.")
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "AmbientTranscription", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
