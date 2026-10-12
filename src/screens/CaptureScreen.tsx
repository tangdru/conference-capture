import { useEffect, useRef, useState } from 'react'
import type { Session, TimelineItemData, VideoItem } from '../types'
import { formatElapsed, formatSessionSubtitle, formatDurationCompact } from '../format'
import { Timeline } from '../components/Timeline'
import { CameraViewfinder } from '../components/CameraViewfinder'
import { PhotoViewer } from '../components/PhotoViewer'
import { VideoViewer } from '../components/VideoViewer'
import { useAmbientTranscription } from '../hooks/useAmbientTranscription'
import * as db from '../db'
import './CaptureScreen.css'

interface CaptureScreenProps {
  session: Session
  userId: string
  onUpdateLocal: (updater: (session: Session) => Session) => void
  onEnded: () => void
  onBack: () => void
}

function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}

export function CaptureScreen({ session, userId, onUpdateLocal, onEnded, onBack }: CaptureScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [cameraOpen, setCameraOpen] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null)
  const [viewingVideoId, setViewingVideoId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | 'new' | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  // A ref, not just the `enhancing` state, guards re-entrancy -- a rapid
  // double-tap can fire two clicks before React re-renders with the button
  // disabled, which raced the edge function into running twice and
  // doubling up enrichment content.
  const enhancingRef = useRef(false)

  useEffect(() => {
    if (session.status !== 'recording') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [session.status])

  const elapsedMs = elapsedFor(session, now)
  const viewingPhoto = session.items.find(
    (i): i is Extract<typeof i, { type: 'photo' }> => i.type === 'photo' && i.id === viewingPhotoId,
  )
  const viewingVideo = session.items.find(
    (i): i is VideoItem => i.type === 'video' && i.id === viewingVideoId,
  )
  const isLive = session.status === 'recording' || session.status === 'suspended'
  const noteCount = session.items.filter((i) => i.type === 'note').length
  const photoCount = session.items.filter((i) => i.type === 'photo').length
  const hasTranscript = session.items.some((i) => i.type === 'transcript')
  const canEnhance = !enhancing && session.items.some(
    (i) => i.type === 'transcript' && i.timestamp > (session.lastEnrichedAt ?? -Infinity),
  )

  async function commitNewNote(text: string) {
    setActiveId(null)
    try {
      const item = await db.addNote(session.id, userId, text)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save note')
    }
  }

  async function commitNoteEdit(id: string, text: string) {
    setActiveId(null)
    onUpdateLocal((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id && i.type === 'note' ? { ...i, text } : i)),
    }))
    try {
      await db.updateNoteText(id, text)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save note')
    }
  }

  async function deleteItem(item: TimelineItemData) {
    if (activeId === item.id) setActiveId(null)
    onUpdateLocal((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))
    try {
      await db.deleteTimelineItem(item)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  async function toggleExcluded(item: TimelineItemData) {
    const excluded = !item.excluded
    onUpdateLocal((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === item.id ? { ...i, excluded } : i)),
    }))
    try {
      await db.setItemExcluded(item.id, excluded)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function reorderItems(orderedIds: string[]) {
    const positionById = new Map(orderedIds.map((id, index) => [id, index]))
    onUpdateLocal((s) => ({
      ...s,
      items: [...s.items].sort((a, b) => (positionById.get(a.id) ?? 0) - (positionById.get(b.id) ?? 0)),
    }))
    try {
      await db.reorderItems(orderedIds)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save order')
    }
  }

  async function commitTitle(title: string) {
    onUpdateLocal((s) => ({ ...s, title }))
    try {
      await db.updateSession(session.id, { title })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save title')
    }
  }

  async function commitPhoto(blob: Blob) {
    try {
      const item = await db.addPhoto(session.id, userId, blob)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save photo')
    }
  }

  async function commitTranscriptSegment(text: string, startedAt: number, durationMs: number) {
    try {
      const item = await db.addTranscriptSegment(session.id, userId, text, startedAt, durationMs)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    } catch {
      // Best-effort -- a dropped transcript segment isn't worth surfacing as
      // an error; the next segment will still come through.
    }
  }

  useAmbientTranscription({
    active: session.status === 'recording',
    onSegment: commitTranscriptSegment,
    onError: setSaveError,
  })

  async function stop() {
    const accumulatedMs = elapsedFor(session, Date.now())
    onUpdateLocal((s) => ({ ...s, status: 'suspended', accumulatedMs, liveSpanStartedAt: null }))
    try {
      await db.updateSession(session.id, { status: 'suspended', accumulatedMs, liveSpanStartedAt: null })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function resume() {
    const liveSpanStartedAt = Date.now()
    onUpdateLocal((s) => ({ ...s, status: 'recording', liveSpanStartedAt }))
    try {
      await db.updateSession(session.id, { status: 'recording', liveSpanStartedAt })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function confirmEnd() {
    onUpdateLocal((s) => ({ ...s, status: 'complete' }))
    setConfirmingEnd(false)
    onEnded()
    try {
      await db.updateSession(session.id, { status: 'complete' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  /** Enhancement is its own action, independent of ending the session --
   * callable any time there's new transcript since the last run (live,
   * paused, or already complete), and repeatable as more audio comes in. */
  async function handleEnhance() {
    if (!canEnhance || enhancingRef.current) return
    enhancingRef.current = true
    setEnhancing(true)
    try {
      await db.enrichSession(session.id)
      const [items, { lastEnrichedAt }] = await Promise.all([
        db.fetchSessionItems(session.id),
        db.fetchSessionEnrichmentState(session.id),
      ])
      onUpdateLocal((s) => ({ ...s, items, lastEnrichedAt }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to enhance')
    } finally {
      enhancingRef.current = false
      setEnhancing(false)
    }
  }

  return (
    <div className="capture-screen">
      <header className="capture-header">
        <div className="capture-header__row1">
          <button className="capture-header__back" onClick={onBack} aria-label="Back to home">
            ‹
          </button>
          <EditableTitle title={session.title} onCommit={commitTitle} />
        </div>

        <div className="capture-header__row2">
          <div className="capture-header__primary">
            <span
              className={`rec-dot${session.status === 'recording' ? ' rec-dot--live' : ''}${!isLive ? ' rec-dot--done' : ''}`}
              aria-hidden="true"
            />
            {isLive ? (
              <span
                className="capture-header__timer mono-timestamp"
                role="status"
                aria-label={
                  session.status === 'recording'
                    ? `Recording active, ${formatElapsed(elapsedMs)} elapsed`
                    : `Recording paused, ${formatElapsed(elapsedMs)} recorded`
                }
              >
                {formatElapsed(elapsedMs)}
              </span>
            ) : (
              <span className="capture-header__subtitle">
                {formatSessionSubtitle(session.startedAt)}
                {session.accumulatedMs > 0 && ` · ${formatDurationCompact(session.accumulatedMs)}`}
              </span>
            )}
            {isLive && (
              <div className="capture-header__record-controls">
                <button
                  className="header-btn header-btn--compact"
                  onClick={session.status === 'recording' ? stop : resume}
                  aria-label={session.status === 'recording' ? 'Pause recording' : 'Resume recording'}
                >
                  {session.status === 'recording' ? (
                    <span className="header-btn__square" />
                  ) : (
                    <span className="header-btn__circle" />
                  )}
                </button>
                {session.status === 'suspended' && (
                  <button
                    className="end-btn"
                    onClick={() => setConfirmingEnd(true)}
                    aria-label="End session"
                  >
                    End
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="capture-header__stats">
            <span className="capture-header__stat">
              <NoteIcon /> {noteCount}
            </span>
            <span className="capture-header__stat">
              <PhotoIcon /> {photoCount}
            </span>
          </div>

          <div className="capture-header__controls">
            {hasTranscript && (
              <button
                className="header-btn"
                onClick={handleEnhance}
                disabled={!canEnhance}
                aria-label={enhancing ? 'Enhancing…' : 'Enhance with new transcript'}
              >
                <SparkleIcon />
              </button>
            )}
            {!isLive && (
              session.deckStatus === 'ready' && session.deckGeneratedAt && (
                session.updatedAt > session.deckGeneratedAt ? (
                  <span className="capture-header__deck-warn">
                    <WarningIcon /> Edited since deck
                  </span>
                ) : (
                  <span className="capture-header__deck-ok">
                    <CheckIcon /> Deck up to date
                  </span>
                )
              )
            )}
          </div>
        </div>
      </header>

      {saveError && (
        <div className="save-error" role="alert">
          {saveError} <button onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}

      <Timeline
        items={session.items}
        onPhotoTap={setViewingPhotoId}
        onVideoTap={setViewingVideoId}
        activeId={activeId}
        onStartNewNote={() => setActiveId('new')}
        onStartEditNote={setActiveId}
        onCommitNewNote={commitNewNote}
        onCommitNoteEdit={commitNoteEdit}
        onCancelActive={() => setActiveId(null)}
        onDeleteItem={deleteItem}
        onToggleExcluded={toggleExcluded}
        onReorder={reorderItems}
      />

      <div className="capture-actions">
        <button
          className="camera-trigger"
          onClick={() => setCameraOpen(true)}
          aria-label="Capture photo"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8.5A1.5 1.5 0 015.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z"
              stroke="var(--accent)"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="13" r="3.2" stroke="var(--accent)" strokeWidth="1.6" />
          </svg>
        </button>
      </div>

      {viewingPhoto && (
        <PhotoViewer item={viewingPhoto} onClose={() => setViewingPhotoId(null)} />
      )}

      {viewingVideo && (
        <VideoViewer item={viewingVideo} onClose={() => setViewingVideoId(null)} />
      )}

      {cameraOpen && (
        <CameraViewfinder
          sessionTimer={formatElapsed(elapsedMs)}
          onCapture={commitPhoto}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {confirmingEnd && (
        <div className="end-modal-backdrop">
          <div className="end-modal" role="dialog" aria-modal="true">
            <p className="end-modal__text">
              End this session? You won't be able to add more captures.
            </p>
            <div className="end-modal__actions">
              <button className="end-modal__keep" onClick={() => setConfirmingEnd(false)}>
                Keep open
              </button>
              <button className="end-modal__end" onClick={confirmEnd}>
                End session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M12.5 2.5l3 3L6 15l-4 1 1-4L12.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 4.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PhotoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5A1.5 1.5 0 015.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 2l1.8 5.8a3 3 0 002 2L20.5 11.6l-5.7 1.8a3 3 0 00-2 2L11 21.2l-1.8-5.8a3 3 0 00-2-2L1.5 11.6l5.7-1.8a3 3 0 002-2L11 2z" fill="currentColor" />
      <path d="M19 15l.7 2.3a1.2 1.2 0 00.8.8l2.3.7-2.3.7a1.2 1.2 0 00-.8.8L19 22.3l-.7-2.3a1.2 1.2 0 00-.8-.8l-2.3-.7 2.3-.7a1.2 1.2 0 00.8-.8L19 15z" fill="currentColor" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5L21.5 20H2.5L12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="10" x2="12" y2="14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 26 26" width="12" height="12" aria-hidden="true">
      <path
        d="M5 13.5l5.5 5.5L21 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EditableTitle({ title, onCommit }: { title: string; onCommit: (title: string) => void }) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <h1 className="capture-header__title" onClick={() => setEditing(true)}>
        {title}
      </h1>
    )
  }

  return (
    <TitleInput
      initialTitle={title}
      onCommit={(text) => {
        setEditing(false)
        onCommit(text)
      }}
      onCancel={() => setEditing(false)}
    />
  )
}

function TitleInput({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)

    // Same iOS Safari keyboard-covers-the-field workaround as NoteRowEditor —
    // a custom scroll container doesn't get the browser's automatic
    // scroll-into-view when the keyboard opens.
    const bringIntoView = () => {
      requestAnimationFrame(() => el?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }
    bringIntoView()
    window.visualViewport?.addEventListener('resize', bringIntoView)
    return () => window.visualViewport?.removeEventListener('resize', bringIntoView)
  }, [])

  function commit() {
    const trimmed = text.trim()
    if (trimmed && trimmed !== initialTitle) {
      onCommit(trimmed)
    } else {
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      className="capture-header__title-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
