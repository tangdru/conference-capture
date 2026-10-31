import { useEffect, useRef, useState, type RefObject } from 'react'

// How far (after resistance) the list must be pulled before letting go
// refreshes, and where it rests while the refresh runs.
const TRIGGER_PX = 72
const HOLD_PX = 56
// Pull distance approaches this asymptotically -- the further you drag, the
// less the list follows, like iOS rubber-banding.
const MAX_PULL_PX = 160
// Shorter than this and the spinner flashes by too fast to register.
const MIN_REFRESH_MS = 700
const SPRING = 'transform 0.45s cubic-bezier(0.2, 0.9, 0.25, 1)'

/** Rubber-band resistance: 1:1 at first, tapering off toward MAX_PULL_PX. */
function resist(dy: number): number {
  const sign = Math.sign(dy)
  const d = Math.abs(dy)
  return sign * MAX_PULL_PX * (1 - 1 / ((d * 0.55) / MAX_PULL_PX + 1))
}

/**
 * Pull-to-refresh with iOS-style rubber-banding for a scroll container.
 * Dragging down from the top moves `contentRef` with increasing resistance
 * and reports progress (0..1+) for the indicator; releasing past the trigger
 * runs `onRefresh` while the content rests at HOLD_PX, then springs back.
 * Dragging up at the bottom just rubber-bands. Normal scrolling, momentum,
 * and horizontal swipes are left native -- this only engages when a mostly
 * vertical drag would otherwise push past an edge.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
): { progress: number; refreshing: boolean } {
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    let start: { x: number; y: number } | null = null
    let mode: 'undecided' | 'pull' | 'native' = 'undecided'
    // Which edge this drag is stretching -- fixed when the pull starts, since
    // a list too short to scroll is at both edges at once.
    let edge: 'top' | 'bottom' = 'top'
    let offset = 0

    function place(px: number, animate: boolean) {
      offset = px
      content!.style.transition = animate ? SPRING : 'none'
      content!.style.transform = px === 0 ? '' : `translateY(${px}px)`
      setProgress(px > 0 ? px / TRIGGER_PX : 0)
    }

    function atTop() {
      return scroller!.scrollTop <= 0
    }
    function atBottom() {
      return scroller!.scrollTop + scroller!.clientHeight >= scroller!.scrollHeight - 1
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || e.touches.length !== 1) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      mode = 'undecided'
    }

    function onTouchMove(e: TouchEvent) {
      if (!start) return
      const dx = e.touches[0].clientX - start.x
      const dy = e.touches[0].clientY - start.y

      if (mode === 'undecided') {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        const vertical = Math.abs(dy) > Math.abs(dx)
        const pastEdge = (dy > 0 && atTop()) || (dy < 0 && atBottom())
        mode = vertical && pastEdge ? 'pull' : 'native'
        edge = dy > 0 ? 'top' : 'bottom'
        if (mode === 'pull') start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
      if (mode !== 'pull') return

      e.preventDefault()
      const pull = e.touches[0].clientY - start.y
      // Only the top edge refreshes; the bottom edge just bounces.
      place(resist(edge === 'top' ? Math.max(pull, 0) : Math.min(pull, 0)), false)
    }

    function onTouchEnd() {
      if (!start) return
      start = null
      if (mode !== 'pull') return
      if (offset >= TRIGGER_PX) {
        void runRefresh()
      } else {
        place(0, true)
      }
    }

    async function runRefresh() {
      refreshingRef.current = true
      setRefreshing(true)
      place(HOLD_PX, true)
      try {
        await Promise.all([
          onRefreshRef.current().catch(() => {}),
          new Promise((resolve) => window.setTimeout(resolve, MIN_REFRESH_MS)),
        ])
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        place(0, true)
      }
    }

    scroller.addEventListener('touchstart', onTouchStart, { passive: true })
    // Not passive: a pull past the edge has to stop the native bounce.
    scroller.addEventListener('touchmove', onTouchMove, { passive: false })
    scroller.addEventListener('touchend', onTouchEnd)
    scroller.addEventListener('touchcancel', onTouchEnd)
    return () => {
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [scrollRef, contentRef])

  return { progress, refreshing }
}
