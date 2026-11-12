import { supabase } from './supabaseClient'
import { MESSAGES } from './networkError'

// Share by link. A shared presentation is a copy of its page in the public
// cc-shared bucket at <owner>/<token>.html; the link is the website with
// ?p=<token>, which opens it in any browser without the app. One link per
// session: sharing again replaces the page and keeps the link. Someone with
// the app can add a link to their own sessions, where it shows as a "Shared
// with you" card. Adding it also saves a copy in their own (private) storage,
// so it's theirs to keep: while it's still shared the card opens the owner's
// latest version (and refreshes the copy), and after the owner stops sharing
// or deletes it, the card opens the copy.

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
  /** The title when it was last saved. */
  title: string
  /** This person's own copy (cc-decks), or null if none was saved. */
  copyPath: string | null
  /** The owner's version the copy was taken from. */
  copiedAt: number | null
  /** Null once the owner stops sharing it (or deletes it). */
  deck: SharedDeck | null
}

const DECKS_BUCKET = 'cc-decks'

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

/** Shared but its page not uploaded yet: the row's update time is set to
 * this until the upload finishes. */
const NOT_UPLOADED = '2000-01-01T00:00:00Z'
const NOT_UPLOADED_MS = Date.parse(NOT_UPLOADED)

export function isUploading(deck: SharedDeck): boolean {
  return deck.updatedAt <= NOT_UPLOADED_MS
}

/** The session's link, and whether its page still has to be uploaded. Only a
 * small lookup -- the link can go into the share sheet at once while the
 * page (photos and all, often megabytes) uploads afterwards. A page shared
 * since the presentation was last built isn't uploaded again. */
export async function prepareShareLink(
  sessionId: string,
  deckGeneratedAt: number | null,
): Promise<{ token: string; url: string; isNew: boolean; upToDate: boolean }> {
  const { data, error } = await supabase
    .from('cc_shared_decks')
    .select('token, updated_at')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) throw error
  const token = data?.token ?? newToken()
  const sharedAt = data ? new Date(data.updated_at).getTime() : 0
  const upToDate = !!data && sharedAt > NOT_UPLOADED_MS && deckGeneratedAt !== null && sharedAt >= deckGeneratedAt
  return { token, url: shareUrl(token), isNew: !data, upToDate }
}

/** Puts the page where its link opens it. A new link is claimed first (so it
 * reads "still uploading" rather than "no longer shared" in the meantime),
 * and the upload is retried a few times on a bad connection. */
