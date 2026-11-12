// Every error the app shows is one of these short messages, decided ahead of
// time (2026-11-10) rather than whatever text the failure came with. The
// server functions use the same wording for anything Claude-related (keep in
// step with explain() in supabase/functions/*/index.ts).

export const MESSAGES = {
  // Claude (Sparkle, Ask) -- set by the server functions.
  credits: 'Out of Claude API credits',
  apiKey: 'Claude API key missing or rejected',
  busy: 'Too many requests, even after the automatic retries',
  overloaded: 'Claude overloaded or down',
  refused: 'Claude refused to write it',
  tooBig: 'Session too big for one request',
  stopped: 'Build stopped partway',
  empty: 'Claude replied with nothing usable',
  nothing: 'Nothing captured yet',
  photos: "Photos couldn't be loaded for Claude",
  // Connection, account and storage.
  offline: 'No signal',
  signedOut: 'Signed out or sign-in expired',
  server: 'Server not responding',
  serverFull: 'Server storage full',
  phoneFull: 'Phone storage full',
  refusedChange: 'The server refused a change',
  notShared: 'No longer shared',
  uploading: 'Still uploading, try again in a minute',
  unknown: 'Something went wrong, try again',
} as const

export const OFFLINE_MESSAGE = MESSAGES.offline

const KNOWN = new Set<string>(Object.values(MESSAGES))

// A request that never reached the server (no signal, or the connection
// dropped) surfaces as the browser's own wording -- "Load failed" on iPhone,
// "Failed to fetch" in Chrome -- sometimes wrapped by Supabase.
const NETWORK = /load failed|failed to fetch|networkerror|network connection was lost|internet connection appears to be offline|failed to send a request|fetcherror|request timed out|could not connect|the operation was aborted|timeouterror|signal timed out/i

function textOf(err: unknown): string {
  const e = err as { name?: unknown; message?: unknown } | null
  return [e?.name, e?.message, typeof err === 'string' ? err : ''].filter((s) => typeof s === 'string').join(' ')
}

export function isNetworkError(err: unknown): boolean {
  return NETWORK.test(textOf(err))
}

/** The message to show for a failure: one of MESSAGES, never raw error text. */
export function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message
  if (typeof message === 'string' && KNOWN.has(message)) return message
  if (typeof err === 'string' && KNOWN.has(err)) return err
  const text = textOf(err)
  const status = Number((err as { status?: unknown; statusCode?: unknown } | null)?.status ?? (err as { statusCode?: unknown } | null)?.statusCode)
  if (isNetworkError(err)) return MESSAGES.offline
  if (/no space|disk full|enospc|out of space|quota.*(device|exceeded)/i.test(text)) return MESSAGES.phoneFull
  if (status === 401 || /jwt|refresh token|auth session missing|not signed in|invalid claim/i.test(text)) return MESSAGES.signedOut
  if (status === 413 || /payload too large|exceeded the maximum allowed size|storage.*(quota|limit)/i.test(text)) return MESSAGES.serverFull
  if (status >= 500 || /bad gateway|service unavailable|gateway timeout|internal server error/i.test(text)) return MESSAGES.server
  return MESSAGES.unknown
}
