import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { errorMessage } from '../networkError'
import type {
  AudioItem,
  EnrichmentItemData,
  HighlightItem,
  NoteItem,
  PhotoItem,
  TimelineItemData,
  TranscriptItem,
  VideoItem,
} from '../types'
import { formatClock, formatClipDuration } from '../format'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { useVideoUrl } from '../hooks/useVideoUrl'
import { SwipeActions, DeleteIcon, ExcludeIcon, IncludeIcon, SaveIcon, StarActionIcon, type DragHandle } from './SwipeActions'
import { CheckIcon, PauseIcon, PlayIcon, StarIcon } from './InlineIcons'
import { seekClip, togglePlay, useClip, usePlayback } from '../clips'
import type { ClipInfo } from '../native/clips'
import { clipUrl } from '../audioClips'
import { TOUR_REVEAL_EVENT, type TourRevealTarget } from '../tour'
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
  onToggleStarred: (item: TimelineItemData) => void
  /** Saves a photo to the phone's album. Absent where there's no album to save to. */
  onSavePhoto?: (item: PhotoItem) => void
  /** The new order, and the entry the user dragged. */
  onReorder: (orderedIds: string[], movedId: string) => void
  /** While listening: the words heard so far ('' before any). null when not listening. */
  liveTranscript: string | null
  /** Photos still being straightened and read on-device. */
  processingPhotoIds?: ReadonlySet<string>
  /** Scrolled to and flashed once on mount, instead of starting at the end. */
  focusId?: string
  /** A clip's trim handles were moved. Absent where clips can't be trimmed. */
  onTrimClip?: (item: AudioItem) => void
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
  onToggleStarred,
  onSavePhoto,
  onReorder,
  liveTranscript,
  processingPhotoIds,
  focusId,
  onTrimClip,
}: TimelineProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [flashId, setFlashId] = useState<string | null>(null)

  // Opened from a search hit: start at that item, not the end. (Declared
  // before the scroll-to-end effect so it holds that one off.)
  useEffect(() => {
    if (!focusId) return
    const el = rowRefs.current.get(focusId)
    if (!el) return
    userScrolledUp.current = true
    el.scrollIntoView({ block: 'center' })
    setFlashId(focusId)
    const t = window.setTimeout(() => setFlashId(null), 1800)
    return () => window.clearTimeout(t)
  }, [focusId])

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

  // The tutorial opens the first row's swipe panel to show what's in it.
  const firstItemId = useRef<string | null>(null)
  firstItemId.current = displayItems[0]?.id ?? null
  useEffect(() => {
    const onTour = (e: Event) => {
      const target = (e as CustomEvent<TourRevealTarget | null>).detail
      if (target === 'timeline-item') setRevealedId(firstItemId.current)
      else if (target === null) setRevealedId(null)
    }
    window.addEventListener(TOUR_REVEAL_EVENT, onTour)
    return () => window.removeEventListener(TOUR_REVEAL_EVENT, onTour)
  }, [])

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
      if (prev) onReorder(prev.order, prev.draggedId)
      return null
    })
    // Close the swipe panel now that the reorder is committed -- it was
    // only open because that's where the drag handle lives.
    setRevealedId(null)
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
          {/* liveTranscript is only non-null while recording. */}
          {liveTranscript !== null && <p className="timeline-empty__line2">Audio is recording.</p>}
        </div>
      )}

      {displayItems.map((item, index) => {
        const reorderable = isReorderable(item)
        const dragHandle: DragHandle | null = reorderable
          ? {
              onDragPointerDown: (e: ReactPointerEvent) => {
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
            className={
              dragState?.draggedId === item.id ? 'timeline-row--dragging' : flashId === item.id ? 'timeline-row--flash' : undefined
            }
          >
            {index > 0 && <div className="dot-divider" aria-hidden="true" />}
            <SwipeActions
              id={item.id}
              revealedId={revealedId}
              onReveal={setRevealedId}
              actions={[
                ...(item.type === 'photo' && onSavePhoto
                  ? [{ icon: <SaveIcon />, label: 'Save to Photos', onClick: () => {
                      setRevealedId(null)
                      onSavePhoto(item)
                    } }]
                  : []),
                ...(item.type === 'highlight' || item.type === 'enrichment' || item.type === 'audio'
                  ? []
                  : [{
                      icon: <StarActionIcon filled={!!item.starred} />,
                      label: item.starred ? 'Unstar' : 'Star',
                      onClick: () => onToggleStarred(item),
                    }]),
                item.excluded
                  ? { icon: <IncludeIcon />, label: 'Include in export', onClick: () => onToggleExcluded(item) }
                  : { icon: <ExcludeIcon />, label: 'Exclude from export', onClick: () => onToggleExcluded(item) },
                { icon: <DeleteIcon />, label: 'Delete', onClick: () => onDeleteItem(item) },
              ]}
              dragHandle={dragHandle}
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
              ) : item.type === 'photo' ? (
                <PhotoRow item={item} processing={processingPhotoIds?.has(item.id) ?? false} onTap={() => onPhotoTap(item.id)} />
              ) : item.type === 'video' ? (
                <VideoRow item={item} onTap={() => onVideoTap(item.id)} />
              ) : item.type === 'transcript' ? (
                <TranscriptRow item={item} />
              ) : item.type === 'highlight' ? (
                <HighlightRow item={item} items={items} />
              ) : item.type === 'audio' ? (
                <AudioRow item={item} items={items} onTrim={onTrimClip} />
              ) : (
                <EnrichmentRow item={item} />
              )}
            </SwipeActions>
          </div>
        )
      })}

      {liveTranscript !== null && (
        <>
          {!isEmpty && <div className="dot-divider" aria-hidden="true" />}
          <LiveTranscriptRow text={liveTranscript} />
        </>
      )}

      {(!isEmpty || liveTranscript !== null) && <div className="dot-divider" aria-hidden="true" />}

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

