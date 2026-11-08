import { useState } from 'react'
import './DeleteAccountSheet.css'

interface DeleteAccountSheetProps {
  /** The account's email, or null for a no-email account. */
  email: string | null
  sessionCount: number
  onBack: () => void
  /** Deletes everything; rejects with a message to show if it fails. */
  onDelete: () => Promise<void>
}

// The confirmation screen for deleting the account: says exactly what goes,
// then one clearly labelled button does it.
export function DeleteAccountSheet({ email, sessionCount, onBack, onDelete }: DeleteAccountSheetProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setDeleting(false)
    }
  }

  const sessions =
    sessionCount === 0 ? 'Your sessions' : sessionCount === 1 ? 'Your 1 session' : `All ${sessionCount} of your sessions`

  return (
    <div className="app-menu" role="dialog" aria-modal="true" aria-label="Delete account">
      <header className="app-menu__header">
        <button className="app-menu__back" onClick={onBack} disabled={deleting} aria-label="Back to menu">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="app-menu__title">Delete account</h1>
      </header>

      <div className="app-menu__body delete-account">
        <p className="delete-account__lead">
          This permanently deletes your account{email ? ` (${email})` : ''} and everything in it:
        </p>
        <ul className="delete-account__list">
          <li>{sessions}, with their notes, transcripts and Remember this clips</li>
          <li>All your photos and videos</li>
          <li>All your presentations</li>
          <li>Your presentation options</li>
        </ul>
        <p className="delete-account__warning">This can’t be undone.</p>
        {sessionCount > 0 && (
          <p className="delete-account__hint">
            To keep a presentation, share or save it before you delete your account.
          </p>
        )}

        {error && (
          <p className="delete-account__error" role="alert">
            Couldn’t delete your account: {error} Check your connection and try again.
          </p>
        )}

        <button className="delete-account__button" onClick={confirm} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete account permanently'}
        </button>
        <button className="delete-account__cancel" onClick={onBack} disabled={deleting}>
          Cancel
        </button>
      </div>
    </div>
  )
}
