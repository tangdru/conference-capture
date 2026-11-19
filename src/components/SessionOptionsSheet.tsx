import { useEffect, useRef, useState } from 'react'
import {
  CLIP_AFTER_MAX_S,
  CLIP_BEFORE_MAX_S,
  LIVE_WINDOW_MAX_S,
  LIVE_WINDOW_MIN_S,
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

type NumberKey = 'clipBeforeS' | 'clipAfterS' | 'liveWindowS'

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

  function set<K extends keyof SessionOptions>(key: K, value: SessionOptions[K]) {
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

  // Clips are cut from the transcript's microphone, so they need it on.
  const clipsOpen = options.chuisAudio && options.liveTranscript

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

        <h2 className="app-menu__section-title">During a talk</h2>
        <ul className="app-menu__list">
          <li>
            <label className="app-menu__row">
              <span className="app-menu__label">
                Live transcript
                <span className="app-menu__hint">
                  Writes down what the speaker says, on the phone. Off: the microphone stays off, so Chui’s audio clips
                  aren’t recorded either.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="pres-options__switch"
                checked={options.liveTranscript}
                aria-expanded={options.liveTranscript}
                aria-controls="session-options-transcript"
                onChange={(e) => set('liveTranscript', e.target.checked)}
              />
            </label>
            <div
              id="session-options-transcript"
              className={`session-options__more${options.liveTranscript ? ' is-open' : ''}`}
              aria-hidden={!options.liveTranscript}
              inert={!options.liveTranscript}
            >
              <div className="session-options__more-inner">
                <ul className="app-menu__list">
                  <li>
                    <label className="app-menu__row">
                      <span className="app-menu__label">
                        Show transcript while live
                        <span className="app-menu__hint">
                          Off: the timeline shows only your photos, notes, stars and clips while recording, with a
                          “Transcribing” light so you know it’s still listening. The transcript appears when you pause.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="pres-options__switch"
                        checked={options.showTranscriptLive}
                        onChange={(e) => set('showTranscriptLive', e.target.checked)}
                      />
                    </label>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ul>
        <label className="session-options__slider">
          <span className="session-options__slider-top">
            <span>
              Stay live after a pause
              <span className="app-menu__hint">How long a paused session stays at the top of your sessions</span>
            </span>
            <span className="session-options__value">{seconds(options.liveWindowS)}</span>
          </span>
          <input
            type="range"
            min={LIVE_WINDOW_MIN_S}
            max={LIVE_WINDOW_MAX_S}
            step={30}
            value={options.liveWindowS}
            onChange={(e) => slide('liveWindowS', Number(e.target.value))}
            style={
              {
                '--fill': `${((options.liveWindowS - LIVE_WINDOW_MIN_S) / (LIVE_WINDOW_MAX_S - LIVE_WINDOW_MIN_S)) * 100}%`,
              } as React.CSSProperties
            }
          />
          <span className="session-options__range" aria-hidden="true">
            <span>{seconds(LIVE_WINDOW_MIN_S)}</span>
            <span>{seconds(LIVE_WINDOW_MAX_S)}</span>
          </span>
        </label>

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
                  <span className="app-menu__hint">
                    {key === 'chuisAudio' && !options.liveTranscript ? 'Needs Live transcript: clips come from its microphone' : hint}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="pres-options__switch"
                  checked={options[key]}
                  disabled={key === 'chuisAudio' && !options.liveTranscript}
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

        <h2 className="app-menu__section-title">Video clips</h2>
        <p className="pres-options__section-hint">Hold the shutter in the camera to record one.</p>
        <ul className="app-menu__list">
          <Choice
            label="Longest clip"
            hint="Recording stops by itself at this length. Let go of the shutter to stop sooner."
            value={String(options.videoMaxS)}
            choices={[['15', '15 sec'], ['30', '30 sec'], ['60', '1 min']]}
            onChange={(v) => set('videoMaxS', Number(v) as SessionOptions['videoMaxS'])}
          />
          <Choice
            label="Upload clips"
            hint={
              options.videoUploads === 'off'
                ? 'Clips stay on this phone: they don’t appear on your other devices or in presentations'
                : options.videoUploads === 'wifi'
                  ? 'Clips wait on the phone until you’re on Wi-Fi (about 13 MB per 30 sec)'
                  : 'Clips upload straight away, on mobile data too (about 13 MB per 30 sec)'
            }
            value={options.videoUploads}
            choices={[['wifi', 'Wi-Fi only'], ['always', 'Always'], ['off', 'Off']]}
            onChange={(v) => set('videoUploads', v)}
          />
          <li>
            <label className="app-menu__row">
              <span className="app-menu__label">
                Show Claude video frames
                <span className="app-menu__hint">
                  Claude can’t watch video, so it’s shown a few stills from each clip when building a presentation. They
                  take some of the 20 pictures Claude can look at, after your slide photos. Off: clips are placed by
                  when they were recorded and what was said.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="pres-options__switch"
                checked={options.videoFramesForClaude}
                onChange={(e) => set('videoFramesForClaude', e.target.checked)}
              />
            </label>
          </li>
        </ul>

        <h2 className="app-menu__section-title">Photos</h2>
        <ul className="app-menu__list">
          <Choice
            label="Photo size"
            hint={
              options.photoQuality === 'smaller'
                ? 'About a third of the storage; small text on a busy slide may be harder to read'
                : 'Full detail, so small text on slides stays readable'
            }
            value={options.photoQuality}
            choices={[['standard', 'Standard'], ['smaller', 'Smaller']]}
            onChange={(v) => set('photoQuality', v)}
          />
        </ul>
      </div>
    </div>
  )
}

function Choice<T extends string>({
  label,
  hint,
  value,
  choices,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  choices: [T, string][]
  onChange: (value: T) => void
}) {
  return (
    <li>
      <div className="app-menu__row pres-options__stack">
        <span className="app-menu__label">
          {label}
          {hint && <span className="app-menu__hint">{hint}</span>}
        </span>
        <div className="pres-options__segmented" role="radiogroup" aria-label={label}>
          {choices.map(([v, text]) => (
            <button
              key={v}
              role="radio"
              aria-checked={value === v}
              className={`pres-options__segment${value === v ? ' is-selected' : ''}`}
              onClick={() => onChange(v)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
