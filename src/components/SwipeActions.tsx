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
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <path
        d="M6 6l14 14M20 6L6 20"
        fill="none"
        stroke="var(--recording-dot)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function GenerateIcon() {
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <path
        d="M13,2 C14,9 17,12 24,13 C17,14 14,17 13,24 C12,17 9,14 2,13 C9,12 12,9 13,2 Z"
        fill="var(--accent)"
      />
      <path
        d="M6,17 C6.6,19 7.4,19.4 9,20 C7.4,20.6 6.6,21.4 6,23 C5.4,21.4 4.6,20.6 3,20 C4.6,19.4 5.4,19 6,17 Z"
        fill="var(--accent)"
      />
    </svg>
  )
}

export function ViewIcon() {
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <path
        d="M2 13c3.2-5.3 7.4-8 11-8s7.8 2.7 11 8c-3.2 5.3-7.4 8-11 8S5.2 18.3 2 13z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="13" r="3.2" fill="var(--accent)" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <path
        d="M13 2v15M6 10l7 7 7-7M4 22h18"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RegenerateIcon() {
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <path
        d="M4.5 12.5a8.5 8.5 0 0 1 14-6.5M20.5 2.5v6.5H14"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.5 13.5a8.5 8.5 0 0 1-14 6.5M5.5 23.5V17H12"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
