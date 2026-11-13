import Capacitor
import UIKit

/// The haptics @capacitor/haptics doesn't offer: the soft and rigid impacts
/// (a cushioned bump, a crisp click). `impact({style: "soft" | "rigid"})`.
@objc(FeelPlugin)
public class FeelPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FeelPlugin"
    public let jsName = "Feel"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
    ]

    @objc func impact(_ call: CAPPluginCall) {
        let style: UIImpactFeedbackGenerator.FeedbackStyle = call.getString("style") == "rigid" ? .rigid : .soft
        DispatchQueue.main.async {
            UIImpactFeedbackGenerator(style: style).impactOccurred()
            call.resolve()
        }
    }
}
