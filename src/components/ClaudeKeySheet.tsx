import { useEffect, useState } from 'react'
import { fetchClaudeKey, removeClaudeKey, saveClaudeKey, type ClaudeKeyInfo } from '../db'
import { errorMessage } from '../networkError'
import './AppMenu.css'
import './ClaudeKeySheet.css'

interface ClaudeKeySheetProps {
  onBack: () => void
}

const CONSOLE_URL = 'https://console.anthropic.com/settings/keys'

// What the claude-key function says when it turns a key down; anything else
// goes through errorMessage like every other failure.
const KEY_MESSAGES = new Set([
  'That doesn’t look like a Claude API key',
  'Claude rejected that key',
  'Couldn’t check the key with Claude, try again',
])

// Menu > Claude API key. Sparkle and Ask run on the account's own key: it's
// checked with Claude, then kept encrypted on the server. The app only ever
// sees its last 4 characters.
export function ClaudeKeySheet({ onBack }: ClaudeKeySheetProps) {
  const [saved, setSaved] = useState<ClaudeKeyInfo | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'saving' | 'removing' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchClaudeKey()
      .then(setSaved)
      .catch((err) => {
        setSaved(null)
        setError(errorMessage(err))
      })
  }, [])

  const showForm = saved === null || editing

  async function save() {
    const key = draft.trim()
    if (!key || busy) return
    setBusy('saving')
    setError(null)
    try {
      setSaved(await saveClaudeKey(key))
      setDraft('')
      setEditing(false)
    } catch (err) {
      const message = (err as { message?: unknown } | null)?.message
      setError(typeof message === 'string' && KEY_MESSAGES.has(message) ? message : errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('removing')
    setError(null)
    try {
      await removeClaudeKey()
      setSaved(null)
      setConfirmRemove(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="app-menu" role="dialog" aria-modal="true" aria-label="Claude API key">
      <header className="app-menu__header">
        <button className="app-menu__back" onClick={onBack} disabled={busy !== null} aria-label="Back to menu">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="app-menu__title">Claude API key</h1>
      </header>

      <div className="app-menu__body claude-key">
        <p className="claude-key__lead">
          Sparkle (presentations) and Ask use Claude. Add your own Claude API key and they run on your Anthropic
          account, billed by Anthropic to you.
        </p>
        <p className="claude-key__note">
          A Claude Pro or Max subscription doesn’t include API use. API keys come from the Claude Console, which
          bills separately: add credit there before using your key.{' '}
          <a className="claude-key__link claude-key__link--inline" href={CONSOLE_URL} target="_blank" rel="noopener">
            Open the Claude Console
          </a>
        </p>

        {saved && (
          <div className="claude-key__saved">
            <span className="claude-key__saved-label">Your key</span>
            <span className="claude-key__saved-value">
              <span aria-label={`ending in ${saved.last4}`}>sk-ant-…{saved.last4}</span>
            </span>
            <span className="claude-key__saved-date">
              Added {new Date(saved.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}

        {showForm && saved !== undefined && (
          <form
            className="claude-key__form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <label className="claude-key__field">
              <span className="claude-key__field-label">{saved ? 'New key' : 'Paste your key'}</span>
              <input
                className="claude-key__input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy !== null}
              />
            </label>
            <button className="claude-key__primary" type="submit" disabled={!draft.trim() || busy !== null}>
              {busy === 'saving' ? 'Checking with Claude…' : 'Save key'}
            </button>
            {editing && (
              <button
                className="claude-key__secondary"
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft('')
                  setError(null)
                }}
                disabled={busy !== null}
              >
                Cancel
              </button>
            )}
          </form>
        )}

        {error && <p className="claude-key__error" role="alert">{error}</p>}

        {saved && !editing && !confirmRemove && (
          <div className="claude-key__actions">
            <button className="claude-key__secondary" onClick={() => setEditing(true)} disabled={busy !== null}>
              Replace key
            </button>
            <button className="claude-key__danger" onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
              Remove key
            </button>
          </div>
        )}

        {confirmRemove && (
          <div className="claude-key__confirm">
            <p>Remove your key? Sparkle and Ask stop working until you add one again.</p>
            <button className="claude-key__danger" onClick={() => void remove()} disabled={busy !== null}>
              {busy === 'removing' ? 'Removing…' : 'Remove key'}
            </button>
            <button className="claude-key__secondary" onClick={() => setConfirmRemove(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        )}

        <div className="claude-key__help">
          <p>
            <strong>Getting a key:</strong> sign in at the Claude Console (your Claude login works), add credit under Billing, then create a key
            under API keys and paste it here.
          </p>
          <a className="claude-key__link" href={CONSOLE_URL} target="_blank" rel="noopener">
            Open the Claude Console
          </a>
          <p>
            Your key is checked with Claude, then stored encrypted on the server and used only for your own Sparkle and
            Ask requests. It never comes back to this phone; remove it here at any time, or revoke it in the Console.
          </p>
        </div>
      </div>
    </div>
  )
}
