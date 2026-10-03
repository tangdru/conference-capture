import { useEffect } from 'react'

/**
 * iOS Safari doesn't shrink `position: fixed` elements when the on-screen
 * keyboard opens — it resizes the visual viewport but leaves the layout
 * viewport (and therefore 100vh/inset:0) alone, so fixed-full-screen UI ends
 * up partly hidden behind the keyboard. Track the real visible height via
 * the visualViewport API and expose it as --app-vh for screens that need to
 * stay fully reachable (e.g. the capture screen's note input).
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
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)

    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
}
