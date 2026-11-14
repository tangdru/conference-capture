import { ChatIcon } from './InlineIcons'
import './ClaudeKeySheet.css'
import './ClaudeInviteDialog.css'

interface ClaudeInviteDialogProps {
  /** 'invite': opened by itself now and then. 'needed': a button that uses
   * Claude was tapped before connecting. */
  reason: 'invite' | 'needed'
  busy: boolean
  error: string | null
  onConnect: () => void
  onClose: () => void
}

// Asks to connect Conference Capture to the Claude app, where presentations
// and questions about the sessions now happen. Connect makes the account's
// private link and opens Claude's Add custom connector form, filled in.
export function ClaudeInviteDialog({ reason, busy, error, onConnect, onClose }: ClaudeInviteDialogProps) {
  return (
    <div className="claude-invite" role="dialog" aria-modal="true" aria-labelledby="claude-invite-title">
      <div className="claude-invite__card">
        <span className="claude-invite__icon" aria-hidden="true">
          <ChatIcon />
        </span>
        <h2 id="claude-invite-title" className="claude-invite__title">
          {reason === 'needed' ? 'Connect Claude first' : 'Make presentations and ask questions in Claude'}
        </h2>
        <p className="claude-invite__text">
          Connect Conference Capture to your Claude app. Claude can then read your talks, answer questions about them,
          and make presentations that save back here.
        </p>
        <p className="claude-invite__fine">
          Connect opens Claude with Conference Capture filled in: just tap Add. Needs the Claude app and a Claude Pro
          plan or higher.
        </p>
        {error && <p className="claude-key__error" role="alert">{error}</p>}
        <button className="claude-key__primary" onClick={onConnect} disabled={busy}>
          {busy ? 'Connecting…' : 'Connect to Claude'}
        </button>
        <button className="claude-key__secondary" onClick={onClose} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  )
}
