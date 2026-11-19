import Capacitor
import Foundation

/// Video clips saved on this phone (see VideoClips.swift): their files,
/// trimming, deleting and saving to Photos. The clip's id is its timeline
/// entry's id.
@objc(VideoClipsPlugin)
public class VideoClipsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VideoClipsPlugin"
    public let jsName = "VideoClips"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportTrimmed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keyFrames", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "commitTrim", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToPhotos", returnType: CAPPluginReturnPromise),
    ]

    private let queue = DispatchQueue(label: "VideoClipsPlugin", qos: .userInitiated)

    /// { clip } -- or no clip when it isn't on this phone.
    @objc func info(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No clip") }
        queue.async {
            if let saved = VideoClipRecorder.info(id: id) {
                call.resolve(["clip": saved.json])
            } else {
                call.resolve([:])
            }
        }
    }

    /// { path }: the kept part as its own MP4 (file:// URL, temporary).
    @objc func exportTrimmed(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No clip") }
        let startMs = call.getInt("startMs") ?? 0
        let endMs = call.getInt("endMs") ?? 0
        queue.async {
            do {
                let url = try VideoClipRecorder.exportTrimmed(id: id, startMs: startMs, endMs: endMs)
                call.resolve(["path": url.absoluteString])
            } catch {
                call.reject("Couldn't cut the clip: \(error.localizedDescription)")
            }
        }
    }

    /// { frames: [{ path, atMs }] }: stills where the kept part's picture
    /// changes (temporary JPEGs; the first doubles as its poster).
    @objc func keyFrames(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No clip") }
        let startMs = call.getInt("startMs") ?? 0
        let endMs = call.getInt("endMs") ?? 0
        queue.async {
            let frames = VideoClipRecorder.keyFrames(id: id, startMs: startMs, endMs: endMs)
            call.resolve(["frames": frames.map { ["path": $0.url.absoluteString, "atMs": $0.atMs] }])
        }
    }

    /// Keep only the trimmed part. { clip } with the new length and stills.
    @objc func commitTrim(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No clip") }
        let startMs = call.getInt("startMs") ?? 0
        let endMs = call.getInt("endMs") ?? 0
        let startedAt = call.getInt("startedAt") ?? 0
        queue.async {
            do {
                if let saved = try VideoClipRecorder.commitTrim(id: id, startMs: startMs, endMs: endMs, startedAt: startedAt) {
                    call.resolve(["clip": saved.json])
                } else {
                    call.resolve([:])
                }
            } catch {
                call.reject("Couldn't keep the trimmed part: \(error.localizedDescription)")
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No clip") }
        queue.async {
            VideoClipRecorder.remove(id: id)
            call.resolve()
        }
    }

    /// Rejects with code 'denied' if Photos access is off.
    @objc func saveToPhotos(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No clip") }
        let startMs = call.getInt("startMs") ?? 0
        let endMs = call.getInt("endMs") ?? 0
        queue.async {
            VideoClipRecorder.saveToPhotos(id: id, startMs: startMs, endMs: endMs) { problem in
                if let problem {
                    if problem == "denied" { call.reject("Photos access is off", "denied") } else { call.reject(problem) }
                } else {
                    call.resolve()
                }
            }
        }
    }
}
