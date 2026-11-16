import AVFoundation
import Photos
import UIKit

/// Video clips: hold the shutter in the camera to record, up to 30 s.
///
/// The camera records the picture only. While a session listens, the mic is
/// already busy with the transcript (and the clip button's memory of the last
/// two minutes, ClipRecorder), so the clip's sound is taken from there once
/// the clip ends and laid under the picture -- no second recorder fighting
/// over the mic. When the session isn't listening, the clip records its own
/// sound. Saved as MP4 (H.264, so any browser plays it in a presentation)
/// with a poster frame, in Library/Videos.
/// See design/plans/2026-11-15-video-clips-plan.md.
final class VideoClipRecorder {
    static let shared = VideoClipRecorder()
    static let maxSeconds = 30.0
    /// A shorter hold is dropped (a slip of the finger, not a clip).
    static let minSeconds = 0.5

    struct Saved {
        let id: String
        let video: URL
        let poster: URL
        let durationMs: Int
        let width: Int
        let height: Int
        /// When the first frame was taken, ms since 1970.
        let startedAt: Int

        var json: [String: Any] {
            ["id": id, "path": video.absoluteString, "posterPath": poster.absoluteString,
             "durationMs": durationMs, "width": width, "height": height, "startedAt": startedAt]
        }
    }

