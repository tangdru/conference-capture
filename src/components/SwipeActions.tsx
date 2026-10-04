import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import './SwipeActions.css'

const ACTION_WIDTH = 72
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

export interface SwipeAction {
  icon: ReactNode
  label: string
  onClick: () => void
}

interface SwipeActionsProps {
  id: string
  revealedId: string | null
  onReveal: (id: string | null) => void
  actions: SwipeAction[]
  /** Suppresses the swipe gesture entirely, e.g. while this row is being edited inline. */
  disabled?: boolean
  children: ReactNode
}

export function SwipeActions({ id, revealedId, onReveal, actions, disabled, children }: SwipeActionsProps) {
  const revealWidth = actions.length * ACTION_WIDTH
  const isRevealed = !disabled && revealedId === id
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
    if (!dragRef.current) setTransform(isRevealed ? -revealWidth : 0, true)
  }, [isRevealed, revealWidth])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return
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

    const base = isRevealed ? -revealWidth : 0
    const next = Math.min(0, Math.max(-revealWidth - OVERDRAG, base + dx))
    setTransform(next, false)
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current
    dragRef.current = null
    if (!state || !state.dragging) return

    suppressNextClick.current = true

    const dx = e.clientX - state.startX
    const base = isRevealed ? -revealWidth : 0
    const finalPos = Math.min(0, Math.max(-revealWidth - OVERDRAG, base + dx))
    const shouldOpen = finalPos < -revealWidth / 2

    setTransform(shouldOpen ? -revealWidth : 0, true)
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
    <div className="swipe-actions">
      <div className="swipe-actions__row" style={{ width: revealWidth }}>
        {actions.map((action) => (
          <button
            key={action.label}
            className="swipe-actions__action"
            onClick={action.onClick}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>
      <div
        ref={contentRef}
        className="swipe-actions__content"
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

export function DeleteIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="var(--recording-dot)" strokeWidth="2" />
      <path
        d="M9.5 9.5l7 7M16.5 9.5l-7 7"
        fill="none"
        stroke="var(--recording-dot)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ExportIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path
        d="M13 17v-8M9.5 12.5L13 9l3.5 3.5M9 17h8"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
