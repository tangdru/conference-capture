import { useEffect, useRef, useState } from 'react'
import type { Session, TimelineItemData, VideoItem } from '../types'
import { formatElapsed, formatSessionSubtitle, formatDurationCompact } from '../format'
import { Timeline } from '../components/Timeline'
import { CheckIcon, NoteIcon, PhotoIcon, WarningIcon } from '../components/InlineIcons'
import { CameraViewfinder } from '../components/CameraViewfinder'
import { PhotoViewer } from '../components/PhotoViewer'
import { VideoViewer } from '../components/VideoViewer'
import { useAmbientTranscription } from '../hooks/useAmbientTranscription'
import { useWakeLock } from '../hooks/useWakeLock'
import * as db from '../db'
import './CaptureScreen.css'

interface CaptureScreenProps {
  session: Session
  userId: string
  onUpdateLocal: (updater: (session: Session) => Session) => void
  onBack: () => void
}

// The header's Enhance sparkle is hidden for now, even when there's new
// transcript to enhance. The feature itself is intact -- set this to true
// to bring the button back.
const SHOW_ENHANCE_BUTTON = false

function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}

export function CaptureScreen({ session, userId, onUpdateLocal, onBack }: CaptureScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [cameraOpen, setCameraOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null)
  const [viewingVideoId, setViewingVideoId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | 'new' | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  // Words heard so far in the transcript segment that's still in progress.
  const [liveText, setLiveText] = useState('')
  // Photos that failed to save -- kept in memory (not just dropped) so a bad
  // connection doesn't lose the actual capture. Retried on demand and
  // automatically once the browser reports it's back online.
  const [pendingPhotos, setPendingPhotos] = useState<{ id: string; blob: Blob }[]>([])
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

  useWakeLock(session.status === 'recording')

  useEffect(() => {
    if (session.status !== 'recording') setLiveText('')
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
  const canEnhance = !enhancing && session.items.some(
    (i) => i.type === 'transcript' && i.timestamp > (session.lastEnrichedAt ?? -Infinity),
  )

  async function commitNewNote(text: string) {
    // Stay open on failure instead of clearing immediately -- losing the
    // save on bad wifi shouldn't also lose what was typed. The editor
    // keeps its text and the user can tap away again to retry.
    try {
      const item = await db.addNote(session.id, userId, text)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
      setActiveId(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save note -- tap away again to retry')
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

  async function savePhoto(pendingId: string, blob: Blob) {
    try {
      const item = await db.addPhoto(session.id, userId, blob)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
      setPendingPhotos((p) => p.filter((x) => x.id !== pendingId))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save photo -- will retry automatically')
    }
  }

  function commitPhoto(blob: Blob) {
    const pendingId = `${Date.now()}-${Math.random()}`
    setPendingPhotos((p) => [...p, { id: pendingId, blob }])
    void savePhoto(pendingId, blob)
  }

  function retryPendingPhotos() {
    setPendingPhotos((current) => {
      current.forEach((p) => void savePhoto(p.id, p.blob))
      return current
    })
  }
  const retryPendingPhotosRef = useRef(retryPendingPhotos)
  useEffect(() => {
    retryPendingPhotosRef.current = retryPendingPhotos
  })

  // A photo that failed to save stays queued, not lost -- retry it the
  // moment the browser reports a connection again, since conference wifi
  // dropouts are usually brief. (Also retriable by hand, see the save-error
  // banner below.)
  useEffect(() => {
    function handleOnline() {
      retryPendingPhotosRef.current()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  async function commitTranscriptSegment(text: string, startedAt: number, durationMs: number) {
    try {
      // duration_ms is an integer column -- round in case a capture source
      // reports fractional milliseconds.
      const item = await db.addTranscriptSegment(session.id, userId, text, startedAt, Math.round(durationMs))
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
      setLiveText('')
    } catch {
      // Best-effort -- a dropped transcript segment isn't worth surfacing as
      // an error; the next segment will still come through.
    }
  }

  useAmbientTranscription({
    active: session.status === 'recording',
    onSegment: commitTranscriptSegment,
    onPartial: setLiveText,
    onError: setSaveError,
  })

  async function stop() {
    const accumulatedMs = elapsedFor(session, Date.now())
    // Bump updatedAt locally too, matching what the server sets -- otherwise
    // the in-memory session (reused across navigation until the next full
    // fetchSessions) still looks stale to isSessionActive even though the
    // user just interacted with it.
    onUpdateLocal((s) => ({ ...s, status: 'suspended', accumulatedMs, liveSpanStartedAt: null, updatedAt: Date.now() }))
    try {
      await db.updateSession(session.id, { status: 'suspended', accumulatedMs, liveSpanStartedAt: null })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function resume() {
    const liveSpanStartedAt = Date.now()
    onUpdateLocal((s) => ({ ...s, status: 'recording', liveSpanStartedAt, updatedAt: Date.now() }))
    try {
      await db.updateSession(session.id, { status: 'recording', liveSpanStartedAt })
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
            {isLive ? (
              // The record indicator is also the pause/resume control: a
              // blinking dot while recording, a pause glyph while paused.
              <button
                className="rec-toggle"
                onClick={session.status === 'recording' ? stop : resume}
                aria-label={session.status === 'recording' ? 'Pause recording' : 'Resume recording'}
              >
                {session.status === 'recording' ? (
                  <span className="rec-dot rec-dot--live" aria-hidden="true" />
                ) : (
                  <span className="rec-toggle__pause" aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="rec-dot rec-dot--done" aria-hidden="true" />
            )}
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
            {SHOW_ENHANCE_BUTTON && (canEnhance || enhancing) && (
              <button
                className="header-btn"
                onClick={handleEnhance}
                disabled={enhancing}
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
          {saveError}{' '}
          {pendingPhotos.length > 0 && (
            <button onClick={retryPendingPhotos}>
              Retry {pendingPhotos.length > 1 ? `${pendingPhotos.length} photos` : 'photo'}
            </button>
          )}{' '}
          <button onClick={() => setSaveError(null)}>Dismiss</button>
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
        liveTranscript={session.status === 'recording' ? liveText : null}
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
    </div>
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
