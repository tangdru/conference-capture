import { useEffect, useState } from 'react'

/**
 * Temporary on-device diagnostic overlay. Several fix attempts in a row have
 * each been based on a theory that turned out wrong once tested on a real
 * iPhone -- this exists to stop guessing and instead capture what's actually
 * happening at the moment it happens. Rendered via a fixed element so it
 * stays on top (and visible) regardless of what the rest of the page's
 * layout is doing.
 *
 * Enable with ?debug=1 in the URL. Remove this file and its one call site
 * once the real bug is found -- it's not meant to ship long-term.
 */
export function DebugHud() {
  const [enabled] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1')
  const [snapshot, setSnapshot] = useState('')

  useEffect(() => {
    if (!enabled) return

    function rectOf(el: Element | null) {
      if (!el) return 'none'
      const r = el.getBoundingClientRect()
      return `(${r.top.toFixed(0)},${r.left.toFixed(0)},${r.width.toFixed(0)}x${r.height.toFixed(0)})`
    }

    function read() {
      const vv = window.visualViewport
      const active = document.activeElement as HTMLElement | null
      const timeline = document.querySelector('.timeline')
      const captureScreen = document.querySelector('.capture-screen')
      const captureActions = document.querySelector('.capture-actions')
      const scrollingEl = document.scrollingElement

      const lines = [
        `=== t=${(performance.now() / 1000).toFixed(1)}s dpr=${window.devicePixelRatio} ===`,
        `win inner=${window.innerWidth}x${window.innerHeight} scrollY=${window.scrollY}`,
        `html rect=${rectOf(document.documentElement)} scrollTop=${document.documentElement.scrollTop}`,
        `body scrollTop=${document.body.scrollTop}`,
        `scrollingElement=${scrollingEl ? scrollingEl.tagName : 'null'}`,
        vv
          ? `vv ${vv.width.toFixed(0)}x${vv.height.toFixed(0)} off=(${vv.offsetLeft.toFixed(0)},${vv.offsetTop.toFixed(0)}) scale=${vv.scale.toFixed(2)}`
          : 'vv unsupported',
        `active=<${active?.tagName.toLowerCase() ?? 'none'} .${active?.className ?? ''}>`,
        `active rect=${rectOf(active)}`,
        captureScreen ? `.capture-screen rect=${rectOf(captureScreen)}` : '(no .capture-screen)',
        captureActions ? `.capture-actions rect=${rectOf(captureActions)}` : '(no .capture-actions)',
        timeline
          ? `.timeline scrollTop=${(timeline as HTMLElement).scrollTop} scrollH=${(timeline as HTMLElement).scrollHeight} clientH=${(timeline as HTMLElement).clientHeight} rect=${rectOf(timeline)}`
          : '(no .timeline)',
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
        padding: '4px 4px',
        paddingTop: 'calc(4px + env(safe-area-inset-top))',
        paddingLeft: 'calc(4px + env(safe-area-inset-left))',
        background: 'rgba(0,0,0,0.9)',
        color: '#4ade80',
        fontSize: '8px',
        lineHeight: 1.35,
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
