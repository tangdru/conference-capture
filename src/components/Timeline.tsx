import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  EnrichmentItemData,
  NoteItem,
  PhotoItem,
  TimelineItemData,
  TranscriptItem,
  VideoItem,
} from '../types'
import { formatClock, formatClipDuration } from '../format'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { useVideoUrl } from '../hooks/useVideoUrl'
import { SwipeActions, DeleteIcon, ExcludeIcon, IncludeIcon, GripIcon } from './SwipeActions'
import './Timeline.css'

/** 'new' means composing a brand-new note at the end of the list; a string is an existing item's id being edited; null means nothing is active. */
type ActiveId = string | 'new' | null

interface TimelineProps {
  items: TimelineItemData[]
  onPhotoTap: (id: string) => void
  onVideoTap: (id: string) => void
  activeId: ActiveId
  onStartNewNote: () => void
  onStartEditNote: (id: string) => void
  onCommitNewNote: (text: string) => void
  onCommitNoteEdit: (id: string, text: string) => void
  onCancelActive: () => void
  onDeleteItem: (item: TimelineItemData) => void
  onToggleExcluded: (item: TimelineItemData) => void
  onReorder: (orderedIds: string[]) => void
}

/** Only notes and photos have a drag handle -- a human typing a note may
 * finish well after the thought occurred, so the timestamp it lands on
 * doesn't always match where it belongs. Everything else (transcript,
 * video, enrichment) always follows timestamp order. */
function isReorderable(item: TimelineItemData): boolean {
  return item.type === 'note' || item.type === 'photo'
}

interface DragState {
  draggedId: string
  order: string[]
}

export function Timeline({
  items,
  onPhotoTap,
  onVideoTap,
  activeId,
  onStartNewNote,
  onStartEditNote,
  onCommitNewNote,
  onCommitNoteEdit,
  onCancelActive,
  onDeleteItem,
  onToggleExcluded,
  onReorder,
}: TimelineProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!userScrolledUp.current) {
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [items.length, activeId])

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const displayItems = dragState
    ? (dragState.order.map((id) => itemsById.get(id)).filter((i): i is TimelineItemData => !!i))
    : items

  const isEmpty = items.length === 0

  function startDrag(id: string, clientY: number) {
    setDragState({ draggedId: id, order: items.map((i) => i.id) })
    dragStartY.current = clientY
  }

  const dragStartY = useRef(0)

  function moveDrag(clientY: number) {
    setDragState((prev) => {
      if (!prev) return prev
      const others = prev.order.filter((id) => id !== prev.draggedId)
      let targetIndex = others.length
      for (let i = 0; i < others.length; i++) {
        const el = rowRefs.current.get(others[i])
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (clientY < rect.top + rect.height / 2) {
          targetIndex = i
          break
        }
      }
      others.splice(targetIndex, 0, prev.draggedId)
      if (others.join() === prev.order.join()) return prev
      return { ...prev, order: others }
    })
  }

  function endDrag() {
    setDragState((prev) => {
      if (prev) onReorder(prev.order)
      return null
    })
  }

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

      {displayItems.map((item, index) => {
        const reorderable = isReorderable(item)
        const dragHandlers = reorderable
          ? {
              onDragPointerDown: (e: ReactPointerEvent) => {
                e.stopPropagation()
                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                startDrag(item.id, e.clientY)
              },
              onDragPointerMove: (e: ReactPointerEvent) => {
                if (dragState?.draggedId === item.id) moveDrag(e.clientY)
              },
              onDragPointerUp: () => {
                if (dragState?.draggedId === item.id) endDrag()
              },
              onDragPointerCancel: () => {
                if (dragState?.draggedId === item.id) setDragState(null)
              },
            }
          : null

        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) rowRefs.current.set(item.id, el)
              else rowRefs.current.delete(item.id)
            }}
            className={dragState?.draggedId === item.id ? 'timeline-row--dragging' : undefined}
          >
            {index > 0 && <div className="dot-divider" aria-hidden="true" />}
            <SwipeActions
              id={item.id}
              revealedId={revealedId}
              onReveal={setRevealedId}
              actions={[
                item.excluded
                  ? { icon: <IncludeIcon />, label: 'Include in export', onClick: () => onToggleExcluded(item) }
                  : { icon: <ExcludeIcon />, label: 'Exclude from export', onClick: () => onToggleExcluded(item) },
                { icon: <DeleteIcon />, label: 'Delete', onClick: () => onDeleteItem(item) },
              ]}
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
                  <NoteRow item={item} onTap={() => onStartEditNote(item.id)} dragHandlers={dragHandlers} />
                )
              ) : item.type === 'photo' ? (
                <PhotoRow item={item} onTap={() => onPhotoTap(item.id)} dragHandlers={dragHandlers} />
              ) : item.type === 'video' ? (
                <VideoRow item={item} onTap={() => onVideoTap(item.id)} />
              ) : item.type === 'transcript' ? (
                <TranscriptRow item={item} />
              ) : (
                <EnrichmentRow item={item} />
              )}
            </SwipeActions>
          </div>
        )
      })}

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

interface DragHandlers {
  onDragPointerDown: (e: ReactPointerEvent) => void
  onDragPointerMove: (e: ReactPointerEvent) => void
  onDragPointerUp: (e: ReactPointerEvent) => void
  onDragPointerCancel: (e: ReactPointerEvent) => void
}

