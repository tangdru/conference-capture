import type { ReactNode } from 'react'
import type { PhotoItem, Session } from '../types'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { formatDuration, formatElapsed, formatSessionSubtitle } from '../format'
import { isSessionActive } from '../sessionActivity'
import { ClockIcon, ErrorIcon, NoteIcon, PhotoIcon, PresentationIcon, SparkleIcon } from './InlineIcons'
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

  // A finished presentation: what the talk was at a glance, and a tap opens it.
  if (!live && session.deckStatus === 'ready' && session.deckPath) {
    return <PresentationSessionCard session={session} onTap={onTap} />
  }

  return (
    <button className={`session-card${live ? ' session-card--active' : ''}`} onClick={onTap}>
      <p className="session-card__title">{session.title}</p>
      <StatusLine session={session} now={now} live={live} onView={onViewDeck} onGenerate={onGenerateDeck} />
      <BuildingStatus session={session} />
    </button>
  )
}

function PresentationSessionCard({ session, onTap }: { session: Session; onTap: () => void }) {
  const photo = coverPhoto(session)
  const bio = session.items.find((i) => i.type === 'enrichment' && i.subtype === 'speaker_bio' && !i.excluded)
  const speaker = bio && bio.type === 'enrichment' && bio.subtype === 'speaker_bio'
    ? [bio.name, bio.org].filter(Boolean).join(' · ')
    : ''
  const meta = [
    formatSessionSubtitle(session.startedAt),
    session.deckReadMinutes ? `${session.deckReadMinutes} min read` : '',
  ].filter(Boolean).join(' · ')
  return (
    <button className="session-card session-card--presentation" onClick={onTap} aria-label={`Open presentation: ${session.title}`}>
      <span className="session-card__cover" aria-hidden="true">
        {photo ? <Cover photo={photo} /> : <PresentationIcon />}
      </span>
      <span className="session-card__body">
        <span className="session-card__title">{session.title}</span>
        {speaker && <span className="session-card__speaker">{speaker}</span>}
        <span className="session-card__subtitle">{meta}</span>
      </span>
    </button>
  )
}

function Cover({ photo }: { photo: PhotoItem }) {
  const url = usePhotoUrl(photo)
  return url ? <img src={url} alt="" loading="lazy" /> : null
}

/** The card's image: a photo the user starred, else the slide Sparkle chose
 * as the talk's most telling, else the first photo after the opening slide. */
function coverPhoto(session: Session): PhotoItem | undefined {
  const photos = session.items.filter((i): i is PhotoItem => i.type === 'photo' && !i.excluded)
  return photos.find((p) => p.starred)
    ?? photos.find((p) => p.id === session.deckCoverPhotoId)
    ?? photos[1]
    ?? photos[0]
}

/** The status line, in one order on every card -- left to right, whichever
 * apply: the recording time (live sessions), the presentation's action icon,
 * note/photo counts, how long it was recorded (past sessions), and the start
 * date and time aligned right (past
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
  const recordedMs = elapsedFor(session, now)
  const elapsed = formatElapsed(recordedMs)
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
        <DeckIcon session={session} onView={onView} onGenerate={onGenerate} live={live} />
        <span className="session-card__stat" aria-label={`${notes} notes`}>
          <NoteIcon /> {notes}
        </span>
        <span className="session-card__stat" aria-label={`${photos} photos`}>
          <PhotoIcon /> {photos}
        </span>
        {/* How long it was recorded; a live card already shows it in full. */}
        {!live && recordedMs > 0 && (
          <span className="session-card__stat" aria-label={`${formatDuration(recordedMs)} recorded`}>
            <ClockIcon /> {formatDuration(recordedMs)}
          </span>
        )}
      </span>
      {!live && <span className="session-card__subtitle">{formatSessionSubtitle(session.startedAt)}</span>}
    </div>
  )
}

/** The presentation's state as one icon on the card's status line: a
 * sparkle when one could be made (past sessions only -- a live one is still
 * being captured; display only), the board when it's ready, magenta when it
 * failed. The latter two are tappable: a span, not a nested <button> (the
 * card itself is one), that stops the tap from also opening the session. */
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
    // Only a hint that one could be made: it was too easy to start a
    // generation by accident, so that lives in the swipe menu. A tap here
    // falls through to the card and opens the session.
    return (
      <span className="session-card__deck-icon session-card__deck-icon--generate" aria-hidden="true">
        <SparkleIcon />
      </span>
    )
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
  if (session.deckStatus === 'queued') {
    return (
      <p className="session-card__deck session-card__deck--queued" role="status">
        <span className="session-card__deck-dot" aria-hidden="true" /> Presentation queued… builds after the one in progress
      </p>
    )
  }
  if (session.deckStatus !== 'generating') return null
  return (
    <p className="session-card__deck" role="status">
      <span className="session-card__deck-dot" aria-hidden="true" /> Building presentation… this takes a few minutes
    </p>
  )
}
