import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Session } from '../types'
import type { SavedShare } from '../sharing'
import { formatSessionSubtitle } from '../format'
import { isSessionActive, lastActivityAt } from '../sessionActivity'
import { hasContentSinceDeck } from '../deck'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { SessionCard } from '../components/SessionCard'
import { groupByDay } from '../dayGroups'
import type { AskOrigin } from '../components/AskPanel'
import { SortMenu, SORT_OPTIONS, type SessionSort } from '../components/SortMenu'
import {
  SwipeActions,
  type SwipeAction,
  DeleteIcon,
  EditIcon,
  GenerateIcon,
  PinIcon,
  ShareIcon,
} from '../components/SwipeActions'
import { Logo } from '../components/Logo'
import { TOUR_REVEAL_EVENT, type TourRevealTarget } from '../tour'
import './HomeScreen.css'

// Where the session list was scrolled to. The home screen closes while a
// presentation or a session is open, so this keeps the place for when it
// comes back (for as long as the app is open).
let savedScrollTop = 0

const SORT_KEY = 'cc-session-sort'
const COLLAPSED_KEY = 'cc-collapsed-days'

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
  const deckRank = (s: Session) => (s.deckStatus === 'ready' ? 0 : s.deckStatus === 'generating' || s.deckStatus === 'queued' ? 1 : 2)
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
  /** Pin a session to the top of the list, or unpin it. */
  onTogglePin: (id: string) => void
  onShareDeck: (id: string) => void
  onDeleteSession: (id: string) => void
  /** Presentations others shared that were added to these sessions. */
  savedShares: SavedShare[]
  onOpenShared: (share: SavedShare) => void
  onRemoveShared: (token: string) => void
  /** Reloads the list -- run by pulling it down past the top. */
  onRefresh: () => Promise<void>
  error: string | null
  onDismissError: () => void
  /** Search: opens Ask Claude, growing out of the search button. */
  onOpenAsk: (origin: AskOrigin) => void
  /** A session is open over the list: it's out of reach (inert) and its
   * clock stops, until swiped or tapped back to. */
  covered?: boolean
}

