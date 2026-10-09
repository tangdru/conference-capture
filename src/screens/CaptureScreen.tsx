import { useEffect, useRef, useState } from 'react'
import type { Session, TimelineItemData, VideoItem } from '../types'
import { formatElapsed, formatSessionSubtitle, formatDurationCompact } from '../format'
import { Timeline } from '../components/Timeline'
import { CameraViewfinder } from '../components/CameraViewfinder'
import { VideoRecorder } from '../components/VideoRecorder'
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
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null)
  const [viewingVideoId, setViewingVideoId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | 'new' | null>(null)

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
  const videoCount = session.items.filter((i) => i.type === 'video').length

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

  async function commitVideo(blob: Blob, durationMs: number) {
    try {
      const item = await db.addVideo(session.id, userId, blob, durationMs)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save video')
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
    onUpdateLocal((s) => ({ ...s, status: 'enriching' }))
    setConfirmingEnd(false)
    onEnded()
    try {
      await db.updateSession(session.id, { status: 'enriching' })
      // Simulate background enrichment.
      window.setTimeout(async () => {
        onUpdateLocal((s) => ({ ...s, status: 'complete' }))
        try {
          await db.updateSession(session.id, { status: 'complete' })
        } catch {
          // Best-effort — the session still shows complete locally.
        }
      }, 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
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
          {isLive ? (
            <>
              <span
                className={`rec-dot${session.status === 'recording' ? ' rec-dot--live' : ''}`}
                aria-hidden="true"
              />
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

              <div className="capture-header__controls">
                {session.status === 'recording' && (
                  <button className="header-btn" onClick={stop} aria-label="Stop recording">
                    <span className="header-btn__square" />
                  </button>
                )}
                {session.status === 'suspended' && (
                  <>
                    <button className="header-btn" onClick={resume} aria-label="Resume recording">
                      <span className="header-btn__circle" />
                    </button>
                    <button
                      className="end-btn"
                      onClick={() => setConfirmingEnd(true)}
                      aria-label="End session"
                    >
                      End
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="rec-dot rec-dot--done" aria-hidden="true" />
              <span className="capture-header__subtitle">
                {formatSessionSubtitle(session.startedAt)}
                {session.accumulatedMs > 0 && ` · ${formatDurationCompact(session.accumulatedMs)}`}
              </span>
              <span className="capture-header__stats">
                📝 {noteCount} &nbsp; 📷 {photoCount} &nbsp; 🎥 {videoCount}
              </span>
              {session.deckStatus === 'ready' && session.deckGeneratedAt && (
                session.updatedAt > session.deckGeneratedAt ? (
                  <span className="capture-header__deck-warn">⚠ Edited since deck</span>
                ) : (
                  <span className="capture-header__deck-ok">Deck up to date</span>
                )
              )}
            </>
          )}
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
        <button
          className="video-trigger"
          onClick={() => setVideoRecorderOpen(true)}
          aria-label="Record video"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="6" width="13" height="12" rx="1.5" stroke="var(--recording-dot)" strokeWidth="1.6" />
            <path
              d="M16 10.5l5-2.8v8.6l-5-2.8z"
              stroke="var(--recording-dot)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
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

      {videoRecorderOpen && (
        <VideoRecorder
          sessionTimer={formatElapsed(elapsedMs)}
          onCapture={commitVideo}
          onClose={() => setVideoRecorderOpen(false)}
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
