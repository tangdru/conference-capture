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

export interface DragHandle {
  onDragPointerDown: (e: ReactPointerEvent) => void
  onDragPointerMove: (e: ReactPointerEvent) => void
  onDragPointerUp: (e: ReactPointerEvent) => void
  onDragPointerCancel: (e: ReactPointerEvent) => void
}

interface SwipeActionsProps {
  id: string
  revealedId: string | null
  onReveal: (id: string | null) => void
  actions: SwipeAction[]
  /** An extra slot in the revealed row, behind the swipe like the other
   * actions, but driven by press-and-drag instead of a tap. */
  dragHandle?: DragHandle | null
  /** Suppresses the swipe gesture entirely, e.g. while this row is being edited inline. */
  disabled?: boolean
  children: ReactNode
}

export function SwipeActions({ id, revealedId, onReveal, actions, dragHandle, disabled, children }: SwipeActionsProps) {
  const slotCount = actions.length + (dragHandle ? 1 : 0)
  const revealWidth = slotCount * ACTION_WIDTH
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
        {dragHandle && (
          <button
            className="swipe-actions__action swipe-actions__drag-handle"
            aria-label="Reorder"
            onPointerDown={dragHandle.onDragPointerDown}
            onPointerMove={dragHandle.onDragPointerMove}
            onPointerUp={dragHandle.onDragPointerUp}
            onPointerCancel={dragHandle.onDragPointerCancel}
          >
            <GripIcon />
          </button>
        )}
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
    <svg viewBox="0 0 26 26" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4.5 7h17" stroke="var(--recording-dot)" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 7V5a1 1 0 011-1h4a1 1 0 011 1v2" stroke="var(--recording-dot)" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M6.5 7l1 13.2A2 2 0 009.5 22h7a2 2 0 002-1.8L19.5 7"
        stroke="var(--recording-dot)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M11 11v7M15 11v7" stroke="var(--recording-dot)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function GenerateIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
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

/** A presentation board on a stand -- opens the generated presentation. */
export function ViewIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M2.5 4h21" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="4" width="18" height="12.5" rx="1" stroke="var(--accent)" strokeWidth="2" />
      <path d="M13 16.5V20M13 20l-4 3.5M13 20l4 3.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13v-2.5M13 13V8.5M17 13v-3.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** iOS-style share: an arrow rising out of an open box. */
export function ShareIcon() {
  return (
    <svg
      viewBox="0 0 26 26"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 3v13M8.5 7.5L13 3l4.5 4.5" />
      <path d="M9 11H6.5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 6.5 24h13a1.5 1.5 0 0 0 1.5-1.5v-10a1.5 1.5 0 0 0-1.5-1.5H17" />
    </svg>
  )
}

export function ExcludeIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
      <path
        d="M2 13c3.2-5.3 7.4-8 11-8s7.8 2.7 11 8c-3.2 5.3-7.4 8-11 8S5.2 18.3 2 13z"
        fill="none"
        stroke="var(--text-secondary)"
        strokeWidth="1.8"
      />
      <circle cx="13" cy="13" r="3.2" fill="var(--text-secondary)" />
      <path d="M4 4L22 22" stroke="var(--recording-dot)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IncludeIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
      <path
        d="M2 13c3.2-5.3 7.4-8 11-8s7.8 2.7 11 8c-3.2 5.3-7.4 8-11 8S5.2 18.3 2 13z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
      />
      <circle cx="13" cy="13" r="3.2" fill="var(--accent)" />
    </svg>
  )
}

export function GripIcon() {
  return (
    <svg viewBox="0 0 26 26" width="16" height="16" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" fill="var(--text-muted)" />
      <circle cx="17" cy="6" r="1.6" fill="var(--text-muted)" />
      <circle cx="9" cy="13" r="1.6" fill="var(--text-muted)" />
      <circle cx="17" cy="13" r="1.6" fill="var(--text-muted)" />
      <circle cx="9" cy="20" r="1.6" fill="var(--text-muted)" />
      <circle cx="17" cy="20" r="1.6" fill="var(--text-muted)" />
    </svg>
  )
}

export function RegenerateIcon() {
  return (
    <svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true">
      <path d="M5.21,17.5 A9,9 0 0,1 17.5,5.21" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <path d="M21,7.2 L16.3,7.4 L18.8,3 Z" fill="var(--accent)" />
      <path d="M20.79,8.5 A9,9 0 0,1 8.5,20.79" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <path d="M5,18.8 L9.7,18.6 L7.2,23 Z" fill="var(--accent)" />
    </svg>
  )
}
