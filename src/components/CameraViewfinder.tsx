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
  // iOS starts the stream with a few landscape frames, shown letterboxed,
  // before it settles into the portrait shape that fills the stage -- even
  // after "playing" fires. Keep the video hidden until its frames match the
  // stage's orientation, with a fallback so the camera always appears.
  const [ready, setReady] = useState(false)
  const revealFallback = useRef<number | null>(null)
  useEffect(() => () => {
    if (revealFallback.current) window.clearTimeout(revealFallback.current)
  }, [])

  function revealWhenSettled() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const stagePortrait = window.innerHeight >= window.innerWidth
    const framesPortrait = video.videoHeight >= video.videoWidth
    if (framesPortrait === stagePortrait) {
      // A beat more for the display layer to catch up with the new shape.
      window.setTimeout(() => setReady(true), 200)
    } else if (!revealFallback.current) {
      revealFallback.current = window.setTimeout(() => setReady(true), 1500)
    }
  }
  // Held sideways (native only) -- moves the close button to the shutter's
  // left, where a thumb on that side of a landscape phone can reach it.
  const [sideways, setSideways] = useState(false)
  const touchStartY = useRef<number | null>(null)

  // Zoom and the light come from the camera track itself, where the browser
  // exposes them (WebKit does on recent iOS); the controls only show if so.
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  // A pinch in progress: finger spread and zoom when it started. `pinched`
  // stops the gesture's end from also counting as a swipe down to close.
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinched = useRef(false)

  function applyZoom(value: number) {
    if (!zoomRange) return
    const next = Math.min(zoomRange.max, Math.max(zoomRange.min, value))
    setZoom(next)
    void trackRef.current
      ?.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] })
      .catch(() => {})
  }

  function toggleTorch() {
    const next = !torchOn
    setTorchOn(next)
    void trackRef.current
      ?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .catch(() => setTorchOn(!next))
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    // Request an aspect ratio matching the viewfinder's own shape (3:4 on a
    // phone held normally, like the iPhone camera) -- without this,
    // getUserMedia commonly hands back the camera's native landscape sensor
    // ratio regardless of how the device is held, and object-fit: cover then
    // crops it down to a thin vertical sliver inside this portrait stage.
    const portrait = window.innerHeight >= window.innerWidth
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: 'environment',
          aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 },
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
        const track = s.getVideoTracks()[0]
        trackRef.current = track ?? null
        const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number }; torch?: boolean }
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomRange({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 10) })
          setZoom(Math.max(1, caps.zoom.min))
        }
        if (caps.torch) setTorchAvailable(true)
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

  function fingerSpread(touches: React.TouchList) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchStartY.current = e.touches[0].clientY
      pinched.current = false
    } else if (e.touches.length === 2 && zoomRange) {
      pinch.current = { distance: fingerSpread(e.touches), zoom }
      pinched.current = true
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!pinch.current || e.touches.length !== 2) return
    applyZoom(pinch.current.zoom * (fingerSpread(e.touches) / pinch.current.distance))
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null
    if (e.touches.length > 0 || touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (delta > 80 && !pinched.current) onClose()
  }

  const visibleThumbs = shots.slice(-MAX_THUMBS)
  const overflow = shots.length - visibleThumbs.length

  return (
    <div
      className="viewfinder"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="viewfinder__top-bar">
        <span className="mono-timestamp">Session · {sessionTimer}</span>
        {torchAvailable && (
          <button
            className={`viewfinder__torch${torchOn ? ' viewfinder__torch--on' : ''}`}
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn light off' : 'Turn light on'}
            aria-pressed={torchOn}
          >
            <svg viewBox="0 0 16 22" width="14" height="19" aria-hidden="true">
              <path
                d="M10 1 2 12.5h5.5L6 21l8-11.5H8.5z"
                fill={torchOn ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              {!torchOn && <path d="M1.5 2.5l13 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
            </svg>
          </button>
        )}
      </div>

      <div className="viewfinder__stage">
        {error ? (
          <p className="viewfinder__error">{error}</p>
        ) : (
          <video
            ref={videoRef}
            className={`viewfinder__video${ready ? ' viewfinder__video--ready' : ''}`}
            autoPlay
            playsInline
            muted
            onPlaying={revealWhenSettled}
            onResize={revealWhenSettled}
          />
        )}
        <div className="viewfinder__reticle" aria-hidden="true">
          <span className="corner corner--tl" />
          <span className="corner corner--tr" />
          <span className="corner corner--bl" />
          <span className="corner corner--br" />
        </div>

        {zoomRange && (
          <button className="viewfinder__zoom" onClick={() => applyZoom(1)} aria-label={`Zoom ${zoom.toFixed(1)}×, tap to reset`}>
            {zoom < 1.05 ? '1' : zoom.toFixed(1)}×
          </button>
        )}

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
      </div>

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