    static var directory: URL {
        let url = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Videos")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // Main thread only.
    private struct Recording {
        let id: String
        let picture: URL
        let boost: Bool
        var startedAt: Date?
        /// Where the listening mic was at the first frame.
        var fromSample: Int?
        var ownSound: AVAudioRecorder?
    }
    private var recording: Recording?
    private(set) var isRecording = false

    /// `started` gets true once the first frame is in (main queue).
    func start(degrees: Int, boost: Bool, started: @escaping (Bool) -> Void) {
        guard !isRecording else { return started(false) }
        isRecording = true
        let id = UUID().uuidString.lowercased()
        let picture = FileManager.default.temporaryDirectory.appendingPathComponent("\(id)-picture.mp4")
        recording = Recording(id: id, picture: picture, boost: boost)
        CameraEngine.shared.startVideo(to: picture, degrees: degrees) { [weak self] ok in
            guard let self, self.recording?.id == id else { return }
            guard ok else {
                self.recording = nil
                self.isRecording = false
                return started(false)
            }
            self.recording?.startedAt = Date()
            if let position = ClipRecorder.shared.position {
                self.recording?.fromSample = position
            } else {
                self.recording?.ownSound = Self.recordOwnSound(id: id)
            }
            started(true)
        }
    }

    /// `done` gets the saved clip, or nil if nothing worth keeping (main queue).
    func stop(done: @escaping (Saved?) -> Void) {
        guard isRecording, let current = recording else { return done(nil) }
        recording = nil
        let heard = current.fromSample.flatMap { ClipRecorder.shared.samples(since: $0) }
        current.ownSound?.stop()
        if current.ownSound != nil {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        CameraEngine.shared.stopVideo { [weak self] seconds in
            self?.isRecording = false
            guard let seconds, seconds >= Self.minSeconds, let startedAt = current.startedAt else {
                try? FileManager.default.removeItem(at: current.picture)
                if let own = current.ownSound { try? FileManager.default.removeItem(at: own.url) }
                return done(nil)
            }
            DispatchQueue.global(qos: .userInitiated).async {
                let saved = Self.save(current, seconds: seconds, startedAt: startedAt, heard: heard)
                DispatchQueue.main.async { done(saved) }
            }
        }
    }

    /// TEST SHORTCUT (build 90, until clips show in the session -- step 2):
    /// every clip is also copied to the Photos album, so picture and sound
    /// can be checked there. Remove with step 2's Save to Photos.
    static func copyToPhotosForTesting(_ saved: Saved) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { return }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: saved.video, options: nil)
            }) { ok, error in
                if !ok { NSLog("VideoClipRecorder: couldn't copy to Photos (\(error?.localizedDescription ?? "?"))") }
            }
        }
    }

    // MARK: - Saving

    private static func save(_ recording: Recording, seconds: Double, startedAt: Date, heard: [Float]?) -> Saved? {
        let fm = FileManager.default
        let video = directory.appendingPathComponent("\(recording.id).mp4")
        let poster = directory.appendingPathComponent("\(recording.id).jpg")
        defer { try? fm.removeItem(at: recording.picture) }

        var sound: URL? = recording.ownSound?.url
        if let heard, !heard.isEmpty {
            let url = fm.temporaryDirectory.appendingPathComponent("\(recording.id)-sound.m4a")
            let samples = recording.boost ? ClipRecorder.voiceBoost(heard) : heard
            if (try? writeSound(samples, rate: ClipRecorder.rate, to: url)) != nil { sound = url }
        }
        defer { if let sound { try? fm.removeItem(at: sound) } }

        guard combine(picture: recording.picture, sound: sound, into: video) else { return nil }
        let asset = AVURLAsset(url: video)
        guard let track = asset.tracks(withMediaType: .video).first else { return nil }
        let size = track.naturalSize.applying(track.preferredTransform)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)
        let at = CMTime(seconds: min(0.5, seconds / 2), preferredTimescale: 600)
        if let image = try? generator.copyCGImage(at: at, actualTime: nil),
           let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.8) {
            try? jpeg.write(to: poster, options: .atomic)
        }
        return Saved(
            id: recording.id, video: video, poster: poster,
            durationMs: Int((asset.duration.seconds * 1000).rounded()),
            width: Int(abs(size.width).rounded()), height: Int(abs(size.height).rounded()),
            startedAt: Int((startedAt.timeIntervalSince1970 * 1000).rounded()))
    }

    private static func writeSound(_ samples: [Float], rate: Double, to url: URL) throws {
        try? FileManager.default.removeItem(at: url)
        guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0] else { throw CocoaError(.fileWriteUnknown) }
        samples.withUnsafeBufferPointer { channel.update(from: $0.baseAddress!, count: samples.count) }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        // Scoped: the file is finished when it's released.
        do {
            let file = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: rate,
                AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000,
            ], commonFormat: .pcmFormatFloat32, interleaved: false)
            try file.write(from: buffer)
        }
    }

    /// The picture with the sound under it (from its start), as one MP4.
    private static func combine(picture: URL, sound: URL?, into out: URL) -> Bool {
        let fm = FileManager.default
        try? fm.removeItem(at: out)
        let video = AVURLAsset(url: picture)
        // Kept in a variable: a track only works while its asset is alive (an
        // asset made and dropped in one expression left the clips silent).
        let heard = sound.map { AVURLAsset(url: $0) }
        guard let heard,
              let pictureTrack = video.tracks(withMediaType: .video).first,
              let soundTrack = heard.tracks(withMediaType: .audio).first else {
            if sound != nil { NSLog("VideoClipRecorder: couldn't read the sound, keeping the picture only") }
            return (try? fm.copyItem(at: picture, to: out)) != nil
        }
        // Both assets stay alive until the export is done.
        defer { withExtendedLifetime((video, heard)) {} }
        let composition = AVMutableComposition()
        let length = video.duration
        guard let v = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let a = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
              (try? v.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: pictureTrack, at: .zero)) != nil
        else { return (try? fm.copyItem(at: picture, to: out)) != nil }
        v.preferredTransform = pictureTrack.preferredTransform
        let soundLength = CMTimeMinimum(length, soundTrack.timeRange.duration)
        do {
            try a.insertTimeRange(CMTimeRange(start: .zero, duration: soundLength), of: soundTrack, at: .zero)
        } catch {
            NSLog("VideoClipRecorder: couldn't lay the sound under (\(error.localizedDescription)), keeping the picture only")
            return (try? fm.copyItem(at: picture, to: out)) != nil
        }

        guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
            return (try? fm.copyItem(at: picture, to: out)) != nil
        }
        export.outputURL = out
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        let finished = DispatchSemaphore(value: 0)
        export.exportAsynchronously { finished.signal() }
        finished.wait()
        if export.status == .completed { return true }
        NSLog("VideoClipRecorder: couldn't add the sound (\(export.error?.localizedDescription ?? "?")), keeping the picture only")
        return (try? fm.copyItem(at: picture, to: out)) != nil
    }

    /// Not listening: the clip records its own sound, if the mic is allowed
    /// (never asks here -- a permission prompt mid-clip would stop it).
    private static func recordOwnSound(id: String) -> AVAudioRecorder? {
        let session = AVAudioSession.sharedInstance()
        guard session.recordPermission == .granted else { return nil }
        do {
            try session.setCategory(.record, mode: .default, options: [])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(id)-own.m4a")
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96_000,
            ])
            guard recorder.record() else { return nil }
            return recorder
        } catch {
            NSLog("VideoClipRecorder: no sound for this clip (\(error.localizedDescription))")
            return nil
        }
    }
}

