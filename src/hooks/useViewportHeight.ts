import { useEffect } from 'react'

/**
 * Keeps a fixed-position full-screen shell correctly sized AND positioned
 * against the real visual viewport, not just the layout viewport.
 *
 * `position: fixed` pins an element to the *layout* viewport. iOS Safari's
 * on-screen keyboard shrinks the *visual* viewport without touching the
 * layout viewport, so a plain 100vh/inset:0 element doesn't shrink with it.
 * That was the first bug this hook fixed (--app-vh).
 *
 * But the keyboard (and any zoom, however triggered) can also *pan* the
 * visual viewport away from the layout viewport's origin --
 * visualViewport.offsetTop/offsetLeft become non-zero. A `top: 0` fixed
 * element is still pinned to the untouched layout viewport, so it visually
 * scrolls off-screen even though nothing about its own position changed --
 * from the user's point of view the entire screen just vanishes behind the
 * keyboard. Tracking the offset too, and compensating with a transform,
 * keeps the shell visually anchored to whatever is actually on screen.
 */
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement.style

    function update() {
      const height = vv?.height ?? window.innerHeight
      const offsetLeft = vv?.offsetLeft ?? 0
      const offsetTop = vv?.offsetTop ?? 0
      root.setProperty('--app-vh', `${height}px`)
      root.setProperty('--app-vv-x', `${offsetLeft}px`)
      root.setProperty('--app-vv-y', `${offsetTop}px`)
    }

    update()
    // 'resize' covers height changes (keyboard open/close, orientation).
    // 'scroll' covers the visual viewport panning relative to the layout
    // viewport (zoom, or the keyboard shifting things) -- both matter here.
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
