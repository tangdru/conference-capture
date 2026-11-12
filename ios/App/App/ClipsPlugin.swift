import AVFoundation
import Capacitor

/// Audio clips. While a session listens, the last few minutes of the mic feed
/// sit in memory and are overwritten as they age; nothing reaches disk unless
/// the user taps. The clip button keeps the seconds before the tap and records
/// on for a set time (with a spare margin either side, for trimming), then
/// saves it as a small .m4a on the phone. Builds before 65 also saved one on
/// "Remember this" (`capture`), kept so those clips still play. The buffer is
/// wiped whenever listening stops.
final class ClipRecorder {
    static let shared = ClipRecorder()

    struct Clip {
        let id: String
        let sessionId: String
        let startedAt: Int
        let durationMs: Int
        let peaks: [Float]
        /// The part to keep, within the saved audio (which has spare either side).
        var trimStartMs: Int = 0
        var trimEndMs: Int? = nil

        var json: [String: Any] {
            var json: [String: Any] = ["id": id, "sessionId": sessionId, "startedAt": startedAt, "durationMs": durationMs, "peaks": peaks]
            json["trimStartMs"] = trimStartMs
            json["trimEndMs"] = trimEndMs ?? durationMs
            return json
        }
    }

    private static let sampleRate = 24_000.0
    private static let bufferSeconds = 120.0
    // A tap keeps recording for at most this long, and repeat taps can stretch
    // that to maxTailSeconds; the ring holds enough for both.
    private static let tailSeconds = 30.0
    private static let maxTailSeconds = 90.0
    private static let minTailSeconds = 1.0
    private static let pauseSeconds = 1.5
    // Long enough that a full stop the recognizer is about to revise doesn't end the clip.
    private static let sentenceSettleSeconds = 0.4
    private static let checkSeconds = 0.25
    private static let minClipSeconds = 0.5
    private static let peakCount = 48
    private static let maxGain: Float = 8

