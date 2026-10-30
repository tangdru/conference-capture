import './DeckViewer.css'

interface DeckViewerProps {
  title: string
  html: string
  onClose: () => void
}

/** Full-screen in-app view of a generated presentation. The native app can't
 * hand a blob: URL to Safari the way a browser opens it in a new tab, so the
 * page renders here instead, in a sandboxed frame (its own scripts run for
 * the scroll animations; it gets no access to the app). */
export function DeckViewer({ title, html, onClose }: DeckViewerProps) {
  return (
    <div className="deck-viewer">
      <div className="deck-viewer__top-bar">
        <span className="deck-viewer__title">{title}</span>
        <button className="deck-viewer__close" onClick={onClose} aria-label="Close presentation">
          ✕
        </button>
      </div>
      <iframe className="deck-viewer__frame" title={title} srcDoc={html} sandbox="allow-scripts" />
    </div>
  )
}
