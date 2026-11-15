// When to invite someone to connect Conference Capture to Claude (the
// dialog that opens on its own until they do): the first time the app opens
// after this arrived, then again once 3 days or 5 opens have passed since it
// last showed, whichever comes first. Tapping Connect -- making the link and
// opening Claude's Add custom connector form -- counts as connected.
//
// Remembered per account on this phone, plus whether the account has a link,
// so the buttons that need Claude know straight away on the next open.

const INVITE_KEY = 'cc-claude-invite'
const CONNECTED_KEY = 'cc-claude-connected'
const EVERY_MS = 3 * 24 * 60 * 60 * 1000
const EVERY_OPENS = 5

interface InviteState {
  /** When the invitation last showed (ms), or null if never. */
  shownAt: number | null
  /** App opens since then. */
  opens: number
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage off: the invitation just shows more often.
  }
}

/** Counts an app open (a launch, or coming back to the foreground). */
export function noteAppOpen(userId: string) {
  const all = read<Record<string, InviteState>>(INVITE_KEY, {})
  const state = all[userId] ?? { shownAt: null, opens: 0 }
  all[userId] = { ...state, opens: state.opens + 1 }
  write(INVITE_KEY, all)
}

export function inviteDue(userId: string, now = Date.now()): boolean {
  const state = read<Record<string, InviteState>>(INVITE_KEY, {})[userId]
  if (!state || state.shownAt === null) return true
  return now - state.shownAt >= EVERY_MS || state.opens >= EVERY_OPENS
}

export function noteInviteShown(userId: string, now = Date.now()) {
  const all = read<Record<string, InviteState>>(INVITE_KEY, {})
  all[userId] = { shownAt: now, opens: 0 }
  write(INVITE_KEY, all)
}

/** The account's connector link as last seen, or null for none. */
export function cachedConnectorUrl(userId: string): string | null {
  return read<Record<string, string>>(CONNECTED_KEY, {})[userId] ?? null
}

export function cacheConnectorUrl(userId: string, url: string | null) {
  const all = read<Record<string, string>>(CONNECTED_KEY, {})
  if (url) all[userId] = url
  else delete all[userId]
  write(CONNECTED_KEY, all)
}

const FREE_KEY = 'cc-free-user'

/** Whether the account was on the free list when last checked. */
export function cachedFreeUser(userId: string): boolean {
  return read<Record<string, boolean>>(FREE_KEY, {})[userId] === true
}

export function cacheFreeUser(userId: string, free: boolean) {
  const all = read<Record<string, boolean>>(FREE_KEY, {})
  if (free) all[userId] = true
  else delete all[userId]
  write(FREE_KEY, all)
}
