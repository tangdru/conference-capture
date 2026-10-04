import { useEffect, useState } from 'react'
import type { Session } from '../types'
import { formatSessionSubtitle } from '../format'
import { fetchSessionDeckState, generateDeck, resolveDeckUrl } from '../db'
import './ReviewStub.css'

interface ReviewStubProps {
  session: Session
  onBack: () => void
  onUpdateLocal: (updater: (session: Session) => Session) => void
}

export function ReviewStub({ session, onBack, onUpdateLocal }: ReviewStubProps) {
  const notes = session.items.filter((i) => i.type === 'note').length
  const photos = session.items.filter((i) => i.type === 'photo').length
  const hasContent = session.items.length > 0

  const [isGenerating, setIsGenerating] = useState(false)
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

  async function handleGenerate() {
    setIsGenerating(true)
    setResolveError(null)
    onUpdateLocal((s) => ({ ...s, deckStatus: 'generating', deckError: null }))
    try {
      await generateDeck(session.id)
    } catch {
      // Fall through — the refetch below reads the authoritative state the
      // edge function itself recorded, whether this call failed or not.
    }
    try {
      const state = await fetchSessionDeckState(session.id)
      onUpdateLocal((s) => ({ ...s, ...state }))
    } catch (err) {
      onUpdateLocal((s) => ({
        ...s,
        deckStatus: 'error',
        deckError: err instanceof Error ? err.message : 'Failed to generate presentation',
      }))
    } finally {
      setIsGenerating(false)
    }
  }

  const showGenerating = isGenerating || session.deckStatus === 'generating'

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
