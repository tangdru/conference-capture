import AVFoundation
import AVKit
import CoreMotion
import UIKit

/// The camera screen, native, opened over the app by NativeCameraPlugin.
/// Laid out like the iPhone Camera app and the web viewfinder it replaces
/// (CameraViewfinder.tsx, still used on the website): flash at the top, a 3:4
/// preview starting 59pt below the safe area with the cyan corner marks, lens
/// buttons and pinch to zoom, tap to focus, the last three photos top-left
/// (hold one to see it larger), and the shutter centred 124pt above the
/// bottom safe area with Remember this and the clip button beside it while a
/// talk records. The volume buttons (and the Camera Control button) take a
/// photo too. Swipe down to close.
///
/// The screen stays portrait; held sideways, the photo comes out landscape
/// and the icons turn to stay upright.
final class CameraViewController: UIViewController {
    // What the page asks for, kept current through `update`.
    var showRemember = false { didSet { if isViewLoaded { layoutControls(animated: false) } } }
    var showClip = false { didSet { if isViewLoaded { layoutControls(animated: false) } } }
    var remembered = false { didSet { if isViewLoaded { drawStar() } } }
    var clipEndsAt: Date? { didSet { if isViewLoaded { clipTick() } } }

    // What it tells the page.
    var onPhoto: ((Data) -> Void)?
    var onRemember: (() -> Void)?
    var onClip: (() -> Void)?
    var onClose: (() -> Void)?
    /// The camera couldn't open (other than a denied permission).
    var onUnavailable: ((String) -> Void)?

    private let engine = CameraEngine.shared

    // Design tokens (src/index.css).
    private enum Palette {
        static let background = UIColor(red: 0x0f / 255, green: 0x0f / 255, blue: 0x0d / 255, alpha: 1)
        static let textPrimary = UIColor(red: 0xee / 255, green: 0xee / 255, blue: 0xe9 / 255, alpha: 1)
        static let textSecondary = UIColor(red: 0x9b / 255, green: 0x9a / 255, blue: 0x94 / 255, alpha: 1)
        static let textMuted = UIColor(red: 0x5e / 255, green: 0x5d / 255, blue: 0x58 / 255, alpha: 1)
        static let accent = UIColor(red: 0x00 / 255, green: 0xf0 / 255, blue: 0xe0 / 255, alpha: 1)
        static let warning = UIColor(red: 0xe8 / 255, green: 0xb3 / 255, blue: 0x39 / 255, alpha: 1)
        static let error = UIColor(red: 0xff / 255, green: 0x6b / 255, blue: 0x6b / 255, alpha: 1)
    }

    // MARK: - Views

    private let stage = UIView()
    private let preview = PreviewView()
    private let standInView = UIImageView()
    private let reticle = UIView()
    private let errorLabel = UILabel()
    private let blink = UIView()
    private let focusRing = UIView()
    private let lensPill = UIView()
    private var lensButtons: [UIButton] = []
    private let strip = UIView()
    private var thumbViews: [UIImageView] = []
    private let overflowLabel = UILabel()
    private let peek = UIView()
    private let peekImage = UIImageView()
    private let flashButton = UIButton(type: .custom)
    private let flashIcon = CAShapeLayer()
    private let flashSlash = CAShapeLayer()
    private let flashAuto = UILabel()
    private let shutter = UIButton(type: .custom)
    private let starButton = UIButton(type: .custom)
    private let starIcon = CAShapeLayer()
    private let clipButton = UIButton(type: .custom)
    private let clipIcon = CAShapeLayer()
    private let clipCount = UILabel()
    private let hint = UILabel()

    // MARK: - State