export async function publishShare(
  userId: string,
  sessionId: string,
  title: string,
  link: { token: string; isNew: boolean; upToDate: boolean },
  loadHtml: () => Promise<string>,
): Promise<void> {
  const row = { token: link.token, owner_id: userId, session_id: sessionId, title }
  if (link.upToDate) {
    // Nothing new to upload; just keep the title current.
    const { error } = await supabase.from('cc_shared_decks').update({ title }).eq('token', link.token)
    if (error) throw error
    return
  }
  if (link.isNew) {
    const { error } = await supabase.from('cc_shared_decks').upsert({ ...row, updated_at: NOT_UPLOADED }, { onConflict: 'token' })
    if (error) throw error
  }
  const html = await loadHtml()
  let lastError: unknown
  for (const wait of [0, 5_000, 15_000, 45_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try {
      const { error: uploadError } = await supabase.storage
        .from(SHARED_BUCKET)
        // A minute of caching at most, so stopping sharing (or sharing again)
        // takes effect almost at once even for someone with the file's address.
        .upload(fileOf(userId, link.token), new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: true, cacheControl: '60' })
      if (uploadError) throw uploadError
      const { error: saveError } = await supabase
        .from('cc_shared_decks')
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'token' })
      if (saveError) throw saveError
      return
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

// Whether each session's shared page was last uploaded with its audio clips
// (Session options), so changing that setting uploads the page again on the
// next share. Pages shared before the setting existed had their clips.
const SHARED_CLIPS_KEY = 'cc-shared-clips'

function sharedClips(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SHARED_CLIPS_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

export function sharedWithClips(sessionId: string): boolean {
  return sharedClips()[sessionId] ?? true
}

export function noteSharedWithClips(sessionId: string, withClips: boolean): void {
  try {
    localStorage.setItem(SHARED_CLIPS_KEY, JSON.stringify({ ...sharedClips(), [sessionId]: withClips }))
  } catch {
    // Only means the page may upload again next time.
  }
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
  if (isUploading(deck)) throw new Error(MESSAGES.uploading)
  // The update time keeps a cached old copy from being shown after a re-share.
  const url = `${supabaseUrl}/storage/v1/object/public/${SHARED_BUCKET}/${fileOf(deck.ownerId, deck.token)}?v=${deck.updatedAt}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Shared page ${response.status}`)
  return response.text()
}

/** Shared presentations this person added to their sessions, newest first. */
export async function listSavedShares(): Promise<SavedShare[]> {
  const { data, error } = await supabase
    .from('cc_saved_shares')
    .select('token, added_at, title, copy_path, copied_at')
    .order('added_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as { token: string; added_at: string; title: string | null; copy_path: string | null; copied_at: string | null }[]
  const decks = await lookupShared(rows.map((r) => r.token))
  return rows.map((r) => ({
    token: r.token,
    addedAt: new Date(r.added_at).getTime(),
    title: r.title ?? '',
    copyPath: r.copy_path,
    copiedAt: r.copied_at ? new Date(r.copied_at).getTime() : null,
    deck: decks.get(r.token) ?? null,
  }))
}

function copyPathFor(userId: string, token: string): string {
  return `${userId}/saved/${token}.html`
}

/** Saves this person's own copy of a shared page, and notes where. */
async function keepCopy(userId: string, deck: SharedDeck, html: string): Promise<void> {
  const path = copyPathFor(userId, deck.token)
  const { error: uploadError } = await supabase.storage
    .from(DECKS_BUCKET)
    .upload(path, new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: true })
  if (uploadError) throw uploadError
  const { error } = await supabase.from('cc_saved_shares').upsert(
    { user_id: userId, token: deck.token, title: deck.title, copy_path: path, copied_at: new Date(deck.updatedAt).toISOString() },
    { onConflict: 'user_id,token' },
  )
  if (error) throw error
}

/** Adds a shared presentation to this person's sessions, with a copy of
 * their own to keep. */
export async function saveShare(userId: string, token: string): Promise<void> {
  const deck = (await lookupShared([token])).get(token)
  if (!deck) throw new Error(MESSAGES.notShared)
  await keepCopy(userId, deck, await fetchSharedHtml(deck))
}

/** The page to show for a saved share: the owner's latest while it's still
 * shared (refreshing the kept copy when it's newer), otherwise the copy. */
export async function openSavedShare(userId: string, share: SavedShare): Promise<{ title: string; html: string }> {
  const deck = share.deck
  if (deck && (share.copiedAt === null || deck.updatedAt > share.copiedAt || !share.copyPath)) {
    const html = await fetchSharedHtml(deck)
    void keepCopy(userId, deck, html).catch(() => {})
    return { title: deck.title, html }
  }
  if (share.copyPath) {
    const { data, error } = await supabase.storage.from(DECKS_BUCKET).download(share.copyPath)
    if (error) throw error
    return { title: deck?.title || share.title || 'Shared presentation', html: await data.text() }
  }
  if (deck) return { title: deck.title, html: await fetchSharedHtml(deck) }
  throw new Error(MESSAGES.notShared)
}

/** Takes it out of this person's sessions, and deletes their copy. */
export async function removeSavedShare(share: Pick<SavedShare, 'token' | 'copyPath'>): Promise<void> {
  if (share.copyPath) await supabase.storage.from(DECKS_BUCKET).remove([share.copyPath])
  const { error } = await supabase.from('cc_saved_shares').delete().eq('token', share.token)
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
