// A request that never reached the server (no signal, or the connection
// dropped) surfaces as the browser's own wording -- "Load failed" on iPhone,
// "Failed to fetch" in Chrome -- sometimes wrapped by Supabase. Those say
// nothing useful to the person holding the phone.

const NETWORK = /load failed|failed to fetch|networkerror|network connection was lost|internet connection appears to be offline|failed to send a request|fetcherror|request timed out|could not connect/i

export const OFFLINE_MESSAGE = "No connection — couldn't reach the server. Trying again when you're back online."

export function isNetworkError(err: unknown): boolean {
  const e = err as { message?: unknown; name?: unknown } | null
  const text = [e?.name, e?.message, typeof err === 'string' ? err : ''].filter((s) => typeof s === 'string').join(' ')
  return NETWORK.test(text)
}

/** What to show for a failure: plain words for a dropped connection,
 * otherwise the error's own message (or the fallback). */
export function errorMessage(err: unknown, fallback: string): string {
  if (isNetworkError(err)) return OFFLINE_MESSAGE
  const message = (err as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}
