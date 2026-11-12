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
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
    ]

    private weak var camera: CameraViewController?

    /// Photos taken in the camera, until they're safely in the upload queue
    /// (which keeps its own copy) and no longer shown from here.
    private static var shotsDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("camera-shots", isDirectory: true)
    }

    /// {showRemember, showClip, remembered, clipEndsAt}: opens the camera.
    /// Resolves once it's up; rejects with code UNAVAILABLE if there's no
    /// camera to use (the page then falls back to the browser camera).
    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.camera == nil, let host = self.bridge?.viewController else {
                return call.resolve()
            }
            Self.clearOldShots()
            let camera = CameraViewController()
            self.apply(call, to: camera)
            camera.modalPresentationStyle = .fullScreen
            camera.onPhoto = { [weak self] jpeg in self?.savePhoto(jpeg) }
            camera.onRemember = { [weak self] in self?.notifyListeners("remember", data: [:]) }
            camera.onClip = { [weak self] in self?.notifyListeners("clip", data: [:]) }
            camera.onClose = { [weak self] in self?.notifyListeners("closed", data: [:]) }
            var settled = false
            camera.onUnavailable = { message in
                camera.dismiss(animated: false)
                if !settled {
                    settled = true
                    call.reject("Camera unavailable: \(message)", "UNAVAILABLE")
                }
            }
            self.camera = camera
            host.present(camera, animated: true) {
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
