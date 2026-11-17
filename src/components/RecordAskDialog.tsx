import './ClaudeKeySheet.css'
import './ClaudeInviteDialog.css'

/** Why record was tapped in a session that needs a check first. */
export type RecordAsk =
  /** Another talk is recording: recording here would take its mic. */
  | { kind: 'other'; sessionId: string; otherId: string }
  /** Nothing is recording, but this talk ended a while ago. */
  | { kind: 'old'; sessionId: string }

interface RecordAskDialogProps {
  ask: RecordAsk
  title: string
  /** 'other': the recording talk's title. */
  otherTitle?: string
  /** 'old': when this talk last had anything happen. */
  endedAt?: number
  onKeepReading: () => void
  /** 'other': open the talk that's recording. */
  onGoToOther: () => void
  /** 'old': start a new session instead. */
  onNewSession: () => void
  onRecordHere: () => void
}

// Asked when record is tapped in a session that isn't the live one, so a tap
// in an old talk can't take the mic or add a new talk to it by mistake.
export function RecordAskDialog({
  ask, title, otherTitle, endedAt, onKeepReading, onGoToOther, onNewSession, onRecordHere,
}: RecordAskDialogProps) {
  const other = ask.kind === 'other'
  return (
    <div className="claude-invite" role="alertdialog" aria-modal="true" aria-labelledby="record-ask-title" aria-describedby="record-ask-text">
      <div className="claude-invite__card">
        <h2 id="record-ask-title" className="claude-invite__title">
          {other ? `${otherTitle} is recording` : `Record more in ${title}?`}
        </h2>
        <p id="record-ask-text" className="claude-invite__fine">
          {other
            ? `It keeps recording while you read here. Recording here ends ${otherTitle}.`
            : endedAt !== undefined
              ? `This talk ended at ${clockTime(endedAt)}, ${ago(endedAt)}.`
              : 'This talk has ended.'}
        </p>
        {other ? (
          <>
            <button className="claude-key__primary" onClick={onKeepReading}>
              Continue reading
            </button>
            <button className="claude-key__secondary" onClick={onRecordHere}>
              Record here
            </button>
            <button className="claude-key__secondary" onClick={onGoToOther}>
              Go to {otherTitle}
            </button>
          </>
        ) : (
          <>
            <button className="claude-key__primary" onClick={onRecordHere}>
              Resume recording
            </button>
            <button className="claude-key__secondary" onClick={onNewSession}>
              New session
            </button>
            <button className="claude-key__secondary" onClick={onKeepReading}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function ago(ms: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - ms) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}
