import AVFoundation
import UIKit

/// The camera itself, for CameraViewController: an AVCaptureSession on the
/// best back camera, with the Camera app's tricks where iOS offers them to
/// other apps -- zero shutter lag (the photo comes from the frames already
/// seen when the shutter is pressed), responsive capture (the next shot can
/// be taken while the last is still processing), and the virtual
/// multi-camera device that switches lenses as the zoom changes.
///
/// Zoom values here are in the Camera app's units: 1 is the main (wide)
/// lens, 0.5 the ultra-wide. The device's own zoom factor starts at the
/// widest lens, so they're scaled by `wideFactor`.
final class CameraEngine: NSObject, AVCapturePhotoCaptureDelegate {
    /// One camera for the app, set up once and reused: setting it up (finding
    /// the lenses, wiring them in) is what made the screen open to black.
    static let shared = CameraEngine()

    enum Failure: Error {
        case denied
        case unavailable(String)
    }

    struct Info {
        var lenses: [Double]
        var minZoom: Double
        var maxZoom: Double
        var zoom: Double
        var flash: Bool
    }

    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "camera-engine")
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    private var wideFactor: CGFloat = 1
    private var configured = false
    /// Shots taken but not yet back, by their settings' id.
    private var inFlight: [Int64: (degrees: Int, done: (Result<Data, Error>) -> Void)] = [:]

    /// The Simulator has no camera: a stand-in picture shows instead, and
    /// "photos" are taken of it, so the screen can still be tried there.
    private(set) var standIn: UIImage?

    // MARK: - Starting and stopping

    /// Sets the camera up ahead of time (when a session opens), so opening it
    /// later is only switching it on. Only once camera access is already
    /// granted -- this never asks for it -- and the camera stays off.
    func prepare() {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { return }
        queue.async {
            if !self.configured { try? self.configure() }
        }
    }

    /// Switching the sensor on takes most of a second, so this begins it as
    /// soon as a finger touches the camera button -- by the time the screen
    /// is up, the picture is nearly there. Only with access already granted.
    func warm() {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { return }
        queue.async {
            self.pendingStop?.cancel()
            self.pendingStop = nil
            if !self.configured { try? self.configure() }
            if self.configured, !self.session.isRunning { self.session.startRunning() }
        }
    }

    func start(completion: @escaping (Result<Info, Failure>) -> Void) {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            self.queue.async {
                self.pendingStop?.cancel()
                self.pendingStop = nil
                do {
                    if !self.configured { try self.configure() }
                } catch {
                    #if targetEnvironment(simulator)
                    self.standIn = Self.makeStandIn()
                    let info = Info(lenses: [0.5, 1, 2], minZoom: 0.5, maxZoom: 10, zoom: 1, flash: true)
                    return DispatchQueue.main.async { completion(.success(info)) }
                    #else
                    let message = (error as NSError).localizedDescription
                    return DispatchQueue.main.async {
                        completion(.failure(granted ? .unavailable(message) : .denied))
                    }
                    #endif
                }
                guard granted else { return DispatchQueue.main.async { completion(.failure(.denied)) } }
                // Each opening starts focused on the middle and on the main lens.
                self.setFocus(at: CGPoint(x: 0.5, y: 0.5))
                self.setZoomFactor(self.wideFactor, animated: false)
                if !self.session.isRunning { self.session.startRunning() }
                let info = self.info()
                DispatchQueue.main.async { completion(.success(info)) }
            }
        }
    }

    /// Switches the camera off, after `delay` seconds: closing the camera
    /// keeps it on a little while, so opening it again straight away (the
    /// next slide) is instant. Opening or warming it cancels the stop.
    func stop(after delay: TimeInterval = 0) {
        queue.async {
            self.pendingStop?.cancel()
            let stop = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                self.pendingStop = nil
                if self.session.isRunning { self.session.stopRunning() }
            }
            self.pendingStop = stop
            self.queue.asyncAfter(deadline: .now() + delay, execute: stop)
        }
    }

    private var pendingStop: DispatchWorkItem?
    private var backgroundObserver: NSObjectProtocol?

    override init() {
        super.init()
        // Never left on in the background.
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil
        ) { [weak self] _ in self?.stop() }
    }

    // MARK: - Zoom, focus, capture

    /// Sets the zoom (Camera app units) and hands back what it became.
    func setZoom(_ zoom: Double, animated: Bool, applied: ((Double) -> Void)? = nil) {
        queue.async {
            guard let device = self.device else { return }
            let factor = min(max(CGFloat(zoom) * self.wideFactor, device.minAvailableVideoZoomFactor), self.maxFactor(device))
            self.setZoomFactor(factor, animated: animated)
            let result = Double(factor / self.wideFactor)
            DispatchQueue.main.async { applied?(result) }
        }
    }

    /// Keeps focusing and exposing on `point` (0...1 in the sensor's
    /// coordinates, from the preview layer) until another tap or the camera
    /// closes -- a small move of the hand doesn't snap focus back.
    func focus(at point: CGPoint) {
        queue.async { self.setFocus(at: point) }
    }

    /// Takes a photo turned `degrees` clockwise (how the phone is held), as
    /// a JPEG with its long edge at most 2560px -- plenty to read a slide,
    /// small enough to upload. `done` runs on the main queue.
    func capture(flash: String, degrees: Int, done: @escaping (Result<Data, Error>) -> Void) {
        let finish: (Result<Data, Error>) -> Void = { result in DispatchQueue.main.async { done(result) } }
        queue.async {
            if let standIn = self.standIn {
                return Self.encode(standIn, degrees: degrees, finish)
            }
            guard self.session.isRunning else {
                return finish(.failure(Failure.unavailable("The camera isn't running")))
            }
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            // Speed over the heaviest processing: slides are flat and well lit.
            settings.photoQualityPrioritization = .balanced
            let mode: AVCaptureDevice.FlashMode = flash == "on" ? .on : flash == "auto" ? .auto : .off
            if self.photoOutput.supportedFlashModes.contains(mode) { settings.flashMode = mode }
            if let connection = self.photoOutput.connection(with: .video) {
                if #available(iOS 17.0, *) {
                    if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
                } else if connection.isVideoOrientationSupported {
                    connection.videoOrientation = .portrait
                }
            }
            self.inFlight[settings.uniqueID] = (degrees, finish)
            self.whenFocused(waited: 0) {
                self.photoOutput.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    /// Runs `take` once the lens has stopped moving, or after 0.8 s at most:
    /// a shot taken mid-hunt (dim rooms, projected slides) comes out blurred.
    private func whenFocused(waited: Int, _ take: @escaping () -> Void) {
        let step = 40
        guard let device = device, device.isAdjustingFocus, waited < 800 else { return take() }
        queue.asyncAfter(deadline: .now() + .milliseconds(step)) {
            self.whenFocused(waited: waited + step, take)
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        queue.async {
            guard let shot = self.inFlight.removeValue(forKey: photo.resolvedSettings.uniqueID) else { return }
            if let error = error { return shot.done(.failure(error)) }
            guard let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
                return shot.done(.failure(Failure.unavailable("Couldn't read the photo")))
            }
            Self.encode(image, degrees: shot.degrees, shot.done)
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
        guard let device = types.lazy.compactMap({ type in found.first { $0.deviceType == type } }).first else {
            throw NSError(domain: "CameraEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "no back camera"])
        }
        let input = try AVCaptureDeviceInput(device: device)

        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(photoOutput) else {
            session.commitConfiguration()
            throw NSError(domain: "CameraEngine", code: 2, userInfo: [NSLocalizedDescriptionKey: "can't use this camera"])
        }
        session.addInput(input)
        session.addOutput(photoOutput)
        photoOutput.maxPhotoQualityPrioritization = .balanced
        if #available(iOS 17.0, *) {
            if photoOutput.isZeroShutterLagSupported { photoOutput.isZeroShutterLagEnabled = true }
            if photoOutput.isResponsiveCaptureSupported {
                photoOutput.isResponsiveCaptureEnabled = true
                if photoOutput.isFastCapturePrioritizationSupported { photoOutput.isFastCapturePrioritizationEnabled = true }
            }
        }
        session.commitConfiguration()

        // With an ultra-wide lens the device's zoom 1 *is* the ultra-wide;
        // the main lens starts at the first switch-over factor (usually 2).
        let hasUltraWide = device.deviceType == .builtInTripleCamera || device.deviceType == .builtInDualWideCamera
        wideFactor = hasUltraWide ? CGFloat(truncating: device.virtualDeviceSwitchOverVideoZoomFactors.first ?? 1) : 1
        self.device = device
        configured = true
    }

    private func setZoomFactor(_ factor: CGFloat, animated: Bool) {
        guard let device = device, (try? device.lockForConfiguration()) != nil else { return }
        if animated {
            device.ramp(toVideoZoomFactor: factor, withRate: 12)
        } else {
            device.cancelVideoZoomRamp()
            device.videoZoomFactor = factor
        }
        device.unlockForConfiguration()
    }

    private func setFocus(at point: CGPoint) {
        guard let device = device, (try? device.lockForConfiguration()) != nil else { return }
        if device.isFocusPointOfInterestSupported { device.focusPointOfInterest = point }
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        if device.isExposurePointOfInterestSupported { device.exposurePointOfInterest = point }
        if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
        device.isSubjectAreaChangeMonitoringEnabled = false
        device.unlockForConfiguration()
    }

    private func maxFactor(_ device: AVCaptureDevice) -> CGFloat {
        // The Camera app stops at 15x on most phones; beyond that it's mush.
        min(device.maxAvailableVideoZoomFactor, wideFactor * 15)
    }

    /// The lens buttons to offer, the zoom range, and whether there's a flash.
    private func info() -> Info {
        guard let device = device else { return Info(lenses: [1], minZoom: 1, maxZoom: 1, zoom: 1, flash: false) }
        var lenses: [Double] = [1, 2]
        if wideFactor > 1 { lenses.insert(Double(1 / wideFactor), at: 0) }
        let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors.map { Double(truncating: $0) / Double(wideFactor) }
        if let tele = switchOvers.last, tele > 1.01 { lenses.append(tele) }
        lenses = Array(Set(lenses.map { ($0 * 10).rounded() / 10 })).sorted()
        return Info(
            lenses: lenses,
            minZoom: Double(device.minAvailableVideoZoomFactor / wideFactor),
            maxZoom: Double(maxFactor(device) / wideFactor),
            zoom: Double(device.videoZoomFactor / wideFactor),
            flash: photoOutput.supportedFlashModes.contains(.on)
        )
    }

    // MARK: - Helpers

    private static func encode(_ image: UIImage, degrees: Int, _ done: @escaping (Result<Data, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let rendered = render(image, rotatedBy: degrees, maxEdge: 2560)
            if let jpeg = rendered.jpegData(compressionQuality: 0.85) {
                done(.success(jpeg))
            } else {
                done(.failure(Failure.unavailable("Couldn't save the photo")))
            }
        }
    }

    /// Scales `image` so its long edge is at most `maxEdge`, turned
    /// `degrees` clockwise.
    static func render(_ image: UIImage, rotatedBy degrees: Int, maxEdge: CGFloat) -> UIImage {
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

    /// A pretend slide for the Simulator.
    private static func makeStandIn() -> UIImage {
        let size = CGSize(width: 1200, height: 1600)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(white: 0.32, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(white: 0.93, alpha: 1).setFill()
            let slide = CGRect(x: 100, y: 500, width: 1000, height: 600)
            context.fill(slide)
            let title: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 72), .foregroundColor: UIColor.black,
            ]
            let body: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 40), .foregroundColor: UIColor.darkGray,
            ]
            ("Simulator camera" as NSString).draw(at: CGPoint(x: 160, y: 560), withAttributes: title)
            ("A stand-in slide: there's no real camera here." as NSString).draw(at: CGPoint(x: 160, y: 700), withAttributes: body)
            ("Time \(Date().formatted(date: .omitted, time: .standard))" as NSString)
                .draw(at: CGPoint(x: 160, y: 780), withAttributes: body)
        }
    }
}
