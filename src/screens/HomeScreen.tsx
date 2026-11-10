import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '../types'
import { isSessionActive, lastActivityAt } from '../sessionActivity'
import { hasContentSinceDeck } from '../deck'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { SessionCard } from '../components/SessionCard'
import { PresentationCard } from '../components/PresentationCard'
import { groupByDay } from '../dayGroups'
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
import { Logo } from '../components/Logo'
import { TOUR_REVEAL_EVENT, type TourRevealTarget } from '../tour'
import './HomeScreen.css'

const SORT_KEY = 'cc-session-sort'
const VIEW_KEY = 'cc-home-view'
const COLLAPSED_KEY = 'cc-collapsed-days'

type HomeView = 'sessions' | 'presentations'

function savedView(): HomeView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'presentations' ? 'presentations' : 'sessions'
  } catch {
    return 'sessions'
  }
}

function savedCollapsed(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((k) => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

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
  const [view, setView] = useState<HomeView>(savedView)
  // Days folded away, by date, remembered between opens.
  const [collapsed, setCollapsed] = useState<Set<string>>(savedCollapsed)
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

  function changeView(next: HomeView) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Not remembered this time.
    }
  }

  function toggleDay(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {
        // Not remembered this time.
      }
      return next
    })
  }

  /** Sessions under a heading per day when the sort is by time; the name and
   * presentation sorts stay one list. */
  function renderByDay(list: Session[], render: (session: Session) => React.ReactNode, dated: boolean) {
    if (!dated) return list.map(render)
    const timeOf = sort === 'activity' && view === 'sessions' ? lastActivityAt : (s: Session) => s.startedAt
    return groupByDay(list, timeOf, now).map((day) => {
      const open = !collapsed.has(day.key)
      return (
        <section key={day.key} className="home-day" aria-label={day.label}>
          <button className="home-day__header" onClick={() => toggleDay(day.key)} aria-expanded={open}>
            <span className="home-day__label">{day.label}</span>
            <span className="home-day__count">
              {day.items.length} {view === 'presentations'
                ? (day.items.length === 1 ? 'presentation' : 'presentations')
                : (day.items.length === 1 ? 'session' : 'sessions')}
            </span>
            <svg className={`home-day__chevron${open ? '' : ' home-day__chevron--closed'}`} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {open && <div className="home-day__items">{day.items.map(render)}</div>}
        </section>
      )
    })
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
  const datedSort = sort === 'started' || sort === 'oldest' || sort === 'activity'
  // Finished presentations, in the chosen order (by date unless sorted by name).
  const presentations = sortSessions(sessions, sort === 'deck' || sort === 'activity' ? 'started' : sort)
    .filter((s) => s.deckStatus === 'ready' && s.deckPath)

  // The tutorial opens the first card's swipe panel to show what's in it.
  const firstCardId = useRef<string | null>(null)
  firstCardId.current = (live[0] ?? past[0])?.id ?? null
  useEffect(() => {
    const onTour = (e: Event) => {
      const target = (e as CustomEvent<TourRevealTarget | null>).detail
      if (target === 'session-card') setRevealedId(firstCardId.current)
      else if (target === null) setRevealedId(null)
    }
    window.addEventListener(TOUR_REVEAL_EVENT, onTour)
    return () => window.removeEventListener(TOUR_REVEAL_EVENT, onTour)
  }, [])

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
          <h1 className="home-header__title">
            <Logo className="home-header__logo" />
            <span className="visually-hidden">Conference Capture</span>
          </h1>
          <button className="home-header__menu" onClick={onOpenMenu} aria-label="Menu">
            <span className="menu-icon" aria-hidden="true">
              <span className="menu-icon__bar" />
              <span className="menu-icon__bar" />
              <span className="menu-icon__bar" />
            </span>
          </button>
        </div>
        {sessions.length > 0 && !searching && (
          <div className="home-view-switch" role="tablist" aria-label="Show">
            {(['sessions', 'presentations'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={`home-view-switch__tab${view === v ? ' is-selected' : ''}`}
                onClick={() => changeView(v)}
              >
                {v === 'sessions' ? 'Sessions' : 'Presentations'}
              </button>
            ))}
          </div>
        )}
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
            view === 'presentations' && sessions.length > 0 ? (
              presentations.length === 0 ? (
                <p className="home-empty">
                  No presentations yet. Swipe a session and tap Generate presentation.
                </p>
              ) : (
                renderByDay(
                  presentations,
                  (session) => <PresentationCard key={session.id} session={session} onOpen={() => onViewDeck(session.id)} />,
                  sort !== 'name',
                )
              )
            ) : (
              <>
                {live.map(renderCard)}

                {sessions.length === 0 && (
                  <p className="home-empty">
                    No sessions yet. Tap "New Session" to start capturing your first talk.
                  </p>
                )}

                {renderByDay(past, renderCard, datedSort)}
              </>
            )
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
