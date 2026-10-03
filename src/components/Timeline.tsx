import { useEffect, useRef, useState } from 'react'
import type { NoteItem, PhotoItem, TimelineItemData } from '../types'
import { formatClock } from '../format'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { SwipeToDelete } from './SwipeToDelete'
import './Timeline.css'

interface TimelineProps {
  items: TimelineItemData[]
  onPhotoTap: (id: string) => void
  onEditNote: (item: NoteItem) => void
  onDeleteItem: (item: TimelineItemData) => void
}

export function Timeline({ items, onPhotoTap, onEditNote, onDeleteItem }: TimelineProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [revealedId, setRevealedId] = useState<string | null>(null)

  useEffect(() => {
    if (!userScrolledUp.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [items.length])

  if (items.length === 0) {
    return (
      <div className="timeline timeline--empty">
        <div className="timeline-empty">
          <p className="timeline-empty__line1">Tap below to add a note.</p>
          <p className="timeline-empty__line2">Tap 📷 to photograph a slide.</p>
          <p className="timeline-empty__line2">Audio is recording.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="timeline"
      onScroll={(e) => {
        const el = e.currentTarget
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        userScrolledUp.current = distanceFromBottom > 40
        setRevealedId(null)
      }}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          {index > 0 && <div className="dot-divider" aria-hidden="true" />}
          <SwipeToDelete
            id={item.id}
            revealedId={revealedId}
            onReveal={setRevealedId}
            onDelete={() => onDeleteItem(item)}
          >
            {item.type === 'note' ? (
              <NoteRow item={item} onTap={() => onEditNote(item)} />
            ) : (
              <PhotoRow item={item} onTap={() => onPhotoTap(item.id)} />
            )}
          </SwipeToDelete>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function NoteRow({ item, onTap }: { item: NoteItem; onTap: () => void }) {
  const label = item.addedLater
    ? `${item.text}, added later at ${formatClock(item.timestamp)}`
    : `${item.text}, captured at ${formatClock(item.timestamp)}`
  return (
    <button
      className={`note-row${item.addedLater ? ' note-row--later' : ''}`}
      onClick={onTap}
      aria-label={`${label}. Double tap to edit.`}
    >
      <div className="note-row__bar" aria-hidden="true" />
      <div className="note-row__body">
        <p className="note-row__text">{item.text}</p>
      </div>
      <div className="note-row__meta">
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
        {item.addedLater && <span className="added-later">Added later</span>}
      </div>
    </button>
  )
}

function PhotoRow({ item, onTap }: { item: PhotoItem; onTap: () => void }) {
  const resolvedUrl = usePhotoUrl(item)

  return (
    <button
      className="photo-row"
      onClick={onTap}
      aria-label={`${item.caption || 'Photo'}, photo captured at ${formatClock(item.timestamp)}`}
    >
      <div className="photo-row__thumb">
        {resolvedUrl && <img className="photo-row__thumb-img" src={resolvedUrl} alt="" />}
      </div>
      <div className="photo-row__body">
        <p className={`photo-row__caption${item.addedLater ? ' photo-row__caption--later' : ''}`}>
          {item.caption}
        </p>
      </div>
      <span className="mono-timestamp photo-row__timestamp">{formatClock(item.timestamp)}</span>
    </button>
  )
}
