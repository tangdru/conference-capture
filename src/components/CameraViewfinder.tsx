import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { DeviceTilt } from '../native/deviceTilt'
import './CameraViewfinder.css'

interface CameraViewfinderProps {
  sessionTimer: string
  onCapture: (blob: Blob) => void
  onClose: () => void
}

const MAX_THUMBS = 3

export function CameraViewfinder({ sessionTimer, onCapture, onClose }: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shots, setShots] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // WebKit shows the stream's first frames letterboxed at their intrinsic
  // size before object-fit kicks in, so keep the video hidden until it plays.
  const [playing, setPlaying] = useState(false)
  // Held sideways (native only) -- moves the close button to the shutter's
  // left, where a thumb on that side of a landscape phone can reach it.
  const [sideways, setSideways] = useState(false)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    // Request an aspect ratio matching the viewfinder's own shape (portrait
    // on a phone held normally) -- without this, getUserMedia commonly
    // hands back the camera's native landscape sensor ratio regardless of
    // how the device is held, and object-fit: cover then crops it down to
    // a thin vertical sliver inside this portrait-shaped stage.
    const portrait = window.innerHeight >= window.innerWidth
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: 'environment',
          aspectRatio: { ideal: portrait ? 9 / 16 : 16 / 9 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setError('Camera unavailable — check browser permissions.'))

    // The native app's UI is locked to portrait, so the viewfinder never
    // rotates -- watch the accelerometer instead, to save a landscape photo
    // when the phone is turned sideways.
    const native = Capacitor.isNativePlatform()
    let tiltPoll: number | null = null
    if (native) {
      void DeviceTilt.startWatching().catch(() => {})
      tiltPoll = window.setInterval(() => {
        DeviceTilt.getRotation()
          .then(({ degrees }) => setSideways(degrees === 90 || degrees === 270))
          .catch(() => {})
      }, 300)
    }

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      if (tiltPoll) window.clearInterval(tiltPoll)
      if (native) void DeviceTilt.stopWatching().catch(() => {})
    }
  }, [])

  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return

    const degrees = Capacitor.isNativePlatform()
      ? await DeviceTilt.getRotation().then((r) => r.degrees).catch(() => 0)
      : 0
    const sideways = degrees === 90 || degrees === 270

    const maxWidth = 640
    const scale = Math.min(1, maxWidth / video.videoWidth)
    const width = video.videoWidth * scale
    const height = video.videoHeight * scale
    canvas.width = sideways ? height : width
    canvas.height = sideways ? width : height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(video, -width / 2, -height / 2, width, height)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        if (navigator.vibrate) navigator.vibrate(30)
        setShots((prev) => [...prev, URL.createObjectURL(blob)])
        onCapture(blob)
      },
      'image/jpeg',
      0.82,
    )
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
      </div>

      <div className="viewfinder__stage">
        {error ? (
          <p className="viewfinder__error">{error}</p>
        ) : (
          <video
            ref={videoRef}
            className={`viewfinder__video${playing ? ' viewfinder__video--playing' : ''}`}
            autoPlay
            playsInline
            muted
            onPlaying={() => requestAnimationFrame(() => setPlaying(true))}
          />
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
        <div className={`viewfinder__controls${sideways ? ' viewfinder__controls--sideways' : ''}`}>
          <button className="viewfinder__shutter" onClick={capture} aria-label="Capture photo" />
          <button className="viewfinder__dismiss" onClick={onClose} aria-label="Stop camera, return to notes">
            ✕
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