/** The transcript entry still being heard -- its words so far, with a
 * blinking ellipsis so it's clear listening is happening. */
function LiveTranscriptRow({ text }: { text: string }) {
  return (
    <div className="transcript-row transcript-row--live" aria-label={text ? `Transcribing: ${text}` : 'Listening'}>
      <div className="transcript-row__bar" aria-hidden="true" />
      <div className="transcript-row__body">
        <p className="transcript-row__text" aria-hidden="true">
          {text || 'Listening'}
          <span className="live-ellipsis">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </div>
    </div>
  )
}

function StarredBadge() {
  return (
    <span className="starred-badge" aria-label="Starred">
      <StarIcon filled />
    </span>
  )
}

function ExcludedBadge() {
  return <span className="excluded-badge">Excluded</span>
}

function NoteRow({ item, onTap }: { item: NoteItem; onTap: () => void }) {
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
          <span className="row-time">
            {item.starred && <StarredBadge />}
            <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
          </span>
          {item.addedLater && <span className="added-later">Added later</span>}
          {item.excluded && <ExcludedBadge />}
        </div>
      </button>
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

function PhotoRow({ item, processing, onTap }: { item: PhotoItem; processing: boolean; onTap: () => void }) {
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
            {processing ? (
              <>
                Processing photo
                <span className="live-ellipsis" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </>
            ) : item.slideText !== undefined ? (
              <span className="photo-row__processed">
                <CheckIcon /> Processed
                {item.uploading && <span className="photo-row__uploading"> · Uploading</span>}
              </span>
            ) : item.uploading ? (
              <span className="photo-row__uploading">Waiting to upload</span>
            ) : (
              item.caption
            )}
          </p>
          {item.excluded && <ExcludedBadge />}
        </div>
        <span className="row-time photo-row__timestamp">
          {item.starred && <StarredBadge />}
          <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
        </span>
      </button>
    </div>
  )
}

