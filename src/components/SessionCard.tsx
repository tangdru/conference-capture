import type { ReactNode } from 'react'
import type { Session } from '../types'
import { formatElapsed, formatSessionSubtitle } from '../format'
import { isSessionActive } from '../sessionActivity'
import { ErrorIcon, NoteIcon, PhotoIcon, PresentationIcon, SparkleIcon } from './InlineIcons'
import { isReadyToGenerate } from '../deck'
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
  const notes = session.items.filter((i) => i.type === 'note').length
  const photos = session.items.filter((i) => i.type === 'photo').length

  if (isSessionActive(session, now)) {
    const elapsed = formatElapsed(elapsedFor(session, now))
    return (
      <button className="session-card session-card--active" onClick={onTap}>
        <p className="session-card__title">{session.title}</p>
        <div className="session-card__active-row">
          <DeckIcon session={session} onView={onViewDeck} onGenerate={onGenerateDeck} live />
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
        <BuildingStatus session={session} />
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
      <div className="session-card__meta">
        <span className="session-card__stats">
          <DeckIcon session={session} onView={onViewDeck} onGenerate={onGenerateDeck} />
          <span className="session-card__stat" aria-label={`${notes} notes`}>
            <NoteIcon /> {notes}
          </span>
          <span className="session-card__stat" aria-label={`${photos} photos`}>
            <PhotoIcon /> {photos}
          </span>
        </span>
        <span className="session-card__subtitle">{formatSessionSubtitle(session.startedAt)}</span>
      </div>
      <BuildingStatus session={session} />
    </button>
  )
}

/** The presentation's state as one tappable icon, leading the card's status
 * line: a sparkle when one could be made (past sessions only -- a live one is
 * still being captured), the board when it's ready, magenta when it failed.
 * A span, not a nested <button> (the card itself is one); it stops the tap
 * from also opening the session. */
function DeckIcon({
  session,
  onView,
  onGenerate,
  live = false,
}: {
  session: Session
  onView: () => void
  onGenerate: () => void
  live?: boolean
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
  } else if (!live && isReadyToGenerate(session)) {
    icon = <SparkleIcon />
    label = 'Generate presentation'
    action = onGenerate
    modifier = 'generate'
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
