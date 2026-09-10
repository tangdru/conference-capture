import { useEffect, useRef } from 'react'
import type { TimelineItemData } from '../types'
import { formatClock } from '../format'
import './Timeline.css'

interface TimelineProps {
  items: TimelineItemData[]
  onPhotoTap: (id: string) => void
}

export function Timeline({ items, onPhotoTap }: TimelineProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

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
      }}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          {index > 0 && <div className="dot-divider" aria-hidden="true" />}
          {item.type === 'note' ? (
            <NoteRow item={item} />
          ) : (
            <PhotoRow item={item} onTap={() => onPhotoTap(item.id)} />
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function NoteRow({ item }: { item: Extract<TimelineItemData, { type: 'note' }> }) {
  const label = item.addedLater
    ? `${item.text}, added later at ${formatClock(item.timestamp)}`
    : `${item.text}, captured at ${formatClock(item.timestamp)}`
  return (
    <div
      className={`note-row${item.addedLater ? ' note-row--later' : ''}`}
      role="text"
      aria-label={label}
    >
      <div className="note-row__bar" aria-hidden="true" />
      <div className="note-row__body">
        <p className="note-row__text">{item.text}</p>
      </div>
      <div className="note-row__meta">
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
        {item.addedLater && <span className="added-later">Added later</span>}
      </div>
    </div>
  )
}

function PhotoRow({
  item,
  onTap,
}: {
  item: Extract<TimelineItemData, { type: 'photo' }>
  onTap: () => void
}) {
  return (
    <button
      className="photo-row"
      onClick={onTap}
      aria-label={`${item.caption || 'Photo'}, photo captured at ${formatClock(item.timestamp)}`}
    >
      <img className="photo-row__thumb" src={item.dataUrl} alt="" />
      <div className="photo-row__body">
        <p className={`photo-row__caption${item.addedLater ? ' photo-row__caption--later' : ''}`}>
          {item.caption}
        </p>
      </div>
      <span className="mono-timestamp photo-row__timestamp">{formatClock(item.timestamp)}</span>
    </button>
  )
}
