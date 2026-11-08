import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '../types'
import { isSessionActive, lastActivityAt } from '../sessionActivity'
import { hasContentSinceDeck } from '../deck'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { SessionCard } from '../components/SessionCard'
import { SearchResults } from '../components/SearchResults'
import { searchSessions } from '../search'
import { SortMenu, SORT_OPTIONS, type SessionSort } from '../components/SortMenu'
import {
  SwipeActions,
  type SwipeAction,
  DeleteIcon,
  GenerateIcon,
  ViewIcon,
  ShareIcon,
} from '../components/SwipeActions'
import './HomeScreen.css'

const SORT_KEY = 'cc-session-sort'

function savedSort(): SessionSort {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    if (SORT_OPTIONS.some((o) => o.value === saved)) return saved as SessionSort
  } catch {
    // Storage unavailable -- fall back to the default.
  }
  return 'started'
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function sortSessions(sessions: Session[], sort: SessionSort): Session[] {
  const newest = (a: Session, b: Session) => b.startedAt - a.startedAt
  const sorted = [...sessions]
  // Ready presentations first, then ones being built, then the rest.
  const deckRank = (s: Session) => (s.deckStatus === 'ready' ? 0 : s.deckStatus === 'generating' ? 1 : 2)
  if (sort === 'activity') sorted.sort((a, b) => lastActivityAt(b) - lastActivityAt(a) || newest(a, b))
  else if (sort === 'name') sorted.sort((a, b) => byName.compare(a.title.trim(), b.title.trim()) || newest(a, b))
  else if (sort === 'oldest') sorted.sort((a, b) => a.startedAt - b.startedAt)
  else if (sort === 'deck') sorted.sort((a, b) => deckRank(a) - deckRank(b) || newest(a, b))
  else sorted.sort(newest)
  return sorted
}

interface HomeScreenProps {
  sessions: Session[]
  /** `itemId`: open scrolled to that item (from a search hit). */
  onOpenSession: (id: string, itemId?: string) => void
  onNewSession: () => void
  onOpenMenu: () => void
  onGenerateDeck: (id: string) => void
  onViewDeck: (id: string) => void
  onShareDeck: (id: string) => void
  onDeleteSession: (id: string) => void
  /** Reloads the list -- run by pulling it down past the top. */
  onRefresh: () => Promise<void>
  error: string | null
  onDismissError: () => void
  /** Ask Claude the search text as a question, across all sessions. */
  onAskAll: (question: string) => void
}

