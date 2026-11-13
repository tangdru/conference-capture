import Capacitor
import UIKit

/// Opens the native camera screen (CameraViewController) over the app and
/// passes what happens there back to the page:
/// - "photo" {path}: a photo taken, saved as a JPEG file (already turned
///   upright); the page queues it for upload from that file.
/// - "remember", "clip": the star or the clip button was tapped; the page
///   does what it does for them on the session screen, then calls `update`
///   with the result (star filled, clip's end time for its countdown).
/// - "closed": the camera was swiped away.
@objc(NativeCameraPlugin)
public class NativeCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCameraPlugin"
    public let jsName = "NativeCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "warm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cool", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
    ]

    private var camera: CameraViewController?

    /// Photos taken in the camera, until they're safely in the upload queue
    /// (which keeps its own copy) and no longer shown from here.
    private static var shotsDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("camera-shots", isDirectory: true)
    }

    /// Sets the camera up ahead of time (a session screen opened), so it
    /// opens at once later. The camera itself stays off.
    @objc func prepare(_ call: CAPPluginCall) {
        CameraEngine.shared.prepare()
        call.resolve()
    }

    /// A finger is on the camera button: start switching the camera on now.
    @objc func warm(_ call: CAPPluginCall) {
        CameraEngine.shared.warm()
        call.resolve()
    }

    /// The session screen closed: no camera kept on for a quick reopen.
    @objc func cool(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.camera?.presentingViewController == nil { CameraEngine.shared.stop() }
            call.resolve()
        }
    }

    /// {showRemember, showClip, remembered, clipEndsAt}: opens the camera.
    /// Resolves once it's up; rejects with code UNAVAILABLE if there's no
    /// camera to use (the page then falls back to the browser camera).
    @objc func open(_ call: CAPPluginCall) {
        CameraTiming.shared.beginOrMark("tap")
        DispatchQueue.main.async {
            // One already up (a double tap on the camera button): nothing to do.
            if let open = self.camera, open.presentingViewController != nil { return call.resolve() }
            guard let host = self.bridge?.viewController else { return call.resolve() }
            Self.clearOldShots()
            let camera = CameraViewController()
            self.apply(call, to: camera)
            camera.modalPresentationStyle = .fullScreen
            // A quick fade, as the Camera app opens -- not a slide up.
            camera.modalTransitionStyle = .crossDissolve
            camera.onPhoto = { [weak self] jpeg in self?.savePhoto(jpeg) }
            camera.onRemember = { [weak self] in self?.notifyListeners("remember", data: [:]) }
            camera.onClip = { [weak self] in self?.notifyListeners("clip", data: [:]) }
            camera.onClose = { [weak self] in
                self?.camera = nil
                self?.notifyListeners("closed", data: [:])
            }
            var settled = false
            // Weak: the screen keeps this closure, so a strong reference to
            // it here would keep it alive (and look open) after it closed.
            camera.onUnavailable = { [weak self, weak camera] message in
                camera?.dismiss(animated: false)
                self?.camera = nil
                if !settled {
                    settled = true
                    call.reject("Camera unavailable: \(message)", "UNAVAILABLE")
                } else {
                    // Already showing: the page falls back to the browser camera.
                    self?.notifyListeners("unavailable", data: ["message": message])
                }
            }
            self.camera = camera
            // The screen shows at once, controls and all, while the camera
            // switches on alongside; the live picture fades in on its first
            // frame (CameraViewController.start).
            camera.start {}
            host.present(camera, animated: true) {
                CameraTiming.shared.mark("screen up")
                if !settled {
                    settled = true
                    call.resolve()
                }
            }
        }
    }

    /// Same options as `open`, for while it's up.
    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let camera = self.camera { self.apply(call, to: camera) }
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.camera?.close()
            call.resolve()
        }
    }

    private func apply(_ call: CAPPluginCall, to camera: CameraViewController) {
        if let show = call.getBool("showRemember") { camera.showRemember = show }
        if let show = call.getBool("showClip") { camera.showClip = show }
        if let remembered = call.getBool("remembered") { camera.remembered = remembered }
        if call.options["clipEndsAt"] != nil {
            let ms = call.getDouble("clipEndsAt")
            camera.clipEndsAt = ms.map { Date(timeIntervalSince1970: $0 / 1000) }
        }
    }

    private func savePhoto(_ jpeg: Data) {
        let url = Self.shotsDir.appendingPathComponent("\(UUID().uuidString).jpg")
        do {
            try FileManager.default.createDirectory(at: Self.shotsDir, withIntermediateDirectories: true)
            try jpeg.write(to: url, options: .atomic)
            notifyListeners("photo", data: ["path": url.absoluteString])
        } catch {
            notifyListeners("photoFailed", data: ["message": error.localizedDescription])
        }
    }

    /// Shots from earlier days: long since in the upload queue.
    private static func clearOldShots() {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: shotsDir, includingPropertiesForKeys: [.contentModificationDateKey]
        )) ?? []
        let cutoff = Date().addingTimeInterval(-2 * 24 * 60 * 60)
        for file in files {
            let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            if let modified = modified, modified < cutoff { try? FileManager.default.removeItem(at: file) }
        }
    }
}
