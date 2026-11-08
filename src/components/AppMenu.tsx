import { useState } from 'react'
import './AppMenu.css'

interface AppMenuProps {
  /** The account's email, or null for a no-email account. */
  email: string | null
  /** Skip the opening animation (coming back from a screen the menu opened). */
  instant?: boolean
  onClose: () => void
  onPresentationOptions: () => void
  onAddEmail: () => void
  onSignOut: () => void
}

const FEEDBACK_ADDRESS = 'tangdru@gmail.com'

// The app's one menu. Items not built yet show "Coming soon" so the list is
// already in its final order.
export function AppMenu({ email, instant = false, onClose, onPresentationOptions, onAddEmail, onSignOut }: AppMenuProps) {
  const [closing, setClosing] = useState(false)

  // Play the opening in reverse, then close.
  function close() {
    if (closing) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return onClose()
    setClosing(true)
    window.setTimeout(onClose, 260)
  }

  const build = `Version 2 (build ${__APP_BUILD__})`
  const feedbackHref =
    `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(`Conference Capture feedback – ${build}`)}`

  return (
    <div
      className={`app-menu app-menu--home${instant ? ' app-menu--instant' : ''}${closing ? ' app-menu--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      {/* The home screen's own header, so only the icon moves: it turns a
          quarter clockwise while the menu is open, and closes it. */}
      <header className="home-header">
        <div className="home-header__row">
          <p className="home-header__title" aria-hidden="true">Conference Capture</p>
          <button className="home-header__menu app-menu__toggle" onClick={close} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="app-menu__body app-menu__slide">
        <ul className="app-menu__list">
          <li>
            <button className="app-menu__row" onClick={onPresentationOptions}>
              <span className="app-menu__label">Presentation options</span>
              <Chevron />
            </button>
          </li>
          <li>
            <div className="app-menu__row app-menu__row--soon">
              <span className="app-menu__label">Tutorial</span>
              <span className="app-menu__soon">Coming soon</span>
            </div>
          </li>
          <li>
            <div className="app-menu__row app-menu__row--soon">
              <span className="app-menu__label">Claude API key</span>
              <span className="app-menu__soon">Coming soon</span>
            </div>
          </li>
          <li>
            {email ? (
              <div className="app-menu__row app-menu__row--static">
                <span className="app-menu__label">Account</span>
                <span className="app-menu__value">{email}</span>
              </div>
            ) : (
              <button className="app-menu__row" onClick={onAddEmail}>
                <span className="app-menu__label">Account</span>
                <span className="app-menu__value app-menu__value--accent">Add email</span>
              </button>
            )}
          </li>
          <li>
            <a className="app-menu__row" href={feedbackHref}>
              <span className="app-menu__label">Send feedback</span>
              <Chevron />
            </a>
          </li>
          <li>
            <div className="app-menu__row app-menu__row--soon">
              <span className="app-menu__label">Privacy policy</span>
              <span className="app-menu__soon">Coming soon</span>
            </div>
          </li>
          <li>
            <div className="app-menu__row app-menu__row--soon">
              <span className="app-menu__label">Delete account</span>
              <span className="app-menu__soon">Coming soon</span>
            </div>
          </li>
        </ul>

        {/* A no-email account can't be signed back in to, so it never gets Sign out. */}
        {email && (
          <ul className="app-menu__list app-menu__list--apart">
            <li>
              <button className="app-menu__row app-menu__row--danger" onClick={onSignOut}>
                <span className="app-menu__label">Sign out</span>
              </button>
            </li>
          </ul>
        )}

        <p className="app-menu__build">{build}</p>
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg className="app-menu__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
