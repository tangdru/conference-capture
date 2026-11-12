import { useEffect, useRef, useState } from 'react'
import {
  CLIP_AFTER_MAX_S,
  CLIP_BEFORE_MAX_S,
  fetchSessionOptions,
  getSessionOptions,
  saveSessionOptions,
  type SessionOptions,
} from '../sessionOptions'
import './AppMenu.css'
import './PresentationOptionsSheet.css'
import './SessionOptionsSheet.css'

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
  { key: 'chuisAudio', label: 'Chui’s audio', hint: 'Keeps a clip of the speaker’s voice' },
]

// Chui's audio settings, shown under it while it's on.
const CLIP_SWITCHES: { key: BooleanKey; label: string; hint: string }[] = [
  { key: 'snapToSentences', label: 'Snap to sentences', hint: 'Starts and ends each clip at a pause, not mid-word' },
  {
    key: 'voiceBoost',
    label: 'Voice boost',
    hint: 'Turns down room noise in the saved clip. Done after recording, so the live transcript of a big room isn’t affected.',
  },
  { key: 'wifiOnlyUploads', label: 'Upload on Wi-Fi only', hint: 'Clips wait on the phone until you’re on Wi-Fi' },
  {
    key: 'keepTrimmedOnly',
    label: 'Keep only the trimmed part',
    hint: 'When you leave a session, audio outside a clip’s trim is deleted from the phone',
  },
  {
    key: 'clipsInShared',
    label: 'Clips in shared presentations',
    hint: 'Let people you share with hear the speaker. Off: shared links and downloads leave clips out.',
  },
]

type NumberKey = 'clipBeforeS' | 'clipAfterS'

const CLIP_SLIDERS: { key: NumberKey; label: string; max: number }[] = [
  { key: 'clipBeforeS', label: 'Before the tap', max: CLIP_BEFORE_MAX_S },
  { key: 'clipAfterS', label: 'After the tap', max: CLIP_AFTER_MAX_S },
]

function seconds(n: number): string {
  if (n < 60) return `${n} sec`
  const m = Math.floor(n / 60)
  const s = n % 60
  return s ? `${m} min ${s} sec` : `${m} min`
}

// Saved to the account as they change, so they follow you to any phone.
export function SessionOptionsSheet({ userId, onBack }: SessionOptionsSheetProps) {
  const [options, setOptions] = useState<SessionOptions>(getSessionOptions)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSessionOptions()
      .then(setOptions)
      .catch(() => {})
  }, [])

  function save(next: SessionOptions) {
    saveSessionOptions(userId, next)
      .then(() => setError(null))
      .catch(() => setError('Couldn’t save to your account. It’s set on this phone.'))
  }

  function set(key: BooleanKey, value: boolean) {
    const next = { ...options, [key]: value }
    setOptions(next)
    save(next)
  }

  // Sliders save once they settle, not on every step of a drag.
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<SessionOptions | null>(null)
  function slide(key: NumberKey, value: number) {
    const next = { ...options, [key]: value }
    setOptions(next)
    pending.current = next
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      pending.current = null
      save(next)
    }, 500)
  }
  // Leaving mid-drag still saves.
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current)
      if (pending.current) void saveSessionOptions(userId, pending.current).catch(() => {})
    },
    [userId],
  )

  const clipsOpen = options.chuisAudio

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
                  aria-expanded={key === 'chuisAudio' ? clipsOpen : undefined}
                  aria-controls={key === 'chuisAudio' ? 'session-options-clips' : undefined}
                  onChange={(e) => set(key, e.target.checked)}
                />
              </label>
              {key === 'chuisAudio' && (
                <div
                  id="session-options-clips"
                  className={`session-options__more${clipsOpen ? ' is-open' : ''}`}
                  aria-hidden={!clipsOpen}
                  inert={!clipsOpen}
                >
                  <div className="session-options__more-inner">
                    <p className="session-options__group">Clip length</p>
                    {CLIP_SLIDERS.map(({ key: k, label: l, max }) => (
                      <label key={k} className="session-options__slider">
                        <span className="session-options__slider-top">
                          <span>{l}</span>
                          <span className="session-options__value">{seconds(options[k])}</span>
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={max}
                          step={1}
                          value={options[k]}
                          onChange={(e) => slide(k, Number(e.target.value))}
                          style={{ '--fill': `${(options[k] / max) * 100}%` } as React.CSSProperties}
                        />
                        <span className="session-options__range" aria-hidden="true">
                          <span>0</span>
                          <span>{seconds(max)}</span>
                        </span>
                      </label>
                    ))}
                    <ul className="app-menu__list">
                      {CLIP_SWITCHES.map(({ key: k, label: l, hint: h }) => (
                        <li key={k}>
                          <label className="app-menu__row">
                            <span className="app-menu__label">
                              {l}
                              <span className="app-menu__hint">{h}</span>
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              className="pres-options__switch"
                              checked={options[k]}
                              onChange={(e) => set(k, e.target.checked)}
                            />
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
