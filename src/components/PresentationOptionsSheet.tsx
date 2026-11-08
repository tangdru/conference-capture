import { useEffect, useRef, useState } from 'react'
import {
  ACCENT_SWATCHES,
  DEFAULT_PRESENTATION_OPTIONS,
  LANGUAGES,
  fetchPresentationOptions,
  savePresentationOptions,
  type PresentationOptions,
} from '../presentationOptions'
import './AppMenu.css'
import './PresentationOptionsSheet.css'

interface PresentationOptionsSheetProps {
  userId: string
  onBack: () => void
}

type BooleanKey = {
  [K in keyof PresentationOptions]: PresentationOptions[K] extends boolean ? K : never
}[keyof PresentationOptions]

// What the page includes; the same kinds, in the same order, as SAVED.
const INCLUDED: { key: BooleanKey; label: string; hint: string }[] = [
  { key: 'tldr', label: 'TL;DR', hint: 'The key takeaways at the top' },
  { key: 'speakerBio', label: 'Speaker bio', hint: 'Who gave the talk' },
  { key: 'quotes', label: 'Speaker quotes', hint: 'Their best lines, set apart' },
  { key: 'actionItems', label: 'Action items', hint: 'What the speaker said they’d do' },
  { key: 'references', label: 'References', hint: 'Links and follow-ups at the end' },
]

const LAYOUT: { key: BooleanKey; label: string; hint: string }[] = [
  { key: 'chapterBar', label: 'Chapter bar', hint: 'Sticks to the top as you scroll' },
  { key: 'chapterTimes', label: 'Chapter times', hint: 'When each part started, like 12:40' },
]

// Entries Sparkle adds to the session itself.
const SAVED: { key: BooleanKey; label: string; hint: string }[] = [
  { key: 'saveSummary', label: 'Summary', hint: 'What the talk was about, at the top' },
  { key: 'saveSpeakerBio', label: 'Speaker bio', hint: 'Who gave the talk, when they say' },
  { key: 'saveActionItems', label: 'Action items', hint: 'What the speaker said they’d do' },
  { key: 'saveAcronyms', label: 'Acronyms', hint: 'Terms the speaker didn’t explain' },
  { key: 'saveReferences', label: 'References', hint: 'Papers, books and tools they named' },
]

