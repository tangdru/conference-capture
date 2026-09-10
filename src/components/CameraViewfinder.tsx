import { useEffect, useRef, useState } from 'react'
import './CameraViewfinder.css'

interface CameraViewfinderProps {
  sessionTimer: string
  onCapture: (dataUrl: string) => void
  onClose: () => void
}

const MAX_THUMBS = 3

export function CameraViewfinder({ sessionTimer, onCapture, onClose }: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shots, setShots] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setError('Camera unavailable — check browser permissions.'))

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return

    const maxWidth = 640
    const scale = Math.min(1, maxWidth / video.videoWidth)
    canvas.width = video.videoWidth * scale
    canvas.height = video.videoHeight * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)

    if (navigator.vibrate) navigator.vibrate(30)
    setShots((prev) => [...prev, dataUrl])
    onCapture(dataUrl)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (delta > 80) onClose()
  }

  const visibleThumbs = shots.slice(-MAX_THUMBS)
  const overflow = shots.length - visibleThumbs.length

  return (
    <div
      className="viewfinder"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="viewfinder__top-bar">
        <span className="mono-timestamp">Session · {sessionTimer}</span>
        <button className="viewfinder__dismiss" onClick={onClose} aria-label="Stop camera, return to notes">
          ✕
        </button>
      </div>

      <div className="viewfinder__stage">
        {error ? (
          <p className="viewfinder__error">{error}</p>
        ) : (
          <video ref={videoRef} className="viewfinder__video" autoPlay playsInline muted />
        )}
        <div className="viewfinder__reticle" aria-hidden="true">
          <span className="corner corner--tl" />
          <span className="corner corner--tr" />
          <span className="corner corner--bl" />
          <span className="corner corner--br" />
        </div>
      </div>

      {shots.length > 0 && (
        <div className="viewfinder__strip" role="status" aria-label={`${shots.length} photos captured`}>
          {visibleThumbs.map((src, i) => (
            <div className="viewfinder__thumb" key={i}>
              <img src={src} alt="" />
              <span className="viewfinder__check">✓</span>
            </div>
          ))}
          {overflow > 0 && <span className="viewfinder__overflow">+{overflow}</span>}
          <span className="mono-timestamp viewfinder__count">{shots.length} captured</span>
        </div>
      )}

      <div className="viewfinder__bottom-bar">
        <span className="viewfinder__hint">
          Swipe down to return to notes
          {shots.length > 0 && <span className="viewfinder__chevron"> ↓</span>}
        </span>
        <button className="viewfinder__shutter" onClick={capture} aria-label="Capture photo" />
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
