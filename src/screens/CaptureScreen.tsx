import { useEffect, useState } from 'react'
import type { Session, TimelineItemData } from '../types'
import { formatElapsed } from '../format'
import { Timeline } from '../components/Timeline'
import { NoteInput } from '../components/NoteInput'
import { CameraViewfinder } from '../components/CameraViewfinder'
import { makeId } from '../storage'
import './CaptureScreen.css'

interface CaptureScreenProps {
  session: Session
  onUpdate: (updater: (session: Session) => Session) => void
  onEnded: () => void
  onBack: () => void
}

function elapsedFor(session: Session, now: number): number {
  const live = session.status === 'recording' && session.liveSpanStartedAt
    ? now - session.liveSpanStartedAt
    : 0
  return session.accumulatedMs + live
}

export function CaptureScreen({ session, onUpdate, onEnded, onBack }: CaptureScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [cameraOpen, setCameraOpen] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)

  useEffect(() => {
    if (session.status !== 'recording') return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [session.status])

  const elapsedMs = elapsedFor(session, now)

  function addItem(item: TimelineItemData) {
    onUpdate((s) => ({ ...s, items: [...s.items, item] }))
  }

  function commitNote(text: string) {
    addItem({ id: makeId(), type: 'note', text, timestamp: Date.now() })
  }

  function commitPhoto(dataUrl: string) {
    addItem({
      id: makeId(),
      type: 'photo',
      dataUrl,
      caption: 'Untitled photo',
      timestamp: Date.now(),
    })
  }

  function stop() {
    onUpdate((s) => ({
      ...s,
      status: 'suspended',
      accumulatedMs: elapsedFor(s, Date.now()),
      liveSpanStartedAt: null,
    }))
  }

  function resume() {
    onUpdate((s) => ({ ...s, status: 'recording', liveSpanStartedAt: Date.now() }))
  }

  function confirmEnd() {
    onUpdate((s) => ({ ...s, status: 'enriching' }))
    setConfirmingEnd(false)
    onEnded()
    // Simulate background enrichment.
    window.setTimeout(() => {
      onUpdate((s) => ({ ...s, status: 'complete' }))
    }, 3000)
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

      <Timeline items={session.items} onPhotoTap={() => {}} />

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