// Saved to the account as they change, so they follow you to any phone.
export function PresentationOptionsSheet({ userId, onBack }: PresentationOptionsSheetProps) {
  const [options, setOptions] = useState<PresentationOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<PresentationOptions | null>(null)

  useEffect(() => {
    fetchPresentationOptions()
      .then(setOptions)
      .catch(() => {
        setOptions(DEFAULT_PRESENTATION_OPTIONS)
        setError('Couldn’t load your options. Changes may not save.')
      })
  }, [])

  function save(next: PresentationOptions) {
    pending.current = next
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flush, 400)
  }

  function flush() {
    const next = pending.current
    if (!next) return
    pending.current = null
    savePresentationOptions(userId, next)
      .then(() => setError(null))
      .catch(() => setError('Couldn’t save. Check your connection and try again.'))
  }

  // Save anything still waiting when the screen closes.
  useEffect(() => () => {
    window.clearTimeout(saveTimer.current)
    flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof PresentationOptions>(key: K, value: PresentationOptions[K]) {
    if (!options) return
    const next = { ...options, [key]: value }
    setOptions(next)
    save(next)
  }

  return (
    <div className="app-menu" role="dialog" aria-modal="true" aria-label="Presentation options">
      <header className="app-menu__header">
        <button className="app-menu__back" onClick={onBack} aria-label="Back to menu">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="app-menu__title">Presentation options</h1>
      </header>

      <div className="app-menu__body">
        {error && <p className="pres-options__error" role="alert">{error}</p>}
        <p className="pres-options__intro">
          These apply to presentations you build from now on. Rebuild an existing one to apply them there.
        </p>

        {options && (
          <>
            <h2 className="app-menu__section-title">In the presentation</h2>
            <ul className="app-menu__list">
              <ToggleRows rows={INCLUDED} options={options} onChange={set} />
              <Choice
                label="Photos"
                hint={options.photos === 'starred' ? 'Only photos you starred' : options.photos === 'none' ? 'Text only' : 'Every photo you took'}
                value={options.photos}
                choices={[['all', 'All'], ['starred', 'Starred'], ['none', 'None']]}
                onChange={(v) => set('photos', v)}
              />
            </ul>

            <h2 className="app-menu__section-title">Layout and style</h2>
            <ul className="app-menu__list">
              <ToggleRows rows={LAYOUT} options={options} onChange={set} />
              <Choice
                label="Motion"
                hint={options.motion === 'scrolly' ? 'Content animates in as you scroll' : 'A simple article; only charts move'}
                value={options.motion}
                choices={[['still', 'Still'], ['scrolly', 'Scrollytelling']]}
                onChange={(v) => set('motion', v)}
              />
              <Choice
                label="Charts"
                hint={options.charts === 'interactive' ? 'Rebuilt from the slides so you can explore them' : 'Just the photo of the slide'}
                value={options.charts}
                choices={[['interactive', 'Interactive'], ['photo', 'Photo only']]}
                onChange={(v) => set('charts', v)}
              />
              <Choice
                label="Theme"
                value={options.theme}
                choices={[['auto', 'Match talk'], ['light', 'Light'], ['dark', 'Dark']]}
                onChange={(v) => set('theme', v)}
              />
              <li>
                <div className="app-menu__row pres-options__stack">
                  <span className="app-menu__label">Accent color</span>
                  <div className="pres-options__swatches" role="radiogroup" aria-label="Accent color">
                    <button
                      role="radio"
                      aria-checked={options.accent === 'auto'}
                      className={`pres-options__swatch pres-options__swatch--auto${options.accent === 'auto' ? ' is-selected' : ''}`}
                      onClick={() => set('accent', 'auto')}
                    >
                      Auto
                    </button>
                    {ACCENT_SWATCHES.map((color) => (
                      <button
                        key={color}
                        role="radio"
                        aria-checked={options.accent === color}
                        aria-label={color}
                        className={`pres-options__swatch${options.accent === color ? ' is-selected' : ''}`}
                        style={{ background: color }}
                        onClick={() => set('accent', color)}
                      />
                    ))}
                  </div>
                </div>
              </li>
            </ul>

            <h2 className="app-menu__section-title">Writing</h2>
            <ul className="app-menu__list">
              <Choice
                label="Length"
                hint={options.length === 'short' ? 'One paragraph per chapter' : 'Every chapter in full'}
                value={options.length}
                choices={[['full', 'Full'], ['short', 'Short']]}
                onChange={(v) => set('length', v)}
              />
              <Choice
                label="Voice"
                hint={
                  options.voice === 'first_person'
                    ? 'Written as your own notes'
                    : options.voice === 'brief'
                      ? 'Short and to the point, for a busy reader'
                      : 'A clear, neutral write-up'
                }
                value={options.voice}
                choices={[['neutral', 'Neutral'], ['first_person', 'My notes'], ['brief', 'Brief']]}
                onChange={(v) => set('voice', v)}
              />
              <li>
                <label className="app-menu__row">
                  <span className="app-menu__label">Language</span>
                  <select
                    className="pres-options__select"
                    value={options.language}
                    onChange={(e) => set('language', e.target.value)}
                  >
                    <option value="auto">Same as talk</option>
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </li>
            </ul>

            <h2 className="app-menu__section-title">Save to the session</h2>
            <p className="pres-options__section-hint">
              Building a presentation also adds these to the session, so you can find them and Ask about them.
            </p>
            <ul className="app-menu__list">
              <ToggleRows rows={SAVED} options={options} onChange={set} />
            </ul>

            <button
              className="pres-options__reset"
              onClick={() => {
                setOptions(DEFAULT_PRESENTATION_OPTIONS)
                save(DEFAULT_PRESENTATION_OPTIONS)
              }}
            >
              Reset to defaults
            </button>
          </>
        )}
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

function ToggleRows({
  rows,
  options,
  onChange,
}: {
  rows: { key: BooleanKey; label: string; hint: string }[]
  options: PresentationOptions
  onChange: (key: BooleanKey, value: boolean) => void
}) {
  return (
    <>
      {rows.map(({ key, label, hint }) => (
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
              onChange={(e) => onChange(key, e.target.checked)}
            />
          </label>
        </li>
      ))}
    </>
  )
}