    private static let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)!

    static var directory: URL {
        let url = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Clips")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // Shared with the audio thread, under `lock`.
    private let lock = NSLock()
    private var capturing = false
    private var ring = [Float](repeating: 0, count: Int(sampleRate * (bufferSeconds + maxTailSeconds)))
    private var written = 0
    private var lastClipEnd = 0

    // Audio thread only.
    private var converter: AVAudioConverter?

    // Main thread only.
    private struct Waiting {
        let id: String
        let sessionId: String
        let startSample: Int
        let firstTapAt: Date
        var lastTapAt: Date
        var lastHeardAt: Date
        var heardMore: Bool
        let completion: (Clip?) -> Void
    }
    private var waiting: Waiting?
    private var lastText = ""
    private var timer: Timer?

    // A clip-button recording, main thread only.
    private struct Recording {
        let id: String
        let sessionId: String
        let startSample: Int
        let keepFromSample: Int
        let keepToSample: Int
        let endSample: Int
        let completion: (Clip?) -> Void
    }
    private var recording: Recording?
    private var recordTimer: Timer?

    var isCapturing: Bool {
        lock.lock()
        defer { lock.unlock() }
        return capturing
    }

    func begin() {
        lock.lock()
        capturing = true
        written = 0
        lastClipEnd = 0
        lock.unlock()
        DispatchQueue.main.async { self.lastText = "" }
    }

    /// Saves a clip still waiting for the end of the thought, then wipes the buffer.
    func end() {
        finish()
        finishRecording()
        lock.lock()
        capturing = false
        written = 0
        lock.unlock()
    }

    /// From the mic tap, on the audio thread.
    func append(_ buffer: AVAudioPCMBuffer) {
        guard isCapturing, let converted = convert(buffer), let samples = converted.floatChannelData?[0] else { return }
        let count = Int(converted.frameLength)
        lock.lock()
        for i in 0..<count {
            ring[(written + i) % ring.count] = samples[i]
        }
        written += count
        lock.unlock()
    }

    /// The transcript so far, on every update -- how the end of a thought is found.
    func heard(_ text: String) {
        if text != lastText, waiting != nil {
            waiting?.lastHeardAt = Date()
            waiting?.heardMore = true
        }
        lastText = text
    }

    /// `completion` gets nil when nothing was saved under this id: not
    /// listening, or the tap extended the clip already being recorded.
    func capture(id: String, sessionId: String, completion: @escaping (Clip?) -> Void) {
        lock.lock()
        let listening = capturing
        let start = max(written - Int(Self.sampleRate * Self.bufferSeconds), lastClipEnd, 0)
        lock.unlock()
        guard listening else {
            completion(nil)
            return
        }
        let now = Date()
        if waiting != nil {
            waiting?.lastTapAt = now
            waiting?.lastHeardAt = now
            waiting?.heardMore = false
            completion(nil)
            return
        }
        waiting = Waiting(
            id: id, sessionId: sessionId, startSample: start, firstTapAt: now, lastTapAt: now,
            lastHeardAt: now, heardMore: false, completion: completion)
        timer = Timer.scheduledTimer(withTimeInterval: Self.checkSeconds, repeats: true) { [weak self] _ in
            self?.checkForEndOfThought()
        }
    }

    /// The clip button: keeps `before` seconds already heard and records
    /// `after` more, plus `margin` spare on each side for trimming. Starting
    /// one while another is recording finishes that one first. `completion`
    /// gets nil when not listening (or nothing was heard).
    func record(id: String, sessionId: String, before: Double, after: Double, margin: Double,
                completion: @escaping (Clip?) -> Void) {
        finishRecording()
        lock.lock()
        let listening = capturing
        let tap = written
        let oldest = max(written - ring.count + Int(Self.sampleRate * (after + margin)), 0)
        lock.unlock()
        guard listening else {
            completion(nil)
            return
        }
        let start = max(tap - Int(Self.sampleRate * (before + margin)), oldest)
        recording = Recording(
            id: id, sessionId: sessionId, startSample: start,
            keepFromSample: max(tap - Int(Self.sampleRate * before), start),
            keepToSample: tap + Int(Self.sampleRate * after),
            endSample: tap + Int(Self.sampleRate * (after + margin)),
            completion: completion)
        recordTimer = Timer.scheduledTimer(withTimeInterval: Self.checkSeconds, repeats: true) { [weak self] _ in
            guard let self, let recording = self.recording else { return }
            self.lock.lock()
            let now = self.written
            self.lock.unlock()
            if now >= recording.endSample { self.finishRecording() }
        }
    }

    /// Ends the clip-button recording now (the stop tap, or listening ended).
    func finishRecording() {
        recordTimer?.invalidate()
        recordTimer = nil
        guard let recording else { return }
        self.recording = nil

        lock.lock()
        let end = min(written, recording.endSample)
        let start = max(recording.startSample, written - ring.count)
        var samples = [Float](repeating: 0, count: max(end - start, 0))
        for i in 0..<samples.count {
            samples[i] = ring[(start + i) % ring.count]
        }
        let behind = written - end
        lock.unlock()

        guard Double(samples.count) >= Self.sampleRate * Self.minClipSeconds else {
            recording.completion(nil)
            return
        }
        let ms = { (sample: Int) in Int((Double(sample) / Self.sampleRate * 1000).rounded()) }
        let trimStart = ms(max(recording.keepFromSample - start, 0))
        // Stopped early: keep up to the stop.
        let trimEnd = ms(min(recording.keepToSample, end) - start)
        let seconds = Double(samples.count + behind) / Self.sampleRate
        let startedAt = Int(((Date().timeIntervalSince1970 - seconds) * 1000).rounded())
        DispatchQueue.global(qos: .userInitiated).async {
            let clip = Self.save(samples, id: recording.id, sessionId: recording.sessionId, startedAt: startedAt,
                                 trimStartMs: trimStart, trimEndMs: trimEnd)
            DispatchQueue.main.async { recording.completion(clip) }
        }
    }

    var recordingId: String? { recording?.id }

    private func checkForEndOfThought() {
        guard let waiting else { return }
        let now = Date()
        let deadline = min(
            waiting.lastTapAt.addingTimeInterval(Self.tailSeconds),
            waiting.firstTapAt.addingTimeInterval(Self.maxTailSeconds))
        let quiet = now.timeIntervalSince(waiting.lastHeardAt)
        let sentenceEnded = waiting.heardMore
            && [".", "?", "!"].contains(where: lastText.hasSuffix)
            && quiet >= Self.sentenceSettleSeconds
        let settled = now.timeIntervalSince(waiting.lastTapAt) >= Self.minTailSeconds
        if now >= deadline || (settled && (sentenceEnded || quiet >= Self.pauseSeconds)) {
            finish()
        }
    }

    private func finish() {
        timer?.invalidate()
        timer = nil
        guard let waiting else { return }
        self.waiting = nil

        lock.lock()
        let end = written
        let start = max(waiting.startSample, end - ring.count)
        var samples = [Float](repeating: 0, count: max(end - start, 0))
        for i in 0..<samples.count {
            samples[i] = ring[(start + i) % ring.count]
        }
        lastClipEnd = end
        lock.unlock()

        guard Double(samples.count) >= Self.sampleRate * Self.minClipSeconds else {
            waiting.completion(nil)
            return
        }
        let seconds = Double(samples.count) / Self.sampleRate
        let startedAt = Int(((Date().timeIntervalSince1970 - seconds) * 1000).rounded())
        DispatchQueue.global(qos: .userInitiated).async {
            let clip = Self.save(samples, id: waiting.id, sessionId: waiting.sessionId, startedAt: startedAt)
            DispatchQueue.main.async { waiting.completion(clip) }
        }
    }

    private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        if converter == nil || converter?.inputFormat != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: Self.format)
            converter?.primeMethod = .none
            converter?.downmix = true
        }
        guard let converter else { return nil }
        let ratio = Self.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
        guard let output = AVAudioPCMBuffer(pcmFormat: Self.format, frameCapacity: capacity) else { return nil }
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

    // MARK: - Saved clips

    private static func save(_ raw: [Float], id: String, sessionId: String, startedAt: Int,
                             trimStartMs: Int = 0, trimEndMs: Int? = nil) -> Clip? {
        // The mic runs unprocessed for transcription, so a far-off speaker is
        // quiet: bring the clip up to a listenable level.
        let peak = raw.reduce(0) { max($0, abs($1)) }
        let gain = peak > 0 ? min(maxGain, 0.89 / peak) : 1
        let samples = raw.map { $0 * gain }

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { channel.update(from: $0.baseAddress!, count: samples.count) }

        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 48_000,
        ]
        do {
            // The file only finishes writing when this object is released.
            let file = try AVAudioFile(
                forWriting: audioURL(id), settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
            try file.write(from: buffer)
        } catch {
            return nil
        }

        let perBar = max(samples.count / peakCount, 1)
        let peaks = stride(from: 0, to: samples.count, by: perBar).prefix(peakCount).map { start in
            samples[start..<min(start + perBar, samples.count)].reduce(0) { max($0, abs($1)) }
        }
        let durationMs = Int((Double(samples.count) / sampleRate * 1000).rounded())
        let clip = Clip(
            id: id, sessionId: sessionId, startedAt: startedAt, durationMs: durationMs, peaks: peaks,
            trimStartMs: min(trimStartMs, durationMs), trimEndMs: trimEndMs.map { min($0, durationMs) })
        // Written last: its presence means the audio is complete.
        guard let data = try? JSONSerialization.data(withJSONObject: clip.json),
              (try? data.write(to: infoURL(id), options: .atomic)) != nil else { return nil }
        return clip
    }

    /// Writes the kept part to its own file, for uploading; returns its URL.
    static func exportTrimmed(_ id: String, startMs: Int, endMs: Int, completion: @escaping (URL?) -> Void) {
        let output = directory.appendingPathComponent("\(id).trimmed.m4a")
        let asset = AVURLAsset(url: audioURL(id))
        let range = CMTimeRange(
            start: CMTime(value: CMTimeValue(startMs), timescale: 1000),
            end: CMTime(value: CMTimeValue(endMs), timescale: 1000))
        // Cut without re-encoding (small, quick); re-encode only if that fails.
        func run(_ preset: String, then fallback: (() -> Void)?) {
            try? FileManager.default.removeItem(at: output)
            guard let export = AVAssetExportSession(asset: asset, presetName: preset) else {
                if let fallback { fallback() } else { completion(nil) }
                return
            }
            export.outputURL = output
            export.outputFileType = .m4a
            export.timeRange = range
            export.exportAsynchronously {
                if export.status == .completed {
                    completion(output)
                } else if let fallback {
                    fallback()
                } else {
                    completion(nil)
                }
            }
        }
        run(AVAssetExportPresetPassthrough) { run(AVAssetExportPresetAppleM4A, then: nil) }
    }

    /// Remembers a new trim in the clip's info file.
    static func setTrim(_ id: String, startMs: Int, endMs: Int) {
        guard var json = info(id), let data = try? JSONSerialization.data(withJSONObject: {
            json["trimStartMs"] = startMs
            json["trimEndMs"] = endMs
            return json
        }()) else { return }
        try? data.write(to: infoURL(id), options: .atomic)
    }

    static func audioURL(_ id: String) -> URL { directory.appendingPathComponent("\(id).m4a") }
    static func infoURL(_ id: String) -> URL { directory.appendingPathComponent("\(id).json") }

    static func info(_ id: String) -> [String: Any]? {
        guard let data = try? Data(contentsOf: infoURL(id)) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func remove(_ id: String) {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("\(id).trimmed.m4a"))
        try? FileManager.default.removeItem(at: audioURL(id))
        try? FileManager.default.removeItem(at: infoURL(id))
    }

    static func removeSession(_ sessionId: String) {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for file in files where file.pathExtension == "json" {
            let id = file.deletingPathExtension().lastPathComponent
            if info(id)?["sessionId"] as? String == sessionId { remove(id) }
        }
    }
}

