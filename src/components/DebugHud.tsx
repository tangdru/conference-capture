import { useEffect, useState } from 'react'

/**
 * Temporary on-device diagnostic overlay. Four attempts at fixing the
 * "screen goes blank when an input is focused" bug have each been based on
 * a theory that turned out wrong once tested on a real iPhone -- this exists
 * to stop guessing and instead capture what's actually happening at the
 * moment it happens. Rendered via a portal-free fixed element at the end of
 * <body> so it stays on top (and visible) regardless of what the rest of
 * the page's layout is doing.
 *
 * Enable with ?debug=1 in the URL. Remove this file and its one call site
 * once the real bug is found -- it's not meant to ship long-term.
 */
export function DebugHud() {
  const [enabled] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1')
  const [snapshot, setSnapshot] = useState('')

  useEffect(() => {
    if (!enabled) return

    function read() {
      const vv = window.visualViewport
      const fixedShells = Array.from(
        document.querySelectorAll('.capture-screen, .home-screen, .review-stub, .sign-in-screen, .auth-loading'),
      )
      const active = document.activeElement
      const lines = [
        `t=${(performance.now() / 1000).toFixed(1)}s`,
        `window: inner=${window.innerWidth}x${window.innerHeight} scrollY=${window.scrollY}`,
        `html: scrollTop=${document.documentElement.scrollTop} clientH=${document.documentElement.clientHeight}`,
        `body: scrollTop=${document.body.scrollTop}`,
        vv
          ? `vv: ${vv.width.toFixed(0)}x${vv.height.toFixed(0)} offset=(${vv.offsetLeft.toFixed(0)},${vv.offsetTop.toFixed(0)}) pageOffset=(${vv.pageLeft.toFixed(0)},${vv.pageTop.toFixed(0)}) scale=${vv.scale.toFixed(2)}`
          : 'vv: unsupported',
        `active: <${active?.tagName.toLowerCase()} class="${(active as HTMLElement)?.className ?? ''}">`,
        `body style: position=${getComputedStyle(document.body).position} overflow=${getComputedStyle(document.body).overflow} transform=${getComputedStyle(document.body).transform}`,
        ...fixedShells.map((el) => {
          const cs = getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          return `.${el.className.split(' ')[0]}: pos=${cs.position} top=${cs.top} h=${cs.height} transform=${cs.transform} opacity=${cs.opacity} visibility=${cs.visibility} rect=(${rect.top.toFixed(0)},${rect.left.toFixed(0)},${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`
        }),
      ]
      setSnapshot(lines.join('\n'))
    }

    read()
    const interval = window.setInterval(read, 200)
    window.visualViewport?.addEventListener('resize', read)
    window.visualViewport?.addEventListener('scroll', read)
    window.addEventListener('scroll', read, true)
    window.addEventListener('focusin', read)

    return () => {
      window.clearInterval(interval)
      window.visualViewport?.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('scroll', read)
      window.removeEventListener('scroll', read, true)
      window.removeEventListener('focusin', read)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <pre
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999999,
        margin: 0,
        padding: '4px 6px',
        background: 'rgba(0,0,0,0.85)',
        color: '#4ade80',
        fontSize: '9px',
        lineHeight: 1.3,
        fontFamily: 'ui-monospace, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        pointerEvents: 'none',
      }}
    >
      {snapshot}
    </pre>
  )
}
