import { useEffect, useState } from 'react'
import {
  fetchSessionOptions,
  getSessionOptions,
  saveSessionOptions,
  type SessionOptions,
} from '../sessionOptions'
import './AppMenu.css'
import './PresentationOptionsSheet.css'

interface SessionOptionsSheetProps {
  userId: string
  onBack: () => void
}

type BooleanKey = {
  [K in keyof SessionOptions]: SessionOptions[K] extends boolean ? K : never
}[keyof SessionOptions]

// The buttons beside the camera button while a talk is recording.
const BUTTONS: { key: BooleanKey; label: string; hint: string }[] = [
  { key: 'rememberThis', label: 'Remember this', hint: 'A star to mark a key moment' },
  { key: 'chuisAudio', label: 'Chui’s audio', hint: 'Keeps a minute of the speaker’s voice' },
]

// Saved to the account as they change, so they follow you to any phone.
export function SessionOptionsSheet({ userId, onBack }: SessionOptionsSheetProps) {
  const [options, setOptions] = useState<SessionOptions>(getSessionOptions)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSessionOptions()
      .then(setOptions)
      .catch(() => {})
  }, [])

  function set(key: BooleanKey, value: boolean) {
    const next = { ...options, [key]: value }
    setOptions(next)
    saveSessionOptions(userId, next)
      .then(() => setError(null))
      .catch(() => setError('Couldn’t save to your account. It’s set on this phone.'))
  }

  return (
    <div className="app-menu" role="dialog" aria-modal="true" aria-label="Session options">
      <header className="app-menu__header">
        <button className="app-menu__back" onClick={onBack} aria-label="Back to menu">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="app-menu__title">Session options</h1>
      </header>

      <div className="app-menu__body">
        {error && <p className="pres-options__error" role="alert">{error}</p>}

        <h2 className="app-menu__section-title">In the session bar</h2>
        <p className="pres-options__section-hint">
          Buttons beside the camera while a talk is recording. Turning one off hides it; nothing you captured is removed.
        </p>
        <ul className="app-menu__list">
          {BUTTONS.map(({ key, label, hint }) => (
            <li key={key}>
              <label className="app-menu__row">
                <span className="app-menu__label">
                  {label}
                  <span className="app-menu__hint">{hint}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="pres-options__switch"
                  checked={options[key]}
                  onChange={(e) => set(key, e.target.checked)}
                />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