function HighlightRow({ item, items }: { item: HighlightItem; items: TimelineItemData[] }) {
  const clip = useClip(item.id)
  return (
    <div
      className={`highlight-block${item.excluded ? ' is-excluded' : ''}`}
      role="group"
      aria-label={`Remembered moment at ${formatClock(item.timestamp)}`}
    >
      <div className="highlight-row">
        <p className="highlight-row__label">
          <StarIcon filled /> Remembered this moment
        </p>
        {item.excluded && <ExcludedBadge />}
        <span className="mono-timestamp highlight-row__meta">{formatClock(item.timestamp)}</span>
      </div>
      {clip === 'saving' && <p className="clip-status">Saving clip…</p>}
      {clip && clip !== 'saving' && <ClipPlayer clip={clip} items={items} />}
    </div>
  )
}

/** What was transcribed during a clip. */
function clipWords(clip: ClipInfo, items: TimelineItemData[]): string {
  const end = clip.startedAt + clip.durationMs
  return items
    .filter((i): i is TranscriptItem => i.type === 'transcript')
    .filter((i) => i.timestamp < end && i.timestamp + i.durationMs > clip.startedAt)
    .map((i) => i.text)
    .join(' ')
}

function ClipPlayer({ clip, items }: { clip: ClipInfo; items: TimelineItemData[] }) {
  const playback = usePlayback()
  const [error, setError] = useState<string | null>(null)
  const current = playback.id === clip.id
  const playing = current && playback.playing
  const fraction = current ? playback.fraction : 0
  const words = clipWords(clip, items)

  function toggle() {
    setError(null)
    togglePlay(clip.id).catch((err: unknown) => {
      setError(errorMessage(err))
    })
  }

  return (
    <div className="clip-player">
      <div className="clip-player__controls">
        <button className="clip-player__play" onClick={toggle} aria-label={playing ? 'Pause clip' : 'Play clip'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div
          className="clip-player__wave"
          aria-hidden="true"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            seekClip(clip.id, (e.clientX - box.left) / box.width)
          }}
        >
          {clip.peaks.map((peak, i) => (
            <span
              key={i}
              className={(i + 0.5) / clip.peaks.length <= fraction ? 'is-played' : undefined}
              style={{ height: `${Math.max(Math.sqrt(peak) * 100, 8)}%` }}
            />
          ))}
        </div>
        <span className="mono-timestamp">{formatClipDuration(clip.durationMs)}</span>
      </div>
      {error && <p className="clip-status">{error}</p>}
      {words && <p className="clip-player__words">{words}</p>}
    </div>
  )
}

/** What was transcribed between two times (epoch ms). */
function wordsBetween(items: TimelineItemData[], from: number, to: number): string {
  return items
    .filter((i): i is TranscriptItem => i.type === 'transcript')
    .filter((i) => i.timestamp < to && i.timestamp + i.durationMs > from)
    .map((i) => i.text)
    .join(' ')
}

const MIN_CLIP_MS = 1000

/** The clip button's minute: play button, waveform with trim handles (on the
 * phone that recorded it), and what was said in the kept part. */
