import { useEffect } from 'react'

/**
 * iOS Safari doesn't shrink `position: fixed` elements when the on-screen
 * keyboard opens — it resizes the visual viewport but leaves the layout
 * viewport (and therefore 100vh/inset:0) alone, so fixed-full-screen UI ends
 * up partly hidden behind the keyboard. Track the real visible height via
 * the visualViewport API and expose it as --app-vh for screens that need to
 * stay fully reachable (e.g. the capture screen's note input).
 *
 * Note: an earlier version of this hook also tracked
 * visualViewport.offsetLeft/offsetTop (via its 'scroll' event) and used them
 * to translate the fixed shell, to compensate for the visual viewport
 * panning away from the layout viewport's origin. That turned out to fight
 * iOS's own built-in behavior that keeps a focused input visible: on a
 * real device it broke the (already-working) bottom add-note bar, pushing
 * it off-screen on focus instead of fixing the edit-existing-note bug it
 * targeted. Reverted back to height-only tracking.
 */
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport

    function update() {
      const height = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-vh', `${height}px`)
    }

    update()
    vv?.addEventListener('resize', update)
    window.addEventListener('resize', update)

    return () => {
      vv?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
    }
  }, [])
}
