import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import './SwipeToDelete.css'

const REVEAL_WIDTH = 72
const OVERDRAG = 24
/** Pixels of movement before committing to a horizontal (swipe) vs vertical (scroll) gesture. */
const DIRECTION_LOCK_THRESHOLD = 8

interface DragState {
  startX: number
  startY: number
  directionDecided: boolean
  dragging: boolean
  pointerId: number
}

interface SwipeToDeleteProps {
  id: string
  revealedId: string | null
  onReveal: (id: string | null) => void
  onDelete: () => void
  children: ReactNode
}

export function SwipeToDelete({ id, revealedId, onReveal, onDelete, children }: SwipeToDeleteProps) {
  const isRevealed = revealedId === id
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  // A browser can still synthesize a click after pointerup even when the
  // pointer genuinely moved (observed with Chromium + synthetic input, and
  // not something safe to assume away on real devices either). Without
  // this, that trailing click immediately undoes whatever the drag just
  // did -- reopening or reclosing -- since by the time it fires React has
  // already re-rendered with the drag's result.
  const suppressNextClick = useRef(false)

  function setTransform(px: number, animate: boolean) {
    const el = contentRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.2s ease-out' : 'none'
    el.style.transform = px === 0 ? '' : `translateX(${px}px)`
  }

  // Sync to the "rest" position whenever revealedId changes for a reason
  // other than this row's own gesture (e.g. a different row opened and
  // this one must close) -- never during an active drag.
  useEffect(() => {
    if (!dragRef.current) setTransform(isRevealed ? -REVEAL_WIDTH : 0, true)
  }, [isRevealed])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      directionDecided: false,
      dragging: false,
      pointerId: e.pointerId,
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current
    if (!state) return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY

    if (!state.directionDecided) {
      if (Math.abs(dx) < DIRECTION_LOCK_THRESHOLD && Math.abs(dy) < DIRECTION_LOCK_THRESHOLD) return
      state.directionDecided = true
      state.dragging = Math.abs(dx) > Math.abs(dy)
      if (state.dragging) {
        e.currentTarget.setPointerCapture(state.pointerId)
      } else {
        // Vertical intent -- hand off to native scrolling entirely.
        dragRef.current = null
        return
      }
    }

    if (!state.dragging) return

    const base = isRevealed ? -REVEAL_WIDTH : 0
    const next = Math.min(0, Math.max(-REVEAL_WIDTH - OVERDRAG, base + dx))
    setTransform(next, false)
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current
    dragRef.current = null
    if (!state || !state.dragging) return

    suppressNextClick.current = true

    const dx = e.clientX - state.startX
    const base = isRevealed ? -REVEAL_WIDTH : 0
    const finalPos = Math.min(0, Math.max(-REVEAL_WIDTH - OVERDRAG, base + dx))
    const shouldOpen = finalPos < -REVEAL_WIDTH / 2

    setTransform(shouldOpen ? -REVEAL_WIDTH : 0, true)
    onReveal(shouldOpen ? id : null)
  }

  function onContentClickCapture(e: React.MouseEvent) {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      e.stopPropagation()
      e.preventDefault()
      return
    }
    // A genuine tap (no preceding drag) on an already-revealed row closes
    // it instead of acting on the underlying note/photo.
    if (isRevealed) {
      e.stopPropagation()
      e.preventDefault()
      setTransform(0, true)
      onReveal(null)
    }
  }

  return (
    <div className="swipe-to-delete">
      <button className="swipe-to-delete__action" onClick={onDelete} aria-label="Delete">
        <TrashIcon />
      </button>
      <div
        ref={contentRef}
        className="swipe-to-delete__content"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onContentClickCapture}
      >
        {children}
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0h10l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7z"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
