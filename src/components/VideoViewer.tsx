import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { VideoItem } from '../types'
import { useVideoUrl } from '../hooks/useVideoUrl'
import { useLocalVideo } from '../videoClips'
import { formatClipDuration, formatClock } from '../format'
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

/** Plays a video clip's kept part. On the phone that recorded it, the strip
 * of frames below has two handles to trim it, like an audio clip's. */
export function VideoViewer({ item, onClose, onTrim, listening }: VideoViewerProps) {
  const localVideo = useLocalVideo(item.id)
  const remoteUrl = useVideoUrl(item)
  const src = localVideo?.src ?? remoteUrl
  const videoRef = useRef<HTMLVideoElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start' | 'end' | null>(null)
  const [draft, setDraft] = useState<{ startMs: number; endMs: number } | null>(null)
  const [positionMs, setPositionMs] = useState(item.trimStartMs)

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
    video.addEventListener('loadedmetadata', toStart)
    video.addEventListener('play', toStart)
    video.addEventListener('timeupdate', tick)
    return () => {
      video.removeEventListener('loadedmetadata', toStart)
      video.removeEventListener('play', toStart)
      video.removeEventListener('timeupdate', tick)
    }
  }, [src, startMs, endMs])

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
    <div className="video-viewer">
      <div className="video-viewer__top-bar">
        <span className="mono-timestamp">
          {formatClock(item.timestamp)} · {formatClipDuration(endMs - startMs)}
        </span>
        <button className="video-viewer__close" onClick={onClose} aria-label="Close video">
          ✕
        </button>
      </div>

      <div className="video-viewer__stage">
        {src ? (
          <video
            ref={videoRef}
            className="video-viewer__video"
            src={src}
            poster={localVideo?.poster}
            controls
            autoPlay
            playsInline
            muted={listening}
          />
        ) : (
          <p className="video-viewer__note">
            {item.videoPath ? 'Loading…' : 'This clip is on the phone that recorded it. It shows here once it has uploaded.'}
          </p>
        )}
      </div>

      {(canTrim || listening) && (
        <div className="video-viewer__bottom">
          {canTrim && localVideo && (
            <div className="video-trim" ref={stripRef}>
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
          )}
          {listening && <p className="video-viewer__note">Plays without sound while the session is listening.</p>}
        </div>
      )}
    </div>
  )
}