function AudioRow({ item, items, onTrim }: { item: AudioItem; items: TimelineItemData[]; onTrim?: (item: AudioItem) => void }) {
  const local = useClip(item.id)
  const hasLocal = !!local && local !== 'saving'
  const playback = usePlayback()
  const [error, setError] = useState<string | null>(null)
  // While a handle is being dragged: the trim shown, not yet saved.
  const [draft, setDraft] = useState<{ startMs: number; endMs: number } | null>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start' | 'end' | null>(null)
  const remote = useRemotePlayback(item)

  const startMs = draft?.startMs ?? item.trimStartMs
  const endMs = draft?.endMs ?? item.trimEndMs
  const total = Math.max(item.durationMs, 1)
  const label = `Clip at ${formatClock(item.timestamp)}`

  if (item.recording || (item.durationMs === 0 && local === 'saving')) {
    return (
      <div className="highlight-block" role="group" aria-label={label}>
        <div className="highlight-row">
          <p className="highlight-row__label clip-row__label"><ClipIcon /> Recording clip…</p>
          <span className="mono-timestamp highlight-row__meta">{formatClock(item.timestamp)}</span>
        </div>
      </div>
    )
  }
  if (item.durationMs === 0) {
    return (
      <div className="highlight-block" role="group" aria-label={label}>
        <div className="highlight-row">
          <p className="highlight-row__label clip-row__label"><ClipIcon /> Clip not saved</p>
          <span className="mono-timestamp highlight-row__meta">{formatClock(item.timestamp)}</span>
        </div>
      </div>
    )
  }

  const current = hasLocal ? playback.id === item.id : remote.active
  const playing = hasLocal ? current && playback.playing : remote.playing
  const fraction = hasLocal ? (current ? playback.fraction : startMs / total) : (startMs + remote.positionMs) / total
  const canTrim = hasLocal && !!onTrim
  const from = (item.startedAt ?? item.timestamp) + startMs
  const words = wordsBetween(items, from, (item.startedAt ?? item.timestamp) + endMs)

  function toggle() {
    setError(null)
    if (hasLocal) {
      togglePlay(item.id, { startMs, endMs }).catch((err: unknown) => setError(errorMessage(err)))
    } else if (item.audioPath) {
      remote.toggle().catch((err: unknown) => setError(errorMessage(err)))
    } else {
      setError('Still uploading')
    }
  }

  function msAt(clientX: number): number {
    const box = waveRef.current?.getBoundingClientRect()
    if (!box) return 0
    return Math.min(Math.max(((clientX - box.left) / box.width) * total, 0), total)
  }

  function handleDown(which: 'start' | 'end') {
    return (e: ReactPointerEvent<HTMLSpanElement>) => {
      e.stopPropagation()
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = which
      setDraft({ startMs: item.trimStartMs, endMs: item.trimEndMs })
    }
  }

  function handleMove(e: ReactPointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    if (!dragging.current) return
    const at = Math.round(msAt(e.clientX))
    setDraft((d) => {
      const now = d ?? { startMs: item.trimStartMs, endMs: item.trimEndMs }
      return dragging.current === 'start'
        ? { ...now, startMs: Math.min(at, now.endMs - MIN_CLIP_MS) }
        : { ...now, endMs: Math.max(at, now.startMs + MIN_CLIP_MS) }
    })
  }

  function handleUp(e: ReactPointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    if (!dragging.current) return
    dragging.current = null
    const trim = draft
    setDraft(null)
    if (trim && (trim.startMs !== item.trimStartMs || trim.endMs !== item.trimEndMs)) {
      onTrim?.({ ...item, trimStartMs: Math.max(0, trim.startMs), trimEndMs: Math.min(total, trim.endMs), audioPath: item.audioPath })
    }
  }

  const keptFrom = startMs / total
  const keptTo = endMs / total

  return (
    <div className={`highlight-block${item.excluded ? ' is-excluded' : ''}`} role="group" aria-label={label}>
      <div className="highlight-row">
        <p className="highlight-row__label clip-row__label">
          <ClipIcon /> Clip · {formatClipDuration(endMs - startMs)}
        </p>
        {item.excluded && <ExcludedBadge />}
        <span className="mono-timestamp highlight-row__meta">{formatClock(item.timestamp)}</span>
      </div>
      <div className="clip-player">
        <div className="clip-player__controls">
          <button className="clip-player__play" onClick={toggle} aria-label={playing ? 'Pause clip' : 'Play clip'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div className={`clip-player__wave${canTrim ? ' clip-player__wave--trim' : ''}`} ref={waveRef} aria-hidden="true">
            {item.peaks.map((peak, i) => {
              const at = (i + 0.5) / item.peaks.length
              const kept = at >= keptFrom && at <= keptTo
              return (
                <span
                  key={i}
                  className={!kept ? 'is-cut' : at <= fraction && (current || draft) ? 'is-played' : undefined}
                  style={{ height: `${Math.max(Math.sqrt(peak) * 100, 8)}%` }}
                />
              )
            })}
            {canTrim && (
              <>
                <span
                  className="clip-trim clip-trim--start"
                  style={{ left: `${keptFrom * 100}%` }}
                  role="slider"
                  aria-label="Clip start"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={startMs}
                  onPointerDown={handleDown('start')}
                  onPointerMove={handleMove}
                  onPointerUp={handleUp}
                  onPointerCancel={handleUp}
                />
                <span
                  className="clip-trim clip-trim--end"
                  style={{ left: `${keptTo * 100}%` }}
                  role="slider"
                  aria-label="Clip end"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={endMs}
                  onPointerDown={handleDown('end')}
                  onPointerMove={handleMove}
                  onPointerUp={handleUp}
                  onPointerCancel={handleUp}
                />
              </>
            )}
          </div>
        </div>
        {error && <p className="clip-status">{error}</p>}
        {!item.audioPath && hasLocal && <p className="clip-status">Waiting to upload</p>}
        {words && <p className="clip-player__words">{words}</p>}
      </div>
    </div>
  )
}

/** Plays a clip's uploaded cut, for a device that doesn't have the recording. */
function useRemotePlayback(item: AudioItem) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState(false)
  const [positionMs, setPositionMs] = useState(0)

  useEffect(() => () => audioRef.current?.pause(), [])
  // A new cut: start over with it.
  useEffect(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(false)
    setActive(false)
    setPositionMs(0)
  }, [item.audioPath])

  async function toggle() {
    let audio = audioRef.current
    if (!audio) {
      if (!item.audioPath) return
      audio = new Audio(await clipUrl(item.audioPath))
      audio.ontimeupdate = () => setPositionMs((audio?.currentTime ?? 0) * 1000)
      audio.onended = () => {
        setPlaying(false)
        setActive(false)
        setPositionMs(0)
      }
      audioRef.current = audio
    }
    if (audio.paused) {
      await audio.play()
      setPlaying(true)
      setActive(true)
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  return { playing, active, positionMs, toggle }
}

function ClipIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.8 6.9v10.2M8.5 9.2v5.6M12.1 3.6v16.8M15.8 6.9v10.2M19.4 8.7v6.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
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
      <span className="row-time transcript-row__meta">
        {item.starred && <StarredBadge />}
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
      </span>
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
      <span className="row-time photo-row__timestamp">
        {item.starred && <StarredBadge />}
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
      </span>
    </button>
  )
}

