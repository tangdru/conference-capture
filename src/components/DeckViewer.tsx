import { useSwipeBack } from '../hooks/useSwipeBack'
import './DeckViewer.css'

interface DeckViewerProps {
  title: string
  html: string
  onClose: () => void
}

/** Full-screen in-app view of a generated presentation. The native app can't
 * hand a blob: URL to Safari the way a browser opens it in a new tab, so the
 * page renders here instead, in a sandboxed frame (its own scripts run for
 * its interactive charts; it gets no access to the app).
 *
 * Swiping right from the left edge (or along the top bar) goes back to the
 * session list (useSwipeBack). The frame keeps every touch it gets, so the
 * edge has its own thin strip on top of it. */
export function DeckViewer({ title, html, onClose }: DeckViewerProps) {
  const { close, rootProps, edgeProps } = useSwipeBack(onClose)

  return (
    <div {...rootProps} className={`deck-viewer${rootProps.className}`}>
      <div className="deck-viewer__top-bar" {...edgeProps}>
        <span className="deck-viewer__title">{title}</span>
        <button className="deck-viewer__close" onClick={close} aria-label="Close presentation">
          ✕
        </button>
      </div>
      <iframe className="deck-viewer__frame" title={title} srcDoc={html} sandbox="allow-scripts" />
      <div className="deck-viewer__edge swipe-back-edge" aria-hidden="true" {...edgeProps} />
    </div>
  )
}
