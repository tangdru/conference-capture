import Capacitor
import UIKit

/// Bridge view controller that registers the app's own (in-project) Capacitor
/// plugins. npm-installed plugins are discovered automatically; local ones
/// have to be registered here. SceneDelegate creates this as the root view
/// controller (Main.storyboard points at it too, for consistency).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AmbientTranscriptionPlugin())
        bridge?.registerPluginInstance(DeviceTiltPlugin())
        bridge?.registerPluginInstance(NativeCameraPlugin())
    }
}
