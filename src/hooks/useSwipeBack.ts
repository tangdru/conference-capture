import { useRef, useState, type CSSProperties, type PointerEvent, type TransitionEvent } from 'react'
import { feel } from '../haptics'
import './swipeBack.css'

/** How far right (share of the screen) a drag must go to go back on release. */
const BACK_SHARE = 0.33
/** Or a quick flick right, in px per ms. */
const FLICK_SPEED = 0.5

/**
 * Swipe right to go back to the session list, as iOS's own back swipe does,
 * for a full-screen view over the list (a presentation, a session). The
 * view follows the finger; a light tick once it's far enough that letting
 * go goes back; let go there (or flick) and it slides off, with a solid tap
 * the moment it's gone. Otherwise it settles back.
 *
 * Spread `rootProps` on the view and give its CSS a `transform` transition;
 * spread `edgeProps` on whatever catches the swipe (a strip along the left
 * edge, a top bar). `close` is the same slide-off, for a close button.
 */
export function useSwipeBack(onBack: () => void) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; lastX: number; lastT: number; decided: boolean } | null>(null)
  // Past the go-back point: letting go now goes back. A tick each time it's crossed.
  const armed = useRef(false)

  function close() {
    if (leaving) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      feel.thud()
      return onBack()
    }
    setLeaving(true)
    setOffset(window.innerWidth)
  }

  function down(e: PointerEvent<HTMLElement>) {
    if (leaving || (e.target as HTMLElement).closest('button, input, textarea, [contenteditable="true"]')) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: e.timeStamp, decided: false }
  }

  function move(e: PointerEvent<HTMLElement>) {
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
    const past = dx > window.innerWidth * BACK_SHARE
    if (past && !armed.current) feel.tick()
    armed.current = past
  }

  function up(e: PointerEvent<HTMLElement>) {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.decided) return
    armed.current = false
    setDragging(false)
    const dx = e.clientX - d.x
    const speed = (e.clientX - d.lastX) / Math.max(1, e.timeStamp - d.lastT)
    if (dx > window.innerWidth * BACK_SHARE || (dx > 30 && speed > FLICK_SPEED)) close()
    else setOffset(0)
  }

  const style: CSSProperties | undefined = offset ? { transform: `translateX(${offset}px)` } : undefined
  const className = `${dragging ? ' swipe-back--dragging' : ''}${offset > 0 ? ' swipe-back--moved' : ''}`

  return {
    close,
    rootProps: {
      style,
      className,
      onTransitionEnd(e: TransitionEvent<HTMLElement>) {
        if (leaving && e.target === e.currentTarget && e.propertyName === 'transform') {
          feel.thud()
          onBack()
        }
      },
    },
    edgeProps: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up },
  }
}
