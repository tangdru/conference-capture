import type { Session } from '../types'
import { formatElapsed, formatSessionSubtitle } from '../format'
import { isSessionActive } from '../sessionActivity'
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

  if (isSessionActive(session, now)) {
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
          {session.status === 'recording' ? 'Tap to return to capture' : 'Tap to add more'}
        </p>
        <DeckStatus session={session} />
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
      <DeckStatus session={session} />
    </button>
  )
}

/** The presentation's state, so a tap on the swipe-row sparkle visibly does
 * something -- generation takes a few minutes and otherwise happens silently. */
function DeckStatus({ session }: { session: Session }) {
  switch (session.deckStatus) {
    case 'generating':
      return (
        <p className="session-card__deck session-card__deck--generating" role="status">
          <span className="session-card__deck-dot" aria-hidden="true" /> Building presentation… this takes a few minutes
        </p>
      )
    case 'ready':
      return <p className="session-card__deck">Presentation ready · swipe left to view</p>
    case 'error':
      return (
        <p className="session-card__deck session-card__deck--error" role="status">
          Presentation failed · swipe left to try again
        </p>
      )
    default:
      return null
  }
}
