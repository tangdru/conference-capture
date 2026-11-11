import { supabase } from './supabaseClient'

// Share by link. A shared presentation is a copy of its page in the public
// cc-shared bucket at <owner>/<token>.html; the link is the website with
// ?p=<token>, which opens it in any browser without the app. One link per
// session: sharing again replaces the page and keeps the link. Someone with
// the app can add a link to their own sessions, where it shows as a "Shared
// with you" card that opens the owner's copy (so it stays up to date, and
// stops opening if the owner stops sharing).

export const SHARED_BUCKET = 'cc-shared'
/** The website, which opens shared links (also from the app). */
export const SITE_URL = 'https://tangdru.github.io/conference-capture/'
/** Opens the app from a shared page: conferencecapture://shared/<token>. */
export const APP_SCHEME = 'conferencecapture'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

export interface SharedDeck {
  token: string
  ownerId: string
  title: string
  updatedAt: number
}

/** A shared presentation added to this person's sessions. */
export interface SavedShare {
  token: string
  addedAt: number
  /** Null once the owner stops sharing it (or deletes it). */
  deck: SharedDeck | null
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function shareUrl(token: string): string {
  return `${SITE_URL}?p=${encodeURIComponent(token)}`
}

function fileOf(ownerId: string, token: string): string {
  return `${ownerId}/${token}.html`
}

/** Puts the session's presentation (as shown, photos embedded) where its link
 * can open it, and returns the link. Sharing again updates the same link. */
export async function sharePresentation(userId: string, sessionId: string, title: string, html: string): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('cc_shared_decks')
    .select('token')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (findError) throw findError
  const token = existing?.token ?? newToken()

  const { error: uploadError } = await supabase.storage
    .from(SHARED_BUCKET)
    // A minute of caching at most, so stopping sharing (or sharing again)
    // takes effect almost at once even for someone with the file's address.
    .upload(fileOf(userId, token), new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: true, cacheControl: '60' })
  if (uploadError) throw uploadError

  const { error: saveError } = await supabase
    .from('cc_shared_decks')
    .upsert({ token, owner_id: userId, session_id: sessionId, title, updated_at: new Date().toISOString() }, { onConflict: 'token' })
  if (saveError) throw saveError
  return shareUrl(token)
}

/** Stops sharing a session: its link no longer opens. Best effort. */
export async function stopSharing(userId: string, sessionId: string): Promise<void> {
  const { data } = await supabase.from('cc_shared_decks').select('token').eq('session_id', sessionId).maybeSingle()
  if (!data?.token) return
  await supabase.storage.from(SHARED_BUCKET).remove([fileOf(userId, data.token)])
  await supabase.from('cc_shared_decks').delete().eq('token', data.token)
}

/** What links point to; a token missing from the answer is no longer shared. */
export async function lookupShared(tokens: string[]): Promise<Map<string, SharedDeck>> {
  const found = new Map<string, SharedDeck>()
  if (tokens.length === 0) return found
  const { data, error } = await supabase.rpc('cc_shared_decks_lookup', { tokens })
  if (error) throw error
  for (const row of (data ?? []) as { token: string; owner_id: string; title: string; updated_at: string }[]) {
    found.set(row.token, { token: row.token, ownerId: row.owner_id, title: row.title, updatedAt: new Date(row.updated_at).getTime() })
  }
  return found
}

/** The shared page itself -- readable by anyone with the link. */
export async function fetchSharedHtml(deck: SharedDeck): Promise<string> {
  // The update time keeps a cached old copy from being shown after a re-share.
  const url = `${supabaseUrl}/storage/v1/object/public/${SHARED_BUCKET}/${fileOf(deck.ownerId, deck.token)}?v=${deck.updatedAt}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Shared page ${response.status}`)
  return response.text()
}

/** Shared presentations this person added to their sessions, newest first. */
export async function listSavedShares(): Promise<SavedShare[]> {
  const { data, error } = await supabase.from('cc_saved_shares').select('token, added_at').order('added_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as { token: string; added_at: string }[]
  const decks = await lookupShared(rows.map((r) => r.token))
  return rows.map((r) => ({ token: r.token, addedAt: new Date(r.added_at).getTime(), deck: decks.get(r.token) ?? null }))
}

export async function saveShare(userId: string, token: string): Promise<void> {
  const { error } = await supabase.from('cc_saved_shares').upsert({ user_id: userId, token }, { onConflict: 'user_id,token' })
  if (error) throw error
}

export async function removeSavedShare(token: string): Promise<void> {
  const { error } = await supabase.from('cc_saved_shares').delete().eq('token', token)
  if (error) throw error
}

/** The token in a shared link, an app link or a pasted link, if any. */
export function tokenFromLink(link: string): string | null {
  try {
    const url = new URL(link)
    if (url.protocol === `${APP_SCHEME}:`) {
      const parts = `${url.host}${url.pathname}`.split('/').filter(Boolean)
      return parts[0] === 'shared' && parts[1] ? decodeURIComponent(parts[1]) : null
    }
    return url.searchParams.get('p')
  } catch {
    return null
  }
}