export function HomeScreen({
  sessions,
  onOpenSession,
  onNewSession,
  onOpenMenu,
  onGenerateDeck,
  onViewDeck,
  onTogglePin,
  onShareDeck,
  onDeleteSession,
  savedShares,
  onOpenShared,
  onRemoveShared,
  onRefresh,
  error,
  onDismissError,
  onOpenAsk,
  covered = false,
}: HomeScreenProps) {
  const [now, setNow] = useState(Date.now())
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SessionSort>(savedSort)
  // Days folded away, by date, remembered between opens.
  const [collapsed, setCollapsed] = useState<Set<string>>(savedCollapsed)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { progress, refreshing } = usePullToRefresh(scrollRef, listRef, onRefresh)

  // Coming back from a presentation or a session: back where the list was.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = savedScrollTop
    const remember = () => {
      savedScrollTop = Math.max(0, el.scrollTop)
    }
    el.addEventListener('scroll', remember, { passive: true })
    return () => el.removeEventListener('scroll', remember)
  }, [])

  useEffect(() => {
    if (covered) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [covered])

  // Lift the bottom bar (and shorten the list) by the keyboard's height.
  const keyboardHeight = useKeyboardHeight()

  function openSearch(button: HTMLElement) {
    // Focused now, inside the tap, so iOS raises the keyboard; Ask's own
    // box takes the focus over as it opens.
    searchInputRef.current?.focus()
    const rect = button.getBoundingClientRect()
    onOpenAsk({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 })
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

  /** A heading that folds its group away, like the days -- remembered too. */
  function foldableGroup(key: string, label: string, count: number, items: React.ReactNode) {
    const open = !collapsed.has(key)
    return (
      <section key={key} className="home-day" aria-label={label}>
        <button className="home-day__header" onClick={() => toggleDay(key)} aria-expanded={open}>
          <span className="home-day__label">{label}</span>
          <span className="home-day__count">{count}</span>
          <svg className={`home-day__chevron${open ? '' : ' home-day__chevron--closed'}`} viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && <div className="home-day__items">{items}</div>}
      </section>
    )
  }

  /** Sessions under a heading per day when the sort is by time; the name and
   * presentation sorts stay one list. */
  function renderByDay(list: Session[], render: (session: Session) => React.ReactNode, dated: boolean) {
    if (!dated) return list.map(render)
    const timeOf = sort === 'activity' ? lastActivityAt : (s: Session) => s.startedAt
    return groupByDay(list, timeOf, now).map((day) => {
      const open = !collapsed.has(day.key)
      return (
        <section key={day.key} className="home-day" aria-label={day.label}>
          <button className="home-day__header" onClick={() => toggleDay(day.key)} aria-expanded={open}>
            <span className="home-day__label">{day.label}</span>
            <span className="home-day__count">
              {day.items.length} {day.items.length === 1 ? 'session' : 'sessions'}
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
  const notLive = sortSessions(sessions, sort).filter((s) => !isSessionActive(s, now))
  // Pinned sessions have their own group on top, the latest pin first, and
  // aren't repeated below.
  const pinned = notLive.filter((s) => s.pinnedAt).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
  const past = notLive.filter((s) => !s.pinnedAt)
  const datedSort = sort === 'started' || sort === 'oldest' || sort === 'activity'

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
        // Tapping the card opens the presentation, so no View here.
        return [
          { icon: <ShareIcon />, label: 'Share presentation', onClick: () => onShareDeck(session.id) },
          // Regenerating only makes sense once there's something new to add.
          ...(hasContentSinceDeck(session)
            ? [{ icon: <GenerateIcon />, label: 'Regenerate presentation', onClick: () => onGenerateDeck(session.id) }]
            : []),
        ]
      case 'generating':
      case 'queued':
        return []
      default:
        return [{ icon: <GenerateIcon />, label: 'Generate presentation', onClick: () => onGenerateDeck(session.id) }]
    }
  }

  /** A finished presentation opens on tap; anything else opens the session. */
  function opensPresentation(session: Session): boolean {
    return !isSessionActive(session, now) && session.deckStatus === 'ready' && !!session.deckPath
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
          // Only where a tap opens the presentation; otherwise a tap already
          // opens the session.
          ...(opensPresentation(session)
            ? [{ icon: <EditIcon />, label: 'Edit session', onClick: () => onOpenSession(session.id) }]
            : []),
          ...deckActions(session),
          session.pinnedAt
            ? { icon: <PinIcon filled />, label: 'Unpin', onClick: () => onTogglePin(session.id) }
            : { icon: <PinIcon />, label: 'Pin to top', onClick: () => onTogglePin(session.id) },
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
          // A finished presentation opens on tap; Edit (swipe) opens the session.
          onTap={() => (opensPresentation(session) ? onViewDeck(session.id) : onOpenSession(session.id))}
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
      inert={covered}
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
          <>
              {live.map(renderCard)}

              {sessions.length === 0 && (
                <p className="home-empty">
                  No sessions yet. Tap "New Session" to start capturing your first talk.
                </p>
              )}

              {pinned.length > 0 && foldableGroup('group:pinned', 'Pinned', pinned.length, pinned.map(renderCard))}

              {savedShares.length > 0 && foldableGroup('group:shared', 'Shared with you', savedShares.length, <>
{savedShares.map((share) => (
                      <SwipeActions
                        key={share.token}
                        id={`shared-${share.token}`}
                        revealedId={revealedId}
                        onReveal={setRevealedId}
                        actions={[{
                          icon: <DeleteIcon />,
                          label: 'Remove from my sessions',
                          onClick: () => {
                            setRevealedId(null)
                            onRemoveShared(share.token)
                          },
                        }]}
                      >
                        <button className="session-card" onClick={() => onOpenShared(share)} disabled={!share.deck && !share.copyPath}>
                          <p className="session-card__title">{share.deck?.title || share.title || 'Shared presentation'}</p>
                          <p className="session-card__subtitle">
                            {share.deck
                              ? `Shared with you · added ${formatSessionSubtitle(share.addedAt)}`
                              : share.copyPath
                                ? `Your saved copy · added ${formatSessionSubtitle(share.addedAt)}`
                                : 'No longer shared · swipe to remove'}
                          </p>
                        </button>
                      </SwipeActions>
                    ))}
              </>)}

              {renderByDay(past, renderCard, datedSort)}
          </>
        </div>
      </div>

      <div className="home-footer">
        <button className="new-session-btn" onClick={onNewSession} aria-label="Start new session">
          <span className="new-session-btn__plus" aria-hidden="true">+</span>
          <span className="new-session-btn__label" aria-hidden="true">New Session</span>
        </button>

        {sessions.length > 0 && (
          <>
            <div className="home-searchbox">
              <button className="home-searchbox__open" onClick={(e) => openSearch(e.currentTarget)} aria-label="Search and ask Claude" />
              <svg className="home-searchbox__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {/* Never seen: holds the keyboard for the moment Ask takes to open. */}
              <input ref={searchInputRef} className="home-searchbox__input" aria-hidden="true" tabIndex={-1} />
            </div>

            {/* Tucks away to the right while searching, then grows back as the field shrinks. */}
            <div className="home-footer__sort">
              {sessions.length > 1 && <SortMenu value={sort} onChange={changeSort} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
