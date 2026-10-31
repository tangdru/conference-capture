import AVFoundation
import Capacitor
import UIKit

/// The iPhone's own camera for the viewfinder: a live AVFoundation preview
/// placed *behind* the web view (made transparent while it runs) at the rect
/// the page gives it, so the page's own controls draw on top. Photos come
/// from AVCapturePhotoOutput -- full resolution, real flash -- rather than
/// from grabbing video frames, and the virtual multi-camera device switches
/// between ultra-wide, wide and telephoto lenses as the zoom changes, like
/// the Camera app.
///
/// Zoom values crossing the bridge are in the Camera app's units: 1 is the
/// main (wide) lens, 0.5 the ultra-wide. The device's own zoom factor starts
/// at the widest lens, so they're scaled by `wideFactor`.
@objc(NativeCameraPlugin)
public class NativeCameraPlugin: CAPPlugin, CAPBridgedPlugin, AVCapturePhotoCaptureDelegate {
    public let identifier = "NativeCameraPlugin"
    public let jsName = "NativeCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "focus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
    ]

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "native-camera.session")
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    private var configured = false
    private var wideFactor: CGFloat = 1
    private var previewView: PreviewView?
    private var pendingCapture: (call: CAPPluginCall, degrees: Int)?
    // The web view's look before the preview went behind it, to put back.
    private var savedWebViewLook: (opaque: Bool, background: UIColor?, scrollBackground: UIColor?)?
    private var subjectAreaObserver: NSObjectProtocol?

    // MARK: - Bridge methods

    /// Opens the camera with its preview at {x, y, width, height} (CSS
    /// pixels in the web view). Resolves with what the camera can do.
    @objc func start(_ call: CAPPluginCall) {
        let rect = CGRect(
            x: call.getDouble("x") ?? 0,
            y: call.getDouble("y") ?? 0,
            width: call.getDouble("width") ?? 0,
            height: call.getDouble("height") ?? 0
        )
        AVCaptureDevice.requestAccess(for: .video) { granted in
            guard granted else {
                call.reject("Camera access is off -- turn it on in Settings > Conference Capture.", "DENIED")
                return
            }
            self.sessionQueue.async {
                if !self.configured {
                    do {
                        try self.configure()
                    } catch {
                        call.reject("Camera unavailable: \(error.localizedDescription)", "UNAVAILABLE")
                        return
                    }
                }
                DispatchQueue.main.sync { self.showPreview(at: rect) }
                if !self.session.isRunning { self.session.startRunning() }
                call.resolve(self.capabilities())
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.hidePreview() }
        sessionQueue.async {
            if self.session.isRunning { self.session.stopRunning() }
            call.resolve()
        }
    }

    /// {zoom, animated}: zoom in Camera app units; animated ramps to it
    /// (lens buttons), otherwise it's set at once (pinching).
    @objc func setZoom(_ call: CAPPluginCall) {
        let zoom = CGFloat(call.getDouble("zoom") ?? 1)
        let animated = call.getBool("animated") ?? false
        sessionQueue.async {
            guard let device = self.device else { return call.resolve() }
            let factor = min(max(zoom * self.wideFactor, device.minAvailableVideoZoomFactor), self.maxFactor(device))
            do {
                try device.lockForConfiguration()
                if animated {
                    device.ramp(toVideoZoomFactor: factor, withRate: 12)
                } else {
                    device.cancelVideoZoomRamp()
                    device.videoZoomFactor = factor
                }
                device.unlockForConfiguration()
            } catch {}
            call.resolve(["zoom": Double(factor / self.wideFactor)])
        }
    }

    /// {x, y}: a tap in the preview, 0...1 across and down. Focuses and
    /// exposes there until the scene changes, then goes back to continuous.
    @objc func focus(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0.5
        let y = call.getDouble("y") ?? 0.5
        DispatchQueue.main.async {
            guard let view = self.previewView else { return call.resolve() }
            let layerPoint = CGPoint(x: x * view.bounds.width, y: y * view.bounds.height)
            let point = view.previewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)
            self.sessionQueue.async {
                self.setFocus(at: point, mode: .autoFocus, exposure: .autoExpose, watchForChange: true)
                call.resolve()
            }
        }
    }

    /// {flash: "off" | "auto" | "on", degrees}: takes a photo, turned
    /// `degrees` clockwise (from DeviceTilt) so a sideways phone gives a
    /// landscape photo. Resolves with {data}: base64 JPEG, long edge at most
    /// 2560px -- plenty to read a slide, small enough to upload.
    @objc func capture(_ call: CAPPluginCall) {
        let flash = call.getString("flash") ?? "off"
        let degrees = call.getInt("degrees") ?? 0
        sessionQueue.async {
            guard self.session.isRunning, self.pendingCapture == nil else {
                call.reject("Camera isn't ready", "BUSY")
                return
            }
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            let mode: AVCaptureDevice.FlashMode = flash == "on" ? .on : flash == "auto" ? .auto : .off
            if self.photoOutput.supportedFlashModes.contains(mode) { settings.flashMode = mode }
            if let connection = self.photoOutput.connection(with: .video) {
                if #available(iOS 17.0, *) {
                    if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
                } else if connection.isVideoOrientationSupported {
                    connection.videoOrientation = .portrait
                }
            }
            self.pendingCapture = (call, degrees)
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    // MARK: - Photo delegate

    public func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        sessionQueue.async {
            guard let (call, degrees) = self.pendingCapture else { return }
            self.pendingCapture = nil
            if let error = error {
                call.reject("Couldn't take the photo: \(error.localizedDescription)")
                return
            }
            guard let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
                call.reject("Couldn't read the photo")
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                let rendered = Self.render(image, rotatedBy: degrees, maxEdge: 2560)
                guard let jpeg = rendered.jpegData(compressionQuality: 0.85) else {
                    call.reject("Couldn't save the photo")
                    return
                }
                call.resolve(["data": jpeg.base64EncodedString()])
            }
        }
    }

    // MARK: - Setup

    private func configure() throws {
        // Most capable first: the virtual devices switch lenses on their own
        // as the zoom factor passes each lens's switch-over point.
        let types: [AVCaptureDevice.DeviceType] = [
            .builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera,
        ]
        let found = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: .back).devices
        // Falling back to any camera at all covers the Simulator's test camera.
        guard let device = types.lazy.compactMap({ type in found.first { $0.deviceType == type } }).first
            ?? AVCaptureDevice.default(for: .video)
        else {
            throw NSError(domain: "NativeCamera", code: 1, userInfo: [NSLocalizedDescriptionKey: "no back camera"])
        }
        let input = try AVCaptureDeviceInput(device: device)

        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(photoOutput) else {
            session.commitConfiguration()
            throw NSError(domain: "NativeCamera", code: 2, userInfo: [NSLocalizedDescriptionKey: "can't use this camera"])
        }
        session.addInput(input)
        session.addOutput(photoOutput)
        session.commitConfiguration()

        // With an ultra-wide lens the device's zoom 1 *is* the ultra-wide;
        // the main lens starts at the first switch-over factor (usually 2).
        let hasUltraWide = device.deviceType == .builtInTripleCamera || device.deviceType == .builtInDualWideCamera
        wideFactor = hasUltraWide ? CGFloat(truncating: device.virtualDeviceSwitchOverVideoZoomFactors.first ?? 1) : 1

        try device.lockForConfiguration()
        device.videoZoomFactor = wideFactor
        device.unlockForConfiguration()
        self.device = device
        setFocus(at: CGPoint(x: 0.5, y: 0.5), mode: .continuousAutoFocus, exposure: .continuousAutoExposure, watchForChange: false)
        configured = true
    }

    private func maxFactor(_ device: AVCaptureDevice) -> CGFloat {
        // The Camera app stops at 15x on most phones; beyond that it's mush.
        min(device.maxAvailableVideoZoomFactor, wideFactor * 15)
    }

    /// What the page needs to draw its controls: the lens buttons to offer,
    /// the zoom range, and whether there's a flash.
    private func capabilities() -> [String: Any] {
        guard let device = device else { return [:] }
        var lenses: [Double] = [1, 2]
        if wideFactor > 1 { lenses.insert(Double(1 / wideFactor), at: 0) }
        let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors.map { Double(truncating: $0) / Double(wideFactor) }
        if let tele = switchOvers.last, tele > 1.01 { lenses.append(tele) }
        lenses = Array(Set(lenses.map { ($0 * 10).rounded() / 10 })).sorted()
        return [
            "lenses": lenses,
            "minZoom": Double(device.minAvailableVideoZoomFactor / wideFactor),
            "maxZoom": Double(maxFactor(device) / wideFactor),
            "zoom": Double(device.videoZoomFactor / wideFactor),
            "flash": photoOutput.supportedFlashModes.contains(.on),
        ]
    }

    private func setFocus(
        at point: CGPoint,
        mode: AVCaptureDevice.FocusMode,
        exposure: AVCaptureDevice.ExposureMode,
        watchForChange: Bool
    ) {
        guard let device = device, (try? device.lockForConfiguration()) != nil else { return }
        if device.isFocusPointOfInterestSupported { device.focusPointOfInterest = point }
        if device.isFocusModeSupported(mode) { device.focusMode = mode }
        if device.isExposurePointOfInterestSupported { device.exposurePointOfInterest = point }
        if device.isExposureModeSupported(exposure) { device.exposureMode = exposure }
        device.isSubjectAreaChangeMonitoringEnabled = watchForChange
        device.unlockForConfiguration()

        if watchForChange && subjectAreaObserver == nil {
            subjectAreaObserver = NotificationCenter.default.addObserver(
                forName: .AVCaptureDeviceSubjectAreaDidChange, object: device, queue: nil
            ) { [weak self] _ in
                self?.sessionQueue.async {
                    self?.setFocus(
                        at: CGPoint(x: 0.5, y: 0.5), mode: .continuousAutoFocus,
                        exposure: .continuousAutoExposure, watchForChange: false
                    )
                }
            }
        }
    }

    // MARK: - Preview behind the web view

    private func showPreview(at rect: CGRect) {
        guard let webView = bridge?.webView, let host = webView.superview else { return }
        let view = previewView ?? PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        view.frame = rect.offsetBy(dx: webView.frame.minX, dy: webView.frame.minY)
        view.backgroundColor = .black
        if view.superview == nil { host.insertSubview(view, belowSubview: webView) }
        previewView = view

        if savedWebViewLook == nil {
            savedWebViewLook = (webView.isOpaque, webView.backgroundColor, webView.scrollView.backgroundColor)
        }
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
    }

    private func hidePreview() {
        previewView?.removeFromSuperview()
        previewView = nil
        if let look = savedWebViewLook, let webView = bridge?.webView {
            webView.isOpaque = look.opaque
            webView.backgroundColor = look.background
            webView.scrollView.backgroundColor = look.scrollBackground
        }
        savedWebViewLook = nil
    }

    // MARK: - Helpers

    /// Scales `image` so its long edge is at most `maxEdge`, turned
    /// `degrees` clockwise -- the same turn the web viewfinder applies.
    private static func render(_ image: UIImage, rotatedBy degrees: Int, maxEdge: CGFloat) -> UIImage {
        let scale = min(1, maxEdge / max(image.size.width, image.size.height))
        let width = (image.size.width * scale).rounded()
        let height = (image.size.height * scale).rounded()
        let sideways = degrees == 90 || degrees == 270
        let canvas = sideways ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: canvas, format: format).image { context in
            context.cgContext.translateBy(x: canvas.width / 2, y: canvas.height / 2)
            context.cgContext.rotate(by: CGFloat(degrees) * .pi / 180)
            image.draw(in: CGRect(x: -width / 2, y: -height / 2, width: width, height: height))
        }
    }
}

/// A view whose own layer is the camera preview, so it resizes with it.
private class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
