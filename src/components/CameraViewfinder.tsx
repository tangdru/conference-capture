import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { DeviceTilt } from '../native/deviceTilt'
import { NativeCamera, type FlashMode } from '../native/nativeCamera'
import './CameraViewfinder.css'

interface CameraViewfinderProps {
  onCapture: (blob: Blob) => void
  onClose: () => void
}

const MAX_THUMBS = 3

// In the app, the iPhone's own camera (NativeCameraPlugin.swift) draws the
// preview behind this page, seen through a transparent stage; in a browser,
// a getUserMedia <video> fills the stage instead.
const NATIVE = Capacitor.isNativePlatform()

export function CameraViewfinder({ onCapture, onClose }: CameraViewfinderProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shots, setShots] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Browser only: iOS starts the stream with a few landscape frames, shown
  // letterboxed, before it settles into the portrait shape that fills the
  // stage -- even after "playing" fires. Keep the video hidden until its
  // frames match the stage's orientation, with a fallback so the camera
  // always appears.
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
  // How the phone is held (native only), as DeviceTilt's turn for a photo.
  // Sideways turns the icons upright and swipe-to-close with them.
  const [tilt, setTilt] = useState(0)
  // The icons turn opposite to the phone; the short way round, so going from
  // portrait to "270" doesn't spin them three quarters of a turn.
  const iconTurn = tilt === 90 ? -90 : tilt === 270 ? 90 : tilt
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Zoom in the Camera app's units (1 = main lens). `lenses` are the buttons
  // under the preview: the phone's lenses natively; in a browser just one,
  // which shows the zoom and resets it. Flash natively is the real flash
  // (off/auto/on); in a browser it's the torch, where the track offers one.
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null)
  const [lenses, setLenses] = useState<number[]>([])
  const [zoom, setZoom] = useState(1)
  const [flashModes, setFlashModes] = useState<FlashMode[]>([])
  // Off by default: a flash on a projected slide only adds glare.
  const [flash, setFlash] = useState<FlashMode>('off')
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null)
  const [blink, setBlink] = useState(false)
  // Starts native in the app; drops to the browser camera if the native one
  // can't open (other than a denied permission), e.g. in the Simulator.
  const [useNative, setUseNative] = useState(NATIVE)
  // A pinch in progress: finger spread and zoom when it started. `pinched`
  // stops the gesture's end from also counting as a swipe down to close.
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinched = useRef(false)

  function setZoomTo(value: number, animated: boolean) {
    if (!zoomRange) return
    const next = Math.min(zoomRange.max, Math.max(zoomRange.min, value))
    setZoom(next)
    if (useNative) {
      void NativeCamera.setZoom({ zoom: next, animated }).catch(() => {})
    } else {
      void trackRef.current
        ?.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] })
        .catch(() => {})
    }
  }

  function cycleFlash() {
    const next = flashModes[(flashModes.indexOf(flash) + 1) % flashModes.length]
    setFlash(next)
    if (!useNative) {
      void trackRef.current
        ?.applyConstraints({ advanced: [{ torch: next === 'on' } as MediaTrackConstraintSet] })
        .catch(() => setFlash(flash))
    }
  }

  // Native camera: open it with its preview lined up under the stage, and
  // make the page see-through there while it runs.
  useEffect(() => {
    if (!useNative) return
    let cancelled = false
    document.documentElement.classList.add('native-camera')
    const frame = requestAnimationFrame(() => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      NativeCamera.start({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
        .then((info) => {
          if (cancelled) return void NativeCamera.stop().catch(() => {})
          setZoomRange({ min: info.minZoom, max: info.maxZoom })
          setLenses(info.lenses)
          setZoom(info.zoom)
          if (info.flash) setFlashModes(['off', 'auto', 'on'])
        })
        .catch((err: { code?: string; message?: string }) => {
          if (cancelled) return
          if (err.code === 'DENIED') setError(err.message ?? 'Camera access is off')
          else setUseNative(false)
        })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      document.documentElement.classList.remove('native-camera')
      void NativeCamera.stop().catch(() => {})
    }
  }, [useNative])

  // Browser camera.
  useEffect(() => {
    if (useNative) return
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
          setLenses([1])
          setZoom(Math.max(1, caps.zoom.min))
        }
        if (caps.torch) setFlashModes(['off', 'on'])
      })
      .catch(() => setError('Camera unavailable — check browser permissions.'))

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [useNative])

  // The native app's UI is locked to portrait, so the viewfinder never
  // rotates -- watch the accelerometer instead, to save a landscape photo
  // when the phone is turned sideways.
  useEffect(() => {
    if (!NATIVE) return
    void DeviceTilt.startWatching().catch(() => {})
    const tiltPoll = window.setInterval(() => {
      DeviceTilt.getRotation()
        .then(({ degrees }) => setTilt(degrees))
        .catch(() => {})
    }, 300)
    return () => {
      window.clearInterval(tiltPoll)
      void DeviceTilt.stopWatching().catch(() => {})
    }
  }, [])

  function addShot(blob: Blob) {
    if (navigator.vibrate) navigator.vibrate(30)
    setShots((prev) => [...prev, URL.createObjectURL(blob)])
    onCapture(blob)
  }

  async function capture() {
    const degrees = NATIVE ? await DeviceTilt.getRotation().then((r) => r.degrees).catch(() => 0) : 0
    if (useNative) {
      setBlink(true)
      window.setTimeout(() => setBlink(false), 120)
      try {
        const { data } = await NativeCamera.capture({ flash, degrees })
        addShot(await fetch(`data:image/jpeg;base64,${data}`).then((r) => r.blob()))
      } catch {
        // A failed shot just doesn't appear in the strip; the camera stays open.
      }
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return

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
    canvas.toBlob((blob) => blob && addShot(blob), 'image/jpeg', 0.82)
  }

  /** Tap on the preview itself (not a control on it): focus there. */
  function handleStageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!useNative || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    void NativeCamera.focus({ x: x / rect.width, y: y / rect.height }).catch(() => {})
    setFocusRing({ x, y, key: Date.now() })
  }

  function fingerSpread(touches: React.TouchList) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      pinched.current = false
    } else if (e.touches.length === 2 && zoomRange) {
      pinch.current = { distance: fingerSpread(e.touches), zoom }
      pinched.current = true
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!pinch.current || e.touches.length !== 2) return
    setZoomTo(pinch.current.zoom * (fingerSpread(e.touches) / pinch.current.distance), false)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null
    if (e.touches.length > 0 || touchStart.current === null) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    // "Down" as the viewer holds the phone: sideways, that's across the
    // portrait screen -- toward its left edge when the top is turned left.
    const down = tilt === 90 ? dx : tilt === 270 ? -dx : tilt === 180 ? -dy : dy
    if (down > 80 && !pinched.current) onClose()
  }

  const visibleThumbs = shots.slice(-MAX_THUMBS)
  const overflow = shots.length - visibleThumbs.length
  // The lens in use is the longest one at or below the current zoom; its
  // button shows the exact zoom, like the Camera app.
  const activeLens = lenses.filter((l) => l <= zoom + 0.05).pop() ?? lenses[0]

  return (
    <div
      className={`viewfinder${useNative ? ' viewfinder--native' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ '--vf-icon-turn': `${iconTurn}deg` } as React.CSSProperties}
    >
      <div className="viewfinder__top-bar">
        {flashModes.length > 0 && (
          <button
            className={`viewfinder__flash viewfinder__flash--${flash}`}
            onClick={cycleFlash}
            aria-label={`Flash ${flash}`}
          >
            <FlashIcon mode={flash} />
          </button>
        )}
      </div>

      <div
        ref={stageRef}
        className={`viewfinder__stage${useNative ? ' viewfinder__stage--native' : ''}`}
        onClick={handleStageClick}
      >
        {error ? (
          <p className="viewfinder__error">{error}</p>
        ) : (
          !useNative && (
            <video
              ref={videoRef}
              className={`viewfinder__video${ready ? ' viewfinder__video--ready' : ''}`}
              autoPlay
              playsInline
              muted
              onPlaying={revealWhenSettled}
              onResize={revealWhenSettled}
            />
          )
        )}
        <div className="viewfinder__reticle" aria-hidden="true">
          <span className="corner corner--tl" />
          <span className="corner corner--tr" />
          <span className="corner corner--bl" />
          <span className="corner corner--br" />
        </div>

        {focusRing && (
          <span
            key={focusRing.key}
            className="viewfinder__focus"
            style={{ left: focusRing.x, top: focusRing.y }}
            aria-hidden="true"
          />
        )}
        {blink && <span className="viewfinder__blink" aria-hidden="true" />}

        {zoomRange && lenses.length > 0 && (
          <div className="viewfinder__lenses">
            {lenses.map((lens) => {
              const active = lens === activeLens
              return (
                <button
                  key={lens}
                  className={`viewfinder__lens${active ? ' viewfinder__lens--active' : ''}`}
                  onClick={() => setZoomTo(lens, true)}
                  aria-label={active ? `Zoom ${formatZoom(zoom)}×` : `Zoom to ${formatZoom(lens)}×`}
                >
                  {active ? `${formatZoom(zoom)}×` : formatZoom(lens)}
                </button>
              )
            })}
          </div>
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
        <div className="viewfinder__controls">
          <button className="viewfinder__shutter" onClick={capture} aria-label="Capture photo" />
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}

/** ".5", "1", "2", "1.4" -- the Camera app's lens labels. */
function formatZoom(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded < 1) return `.${Math.round(rounded * 10)}`
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function FlashIcon({ mode }: { mode: FlashMode }) {
  return (
    <svg viewBox="0 0 22 22" width="19" height="19" aria-hidden="true">
      <path
        d="M10 1 2 12.5h5.5L6 21l8-11.5H8.5z"
        fill={mode === 'on' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {mode === 'off' && <path d="M1.5 2.5l13 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
      {mode === 'auto' && (
        <text x="16" y="21" fontSize="8" fontWeight="700" fill="currentColor" fontFamily="system-ui">
          A
        </text>
      )}
    </svg>
  )
}
