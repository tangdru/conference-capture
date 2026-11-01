import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// The app's tokens (src/index.css).
private let accent = Color(red: 0, green: 0xF0 / 255, blue: 0xE0 / 255)
private let recordingDot = Color(red: 1, green: 0x2D / 255, blue: 0x78 / 255)
private let surface = Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x19 / 255)

/// Lock Screen banner and Dynamic Island for a session that's listening:
/// the recorded time, ticking while live, and a Pause / Resume button.
struct RecordingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecordingActivityAttributes.self) { context in
            LockScreenView(title: context.attributes.sessionTitle, state: context.state)
                .padding(16)
                .activityBackgroundTint(surface)
                .activitySystemActionForegroundColor(accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    StatusLabel(paused: context.state.paused)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedText(state: context.state)
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.attributes.sessionTitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Spacer()
                        ToggleButton(paused: context.state.paused)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                StatusDot(paused: context.state.paused)
            } compactTrailing: {
                ElapsedText(state: context.state)
                    .font(.caption.monospacedDigit())
                    .frame(maxWidth: 64)
            } minimal: {
                StatusDot(paused: context.state.paused)
            }
            .keylineTint(context.state.paused ? .secondary : recordingDot)
        }
    }
}

private struct LockScreenView: View {
    let title: String
    let state: RecordingActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                StatusLabel(paused: state.paused)
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            ElapsedText(state: state)
                .font(.title2.monospacedDigit().weight(.semibold))
                .foregroundStyle(.white)
            ToggleButton(paused: state.paused)
        }
    }
}

/// Ticks on its own while live (no updates needed); frozen while paused.
private struct ElapsedText: View {
    let state: RecordingActivityAttributes.ContentState

    var body: some View {
        if state.paused {
            Text(state.elapsedText).foregroundStyle(.secondary)
        } else {
            // timerInterval, not style: .timer -- the Lock Screen spells the
            // latter out ("12 minutes") instead of a clock.
            Text(timerInterval: state.timerStart...Date.distantFuture, countsDown: false)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct StatusLabel: View {
    let paused: Bool

    var body: some View {
        HStack(spacing: 6) {
            StatusDot(paused: paused)
            Text(paused ? "Paused" : "Listening")
                .font(.caption.weight(.semibold))
                .foregroundStyle(paused ? .secondary : recordingDot)
        }
    }
}

private struct StatusDot: View {
    let paused: Bool

    var body: some View {
        if paused {
            Image(systemName: "pause.fill")
                .font(.caption2)
                .foregroundStyle(.secondary)
        } else {
            Circle()
                .fill(recordingDot)
                .frame(width: 8, height: 8)
        }
    }
}

private struct ToggleButton: View {
    let paused: Bool

    var body: some View {
        Group {
            if paused {
                Button(intent: ResumeRecordingIntent()) { icon("mic.fill") }
                    .accessibilityLabel("Resume recording")
            } else {
                Button(intent: PauseRecordingIntent()) { icon("pause.fill") }
                    .accessibilityLabel("Pause recording")
            }
        }
        .buttonStyle(.plain)
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.body.weight(.semibold))
            .foregroundStyle(.black)
            .frame(width: 44, height: 44)
            .background(accent, in: Circle())
    }
}
