import ActivityKit
import AppIntents
import Foundation

/// The Live Activity shown on the Lock Screen and in the Dynamic Island while
/// a session is listening. Compiled into both the app (which starts and
/// updates it) and the RecordingWidget extension (which draws it).
@available(iOS 18.0, *)
struct RecordingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var paused: Bool
        /// Time recorded before the current live stretch.
        var accumulatedSeconds: Double
        /// When the current live stretch began; nil while paused.
        var liveSince: Date?

        /// A date that a counting-up timer can start from to show the total
        /// recorded time.
        var timerStart: Date {
            (liveSince ?? Date()).addingTimeInterval(-accumulatedSeconds)
        }

        var elapsedText: String {
            let total = Int(accumulatedSeconds)
            let h = total / 3600, m = (total % 3600) / 60, s = total % 60
            return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
        }
    }

    var sessionTitle: String
}

/// Where the app hears the Live Activity's Pause and Resume buttons. Set by
/// RecordingActivityPlugin; nil in the widget extension, which never runs
/// these intents itself.
enum RecordingActivityActions {
    static var handler: ((_ action: String) -> Void)?
}

/// AudioRecordingIntent lets Resume start the microphone again while the app
/// is in the background; LiveActivityIntent runs both in the app's process.
@available(iOS 18.0, *)
struct PauseRecordingIntent: LiveActivityIntent, AudioRecordingIntent {
    static var title: LocalizedStringResource = "Pause recording"
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await MainActor.run { RecordingActivityActions.handler?("pause") }
        return .result()
    }
}

@available(iOS 18.0, *)
struct ResumeRecordingIntent: LiveActivityIntent, AudioRecordingIntent {
    static var title: LocalizedStringResource = "Resume recording"
    static var isDiscoverable = false

    func perform() async throws -> some IntentResult {
        await MainActor.run { RecordingActivityActions.handler?("resume") }
        return .result()
    }
}
