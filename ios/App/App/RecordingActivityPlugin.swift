import ActivityKit
import Capacitor
import Foundation

/// Starts, updates and ends the recording Live Activity (Shared/
/// RecordingActivity.swift, drawn by the RecordingWidget extension), and
/// reports its Pause / Resume buttons back to JS as "action" events. JS owns
/// the recording state; this only mirrors it. iOS 18+ -- a no-op before.
@objc(RecordingActivityPlugin)
public class RecordingActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RecordingActivityPlugin"
    public let jsName = "RecordingActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        RecordingActivityActions.handler = { [weak self] action in
            // Kept until JS is listening, in case the button woke the app.
            self?.notifyListeners("action", data: ["action": action], retainUntilConsumed: true)
        }
        // One left over from a previous launch (the app was closed while
        // listening) no longer means anything.
        if #available(iOS 18.0, *) {
            Task { await Self.endAll() }
        }
    }

    /// Shows the activity for `sessionId`, or updates it if it's already up.
    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 18.0, *) else { return call.resolve() }
        guard let sessionId = call.getString("sessionId") else {
            return call.reject("Missing sessionId")
        }
        let title = call.getString("title") ?? "Session"
        let paused = call.getBool("paused") ?? false
        let accumulatedMs = call.getDouble("accumulatedMs") ?? 0
        let liveSinceMs = call.getDouble("liveSince")
        let state = RecordingActivityAttributes.ContentState(
            paused: paused,
            accumulatedSeconds: accumulatedMs / 1000,
            liveSince: liveSinceMs.map { Date(timeIntervalSince1970: $0 / 1000) }
        )
        Task {
            await Self.show(sessionId: sessionId, title: title, state: state)
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 18.0, *) else { return call.resolve() }
        Task {
            await Self.endAll()
            call.resolve()
        }
    }

    private static var currentSessionId: String?

    @available(iOS 18.0, *)
    private static func show(sessionId: String, title: String, state: RecordingActivityAttributes.ContentState) async {
        let content = ActivityContent(state: state, staleDate: nil)
        let existing = Activity<RecordingActivityAttributes>.activities
        if currentSessionId == sessionId,
           let activity = existing.first,
           activity.attributes.sessionTitle == title {
            await activity.update(content)
            return
        }
        // A different session, or the title changed (attributes are fixed
        // for an activity's life): replace it.
        for activity in existing {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        do {
            _ = try Activity.request(
                attributes: RecordingActivityAttributes(sessionTitle: title),
                content: content
            )
            currentSessionId = sessionId
        } catch {
            // Not allowed right now (e.g. the app is in the background) --
            // the next update tries again.
            currentSessionId = nil
        }
    }

    @available(iOS 18.0, *)
    private static func endAll() async {
        currentSessionId = nil
        for activity in Activity<RecordingActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