    private var lenses: [Double] = []
    private var zoom: Double = 1
    private var zoomRange: ClosedRange<Double>?
    private var flashModes: [String] = []
    // Off by default: a flash on a projected slide only adds glare.
    private var flash = "off"
    private var shots: [UIImage] = []
    private var tilt = 0
    private var pinchStartZoom: Double = 1
    // A pinch during the current touches: its end isn't a swipe down to close.
    private var pinched = false
    private let motion = CMMotionManager()
    private var tiltTimer: Timer?
    private var clipTimer: Timer?
    private let haptic = UIImpactFeedbackGenerator(style: .light)
    private var captureInteraction: UIInteraction?
    private var previewingObservation: NSKeyValueObservation?

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.background
        buildStage()
        buildTopBar()
        buildBottomBar()
        buildGestures()
        buildVolumeShutter()
        drawFlash()
        drawStar()
        clipTick()
        haptic.prepare()
    }

    /// Switches the camera on, then calls `ready` -- the plugin shows this
    /// screen only then, so it opens straight onto the live picture. Also
    /// called back when access is off (the screen says so). If there's no
    /// camera at all, `onUnavailable` instead.
    func start(ready: @escaping () -> Void) {
        loadViewIfNeeded()
        engine.start { [weak self] result in
            guard let self = self else { return }
            switch result {
            case let .success(info):
                defer { ready() }
                self.lenses = info.lenses
                self.zoom = info.zoom
                self.zoomRange = info.minZoom...info.maxZoom
                self.flashModes = info.flash ? ["off", "auto", "on"] : []
                if let standIn = self.engine.standIn {
                    self.standInView.image = standIn
                    self.standInView.isHidden = false
                    self.revealPreview()
                } else {
                    self.preview.previewLayer.session = self.engine.session
                    self.steadyPreview()
                    self.revealOnFirstFrame()
                }
                self.flashButton.isHidden = self.flashModes.isEmpty
                self.buildLenses()
                self.view.setNeedsLayout()
            case .failure(.denied):
                defer { ready() }
                self.errorLabel.text = "Camera access is off -- turn it on in Settings > Conference Capture."
                self.errorLabel.isHidden = false
            case let .failure(.unavailable(message)):
                self.onUnavailable?(message)
            }
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        startTilt()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        engine.stop()
        tiltTimer?.invalidate()
        clipTimer?.invalidate()
        motion.stopAccelerometerUpdates()
    }

    // MARK: - Layout

    private var vfTop: CGFloat { view.safeAreaInsets.top + 59 }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = view.bounds.width
        let height = view.bounds.height
        let stageHeight = min(width * 4 / 3, height - vfTop - 216)
        stage.frame = CGRect(x: 0, y: vfTop, width: width, height: stageHeight)
        preview.frame = stage.bounds
        standInView.frame = stage.bounds
        blink.frame = stage.bounds
        peek.frame = stage.bounds
        errorLabel.frame = stage.bounds.insetBy(dx: 32, dy: 0)
        reticle.frame = CGRect(
            x: width * 0.1, y: stageHeight * 0.15, width: width * 0.8, height: stageHeight * 0.7
        )
        layoutReticle()
        flashButton.frame = CGRect(x: width / 2 - 22, y: view.safeAreaInsets.top + 59 / 2 - 22, width: 44, height: 44)
        layoutLenses()
        layoutStrip()
        layoutPeek()
        layoutControls(animated: false)
        let hintHeight: CGFloat = 16
        hint.frame = CGRect(x: 0, y: height - view.safeAreaInsets.bottom - 20 - hintHeight, width: width, height: hintHeight)
    }

    /// Shutter centre 124pt above the bottom safe area; the star 70pt right of
    /// it and the clip button 110pt, the same as beside the camera button on
    /// the session screen. Held sideways the other way (top turned left), the
    /// star moves to the shutter's left and the clip button takes its place.
    private func layoutControls(animated: Bool) {
        let mid = view.bounds.width / 2
        let y = view.bounds.height - view.safeAreaInsets.bottom - 124
        shutter.bounds = CGRect(x: 0, y: 0, width: 80, height: 80)
        shutter.center = CGPoint(x: mid, y: y)
        let starLeft = tilt == 270
        let place = {
            self.starButton.center = CGPoint(x: starLeft ? mid - 70 : mid + 70, y: y)
            self.clipButton.center = CGPoint(x: (starLeft || !self.showRemember) ? mid + 70 : mid + 110, y: y)
        }
        starButton.bounds = CGRect(x: 0, y: 0, width: 48, height: 48)
        clipButton.bounds = CGRect(x: 0, y: 0, width: 48, height: 48)
        starButton.isHidden = !showRemember
        clipButton.isHidden = !showClip
        if animated { UIView.animate(withDuration: 0.3, animations: place) } else { place() }
    }

    // MARK: - Building

    private func buildStage() {
        stage.backgroundColor = .black
        stage.clipsToBounds = true
        view.addSubview(stage)

        preview.previewLayer.videoGravity = .resizeAspectFill
        // Hidden until the camera's first frame, then faded in.
        preview.alpha = 0
        standInView.alpha = 0
        stage.addSubview(preview)
        standInView.contentMode = .scaleAspectFill
        standInView.clipsToBounds = true
        standInView.isHidden = true
        stage.addSubview(standInView)

        errorLabel.textColor = Palette.textSecondary
        errorLabel.font = .systemFont(ofSize: 14)
        errorLabel.numberOfLines = 0
        errorLabel.textAlignment = .center
        errorLabel.isHidden = true
        stage.addSubview(errorLabel)

        reticle.isUserInteractionEnabled = false
        stage.addSubview(reticle)
        for _ in 0..<4 {
            let corner = CAShapeLayer()
            corner.strokeColor = Palette.accent.cgColor
            corner.fillColor = nil
            corner.lineWidth = 2
            reticle.layer.addSublayer(corner)
        }

        focusRing.layer.borderColor = Palette.accent.cgColor
        focusRing.layer.borderWidth = 1.5
        focusRing.isUserInteractionEnabled = false
        focusRing.alpha = 0
        focusRing.bounds = CGRect(x: 0, y: 0, width: 72, height: 72)
        stage.addSubview(focusRing)

        blink.backgroundColor = UIColor.black.withAlphaComponent(0.85)
        blink.isUserInteractionEnabled = false
        blink.alpha = 0
        stage.addSubview(blink)

        peek.backgroundColor = UIColor.black.withAlphaComponent(0.88)
        peek.isUserInteractionEnabled = false
        peek.alpha = 0
        peekImage.contentMode = .scaleAspectFit
        peekImage.layer.cornerRadius = 4
        peekImage.clipsToBounds = true
        peek.addSubview(peekImage)
        stage.addSubview(peek)

        lensPill.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        lensPill.isHidden = true
        stage.addSubview(lensPill)

        stage.addSubview(strip)
        overflowLabel.font = .systemFont(ofSize: 12)
        overflowLabel.textColor = Palette.textSecondary
        strip.addSubview(overflowLabel)
    }

    private func buildTopBar() {
        flashButton.accessibilityLabel = "Flash off"
        flashButton.addTarget(self, action: #selector(cycleFlash), for: .touchUpInside)
        flashButton.isHidden = true
        let box = CGRect(x: 12.5, y: 12.5, width: 19, height: 19)
        for layer in [flashIcon, flashSlash] {
            layer.frame = box
            layer.lineWidth = 1.5 * 19 / 22
            layer.lineJoin = .round
            layer.lineCap = .round
            flashButton.layer.addSublayer(layer)
        }
        flashIcon.path = Self.flashPath(size: 19)
        flashSlash.path = {
            let p = UIBezierPath()
            let s: CGFloat = 19 / 22
            p.move(to: CGPoint(x: 1.5 * s, y: 2.5 * s))
            p.addLine(to: CGPoint(x: 14.5 * s, y: 19.5 * s))
            return p.cgPath
        }()
        flashSlash.fillColor = nil
        flashAuto.text = "A"
        flashAuto.font = .systemFont(ofSize: 7, weight: .bold)
        flashAuto.frame = CGRect(x: 12.5 + 16 * 19 / 22 - 1, y: 12.5 + 13 * 19 / 22, width: 8, height: 8)
        flashButton.addSubview(flashAuto)
        view.addSubview(flashButton)
    }

    private func buildBottomBar() {
        // 68pt disc inside an 80pt ring, the Camera app's shutter size. The
        // gap between them is the background colour, as on the web, so a star
        // passing behind doesn't show through it.
        let backing = CAShapeLayer()
        backing.path = UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 80, height: 80)).cgPath
        backing.fillColor = Palette.background.cgColor
        shutter.layer.addSublayer(backing)
        let ring = CAShapeLayer()
        ring.path = UIBezierPath(ovalIn: CGRect(x: 1.5, y: 1.5, width: 77, height: 77)).cgPath
        ring.strokeColor = Palette.accent.cgColor
        ring.fillColor = nil
        ring.lineWidth = 3
        shutter.layer.addSublayer(ring)
        let disc = CAShapeLayer()
        disc.path = UIBezierPath(ovalIn: CGRect(x: 6, y: 6, width: 68, height: 68)).cgPath
        disc.fillColor = Palette.accent.cgColor
        shutter.layer.addSublayer(disc)
        shutter.accessibilityLabel = "Capture photo"
        shutter.addTarget(self, action: #selector(shutterDown), for: .touchDown)
        shutter.addTarget(self, action: #selector(shutterUp), for: [.touchUpOutside, .touchCancel])
        shutter.addTarget(self, action: #selector(takePhoto), for: .touchUpInside)
        view.addSubview(shutter)

        starIcon.frame = CGRect(x: 11, y: 11, width: 26, height: 26)
        starIcon.path = Self.starPath(size: 26)
        starIcon.strokeColor = Palette.warning.cgColor
        starIcon.lineWidth = 1.6 * 26 / 21.6
        starIcon.lineJoin = .round
        starButton.layer.addSublayer(starIcon)
        starButton.addTarget(self, action: #selector(rememberTapped), for: .touchUpInside)
        view.addSubview(starButton)

        clipIcon.frame = CGRect(x: 11, y: 11, width: 26, height: 26)
        clipIcon.path = Self.clipPath(size: 26)
        clipIcon.strokeColor = Palette.accent.cgColor
        clipIcon.lineWidth = 2.1 * 26 / 24
        clipIcon.lineCap = .round
        clipIcon.fillColor = nil
        clipButton.layer.addSublayer(clipIcon)
        clipButton.layer.cornerRadius = 24
        clipCount.font = .monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
        clipCount.textColor = Palette.textPrimary
        clipCount.textAlignment = .center
        clipCount.frame = CGRect(x: 0, y: 0, width: 48, height: 48)
        clipCount.isHidden = true
        clipButton.addSubview(clipCount)
        clipButton.addTarget(self, action: #selector(clipTapped), for: .touchUpInside)
        view.addSubview(clipButton)
        // The star crosses the shutter when the phone turns sideways the other
        // way; it passes behind it, not over it.
        view.bringSubviewToFront(shutter)

        hint.textAlignment = .center
        drawHint()
        view.addSubview(hint)
    }

    private func buildGestures() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(stageTapped(_:)))
        stage.addGestureRecognizer(tap)
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:)))
        view.addGestureRecognizer(pinch)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        pan.maximumNumberOfTouches = 1
        view.addGestureRecognizer(pan)
    }

    /// Volume up or down, or the Camera Control button: a press takes a
    /// photo (and doesn't change the volume) while the camera is open.
    private func buildVolumeShutter() {
        if #available(iOS 17.2, *) {
            let interaction = AVCaptureEventInteraction { [weak self] event in
                if event.phase == .ended { self?.takePhoto() }
            }
            view.addInteraction(interaction)
            captureInteraction = interaction
        }
    }

    private func buildLenses() {
        lensButtons.forEach { $0.removeFromSuperview() }
        lensButtons = lenses.map { lens in
            let button = UIButton(type: .custom)
            button.layer.cornerRadius = 15
            button.backgroundColor = UIColor.black.withAlphaComponent(0.45)
            button.addAction(UIAction { [weak self] _ in self?.setZoomTo(lens, animated: true) }, for: .touchUpInside)
            lensPill.addSubview(button)
            return button
        }
        lensPill.isHidden = lenses.isEmpty
        drawLenses()
    }

    /// The live picture fades in once its first frame is drawn, rather than
    /// the stage sitting black and then snapping to the picture.
    /// The first-frame signal isn't dependable on every phone (it can come
    /// before we listen, or not at all), so a short timer reveals the picture
    /// regardless -- it must never stay hidden.
    private func revealOnFirstFrame() {
        if #available(iOS 17.0, *) {
            previewingObservation = preview.previewLayer.observe(\.isPreviewing, options: [.initial, .new]) { [weak self] layer, _ in
                guard layer.isPreviewing else { return }
                DispatchQueue.main.async { self?.revealPreview() }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in self?.revealPreview() }
    }

    private var revealed = false

    private func revealPreview() {
        guard !revealed else { return }
        revealed = true
        previewingObservation = nil
        UIView.animate(withDuration: 0.18) {
            self.preview.alpha = 1
            self.standInView.alpha = 1
        }
    }

    /// Steadies the preview against hand shake, as the Camera app does.
    private func steadyPreview() {
        guard let connection = preview.previewLayer.connection else { return }
        if #available(iOS 17.0, *), connection.isVideoStabilizationSupported {
            connection.preferredVideoStabilizationMode = .previewOptimized
        }
    }

    // MARK: - Drawing

    private func layoutReticle() {
        let size = reticle.bounds.size
        let l: CGFloat = 28
        let corners: [(CGPoint, CGPoint, CGPoint)] = [
            (CGPoint(x: 1, y: l), CGPoint(x: 1, y: 1), CGPoint(x: l, y: 1)),
            (CGPoint(x: size.width - l, y: 1), CGPoint(x: size.width - 1, y: 1), CGPoint(x: size.width - 1, y: l)),
            (CGPoint(x: 1, y: size.height - l), CGPoint(x: 1, y: size.height - 1), CGPoint(x: l, y: size.height - 1)),
            (CGPoint(x: size.width - l, y: size.height - 1), CGPoint(x: size.width - 1, y: size.height - 1), CGPoint(x: size.width - 1, y: size.height - l)),
        ]
        for (layer, points) in zip(reticle.layer.sublayers ?? [], corners) {
            let path = UIBezierPath()
            path.move(to: points.0)
            path.addLine(to: points.1)
            path.addLine(to: points.2)
            (layer as? CAShapeLayer)?.path = path.cgPath
        }
    }

    /// The lens in use is the longest one at or below the zoom; its button
    /// shows the exact zoom, like the Camera app.
    private func drawLenses() {
        let active = lenses.last { $0 <= zoom + 0.05 } ?? lenses.first
        for (lens, button) in zip(lenses, lensButtons) {
            let isActive = lens == active
            let title = isActive ? "\(Self.formatZoom(zoom))×" : Self.formatZoom(lens)
            button.setAttributedTitle(NSAttributedString(string: title, attributes: [
                .font: UIFont.monospacedDigitSystemFont(ofSize: isActive ? 13 : 11, weight: .semibold),
                .foregroundColor: isActive ? Palette.accent : Palette.textPrimary,
            ]), for: .normal)
            button.accessibilityLabel = isActive ? "Zoom \(Self.formatZoom(zoom))×" : "Zoom to \(Self.formatZoom(lens))×"
            let side: CGFloat = isActive ? 38 : 30
            button.bounds = CGRect(x: 0, y: 0, width: max(side, button.intrinsicContentSize.width + 8), height: side)
            button.layer.cornerRadius = side / 2
        }
        layoutLenses()
    }

    private func layoutLenses() {
        guard !lensButtons.isEmpty else { return }
        let gap: CGFloat = 6
        let pad: CGFloat = 4
        let height = (lensButtons.map(\.bounds.height).max() ?? 30) + pad * 2
        let width = lensButtons.map(\.bounds.width).reduce(0, +) + gap * CGFloat(lensButtons.count - 1) + pad * 2
        lensPill.frame = CGRect(x: (stage.bounds.width - width) / 2, y: stage.bounds.height - 16 - height, width: width, height: height)
        lensPill.layer.cornerRadius = height / 2
        var x = pad
        for button in lensButtons {
            button.center = CGPoint(x: x + button.bounds.width / 2, y: height / 2)
            button.transform = iconTransform
            x += button.bounds.width + gap
        }
    }

    private func layoutStrip() {
        strip.frame = CGRect(x: 12, y: 12, width: stage.bounds.width - 24, height: 36)
        var x: CGFloat = 0
        for thumb in thumbViews {
            thumb.center = CGPoint(x: x + 18, y: 18)
            thumb.transform = iconTransform
            x += 36 + 8
        }
        let overflow = shots.count - thumbViews.count
        overflowLabel.isHidden = overflow <= 0
        overflowLabel.text = "+\(overflow)"
        overflowLabel.sizeToFit()
        overflowLabel.frame.origin = CGPoint(x: x, y: 18 - overflowLabel.bounds.height / 2)
        strip.isHidden = shots.isEmpty
    }

    private func layoutPeek() {
        let box = peek.bounds.insetBy(dx: 12, dy: 12)
        let sideways = tilt == 90 || tilt == 270
        peekImage.transform = .identity
        peekImage.bounds = CGRect(x: 0, y: 0, width: sideways ? box.height : box.width, height: sideways ? box.width : box.height)
        peekImage.center = CGPoint(x: peek.bounds.midX, y: peek.bounds.midY)
        peekImage.transform = iconTransform
    }

    private func drawFlash() {
        let lit = flash != "off"
        let color = lit ? Palette.warning : Palette.textPrimary
        flashIcon.strokeColor = color.cgColor
        flashIcon.fillColor = flash == "on" ? color.cgColor : nil
        flashSlash.strokeColor = color.cgColor
        flashSlash.isHidden = flash != "off"
        flashAuto.textColor = color
        flashAuto.isHidden = flash != "auto"
        flashButton.accessibilityLabel = "Flash \(flash)"
    }

    private func drawStar() {
        starIcon.fillColor = remembered ? Palette.warning.cgColor : nil
        starButton.accessibilityLabel = remembered ? "Remembered" : "Remember this moment"
    }

    private func drawHint() {
        let text = NSMutableAttributedString(string: "Swipe down to return to notes", attributes: [
            .font: UIFont.systemFont(ofSize: 12), .foregroundColor: Palette.textMuted,
        ])
        if !shots.isEmpty {
            text.append(NSAttributedString(string: " ↓", attributes: [
                .font: UIFont.systemFont(ofSize: 12), .foregroundColor: Palette.accent,
            ]))
        }
        hint.attributedText = text
    }

    /// Seconds left on a recording clip, ticking; else the waveform.
    private func clipTick() {
        let left = clipEndsAt.map { Int(ceil($0.timeIntervalSinceNow)) } ?? 0
        let counting = left > 0
        clipIcon.isHidden = counting
        clipCount.isHidden = !counting
        clipCount.text = "\(left)"
        clipButton.layer.borderWidth = counting ? 2 : 0
        clipButton.layer.borderColor = Palette.error.cgColor
        clipButton.accessibilityLabel = counting ? "Recording clip, \(left) seconds left. Tap to stop" : "Record a clip"
        if counting, clipTimer == nil {
            clipTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.clipTick() }
        } else if !counting {
            clipTimer?.invalidate()
            clipTimer = nil
        }
    }

    // MARK: - Tilt

    /// The icons turn opposite to the phone, the short way round.
    private var iconTransform: CGAffineTransform {
        let turn: CGFloat = tilt == 90 ? -90 : tilt == 270 ? 90 : CGFloat(tilt)
        return CGAffineTransform(rotationAngle: turn * .pi / 180)
    }

    /// Same reading as DeviceTiltPlugin: gravity from the accelerometer, which
    /// works with Portrait Orientation Lock on and needs no permission.
    private func startTilt() {
        if motion.isAccelerometerAvailable {
            motion.accelerometerUpdateInterval = 0.1
            motion.startAccelerometerUpdates()
        }
        tiltTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in self?.readTilt() }
    }

    private func readTilt() {
        guard let g = motion.accelerometerData?.acceleration else { return }
        var next = tilt
        if abs(g.x) > 0.6 && abs(g.x) > abs(g.y) {
            next = g.x < 0 ? 270 : 90
        } else if abs(g.y) > 0.6 {
            next = g.y < 0 ? 0 : 180
        }
        guard next != tilt else { return }
        applyTilt(next)
    }

    private func applyTilt(_ next: Int) {
        tilt = next
        UIView.animate(withDuration: 0.3) {
            let t = self.iconTransform
            self.flashButton.transform = t
            self.starButton.transform = t
            self.clipButton.transform = t
            self.lensButtons.forEach { $0.transform = t }
            self.thumbViews.forEach { $0.transform = t }
            self.layoutPeek()
        }
        layoutControls(animated: true)
    }

    // MARK: - Actions

    @objc private func shutterDown() {
        UIView.animate(withDuration: 0.08) { self.shutter.transform = CGAffineTransform(scaleX: 0.94, y: 0.94) }
    }

    @objc private func shutterUp() {
        UIView.animate(withDuration: 0.12) { self.shutter.transform = .identity }
    }

    /// The photo is asked for at once (the tilt is already known here); the
    /// screen dips to black as in the Camera app, and the haptic comes once
    /// the shot is in, so its nudge can't set the lens refocusing mid-shot.
    @objc private func takePhoto() {
        shutterUp()
        guard errorLabel.isHidden else { return }
        blink.alpha = 1
        UIView.animate(withDuration: 0.12, delay: 0.05) { self.blink.alpha = 0 }
        engine.capture(flash: flash, degrees: tilt) { [weak self] result in
            guard let self = self, case let .success(jpeg) = result else { return }
            self.haptic.impactOccurred()
            self.haptic.prepare()
            self.addShot(jpeg)
        }
    }

    private func addShot(_ jpeg: Data) {
        onPhoto?(jpeg)
        guard let image = UIImage(data: jpeg) else { return }
        shots.append(image)
        let visible = Array(shots.suffix(3))
        while thumbViews.count < visible.count {
            let thumb = UIImageView()
            thumb.contentMode = .scaleAspectFill
            thumb.clipsToBounds = true
            thumb.layer.cornerRadius = 3
            thumb.layer.borderWidth = 1.5
            thumb.layer.borderColor = Palette.accent.cgColor
            thumb.bounds = CGRect(x: 0, y: 0, width: 36, height: 36)
            thumb.isUserInteractionEnabled = true
            thumb.accessibilityLabel = "Hold to preview"
            let check = UILabel(frame: CGRect(x: 36 - 13.5, y: 36 - 13.5, width: 12, height: 12))
            check.text = "✓"
            check.font = .systemFont(ofSize: 9)
            check.textAlignment = .center
            check.textColor = Palette.accent
            check.backgroundColor = UIColor.black.withAlphaComponent(0.5)
            check.layer.cornerRadius = 6
            check.clipsToBounds = true
            thumb.addSubview(check)
            let hold = UILongPressGestureRecognizer(target: self, action: #selector(heldThumb(_:)))
            hold.minimumPressDuration = 0.18
            thumb.addGestureRecognizer(hold)
            strip.addSubview(thumb)
            thumbViews.append(thumb)
        }
        for (thumb, image) in zip(thumbViews, visible) { thumb.image = image }
        layoutStrip()
        drawHint()
    }

    /// Hold a thumbnail to see that photo larger; let go to return.
    @objc private func heldThumb(_ gesture: UILongPressGestureRecognizer) {
        switch gesture.state {
        case .began:
            guard let image = (gesture.view as? UIImageView)?.image else { return }
            peekImage.image = image
            layoutPeek()
            stage.bringSubviewToFront(peek)
            stage.bringSubviewToFront(strip)
            haptic.impactOccurred()
            UIView.animate(withDuration: 0.12) { self.peek.alpha = 1 }
        case .ended, .cancelled, .failed:
            UIView.animate(withDuration: 0.12) { self.peek.alpha = 0 }
        default:
            break
        }
    }

    @objc private func cycleFlash() {
        guard !flashModes.isEmpty else { return }
        flash = flashModes[((flashModes.firstIndex(of: flash) ?? 0) + 1) % flashModes.count]
        drawFlash()
    }

    @objc private func rememberTapped() { onRemember?() }
    @objc private func clipTapped() { onClip?() }

    /// Tap on the preview itself (not a control on it): focus there.
    @objc private func stageTapped(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: stage)
        if lensPill.frame.contains(point) || strip.frame.contains(point) { return }
        let devicePoint: CGPoint
        if engine.standIn != nil {
            devicePoint = CGPoint(x: point.y / stage.bounds.height, y: 1 - point.x / stage.bounds.width)
        } else {
            devicePoint = preview.previewLayer.captureDevicePointConverted(fromLayerPoint: point)
        }
        engine.focus(at: devicePoint)
        focusRing.layer.removeAllAnimations()
        focusRing.center = point
        focusRing.alpha = 1
        focusRing.transform = CGAffineTransform(scaleX: 1.4, y: 1.4)
        UIView.animate(withDuration: 0.25, delay: 0, options: .curveEaseOut) {
            self.focusRing.transform = .identity
        } completion: { _ in
            UIView.animate(withDuration: 0.2, delay: 0.55, options: .curveEaseOut) { self.focusRing.alpha = 0 }
        }
    }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        switch gesture.state {
        case .began:
            pinched = true
            pinchStartZoom = zoom
        case .changed:
            setZoomTo(pinchStartZoom * Double(gesture.scale), animated: false)
        default:
            break
        }
    }

    private func setZoomTo(_ value: Double, animated: Bool) {
        guard let range = zoomRange else { return }
        zoom = min(range.upperBound, max(range.lowerBound, value))
        drawLenses()
        engine.setZoom(zoom, animated: animated)
    }

    /// Swipe down to close -- "down" as the phone is held: sideways, that's
    /// across the portrait screen.
    @objc private func panned(_ gesture: UIPanGestureRecognizer) {
        if gesture.state == .began, gesture.numberOfTouches == 1 { pinched = false }
        guard gesture.state == .ended, !pinched else { return }
        let t = gesture.translation(in: view)
        let down = tilt == 90 ? t.x : tilt == 270 ? -t.x : tilt == 180 ? -t.y : t.y
        if down > 80 { close() }
    }

    func close() {
        guard presentingViewController != nil else { return }
        dismiss(animated: true) { [weak self] in self?.onClose?() }
    }

    // MARK: - Shapes (the web app's SVG icons)

    private static func flashPath(size: CGFloat) -> CGPath {
        let s = size / 22
        let p = UIBezierPath()
        p.move(to: CGPoint(x: 10 * s, y: 1 * s))
        p.addLine(to: CGPoint(x: 2 * s, y: 12.5 * s))
        p.addLine(to: CGPoint(x: 7.5 * s, y: 12.5 * s))
        p.addLine(to: CGPoint(x: 6 * s, y: 21 * s))
        p.addLine(to: CGPoint(x: 14 * s, y: 9.5 * s))
        p.addLine(to: CGPoint(x: 8.5 * s, y: 9.5 * s))
        p.close()
        return p.cgPath
    }

    private static func starPath(size: CGFloat) -> CGPath {
        // viewBox 1.2 1.4 21.6 20.8
        let s = size / 21.6
        let points: [(CGFloat, CGFloat)] = [
            (12, 2.5), (14.9, 8.5), (21.5, 9.3), (16.6, 13.8), (17.9, 20.3),
            (12, 17.1), (6.1, 20.3), (7.4, 13.8), (2.5, 9.3), (9.1, 8.5),
        ]
        let p = UIBezierPath()
        for (i, (x, y)) in points.enumerated() {
            let point = CGPoint(x: (x - 1.2) * s, y: (y - 1.4) * s)
            if i == 0 { p.move(to: point) } else { p.addLine(to: point) }
        }
        p.close()
        return p.cgPath
    }

    private static func clipPath(size: CGFloat) -> CGPath {
        let s = size / 24
        let bars: [(CGFloat, CGFloat, CGFloat)] = [
            (4.8, 6.9, 17.1), (8.5, 9.2, 14.8), (12.1, 3.6, 20.4), (15.8, 6.9, 17.1), (19.4, 8.7, 15.3),
        ]
        let p = UIBezierPath()
        for (x, top, bottom) in bars {
            p.move(to: CGPoint(x: x * s, y: top * s))
            p.addLine(to: CGPoint(x: x * s, y: bottom * s))
        }
        return p.cgPath
    }

    /// ".5", "1", "2", "1.4" -- the Camera app's lens labels.
    private static func formatZoom(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        if rounded < 1 { return ".\(Int((rounded * 10).rounded()))" }
        return rounded == rounded.rounded() ? String(Int(rounded)) : String(format: "%.1f", rounded)
    }
}

/// A view whose own layer is the camera preview, so it resizes with it.
final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
