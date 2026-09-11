import type { Session } from '../types'
import { formatElapsed, formatSessionSubtitle } from '../format'
import './SessionCard.css'

interface SessionCardProps {
  session: Session
  now: number
  onTap: () => void
}

function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}

export function SessionCard({ session, now, onTap }: SessionCardProps) {
  const notes = session.items.filter((i) => i.type === 'note').length
  const photos = session.items.filter((i) => i.type === 'photo').length

  if (session.status === 'recording' || session.status === 'suspended') {
    const elapsed = formatElapsed(elapsedFor(session, now))
    return (
      <button className="session-card session-card--active" onClick={onTap}>
        <div className="session-card__active-row">
          <span className="session-card__active-status">
            {session.status === 'recording' ? (
              <>
                <span className="rec-dot rec-dot--live rec-dot--small" aria-hidden="true" /> REC{' '}
                {elapsed}
              </>
            ) : (
              <>
                <span className="rec-dot rec-dot--small" aria-hidden="true" /> {elapsed} recorded
              </>
            )}
          </span>
        </div>
        <p className="session-card__title">{session.title}</p>
        <p className="session-card__hint">
          {session.status === 'recording'
            ? 'Tap to return to capture'
            : 'Tap to add more, or end the session'}
        </p>
      </button>
    )
  }

  if (session.status === 'enriching') {
    return (
      <button className="session-card" onClick={onTap} disabled>
        <p className="session-card__title">Processing…</p>
        <p className="session-card__subtitle">{formatSessionSubtitle(session.startedAt)}</p>
        <p className="session-card__hint">Preparing your notes</p>
      </button>
    )
  }

  return (
    <button className="session-card" onClick={onTap}>
      <p className="session-card__title">{session.title}</p>
      <p className="session-card__subtitle">{formatSessionSubtitle(session.startedAt)}</p>
      <p className="session-card__stats">
        📝 {notes} &nbsp; 📷 {photos}
      </p>
    </button>
  )
}
