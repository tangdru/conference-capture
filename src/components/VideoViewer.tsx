import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { VideoItem } from '../types'
import { useVideoUrl } from '../hooks/useVideoUrl'
import { useLocalVideo } from '../videoClips'
import { formatClipDuration, formatClock } from '../format'
import { PauseIcon, PlayIcon } from './InlineIcons'
import './VideoViewer.css'

interface VideoViewerProps {
  item: VideoItem
  onClose: () => void
  /** A new trim (only offered on the phone that recorded the clip). */
  onTrim?: (item: VideoItem) => void
  /** The session is listening: the mic holds the sound, so it plays muted. */
  listening?: boolean
}

/** Shortest part a trim can keep. */
const MIN_KEEP_MS = 500

// Swipe down past this (or flick down fast) closes the video, as for a photo.
const CLOSE_DISTANCE = 100
const CLOSE_SPEED = 0.6 // px per ms

/** Plays a video clip's kept part. On the phone that recorded it, the strip
 * of frames below has two handles to trim it, like an audio clip's.
 *
 * Its own play button rather than the system's controls: those offer
 * unmute (which takes the mic from the transcript), full screen and
 * picture in picture, none of which the app wants. */
export function VideoViewer({ item, onClose, onTrim, listening }: VideoViewerProps) {
  const localVideo = useLocalVideo(item.id)
  const remoteUrl = useVideoUrl(item)
  const src = localVideo?.src ?? remoteUrl
  const videoRef = useRef<HTMLVideoElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start' | 'end' | null>(null)
  const [draft, setDraft] = useState<{ startMs: number; endMs: number } | null>(null)
  const [positionMs, setPositionMs] = useState(item.trimStartMs)
  const [playing, setPlaying] = useState(false)
  const seekRef = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ x: number; y: number; at: number; down: boolean | null } | null>(null)
  const swiped = useRef(false)
  const [pull, setPull] = useState(0)
  const [settling, setSettling] = useState(false)

  // Only the phone that recorded it has the whole recording to trim; the
  // uploaded cut elsewhere is the kept part already.
  const whole = !!localVideo
  const total = Math.max(item.durationMs, 1)
  const startMs = whole ? draft?.startMs ?? item.trimStartMs : 0
  const endMs = whole ? draft?.endMs ?? item.trimEndMs : total
  const canTrim = whole && !!onTrim

  // Keep playback inside the kept part.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const toStart = () => {
      if (dragging.current) return
      if (video.currentTime * 1000 < startMs || video.currentTime * 1000 >= endMs) video.currentTime = startMs / 1000
    }
    const tick = () => {
      const ms = video.currentTime * 1000
      setPositionMs(ms)
      if (ms >= endMs && !dragging.current) {
        video.pause()
        video.currentTime = startMs / 1000
      }
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('loadedmetadata', toStart)
    video.addEventListener('play', toStart)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onPause)
    video.addEventListener('timeupdate', tick)
    return () => {
      video.removeEventListener('loadedmetadata', toStart)
      video.removeEventListener('play', toStart)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onPause)
      video.removeEventListener('timeupdate', tick)
    }
  }, [src, startMs, endMs])

  // While the session listens, the sound stays off: playing it takes the
  // mic's audio session and stops the transcript.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const keepMuted = () => {
      if (listening && !video.muted) video.muted = true
    }
    video.muted = !!listening
    video.addEventListener('volumechange', keepMuted)
    return () => video.removeEventListener('volumechange', keepMuted)
  }, [src, listening])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }

  // A tap on the strip (not a handle) or the seek bar moves the playhead,
  // within the kept part.
  function seek(e: ReactPointerEvent<HTMLDivElement>, box: HTMLDivElement | null) {
    const video = videoRef.current
    const rect = box?.getBoundingClientRect()
    if (!video || !rect) return
    const at = ((e.clientX - rect.left) / rect.width) * total
    const ms = Math.min(Math.max(at, startMs), endMs - 50)
    video.currentTime = ms / 1000
    setPositionMs(ms)
  }

  function handleTouchStart(e: React.TouchEvent) {
    swiped.current = false
    if (e.touches.length !== 1) {
      swipe.current = null
      return
    }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), down: null }
    setSettling(false)
  }

  function handleTouchMove(e: React.TouchEvent) {
    const d = swipe.current
    if (!d || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - d.x
    const dy = e.touches[0].clientY - d.y
    if (d.down === null && Math.hypot(dx, dy) > 8) d.down = dy > 0 && dy > Math.abs(dx)
    if (d.down) {
      swiped.current = true
      setPull(Math.max(0, dy))
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const d = swipe.current
    swipe.current = null
    if (!d?.down) return
    const dy = Math.max(0, e.changedTouches[0].clientY - d.y)
    const speed = dy / Math.max(1, Date.now() - d.at)
    if (dy > CLOSE_DISTANCE || speed > CLOSE_SPEED) {
      onClose()
      return
    }
    setSettling(true)
    setPull(0)
  }

  function msAt(clientX: number): number {
    const box = stripRef.current?.getBoundingClientRect()
    if (!box) return 0
    return Math.min(Math.max(((clientX - box.left) / box.width) * total, 0), total)
  }

  function handleDown(which: 'start' | 'end') {
    return (e: ReactPointerEvent<HTMLSpanElement>) => {
      e.stopPropagation()
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = which
      videoRef.current?.pause()
      setDraft({ startMs: item.trimStartMs, endMs: item.trimEndMs })
    }
  }

  function handleMove(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!dragging.current) return
    const at = Math.round(msAt(e.clientX))
    const which = dragging.current
    setDraft((d) => {
      const now = d ?? { startMs: item.trimStartMs, endMs: item.trimEndMs }
      return which === 'start'
        ? { ...now, startMs: Math.min(at, now.endMs - MIN_KEEP_MS) }
        : { ...now, endMs: Math.max(at, now.startMs + MIN_KEEP_MS) }
    })
    // Show the frame at the handle.
    if (videoRef.current) videoRef.current.currentTime = at / 1000
  }

  function handleUp() {
    if (!dragging.current) return
    dragging.current = null
    const trim = draft
    setDraft(null)
    if (videoRef.current && trim) videoRef.current.currentTime = trim.startMs / 1000
    if (trim && (trim.startMs !== item.trimStartMs || trim.endMs !== item.trimEndMs)) {
      onTrim?.({ ...item, trimStartMs: Math.max(0, trim.startMs), trimEndMs: Math.min(total, trim.endMs) })
    }
  }

  const keptFrom = startMs / total
  const keptTo = endMs / total
  const played = Math.min(Math.max(positionMs / total, keptFrom), keptTo)

  return (
    <div className="video-viewer" style={{ background: `rgba(0, 0, 0, ${Math.max(0.3, 1 - pull / 400)})` }}>
      <div className="video-viewer__top-bar">
        <span className="mono-timestamp">
          {formatClock(item.timestamp)} · {formatClipDuration(endMs - startMs)}
        </span>
        <button className="video-viewer__close" onClick={onClose} aria-label="Close video">
          ✕
        </button>
      </div>

      <div
        className={`video-viewer__stage${settling ? ' video-viewer__stage--settling' : ''}`}
        style={pull ? { transform: `translateY(${pull}px) scale(${Math.max(0.85, 1 - pull / 1500)})` } : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { swipe.current = null; setSettling(true); setPull(0) }}
        onClick={() => {
          if (swiped.current) return
          togglePlay()
        }}
      >
        {src ? (
          <>
            <video
              ref={videoRef}
              className="video-viewer__video"
              src={src}
              poster={localVideo?.poster}
              autoPlay
              playsInline
              muted={listening}
              disablePictureInPicture
              disableRemotePlayback
            />
            {!playing && (
              <span className="video-viewer__big-play" aria-hidden="true">
                <PlayIcon />
              </span>
            )}
          </>
        ) : (
          <p className="video-viewer__note">
            {item.videoPath ? 'Loading…' : 'This clip is on the phone that recorded it. It shows here once it has uploaded.'}
          </p>
        )}
      </div>

      {src && (
        <div className="video-viewer__bottom">
          <div className="video-viewer__controls">
            <button
              className="video-viewer__play"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          {canTrim && localVideo ? (
            <div className="video-trim" ref={stripRef} onPointerDown={(e) => seek(e, stripRef.current)}>
              <div className="video-trim__frames" aria-hidden="true">
                {localVideo.frames.map((frame, i) => (
                  <img key={frame} src={frame} alt="" draggable={false} data-i={i} />
                ))}
              </div>
              <div className="video-trim__cut" style={{ left: 0, width: `${keptFrom * 100}%` }} aria-hidden="true" />
              <div className="video-trim__cut" style={{ left: `${keptTo * 100}%`, right: 0 }} aria-hidden="true" />
              <div
                className="video-trim__kept"
                style={{ left: `${keptFrom * 100}%`, width: `${(keptTo - keptFrom) * 100}%` }}
                aria-hidden="true"
              />
              {!draft && <div className="video-trim__playhead" style={{ left: `${played * 100}%` }} aria-hidden="true" />}
              <span
                className="video-trim__handle video-trim__handle--start"
                style={{ left: `${keptFrom * 100}%` }}
                role="slider"
                aria-label="Clip start"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={startMs}
                onPointerDown={handleDown('start')}
                onPointerMove={handleMove}
                onPointerUp={handleUp}
                onPointerCancel={handleUp}
              />
              <span
                className="video-trim__handle video-trim__handle--end"
                style={{ left: `${keptTo * 100}%` }}
                role="slider"
                aria-label="Clip end"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={endMs}
                onPointerDown={handleDown('end')}
                onPointerMove={handleMove}
                onPointerUp={handleUp}
                onPointerCancel={handleUp}
              />
            </div>
          ) : (
            <div className="video-seek" ref={seekRef} onPointerDown={(e) => seek(e, seekRef.current)}>
              <div className="video-seek__fill" style={{ width: `${played * 100}%` }} />
            </div>
          )}
          </div>
          {listening && (
            <p className="video-viewer__note">
              Sound is off while transcribing. It plays when transcription isn't running.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
