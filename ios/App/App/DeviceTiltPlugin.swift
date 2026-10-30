import Capacitor
import CoreMotion

/// Reports how the phone is physically held while the UI stays locked to
/// portrait (Info.plist), so the camera can save a landscape photo when the
/// phone is turned sideways without rotating the viewfinder itself. Reads
/// gravity from the accelerometer -- unlike UIDevice.orientation, that still
/// works when the user has Portrait Orientation Lock on, and needs no
/// permission prompt.
@objc(DeviceTiltPlugin)
public class DeviceTiltPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceTiltPlugin"
    public let jsName = "DeviceTilt"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startWatching", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopWatching", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRotation", returnType: CAPPluginReturnPromise),
    ]

    private let motion = CMMotionManager()
    // Last settled rotation, kept between readings so a phone lying flat
    // (gravity mostly on z) keeps whatever it was last held at.
    private var rotation = 0

    @objc func startWatching(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.motion.isAccelerometerAvailable && !self.motion.isAccelerometerActive {
                self.motion.accelerometerUpdateInterval = 0.1
                self.motion.startAccelerometerUpdates()
            }
            call.resolve()
        }
    }

    @objc func stopWatching(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.motion.stopAccelerometerUpdates()
            call.resolve()
        }
    }

    /// Degrees clockwise to turn a portrait frame so it comes out upright:
    /// 0, 90, 180 or 270.
    @objc func getRotation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let g = self.motion.accelerometerData?.acceleration {
                // Gravity points toward whichever edge of the phone is down;
                // only switch once it clearly favors one edge.
                if abs(g.x) > 0.6 && abs(g.x) > abs(g.y) {
                    // Left edge down (top of the phone turned left) -> the
                    // scene's "up" is the frame's right side -> turn it 270.
                    self.rotation = g.x < 0 ? 270 : 90
                } else if abs(g.y) > 0.6 {
                    self.rotation = g.y < 0 ? 0 : 180
                }
            }
            call.resolve(["degrees": self.rotation])
        }
    }
}
