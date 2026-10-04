import { useEffect, useState } from 'react'
import type { Session } from '../types'
import { formatSessionSubtitle } from '../format'
import { resolveDeckUrl } from '../db'
import './ReviewStub.css'

interface ReviewStubProps {
  session: Session
  onBack: () => void
  onGenerateDeck: (sessionId: string) => Promise<void>
}

export function ReviewStub({ session, onBack, onGenerateDeck }: ReviewStubProps) {
  const notes = session.items.filter((i) => i.type === 'note').length
  const photos = session.items.filter((i) => i.type === 'photo').length
  const hasContent = session.items.length > 0

  const [deckUrl, setDeckUrl] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    if (session.deckStatus !== 'ready' || !session.deckPath) {
      setDeckUrl(null)
      return
    }
    let cancelled = false
    resolveDeckUrl(session.deckPath)
      .then((url) => {
        if (!cancelled) setDeckUrl(url)
      })
      .catch((err) => {
        if (!cancelled) setResolveError(err instanceof Error ? err.message : 'Failed to load presentation')
      })
    return () => {
      cancelled = true
    }
  }, [session.deckStatus, session.deckPath])

  function handleGenerate() {
    setResolveError(null)
    onGenerateDeck(session.id)
  }

  const showGenerating = session.deckStatus === 'generating'

  return (
    <div className="review-stub">
      <header className="review-stub__header">
        <button className="review-stub__back" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
        <h1>{session.title}</h1>
      </header>
      <p className="review-stub__subtitle">{formatSessionSubtitle(session.startedAt)}</p>
      <p className="review-stub__stats">
        📝 {notes} notes &nbsp; 📷 {photos} photos
      </p>

      <div className="review-stub__deck">
        <h2 className="review-stub__deck-title">Presentation</h2>

        {showGenerating && (
          <p className="review-stub__deck-status">
            Generating your presentation from your notes and photos — this can take a minute…
          </p>
        )}

        {!showGenerating && session.deckStatus === 'none' && (
          <>
            <p className="review-stub__deck-status">
              Turn this session into a self-contained HTML presentation you can keep, revisit, or
              share with colleagues.
            </p>
            <button className="review-stub__deck-btn" onClick={handleGenerate} disabled={!hasContent}>
              Generate presentation
            </button>
            {!hasContent && (
              <p className="review-stub__deck-hint">Add a note or photo to this session first.</p>
            )}
          </>
        )}

        {!showGenerating && session.deckStatus === 'error' && (
          <>
            <p className="review-stub__deck-error">{session.deckError ?? 'Something went wrong.'}</p>
            <button className="review-stub__deck-btn" onClick={handleGenerate}>
              Try again
            </button>
          </>
        )}

        {!showGenerating && session.deckStatus === 'ready' && (
          <div className="review-stub__deck-ready">
            {resolveError && <p className="review-stub__deck-error">{resolveError}</p>}
            <a
              className="review-stub__deck-btn"
              href={deckUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!deckUrl}
            >
              View presentation
            </a>
            <a
              className="review-stub__deck-btn review-stub__deck-btn--secondary"
              href={deckUrl ?? undefined}
              download={`${session.title.replace(/[^\w\- ]+/g, '').trim() || 'presentation'}.html`}
              aria-disabled={!deckUrl}
            >
              Download
            </a>
            <button className="review-stub__regenerate" onClick={handleGenerate}>
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