/// Plays clips back. Only while not listening: capture holds the audio session
/// record-only, and a phone speaker would disturb the room and be transcribed.
final class ClipPlayer: NSObject, AVAudioPlayerDelegate {
    static let shared = ClipPlayer()

    var onProgress: ((String, Double) -> Void)?
    var onEnded: ((String) -> Void)?

    private var player: AVAudioPlayer?
    private var playingId: String?
    private var timer: Timer?
    /// Seconds: the part being played (a trimmed clip plays only its kept part).
    private var range: ClosedRange<Double>?

    func play(_ id: String, startMs: Int? = nil, endMs: Int? = nil) throws {
        if playingId != id || player == nil {
            stop()
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true)
            let player = try AVAudioPlayer(contentsOf: ClipRecorder.audioURL(id))
            player.delegate = self
            self.player = player
            playingId = id
        }
        if let player {
            let lower = Double(startMs ?? 0) / 1000
            let upper = endMs.map { Double($0) / 1000 } ?? player.duration
            range = lower...max(lower, min(upper, player.duration))
            if player.currentTime < lower || player.currentTime >= upper - 0.05 { player.currentTime = lower }
        }
        player?.play()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.report() }
    }

    func pause() {
        player?.pause()
        timer?.invalidate()
        timer = nil
    }

    func seek(_ id: String, to fraction: Double) {
        guard playingId == id, let player else { return }
        player.currentTime = player.duration * fraction
        report()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        guard let id = playingId else { return }
        player?.stop()
        player = nil
        playingId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        onEnded?(id)
    }

    private func report() {
        guard let player, let id = playingId, player.duration > 0 else { return }
        if let range, player.isPlaying, player.currentTime >= range.upperBound {
            stop()
            return
        }
        onProgress?(id, player.currentTime / player.duration)
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { self.stop() }
    }
}

