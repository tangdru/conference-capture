import { useRef, useState, type PointerEvent } from 'react'
import { feel } from '../haptics'
import './DeckViewer.css'

interface DeckViewerProps {
  title: string
  html: string
  onClose: () => void
}

/** How far right (share of the screen) a drag must go to close on release. */
const CLOSE_SHARE = 0.33
/** Or a quick flick right, in px per ms. */
const FLICK_SPEED = 0.5

/** Full-screen in-app view of a generated presentation. The native app can't
 * hand a blob: URL to Safari the way a browser opens it in a new tab, so the
 * page renders here instead, in a sandboxed frame (its own scripts run for
 * its interactive charts; it gets no access to the app).
 *
 * Swiping right from the left edge (or along the top bar) goes back to the
 * session list, as iOS's own back swipe does: the presentation follows the
 * finger, and closes if let go far enough over or flicked. The frame keeps
 * every touch it gets, so the edge has its own thin strip on top of it. */
export function DeckViewer({ title, html, onClose }: DeckViewerProps) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; t: number; lastX: number; lastT: number; decided: boolean } | null>(
    null,
  )
  // Past the close point: letting go now closes. A tick each time it's crossed.
  const armed = useRef(false)

  function close() {
    if (leaving) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      thud()
      return onClose()
    }
    setLeaving(true)
    setOffset(window.innerWidth)
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (leaving || (e.target as HTMLElement).closest('button')) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, lastX: e.clientX, lastT: e.timeStamp, decided: false }
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // Mostly sideways and to the right: it's a back swipe. Otherwise not.
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      d.decided = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    setOffset(Math.max(0, dx))
    const past = dx > window.innerWidth * CLOSE_SHARE
    if (past && !armed.current) feel.tick()
    armed.current = past
  }

  function up(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.decided) return
    armed.current = false
    setDragging(false)
    const dx = e.clientX - d.x
    const speed = (e.clientX - d.lastX) / Math.max(1, e.timeStamp - d.lastT)
    if (dx > window.innerWidth * CLOSE_SHARE || (dx > 30 && speed > FLICK_SPEED)) close()
    else setOffset(0)
  }

  const handlers = { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up }

  return (
    <div
      className={`deck-viewer${dragging ? ' deck-viewer--dragging' : ''}${offset > 0 ? ' deck-viewer--moved' : ''}`}
      style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      onTransitionEnd={(e) => {
        if (leaving && e.target === e.currentTarget) {
          thud()
          onClose()
        }
      }}
    >
      <div className="deck-viewer__top-bar" {...handlers}>
        <span className="deck-viewer__title">{title}</span>
        <button className="deck-viewer__close" onClick={close} aria-label="Close presentation">
          ✕
        </button>
      </div>
      <iframe className="deck-viewer__frame" title={title} srcDoc={html} sandbox="allow-scripts" />
      <div className="deck-viewer__edge" aria-hidden="true" {...handlers} />
    </div>
  )
}

/** The tap felt the moment the presentation is fully off the screen, so
 * leaving it lands as one solid close. */
function thud() {
  feel.thud()
}
