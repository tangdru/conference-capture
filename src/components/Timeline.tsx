import { useEffect, useRef, useState } from 'react'
import type { NoteItem, PhotoItem, TimelineItemData } from '../types'
import { formatClock } from '../format'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { SwipeActions, DeleteIcon } from './SwipeActions'
import './Timeline.css'

/** 'new' means composing a brand-new note at the end of the list; a string is an existing item's id being edited; null means nothing is active. */
type ActiveId = string | 'new' | null

interface TimelineProps {
  items: TimelineItemData[]
  onPhotoTap: (id: string) => void
  activeId: ActiveId
  onStartNewNote: () => void
  onStartEditNote: (id: string) => void
  onCommitNewNote: (text: string) => void
  onCommitNoteEdit: (id: string, text: string) => void
  onCancelActive: () => void
  onDeleteItem: (item: TimelineItemData) => void
}

export function Timeline({
  items,
  onPhotoTap,
  activeId,
  onStartNewNote,
  onStartEditNote,
  onCommitNewNote,
  onCommitNoteEdit,
  onCancelActive,
  onDeleteItem,
}: TimelineProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [revealedId, setRevealedId] = useState<string | null>(null)

  useEffect(() => {
    if (!userScrolledUp.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [items.length, activeId])

  const isEmpty = items.length === 0

  return (
    <div
      className={`timeline${isEmpty && activeId !== 'new' ? ' timeline--empty' : ''}`}
      onScroll={(e) => {
        const el = e.currentTarget
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        userScrolledUp.current = distanceFromBottom > 40
        setRevealedId(null)
      }}
    >
      {isEmpty && activeId !== 'new' && (
        <div className="timeline-empty">
          <p className="timeline-empty__line1">Tap below to add your first note.</p>
          <p className="timeline-empty__line2">Tap 📷 to photograph a slide.</p>
          <p className="timeline-empty__line2">Audio is recording.</p>
        </div>
      )}

      {items.map((item, index) => (
        <div key={item.id}>
          {index > 0 && <div className="dot-divider" aria-hidden="true" />}
          <SwipeActions
            id={item.id}
            revealedId={revealedId}
            onReveal={setRevealedId}
            actions={[{ icon: <DeleteIcon />, label: 'Delete', onClick: () => onDeleteItem(item) }]}
            disabled={item.type === 'note' && activeId === item.id}
          >
            {item.type === 'note' ? (
              activeId === item.id ? (
                <NoteRowEditor
                  initialText={item.text}
                  onCommit={(text) => onCommitNoteEdit(item.id, text)}
                  onCancel={onCancelActive}
                />
              ) : (
                <NoteRow item={item} onTap={() => onStartEditNote(item.id)} />
              )
            ) : (
              <PhotoRow item={item} onTap={() => onPhotoTap(item.id)} />
            )}
          </SwipeActions>
        </div>
      ))}

      {!isEmpty && <div className="dot-divider" aria-hidden="true" />}

      {activeId === 'new' ? (
        <NoteRowEditor initialText="" onCommit={onCommitNewNote} onCancel={onCancelActive} />
      ) : (
        <button className="note-row note-row--later note-add-row" onClick={onStartNewNote} aria-label="Add a note">
          <div className="note-row__bar" aria-hidden="true" />
          <div className="note-row__body">
            <p className="note-row__text">+ Add a note…</p>
          </div>
        </button>
      )}

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
  initialText,
  onCommit,
  onCancel,
}: {
  initialText: string
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    autoGrow(el)

    // iOS Safari's automatic "scroll the focused field above the keyboard"
    // behavior only reliably applies to the main document -- it doesn't
    // extend into a custom overflow:auto container like .timeline, so the
    // row being edited can end up hidden behind the keyboard with nothing
    // bringing it back into view. Do that scroll ourselves whenever the
    // visual viewport changes (i.e. the keyboard opening/closing/resizing).
    const bringIntoView = () => {
      requestAnimationFrame(() => el?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }
    bringIntoView()
    window.visualViewport?.addEventListener('resize', bringIntoView)
    return () => window.visualViewport?.removeEventListener('resize', bringIntoView)
  }, [])

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== initialText) {
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
          placeholder="Type a note…"
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
        <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
          <path
            d="M5 13.5l5.5 5.5L21 7"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
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
