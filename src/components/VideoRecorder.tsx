import { useEffect, useRef, useState } from 'react'
import { formatClipDuration } from '../format'
import './CameraViewfinder.css'
import './VideoRecorder.css'

interface VideoRecorderProps {
  sessionTimer: string
  onCapture: (blob: Blob, durationMs: number) => void
  onClose: () => void
}

const CAP_MS = 30_000
const CANDIDATE_MIME_TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

export function VideoRecorder({ sessionTimer, onCapture, onClose }: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const capTimeoutRef = useRef<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    if (pickMimeType() === null) {
      setError('Video recording isn’t supported in this browser.')
      return
    }

    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError('Camera unavailable — check browser permissions.'))

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (capTimeoutRef.current) window.clearTimeout(capTimeoutRef.current)
    }
  }, [])

  function startRecording() {
    const stream = streamRef.current
    const mimeType = pickMimeType()
    if (!stream || !mimeType) return

    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start()
    recorderRef.current = recorder

    const startedAt = Date.now()
    setRecording(true)
    setElapsedMs(0)
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      setElapsedMs(elapsed)
      if (elapsed >= CAP_MS) {
        window.clearInterval(tick)
        stopRecording()
      }
    }, 100)
    capTimeoutRef.current = tick
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (capTimeoutRef.current) {
      window.clearInterval(capTimeoutRef.current)
      capTimeoutRef.current = null
    }
    const durationMs = elapsedMs
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'video/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      if (navigator.vibrate) navigator.vibrate(30)
      onCapture(blob, durationMs)
      onClose()
    }
    recorder.stop()
    setRecording(false)
  }

  function handleRecordTap() {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  function handleClose() {
    if (recording) {
      if (capTimeoutRef.current) window.clearInterval(capTimeoutRef.current)
      recorderRef.current?.stop()
    }
    onClose()
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (recording) return
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (delta > 80) onClose()
  }

  return (
    <div className="viewfinder" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="viewfinder__top-bar">
        <span className="mono-timestamp">Session · {sessionTimer}</span>
        <button className="viewfinder__dismiss" onClick={handleClose} aria-label="Close video recorder">
          ✕
        </button>
      </div>

      <div className="viewfinder__stage">
        {error ? (
          <p className="viewfinder__error">{error}</p>
        ) : (
          <video ref={videoRef} className="viewfinder__video" autoPlay playsInline muted />
        )}
        {recording && (
          <div className="video-recorder__timer" role="status">
            <span className="video-recorder__dot" aria-hidden="true" />
            {formatClipDuration(elapsedMs)} / {formatClipDuration(CAP_MS)}
          </div>
        )}
      </div>

      <div className="viewfinder__bottom-bar">
        <span className="viewfinder__hint">
          {recording ? 'Tap to stop' : 'Tap to record · Swipe down to cancel'}
        </span>
        <button
          className={`video-recorder__shutter${recording ? ' video-recorder__shutter--recording' : ''}`}
          onClick={handleRecordTap}
          disabled={!!error}
          aria-label={recording ? 'Stop recording' : 'Start recording video'}
        />
      </div>
    </div>
  )
}
