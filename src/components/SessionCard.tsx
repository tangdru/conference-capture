import type { ReactNode } from 'react'
import type { Session } from '../types'
import { formatElapsed, formatSessionSubtitle } from '../format'
import { isSessionActive } from '../sessionActivity'
import { ErrorIcon, NoteIcon, PhotoIcon, PresentationIcon } from './InlineIcons'
import './SessionCard.css'

interface SessionCardProps {
  session: Session
  now: number
  onTap: () => void
  onViewDeck: () => void
  onGenerateDeck: () => void
}

function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}

export function SessionCard({ session, now, onTap, onViewDeck, onGenerateDeck }: SessionCardProps) {
  const live = isSessionActive(session, now)

  if (!live && session.status === 'enriching') {
    return (
      <button className="session-card" onClick={onTap} disabled>
        <p className="session-card__title">Processing…</p>
        <p className="session-card__subtitle">{formatSessionSubtitle(session.startedAt)}</p>
        <p className="session-card__hint">Preparing your notes</p>
      </button>
    )
  }

  return (
    <button className={`session-card${live ? ' session-card--active' : ''}`} onClick={onTap}>
      <p className="session-card__title">{session.title}</p>
      <StatusLine session={session} now={now} live={live} onView={onViewDeck} onGenerate={onGenerateDeck} />
      <BuildingStatus session={session} />
    </button>
  )
}

/** The status line, in one order on every card -- left to right, whichever
 * apply: the recording time (live sessions), the presentation's action icon,
 * note/photo counts, and the start date and time aligned right (past
 * sessions; wraps under the rest on a narrow screen). */
function StatusLine({
  session,
  now,
  live,
  onView,
  onGenerate,
}: {
  session: Session
  now: number
  live: boolean
  onView: () => void
  onGenerate: () => void
}) {
  const notes = session.items.filter((i) => i.type === 'note').length
  const photos = session.items.filter((i) => i.type === 'photo').length
  const elapsed = formatElapsed(elapsedFor(session, now))
  const recording = session.status === 'recording'

  return (
    <div className="session-card__meta">
      <span className="session-card__stats">
        {live && (
          <span className="session-card__elapsed" aria-label={recording ? `Recording, ${elapsed}` : `${elapsed} recorded`}>
            <span
              className={`rec-dot session-card__rec-dot${recording ? ' rec-dot--live' : ''}`}
              aria-hidden="true"
            />{' '}
            {recording ? `REC ${elapsed}` : `${elapsed} recorded`}
          </span>
        )}
        <DeckIcon session={session} onView={onView} onGenerate={onGenerate} />
        <span className="session-card__stat" aria-label={`${notes} notes`}>
          <NoteIcon /> {notes}
        </span>
        <span className="session-card__stat" aria-label={`${photos} photos`}>
          <PhotoIcon /> {photos}
        </span>
      </span>
      {!live && <span className="session-card__subtitle">{formatSessionSubtitle(session.startedAt)}</span>}
    </div>
  )
}

/** The presentation's state as one tappable icon on the card's status line:
 * the board when it's ready, magenta when it failed, nothing otherwise
 * (generating starts from the swipe row's sparkle).
 * A span, not a nested <button> (the card itself is one); it stops the tap
 * from also opening the session. */
function DeckIcon({
  session,
  onView,
  onGenerate,
}: {
  session: Session
  onView: () => void
  onGenerate: () => void
}) {
  let icon: ReactNode
  let label: string
  let action: () => void
  let modifier: string
  if (session.deckStatus === 'ready') {
    icon = <PresentationIcon />
    label = 'View presentation'
    action = onView
    modifier = 'ready'
  } else if (session.deckStatus === 'error') {
    icon = <ErrorIcon />
    label = `Presentation failed${session.deckError ? `: ${session.deckError}` : ''}. Try again`
    action = onGenerate
    modifier = 'error'
  } else {
    return null
  }

  return (
    <span
      className={`session-card__deck-icon session-card__deck-icon--${modifier}`}
      role="button"
      aria-label={label}
      title={label}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        action()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          action()
        }
      }}
    >
      {icon}
    </span>
  )
}

/** Generation takes a few minutes and otherwise happens silently, so say so. */
function BuildingStatus({ session }: { session: Session }) {
  if (session.deckStatus !== 'generating') return null
  return (
    <p className="session-card__deck" role="status">
      <span className="session-card__deck-dot" aria-hidden="true" /> Building presentation… this takes a few minutes
    </p>
  )
}
