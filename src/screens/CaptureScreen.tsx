import { useEffect, useState } from 'react'
import type { Session, TimelineItemData } from '../types'
import { formatElapsed } from '../format'
import { Timeline } from '../components/Timeline'
import { NoteInput } from '../components/NoteInput'
import { CameraViewfinder } from '../components/CameraViewfinder'
import { PhotoViewer } from '../components/PhotoViewer'
import { useViewportHeight } from '../hooks/useViewportHeight'
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
  useViewportHeight()
  const [now, setNow] = useState(Date.now())
  const [cameraOpen, setCameraOpen] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewingPhotoId, setViewingPhotoId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  useEffect(() => {
    if (session.status !== 'recording') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [session.status])

  const elapsedMs = elapsedFor(session, now)
  const viewingPhoto = session.items.find(
    (i): i is Extract<typeof i, { type: 'photo' }> => i.type === 'photo' && i.id === viewingPhotoId,
  )

  async function commitNote(text: string) {
    try {
      const item = await db.addNote(session.id, userId, text)
      onUpdateLocal((s) => ({ ...s, items: [...s.items, item] }))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save note')
    }
  }

  async function commitNoteEdit(id: string, text: string) {
    setEditingNoteId(null)
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
    if (editingNoteId === item.id) setEditingNoteId(null)
    onUpdateLocal((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))
    try {
      await db.deleteTimelineItem(item)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete')
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
        <button className="capture-header__back" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
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
              <button className="end-btn" onClick={() => setConfirmingEnd(true)} aria-label="End session">
                End
              </button>
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
        editingNoteId={editingNoteId}
        onStartEditNote={setEditingNoteId}
        onCommitNoteEdit={commitNoteEdit}
        onCancelNoteEdit={() => setEditingNoteId(null)}
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
        <NoteInput onCommit={commitNote} />
      </div>

      {viewingPhoto && (
        <PhotoViewer item={viewingPhoto} onClose={() => setViewingPhotoId(null)} />
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