export function HomeScreen({
  sessions,
  onOpenSession,
  onNewSession,
  onOpenMenu,
  onGenerateDeck,
  onViewDeck,
  onShareDeck,
  onDeleteSession,
  onRefresh,
  error,
  onDismissError,
  onAskAll,
}: HomeScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SessionSort>(savedSort)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchSessions(sessions, query), [sessions, query])
  const searching = query.trim().length > 0
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { progress, refreshing } = usePullToRefresh(scrollRef, listRef, onRefresh)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Lift the bottom bar (and shorten the list) by the keyboard's height.
  const keyboardHeight = useKeyboardHeight()

  function openSearch() {
    setSearchOpen(true)
    // Raise the keyboard right away so the bar grows while the keyboard
    // slides up -- the same feel as closing.
    searchInputRef.current?.focus()
  }

  function closeSearch() {
    setQuery('')
    setSearchOpen(false)
    searchInputRef.current?.blur()
  }

  function changeSort(next: SessionSort) {
    setSort(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // Not remembered this time; the sort still applies.
    }
  }

  // Live sessions stay on top, newest first, whatever the sort -- they're what
  // you're in the middle of. The chosen sort orders everything else.
  const live = sortSessions(sessions, 'started').filter((s) => isSessionActive(s, now))
  const past = sortSessions(sessions, sort).filter((s) => !isSessionActive(s, now))

  function deckActions(session: Session): SwipeAction[] {
    switch (session.deckStatus) {
      case 'ready':
        return [
          { icon: <ViewIcon />, label: 'View presentation', onClick: () => onViewDeck(session.id) },
          { icon: <ShareIcon />, label: 'Share presentation', onClick: () => onShareDeck(session.id) },
          // Regenerating only makes sense once there's something new to add.
          ...(hasContentSinceDeck(session)
            ? [{ icon: <GenerateIcon />, label: 'Regenerate presentation', onClick: () => onGenerateDeck(session.id) }]
            : []),
        ]
      case 'generating':
        return []
      default:
        return [{ icon: <GenerateIcon />, label: 'Generate presentation', onClick: () => onGenerateDeck(session.id) }]
    }
  }

  function renderCard(session: Session) {
    return (
      <SwipeActions
        key={session.id}
        id={session.id}
        revealedId={revealedId}
        onReveal={setRevealedId}
        // Close the row on any action so the card slides back into view and
        // its status line (e.g. "Building presentation…") is visible.
        actions={[
          ...deckActions(session),
          { icon: <DeleteIcon />, label: 'Delete', onClick: () => onDeleteSession(session.id) },
        ].map((action) => ({
          ...action,
          onClick: () => {
            setRevealedId(null)
            action.onClick()
          },
        }))}
      >
        <SessionCard
          session={session}
          now={now}
          onTap={() => onOpenSession(session.id)}
          onViewDeck={() => onViewDeck(session.id)}
          onGenerateDeck={() => onGenerateDeck(session.id)}
        />
      </SwipeActions>
    )
  }

  return (
    <div
      className={`home-screen${keyboardHeight ? ' home-screen--keyboard' : ''}`}
      style={{ height: `calc(100dvh - ${keyboardHeight}px)` }}
    >
      <header className="home-header">
        <div className="home-header__row">
          <h1 className="home-header__title">Conference Capture</h1>
          <button className="home-header__menu" onClick={onOpenMenu} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {error && (
        <div className="home-error" role="alert">
          {error} <button onClick={onDismissError}>Dismiss</button>
        </div>
      )}

      <div className="home-scroll" ref={scrollRef}>
        <div className="home-list" ref={listRef}>
          {/* Sits just above the list and is revealed as it's pulled down. */}
          <div
            className={`home-refresh${progress >= 1 ? ' home-refresh--armed' : ''}${refreshing ? ' home-refresh--spinning' : ''}`}
            style={{ opacity: refreshing ? 1 : Math.min(progress, 1) }}
            role={refreshing ? 'status' : undefined}
            aria-label={refreshing ? 'Refreshing' : undefined}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              aria-hidden="true"
              style={refreshing ? undefined : { transform: `rotate(${Math.min(progress, 1.2) * 300}deg)` }}
            >
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path d="M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {searching ? (
            <SearchResults results={results} query={query.trim()} onOpen={onOpenSession} onAsk={() => onAskAll(query.trim())} />
          ) : (
            <>
              {live.map(renderCard)}

              {sessions.length === 0 && (
                <p className="home-empty">
                  No sessions yet. Tap "New Session" to start capturing your first talk.
                </p>
              )}

              {past.map(renderCard)}
            </>
          )}
        </div>
      </div>

      <div className={`home-footer${searchOpen ? ' home-footer--searching' : ''}`}>
        {/* Shrinks away while searching so the search field can take the whole row. */}
        <button
          className="new-session-btn"
          onClick={onNewSession}
          aria-label="Start new session"
          aria-hidden={searchOpen}
          tabIndex={searchOpen ? -1 : 0}
        >
          <span className="new-session-btn__plus" aria-hidden="true">+</span>
          <span className="new-session-btn__label" aria-hidden="true">New Session</span>
        </button>

        {sessions.length > 0 && (
          <>
            <div className="home-searchbox">
              {!searchOpen && <button className="home-searchbox__open" onClick={openSearch} aria-label="Search sessions" />}
              <svg className="home-searchbox__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                className="home-searchbox__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') closeSearch()
                }}
                placeholder="Search sessions"
                aria-label="Search sessions"
                aria-hidden={!searchOpen}
                tabIndex={searchOpen ? 0 : -1}
                enterKeyHint="search"
                autoCorrect="off"
              />
              {searchOpen && (
                <button className="home-searchbox__close" onClick={closeSearch} aria-label="Close search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Tucks away to the right while searching, then grows back as the field shrinks. */}
            <div className="home-footer__sort" aria-hidden={searchOpen}>
              {sessions.length > 1 && <SortMenu value={sort} onChange={changeSort} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