/// Writes camera frames to an MP4 as they come: H.264 at most 720 on the
/// short side, about 3.5 Mbit/s (a 30 s clip is about 13 MB). Set up on the
/// first frame, when the frame size is known. Video queue only.
final class MovieWriter {
    private let url: URL
    private let degrees: Int
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var first: CMTime?
    private var last: CMTime?
    private var failed = false
    var onFirstFrame: (() -> Void)?
    var onFailure: (() -> Void)?

    static let shortSide = 720.0

    init(url: URL, degrees: Int) {
        self.url = url
        self.degrees = degrees
    }

    func append(_ frame: CVPixelBuffer, at time: CMTime) {
        guard !failed else { return }
        if writer == nil {
            guard setUp(width: CVPixelBufferGetWidth(frame), height: CVPixelBufferGetHeight(frame), at: time) else {
                failed = true
                onFailure?()
                return
            }
        }
        guard let input, let adaptor, input.isReadyForMoreMediaData else { return }
        if let last, time <= last { return }
        if adaptor.append(frame, withPresentationTime: time) {
            last = time
            if first == nil {
                first = time
                onFirstFrame?()
            }
        }
    }

    /// `done` gets the clip's length in seconds, or nil.
    func finish(_ done: @escaping (Double?) -> Void) {
        guard let writer, writer.status == .writing, let first, let last else {
            writer?.cancelWriting()
            return done(nil)
        }
        // The last frame shows for a frame's length.
        let end = last + CMTime(value: 1, timescale: 30)
        input?.markAsFinished()
        writer.endSession(atSourceTime: end)
        writer.finishWriting {
            done(writer.status == .completed ? (end - first).seconds : nil)
        }
    }

    private func setUp(width: Int, height: Int, at time: CMTime) -> Bool {
        try? FileManager.default.removeItem(at: url)
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return false }
        let scale = min(1, Self.shortSide / Double(min(width, height)))
        let even = { (v: Double) in Int((v * scale / 2).rounded()) * 2 }
        let outWidth = even(Double(width))
        let outHeight = even(Double(height))
        NSLog("MovieWriter: frames \(width)x\(height), writing \(outWidth)x\(outHeight)")
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: outWidth,
            AVVideoHeightKey: outHeight,
            AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 3_500_000,
                AVVideoExpectedSourceFrameRateKey: 30,
                AVVideoMaxKeyFrameIntervalKey: 30,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            ],
        ])
        input.expectsMediaDataInRealTime = true
        input.transform = Self.turn(width: CGFloat(outWidth), height: CGFloat(outHeight), by: (90 + degrees) % 360)
        guard writer.canAdd(input) else { return false }
        writer.add(input)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        guard writer.startWriting() else { return false }
        writer.startSession(atSourceTime: time)
        self.writer = writer
        self.input = input
        self.adaptor = adaptor
        return true
    }

    /// The sensor's frames are landscape; this turns them `degrees`
    /// clockwise for playback (as the photos are turned), kept in view.
    private static func turn(width: CGFloat, height: CGFloat, by degrees: Int) -> CGAffineTransform {
        let rotation = CGAffineTransform(rotationAngle: CGFloat(degrees) * .pi / 180)
        let box = CGRect(x: 0, y: 0, width: width, height: height).applying(rotation)
        return rotation.concatenating(CGAffineTransform(translationX: -box.minX, y: -box.minY))
    }

    /// The Simulator's stand-in slide as a landscape frame, like the sensor's
    /// (turned back a quarter, so the playback turn puts it upright).
    static func pixelBuffer(_ image: UIImage) -> CVPixelBuffer? {
        let width = 1280, height = 960
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true] as CFDictionary,
                            &buffer)
        guard let buffer, let cgImage = image.cgImage else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }
        // Core Graphics' y runs up: a quarter turn anticlockwise on screen is
        // +90° here.
        context.translateBy(x: CGFloat(width) / 2, y: CGFloat(height) / 2)
        context.rotate(by: .pi / 2)
        context.draw(cgImage, in: CGRect(x: -CGFloat(height) / 2, y: -CGFloat(width) / 2, width: CGFloat(height), height: CGFloat(width)))
        return buffer
    }
}
