import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { createClaudeConnector, fetchClaudeConnector, removeClaudeConnector, type ClaudeConnector } from '../db'
import { errorMessage } from '../networkError'
import './AppMenu.css'
import './ClaudeKeySheet.css'
import './ClaudeConnectorSheet.css'

interface ClaudeConnectorSheetProps {
  onBack: () => void
}

// Menu > Use in Claude. A private link that adds Conference Capture to Claude
// (desktop, claude.ai, the phone app) as a custom connector, so Claude can
// read every session -- transcripts, notes, slides, presentations -- in an
// ordinary chat. The `mcp` function answers it; read only.
export function ClaudeConnectorSheet({ onBack }: ClaudeConnectorSheetProps) {
  const [connector, setConnector] = useState<ClaudeConnector | null | undefined>(undefined)
  const [busy, setBusy] = useState<'making' | 'removing' | null>(null)
  const [confirm, setConfirm] = useState<'replace' | 'remove' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchClaudeConnector()
      .then(setConnector)
      .catch((err) => {
        setConnector(null)
        setError(errorMessage(err))
      })
  }, [])

  async function make() {
    setBusy('making')
    setError(null)
    try {
      setConnector(await createClaudeConnector())
      setConfirm(null)
      setCopied(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('removing')
    setError(null)
    try {
      await removeClaudeConnector()
      setConnector(null)
      setConfirm(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    if (!connector) return
    try {
      await navigator.clipboard.writeText(connector.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Couldn’t copy the link; use Share instead')
    }
  }

  async function share() {
    if (!connector) return
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: 'Conference Capture for Claude', text: connector.url })
      else if (navigator.share) await navigator.share({ title: 'Conference Capture for Claude', text: connector.url })
      else await copy()
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  return (
    <div className="app-menu" role="dialog" aria-modal="true" aria-label="Use in Claude">
      <header className="app-menu__header">
        <button className="app-menu__back" onClick={onBack} disabled={busy !== null} aria-label="Back to menu">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="app-menu__title">Use in Claude</h1>
      </header>

      <div className="app-menu__body claude-key">
        <p className="claude-key__lead">
          Ask about your sessions in Claude itself (on your computer, at claude.ai or in the Claude app). Claude can
          search every talk, read the transcripts and your notes, look at your slide photos and read your
          presentations. It can also make a presentation the way Sparkle does and save it to the session here.
        </p>

        {connector === undefined && <p className="claude-connector__muted">Loading…</p>}

        {connector === null && (
          <button className="claude-key__primary" onClick={() => void make()} disabled={busy !== null}>
            {busy === 'making' ? 'Making your link…' : 'Make my link'}
          </button>
        )}

        {connector && (
          <>
            <div className="claude-connector__link">
              <span className="claude-connector__label">Your private link</span>
              <span className="claude-connector__url">{connector.url}</span>
              <span className="claude-connector__status">
                {connector.lastUsedAt
                  ? `Connected · last used ${formatWhen(connector.lastUsedAt)}`
                  : 'Not added to Claude yet'}
              </span>
            </div>
            <div className="claude-connector__buttons">
              <button className="claude-key__primary" onClick={() => void copy()} disabled={busy !== null}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button className="claude-key__secondary" onClick={() => void share()} disabled={busy !== null}>
                Share…
              </button>
            </div>

            <ol className="claude-connector__steps">
              <li>
                In Claude, open <strong>Settings › Connectors</strong> and choose <strong>Add custom connector</strong>.
              </li>
              <li>
                Name it <strong>Conference Capture</strong>, paste the link as its URL, and add it.
              </li>
              <li>
                In a new chat, ask away, e.g. “What did the talks I saw say about accessibility?” If Claude doesn’t
                look in your sessions, turn Conference Capture on in the chat’s tools menu.
              </li>
            </ol>
            <p className="claude-connector__muted">
              Share sends the link to your computer (AirDrop, Messages, Notes). Once it’s added in Claude, it works
              there on every device you’re signed in on.
            </p>
          </>
        )}

        {error && <p className="claude-key__error" role="alert">{error}</p>}

        {connector && !confirm && (
          <div className="claude-key__actions claude-connector__manage">
            <button className="claude-key__secondary" onClick={() => setConfirm('replace')} disabled={busy !== null}>
              Make a new link
            </button>
            <button className="claude-key__danger" onClick={() => setConfirm('remove')} disabled={busy !== null}>
              Turn off
            </button>
          </div>
        )}

        {confirm && (
          <div className="claude-key__confirm claude-connector__manage">
            <p>
              {confirm === 'replace'
                ? 'Make a new link? The current one stops working, so you’d paste the new one into Claude.'
                : 'Turn off the link? Claude can no longer read your sessions until you make a new one.'}
            </p>
            <button
              className={confirm === 'replace' ? 'claude-key__primary' : 'claude-key__danger'}
              onClick={() => void (confirm === 'replace' ? make() : remove())}
              disabled={busy !== null}
            >
              {busy === 'making' ? 'Making…' : busy === 'removing' ? 'Turning off…' : confirm === 'replace' ? 'Make a new link' : 'Turn off'}
            </button>
            <button className="claude-key__secondary" onClick={() => setConfirm(null)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        )}

        <div className="claude-key__help">
          <p>
            <strong>Keep the link private.</strong> Anyone who has it can read your sessions, the same way Claude can.
            The only thing it can change is a session’s presentation. If it gets out, make a new link here.
          </p>
          <p>Custom connectors need a Claude Pro, Max, Team or Enterprise plan.</p>
        </div>
      </div>
    </div>
  )
}

function formatWhen(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