function DragHandle({ handlers }: { handlers: DragHandlers }) {
  return (
    <button
      className="drag-handle"
      aria-label="Reorder"
      onPointerDown={handlers.onDragPointerDown}
      onPointerMove={handlers.onDragPointerMove}
      onPointerUp={handlers.onDragPointerUp}
      onPointerCancel={handlers.onDragPointerCancel}
    >
      <GripIcon />
    </button>
  )
}

function ExcludedBadge() {
  return <span className="excluded-badge">Excluded</span>
}

function NoteRow({
  item,
  onTap,
  dragHandlers,
}: {
  item: NoteItem
  onTap: () => void
  dragHandlers: DragHandlers | null
}) {
  const label = item.addedLater
    ? `${item.text}, added later at ${formatClock(item.timestamp)}`
    : `${item.text}, captured at ${formatClock(item.timestamp)}`
  return (
    <div className={`note-row${item.addedLater ? ' note-row--later' : ''}${item.excluded ? ' is-excluded' : ''}`}>
      <div className="note-row__bar" aria-hidden="true" />
      <button className="note-row__tap" onClick={onTap} aria-label={`${label}. Tap to edit.`}>
        <div className="note-row__body">
          <p className="note-row__text">{item.text}</p>
        </div>
        <div className="note-row__meta">
          <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
          {item.addedLater && <span className="added-later">Added later</span>}
          {item.excluded && <ExcludedBadge />}
        </div>
      </button>
      {dragHandlers && <DragHandle handlers={dragHandlers} />}
    </div>
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
        <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
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

function PhotoRow({
  item,
  onTap,
  dragHandlers,
}: {
  item: PhotoItem
  onTap: () => void
  dragHandlers: DragHandlers | null
}) {
  const resolvedUrl = usePhotoUrl(item)

  return (
    <div className={`photo-row${item.excluded ? ' is-excluded' : ''}`}>
      <button
        className="photo-row__tap"
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
          {item.excluded && <ExcludedBadge />}
        </div>
        <span className="mono-timestamp photo-row__timestamp">{formatClock(item.timestamp)}</span>
      </button>
      {dragHandlers && <DragHandle handlers={dragHandlers} />}
    </div>
  )
}

function TranscriptRow({ item }: { item: TranscriptItem }) {
  return (
    <div
      className={`transcript-row${item.excluded ? ' is-excluded' : ''}`}
      role="group"
      aria-label={`Transcript, captured at ${formatClock(item.timestamp)}: ${item.text}`}
    >
      <div className="transcript-row__bar" aria-hidden="true" />
      <div className="transcript-row__body">
        <p className="transcript-row__text">{item.text}</p>
        {item.excluded && <ExcludedBadge />}
      </div>
      <span className="mono-timestamp transcript-row__meta">{formatClock(item.timestamp)}</span>
    </div>
  )
}

function VideoRow({ item, onTap }: { item: VideoItem; onTap: () => void }) {
  const resolvedUrl = useVideoUrl(item)
  const clipLabel = `Video, ${formatClipDuration(item.durationMs)}`

  return (
    <button
      className={`photo-row${item.excluded ? ' is-excluded' : ''}`}
      onClick={onTap}
      aria-label={`${clipLabel}, captured at ${formatClock(item.timestamp)}`}
    >
      <div className="photo-row__thumb">
        {resolvedUrl && (
          <video className="photo-row__thumb-img" src={resolvedUrl} muted playsInline preload="metadata" />
        )}
        <span className="video-row__play" aria-hidden="true">
          <svg viewBox="0 0 26 26" width="14" height="14">
            <path d="M7 3L7 23L21 13Z" fill="#fff" />
          </svg>
        </span>
        <span className="video-row__duration">{formatClipDuration(item.durationMs)}</span>
      </div>
      <div className="photo-row__body">
        <p className={`photo-row__caption${item.addedLater ? ' photo-row__caption--later' : ''}`}>Video</p>
        {item.excluded && <ExcludedBadge />}
      </div>
      <span className="mono-timestamp photo-row__timestamp">{formatClock(item.timestamp)}</span>
    </button>
  )
}

function enrichmentLabel(item: EnrichmentItemData): { title: string; body: string } {
  switch (item.subtype) {
    case 'summary':
      return { title: 'Summary', body: item.text }
    case 'speaker_bio':
      return { title: 'Speaker', body: `${item.name} — ${item.role} at ${item.org}. ${item.description}` }
    case 'action_item':
      return { title: 'Action item', body: item.text }
    case 'reference':
      return { title: 'Reference', body: `${item.title} — ${item.description}` }
    case 'acronym':
      return { title: 'Acronym', body: `${item.term} = ${item.expansion}` }
  }
}

function EnrichmentRow({ item }: { item: EnrichmentItemData }) {
  const { title, body } = enrichmentLabel(item)
  const link = item.subtype === 'reference' ? item.url : null

  return (
    <div
      className={`enrichment-row${item.excluded ? ' is-excluded' : ''}`}
      role="group"
      aria-label={`${title}, AI-generated: ${body}`}
    >
      <div className="enrichment-row__bar" aria-hidden="true" />
      <div className="enrichment-row__body">
        <p className="enrichment-row__label">{title}</p>
        <p className="enrichment-row__text">{body}</p>
        {link && (
          <a className="enrichment-row__link" href={link} target="_blank" rel="noreferrer">
            {link}
          </a>
        )}
        {item.excluded && <ExcludedBadge />}
      </div>
    </div>
  )
}
