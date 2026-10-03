import { useEffect, useRef, useState } from 'react'
import type { NoteItem, PhotoItem, TimelineItemData } from '../types'
import { formatClock } from '../format'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { SwipeToDelete } from './SwipeToDelete'
import './Timeline.css'

interface TimelineProps {
  items: TimelineItemData[]
  onPhotoTap: (id: string) => void
  editingNoteId: string | null
  onStartEditNote: (id: string) => void
  onCommitNoteEdit: (id: string, text: string) => void
  onCancelNoteEdit: () => void
  onDeleteItem: (item: TimelineItemData) => void
}

export function Timeline({
  items,
  onPhotoTap,
  editingNoteId,
  onStartEditNote,
  onCommitNoteEdit,
  onCancelNoteEdit,
  onDeleteItem,
}: TimelineProps) {
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
            disabled={item.type === 'note' && editingNoteId === item.id}
          >
            {item.type === 'note' ? (
              editingNoteId === item.id ? (
                <NoteRowEditor
                  item={item}
                  onCommit={(text) => onCommitNoteEdit(item.id, text)}
                  onCancel={onCancelNoteEdit}
                />
              ) : (
                <NoteRow item={item} onTap={() => onStartEditNote(item.id)} />
              )
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
      aria-label={`${label}. Tap to edit.`}
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

function NoteRowEditor({
  item,
  onCommit,
  onCancel,
}: {
  item: NoteItem
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(item.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    autoGrow(el)
  }, [])

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== item.text) {
      onCommit(trimmed)
    } else {
      onCancel()
    }
  }

  return (
    <div className="note-row note-row--editing">
      <div className="note-row__bar" aria-hidden="true" />
      <div className="note-row__body">
        <textarea
          ref={textareaRef}
          className="note-row__editor"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            autoGrow(e.target)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            // Return is preserved for paragraph breaks — it does not commit.
          }}
        />
      </div>
      <button
        className="note-row__commit"
        // preventDefault on pointerdown stops focus from ever leaving the
        // textarea, so onBlur never fires from pressing this button -- commit
        // runs exactly once, here, instead of racing with a blur commit too.
        onPointerDown={(e) => {
          e.preventDefault()
          commit()
        }}
        aria-label="Save note"
      >
        <svg viewBox="0 0 26 26" width="22" height="22" aria-hidden="true">
          <circle cx="13" cy="13" r="11" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <path
            d="M8 13.5l3 3 7-7.5"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
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