function enrichmentTitle(item: EnrichmentItemData): string {
  switch (item.subtype) {
    case 'summary':
      return 'Summary'
    case 'speaker_bio':
      return 'Speaker'
    case 'action_items':
      return 'Action items'
    case 'references':
      return 'References'
    case 'acronyms':
      return 'Acronyms'
  }
}

/** One or more lines to render in the card -- a single line for the
 * one-per-session categories (summary, speaker bio), one line per entry for
 * the list categories (action items, references, acronyms), all grouped
 * under one shared title rather than a separate card each. */
function enrichmentLines(item: EnrichmentItemData): { text: string; link?: string | null }[] {
  switch (item.subtype) {
    case 'summary':
      return [{ text: item.text }]
    case 'speaker_bio':
      return [{ text: `${item.name} — ${item.role} at ${item.org}. ${item.description}` }]
    case 'action_items':
      return item.items.map((i) => ({ text: i.text }))
    case 'references':
      return item.items.map((i) => ({ text: `${i.title} — ${i.description}`, link: i.url }))
    case 'acronyms':
      return item.items.map((i) => ({ text: `${i.term} = ${i.expansion}` }))
  }
}

function EnrichmentRow({ item }: { item: EnrichmentItemData }) {
  const title = enrichmentTitle(item)
  const lines = enrichmentLines(item)

  return (
    <div
      className={`enrichment-row${item.excluded ? ' is-excluded' : ''}`}
      role="group"
      aria-label={`${title}, AI-generated: ${lines.map((l) => l.text).join('; ')}`}
    >
      <div className="enrichment-row__bar" aria-hidden="true" />
      <div className="enrichment-row__body">
        <p className="enrichment-row__label">{title}</p>
        {lines.map((line, i) => (
          <div className="enrichment-row__entry" key={i}>
            <p className="enrichment-row__text">{line.text}</p>
            {line.link && (
              <a className="enrichment-row__link" href={line.link} target="_blank" rel="noreferrer">
                {line.link}
              </a>
            )}
          </div>
        ))}
        {item.excluded && <ExcludedBadge />}
      </div>
    </div>
  )
}