@objc(ClipsPlugin)
public class ClipsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ClipsPlugin"
    public let jsName = "Clips"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTrim", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportTrimmed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        ClipPlayer.shared.onProgress = { [weak self] id, fraction in
            self?.notifyListeners("progress", data: ["id": id, "fraction": fraction])
        }
        ClipPlayer.shared.onEnded = { [weak self] id in
            self?.notifyListeners("ended", data: ["id": id])
        }
    }

    @objc func capture(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let sessionId = call.getString("sessionId") else {
            call.reject("Missing id or sessionId")
            return
        }
        DispatchQueue.main.async {
            ClipRecorder.shared.capture(id: id, sessionId: sessionId) { clip in
                call.resolve(clip.map { ["clip": $0.json] } ?? [:])
            }
        }
    }

    @objc func record(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let sessionId = call.getString("sessionId") else {
            call.reject("Missing id or sessionId")
            return
        }
        let before = call.getDouble("before") ?? 15
        let after = call.getDouble("after") ?? 45
        let margin = call.getDouble("margin") ?? 15
        DispatchQueue.main.async {
            ClipRecorder.shared.record(id: id, sessionId: sessionId, before: before, after: after, margin: margin) { clip in
                call.resolve(clip.map { ["clip": $0.json] } ?? [:])
            }
        }
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ClipRecorder.shared.finishRecording()
            call.resolve()
        }
    }

    @objc func setTrim(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let start = call.getInt("startMs"), let end = call.getInt("endMs") else {
            call.reject("Missing id or trim")
            return
        }
        ClipRecorder.setTrim(id, startMs: start, endMs: end)
        call.resolve()
    }

    @objc func exportTrimmed(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let start = call.getInt("startMs"), let end = call.getInt("endMs") else {
            call.reject("Missing id or trim")
            return
        }
        ClipRecorder.exportTrimmed(id, startMs: start, endMs: end) { url in
            if let url {
                call.resolve(["path": url.absoluteString])
            } else {
                call.reject("Couldn’t prepare the clip")
            }
        }
    }

    @objc func info(_ call: CAPPluginCall) {
        let clip = call.getString("id").flatMap(ClipRecorder.info)
        call.resolve(clip.map { ["clip": $0] } ?? [:])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing id")
            return
        }
        DispatchQueue.main.async {
            ClipPlayer.shared.stop()
            ClipRecorder.remove(id)
            call.resolve()
        }
    }

    @objc func removeSession(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else {
            call.reject("Missing sessionId")
            return
        }
        DispatchQueue.main.async {
            ClipPlayer.shared.stop()
            ClipRecorder.removeSession(sessionId)
            call.resolve()
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing id")
            return
        }
        DispatchQueue.main.async {
            guard !ClipRecorder.shared.isCapturing else {
                call.reject("Pause the session to listen")
                return
            }
            do {
                try ClipPlayer.shared.play(id, startMs: call.getInt("startMs"), endMs: call.getInt("endMs"))
                call.resolve()
            } catch {
                call.reject("Couldn’t play this clip")
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ClipPlayer.shared.pause()
            call.resolve()
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let fraction = call.getDouble("fraction") else {
            call.reject("Missing id or fraction")
            return
        }
        DispatchQueue.main.async {
            ClipPlayer.shared.seek(id, to: fraction)
            call.resolve()
        }
    }
}
