import type { PhotoItem, Session } from '../types'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { formatDuration, formatSessionSubtitle } from '../format'
import { PresentationIcon } from './InlineIcons'
import './PresentationCard.css'

interface PresentationCardProps {
  session: Session
  onOpen: () => void
}

/** A finished presentation at a glance, for scanning a day's talks: a slide,
 * the title, who gave it and what it was about. Tapping opens it. */
export function PresentationCard({ session, onOpen }: PresentationCardProps) {
  const photo = coverPhoto(session)
  const bio = session.items.find((i) => i.type === 'enrichment' && i.subtype === 'speaker_bio' && !i.excluded)
  const speaker = bio && bio.type === 'enrichment' && bio.subtype === 'speaker_bio'
    ? [bio.name, bio.org].filter(Boolean).join(' · ')
    : ''
  const summaryItem = session.items.find((i) => i.type === 'enrichment' && i.subtype === 'summary' && !i.excluded)
  const summary = summaryItem && summaryItem.type === 'enrichment' && summaryItem.subtype === 'summary'
    ? firstSentence(summaryItem.text)
    : ''

  return (
    <button className="presentation-card" onClick={onOpen} aria-label={`Open presentation: ${session.title}`}>
      <span className="presentation-card__cover" aria-hidden="true">
        {photo ? <Cover photo={photo} /> : <PresentationIcon />}
      </span>
      <span className="presentation-card__text">
        <span className="presentation-card__title">{session.title}</span>
        {speaker && <span className="presentation-card__speaker">{speaker}</span>}
        {summary && <span className="presentation-card__summary">{summary}</span>}
        <span className="presentation-card__meta">
          {formatSessionSubtitle(session.startedAt)}
          {session.accumulatedMs > 0 && ` · ${formatDuration(session.accumulatedMs)}`}
        </span>
      </span>
    </button>
  )
}

function Cover({ photo }: { photo: PhotoItem }) {
  const url = usePhotoUrl(photo)
  return url ? <img src={url} alt="" loading="lazy" /> : null
}

/** A starred photo if there is one, else the first; never one left out. */
function coverPhoto(session: Session): PhotoItem | undefined {
  const photos = session.items.filter((i): i is PhotoItem => i.type === 'photo' && !i.excluded)
  return photos.find((p) => p.starred) ?? photos[0]
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim())
  return match ? match[1] : text.trim()
}
