// Presentations written by Claude through the connector (prepare_presentation
// / save_presentation), built to Sparkle's own instructions and finished the
// way Sparkle finishes them, so the result is the same kind of page in the
// app. The prompt and finishing helpers below are copied from
// supabase/functions/generate-deck/index.ts -- keep them in step with it
// (presentationRequirements, formatEnrichment, formatSlideText,
// formatQrLinks, formatHighlights, readMinutes, stripCodeFence).
//
// Differences from Sparkle, because Claude here works in a chat rather than
// one API call:
//  - placeholders name the entry (PHOTO_d8ac6434, AUDIO_1f2e3d4c) rather than
//    counting (PHOTO_1), so saving finds the right file even if the session
//    changed in between;
//  - Claude looks at photos itself with get_photos, and leaves out repeat
//    shots of one slide itself, instead of separate calls doing it;
//  - an unnamed session's title comes with the save;
//  - Sparkle's organizeSession (summary, action items, speaker bio, acronyms
//    and references saved as entries; unplaced notes and photos moved to
//    just after the spoken line they're about) is asked of Claude in the same
//    instructions and comes back with the save as session_entries; the asks
//    and the saving are copied from organizeSession -- keep them in step.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DECKS_BUCKET = 'cc-decks'
const PHOTOS_BUCKET = 'cc-photos'
const VIDEOS_BUCKET = 'cc-videos'
// As Sparkle: the phone swaps these links for embedded photos the first time
// the page is opened or shared.
const PHOTO_LINK_SECONDS = 365 * 24 * 60 * 60
// Sparkle's "still building" window: a build quiet for longer has stopped.
const BUILD_SILENCE_MS = 6 * 60 * 1000
// What the app titles a session until it's renamed. Keep in step with
// src/sessionTitle.ts.
const DEFAULT_TITLE = /^Session(?: \d+ : \d{2}\/\d{2})?$/

export class DeckError extends Error {}

/** Which photos or clips go in. Smart: Claude picks the ones that tell the
 * talk's whole story. */
type Media = 'smart' | 'all' | 'starred' | 'none'

function chooseMedia<T extends { starred: boolean | null }>(rows: T[], choice: Media): T[] {
  if (choice === 'none') return []
  return choice === 'starred' ? rows.filter((r) => r.starred) : rows
}

/** The account's Presentation options. Keep in step with
 * src/presentationOptions.ts and generate-deck. */
interface PresentationOptions {
  tldr: boolean
  quotes: boolean
  actionItems: boolean
  references: boolean
  chapterBar: boolean
  speakerBio: boolean
  chapterTimes: boolean
  motion: 'still' | 'scrolly'
  charts: 'interactive' | 'photo'
  theme: 'auto' | 'light' | 'dark'
  accent: string
  length: 'full' | 'short'
  photos: Media
  audioClips: Media
  videoClips: Media
  photoLayout: 'full' | 'gallery'
  qa: boolean
  glossary: boolean
  readingLevel: 'expert' | 'general' | 'plain'
  skipRepeatSlides: boolean
  voice: 'neutral' | 'first_person' | 'brief'
  language: string
  saveSummary: boolean
  saveActionItems: boolean
  saveSpeakerBio: boolean
  saveAcronyms: boolean
  saveReferences: boolean
}

const DEFAULT_OPTIONS: PresentationOptions = {
  tldr: true,
  quotes: true,
  actionItems: true,
  references: true,
  chapterBar: true,
  speakerBio: true,
  chapterTimes: true,
  motion: 'still',
  charts: 'interactive',
  theme: 'auto',
  accent: 'auto',
  length: 'full',
  photos: 'all',
  audioClips: 'all',
  videoClips: 'all',
  photoLayout: 'full',
  qa: true,
  glossary: true,
  readingLevel: 'expert',
  skipRepeatSlides: true,
  voice: 'neutral',
  language: 'auto',
  saveSummary: true,
  saveActionItems: true,
  saveSpeakerBio: true,
  saveAcronyms: true,
  saveReferences: true,
}

type EntryKind = 'summary' | 'action_items' | 'speaker_bio' | 'acronyms' | 'references'
const ENTRY_KINDS: EntryKind[] = ['summary', 'action_items', 'speaker_bio', 'acronyms', 'references']
const KEY_FOR: Record<EntryKind, string> = {
  summary: 'summary', action_items: 'actionItems', speaker_bio: 'speakerBio', acronyms: 'acronyms', references: 'references',
}
// organizeSession's asks, word for word.
const ASKS: Record<EntryKind, string> = {
  summary: 'summary: 2 or 3 plain sentences on what the talk was actually about.',
  action_items: 'actionItems: commitments or follow-ups the SPEAKER made (e.g. "I\'ll share the slides", "it ships in Q2"), not things the attendee should do. Each {text, context}: the commitment and brief surrounding context. [] if none.',
  speaker_bio: 'speakerBio: only if the content shows who the speaker is (a self-introduction, or a title or intro slide): {name, role, org, description} with a one-line description; empty string for any part not stated. If nothing says who is speaking but a title slide lists the authors, use the FIRST author listed on the title slide (with their affiliation as org, role empty unless stated, and a description saying they are the first author of the work presented). null if neither the speaker nor a title-slide author list is shown -- never guess.',
  acronyms: 'acronyms: acronyms or jargon used but not explained by the speaker (skip ones they define). Each {term, expansion}. [] if none.',
  references: 'references: papers, books, tools, products or URLs the speaker or slides explicitly named. Each {title, source, description, url}: source is the author, publisher or site; description one line; url only if one was actually given, else null. A link from a QR code on a slide photo counts as given: list each one with that exact url, titled by what the slide says it\'s for. [] if none.',
}

interface Row {
  id: string
  type: string
  subtype: string | null
  payload: Record<string, unknown> | null
  text: string | null
  caption: string | null
  photo_path: string | null
  duration_ms: number | null
  item_timestamp: string
  starred: boolean | null
  position: number | null
  placement_locked: boolean | null
}

interface Session {
  id: string
  title: string
  started_at: string
  deck_status: string
  deck_heartbeat_at: string | null
}

interface Material {
  session: Session
  options: PresentationOptions
  notes: Row[]
  transcript: Row[]
  photos: Row[]
  allPhotos: Row[]
  enrichment: Row[]
  highlights: Row[]
  clips: Row[]
  videos: Row[]
  /** Session options › Show Claude video frames. */
  videoFrames: boolean
  /** Kinds of entry to save: wanted in the options and not hidden by the user. */
  entryKinds: EntryKind[]
  /** Last build's entries, replaced by a save. */
  oldEntries: { id: string; subtype: string | null }[]
  /** Notes and listed photos the user hasn't placed, which a save may move. */
  movable: Row[]
}

const photoToken = (row: Row) => `PHOTO_${row.id.slice(0, 8)}`
const clipToken = (row: Row) => `AUDIO_${row.id.slice(0, 8)}`
const videoToken = (row: Row) => `VIDEO_${row.id.slice(0, 8)}`

async function loadMaterial(admin: SupabaseClient, userId: string, sessionId: string): Promise<Material> {
  const { data: session, error } = await admin
    .from('cc_sessions')
    .select('id, title, started_at, deck_status, deck_heartbeat_at')
    .eq('owner_id', userId)
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!session) throw new DeckError(`No session with id ${sessionId}. list_sessions shows them all.`)

  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: itemsError } = await admin
      .from('cc_timeline_items')
      .select('id, type, subtype, payload, text, caption, photo_path, duration_ms, item_timestamp, starred, position, placement_locked')
      .eq('owner_id', userId)
      .eq('session_id', sessionId)
      .eq('excluded', false)
      .order('item_timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (itemsError) throw itemsError
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  const { data: settings } = await admin.from('cc_user_settings').select('presentation, session_options').eq('user_id', userId).maybeSingle()
  const videoFrames = (settings?.session_options as { videoFramesForClaude?: unknown } | null)?.videoFramesForClaude === true
  const options = { ...DEFAULT_OPTIONS, ...((settings?.presentation as Partial<PresentationOptions>) ?? {}) }

  // Entries, hidden ones included: a kind the user hid is left alone.
  const { data: entryRows, error: entryError } = await admin
    .from('cc_timeline_items')
    .select('id, subtype, excluded')
    .eq('owner_id', userId)
    .eq('session_id', sessionId)
    .eq('type', 'enrichment')
  if (entryError) throw entryError
  const wanted: Record<EntryKind, boolean> = {
    summary: options.saveSummary,
    action_items: options.saveActionItems,
    speaker_bio: options.saveSpeakerBio,
    acronyms: options.saveAcronyms,
    references: options.saveReferences,
  }
  const entryKinds = ENTRY_KINDS.filter((kind) =>
    wanted[kind] && !(entryRows ?? []).some((r) => r.subtype === kind && r.excluded))

  const allPhotos = rows.filter((r) => r.type === 'photo' && r.photo_path)
  const notes = rows.filter((r) => r.type === 'note' && r.text)
  const photos = chooseMedia(allPhotos, options.photos)
  const unplaced = (r: Row) => !r.placement_locked && r.position === null
  return {
    session: session as Session,
    options,
    notes,
    transcript: rows.filter((r) => r.type === 'transcript' && r.text),
    allPhotos,
    photos,
    enrichment: rows.filter((r) => r.type === 'enrichment' && r.payload),
    highlights: rows.filter((r) => r.type === 'highlight'),
    clips: chooseMedia(rows.filter((r) => r.type === 'audio' && typeof r.payload?.path === 'string'), options.audioClips),
    videos: chooseMedia(rows.filter((r) => r.type === 'video' && typeof r.payload?.path === 'string'), options.videoClips),
    videoFrames,
    entryKinds,
    oldEntries: (entryRows ?? []).filter((r) => !r.excluded && entryKinds.includes(r.subtype as EntryKind)),
    movable: [...notes, ...photos.filter((r) => r.text || r.caption)].filter(unplaced),
  }
}

/** Sparkle's instructions for this session, for Claude to follow in the chat. */
export async function preparePresentation(admin: SupabaseClient, userId: string, sessionId: string): Promise<string> {
  const m = await loadMaterial(admin, userId, sessionId)
  const { session, options: o } = m
  if (m.notes.length === 0 && m.transcript.length === 0 && m.allPhotos.length === 0) {
    throw new DeckError(`"${session.title}" has nothing captured yet, so there's nothing to build a presentation from.`)
  }
  const startedAt = session.started_at
  const unnamed = !session.title.trim() || DEFAULT_TITLE.test(session.title.trim())
  const placing = m.movable.length > 0 && m.transcript.length > 0
  const movableIds = new Set(placing ? m.movable.map((r) => r.id) : [])

  const notesText = m.notes.length > 0
    ? m.notes.map((n) => `- [${formatElapsed(startedAt, n.item_timestamp)}]${n.starred ? ' ★' : ''}${movableIds.has(n.id) ? ` (note id ${n.id})` : ''} ${n.text}`).join('\n')
    : '(No written notes were captured -- build the piece from the transcript and photos alone.)'
  const transcriptText = m.transcript.length > 0
    ? m.transcript.map((t, i) => `- [${formatElapsed(startedAt, t.item_timestamp)}] L${i + 1}${t.starred ? ' ★' : ''} ${t.text}`).join('\n')
    : '(No ambient transcript was captured for this talk.)'
  const photosText = m.photos.length > 0
    ? m.photos.map((p) => `- ${photoToken(p)} [${formatElapsed(startedAt, p.item_timestamp)}]${p.starred ? ' ★' : ''} (photo id ${p.id})${p.caption && p.caption !== 'Untitled photo' ? ` -- caption: "${p.caption}"` : ''}${formatSlideText(p.text ?? '')}`).join('\n')
    : o.photos === 'all' || o.photos === 'smart'
      ? '(No photos were captured for this talk.)'
      : '(Photos are left out of this presentation -- use no images or photo placeholders.)'
  const clipsText = m.clips.length > 0
    ? m.clips.map((c) => {
      const { elapsed, length, said } = describeClip(startedAt, c, m.transcript)
      return `- ${clipToken(c)} [${elapsed}] (${length})${c.starred ? ' ★' : ''}${said ? ` -- said in it: "${said}"` : ''}`
    }).join('\n')
    : '(None recorded.)'
  const videosText = m.videos.length > 0
    ? m.videos.map((v) => {
      const { elapsed, length, said } = describeClip(startedAt, v, m.transcript)
      const list = v.payload?.frames
      const frames = m.videoFrames && Array.isArray(list) ? list.length : 0
      const poster = typeof v.payload?.poster === 'string'
      return `- ${videoToken(v)} [${elapsed}] (${length})${v.starred ? ' ★' : ''}${frames ? ` (video id ${v.id}, ${frames} frame${frames === 1 ? '' : 's'} to look at)` : poster ? '' : ' (no poster)'}${said ? ` -- said during it: "${said}"` : ''}`
    }).join('\n')
    : '(None recorded.)'

  const instructions = `You are building a web page someone can keep as a personal resource, or share with friends and colleagues, as a record of a conference talk they attended titled "${unnamed ? '(not named yet)' : session.title}". This is NOT a slide deck -- there is no click/arrow-key/swipe navigation of any kind. It reads like a well-edited article: the takeaways first, then the detail for anyone who wants it.

You are given the attendee's raw notes (taken live, so they may be fragmentary or out of order), an ambient audio transcript of the speaker (auto-transcribed on-device, so it may contain mistranscribed words or awkward phrasing -- use it for content and quotes, but don't assume every word is verbatim), photos they took during the talk (mostly slides, usually straightened square-on; where text was found on a photo it's listed with it, read on-device -- use it to quote slide titles, figures and terms accurately, allowing for the odd misread character), and enrichment already extracted from this session (summary, action items, references, speaker bio, acronyms -- already vetted, safe to use directly). Every note, transcript line, and photo below is tagged with its elapsed time into the talk (MM:SS, or H:MM:SS past the hour) -- this is real data about how the talk actually unfolded, not filler.

Raw notes:
${notesText}

Ambient transcript (chronological):
${transcriptText}

Extracted enrichment:
${formatEnrichment(m.enrichment)}

Photos available (look at them with the get_photos tool, ${'up to 6 per call'}, by their photo ids -- at least the starred ones, those near the key moments, and any whose slide text suggests a chart or diagram; place the rest by their elapsed time and text; ${o.photos === 'smart' ? 'choose which to use as the requirements say' : 'use every photo all the same'}):
${photosText}

Moments the attendee marked "Remember this" (tapped live, as it happened):
${formatHighlights(startedAt, m.highlights, m.transcript, m.notes)}

Audio clips the attendee recorded of the speaker (their own voice, about a minute each; what was said in each is from the transcript):
${clipsText}

Video clips the attendee recorded (up to a minute each, with sound -- a demo, an animated slide, the speaker on stage; ${m.videoFrames ? 'you can\'t watch them, but you can look at a few frames of each with get_photos by its video id' : 'you can\'t watch them, so go by when each was recorded and what was said during it'}; what was said during each is from the transcript):
${videosText}

Links from QR codes on the attendee's photos (decoded on the phone, so exact):
${formatQrLinks(startedAt, m.allPhotos)}

Requirements:
${presentationRequirements(o)}`

  const extra: string[] = [
    `Photo and audio placeholders here name their entry (like ${m.photos[0] ? photoToken(m.photos[0]) : 'PHOTO_1a2b3c4d'}): use them exactly as listed wherever the requirements mention placeholders like PHOTO_1, AUDIO_1 or VIDEO_1 (and VIDEO_1_POSTER becomes the clip's token followed by _POSTER).`,
  ]
  if (o.photos !== 'none' && o.skipRepeatSlides && m.photos.length > 1) {
    extra.push('A slide that builds up step by step is often photographed at every step, and a slide is sometimes photographed twice. Leave a photo out only when another photo of the SAME slide shows everything it does (a later, fuller step, or a clearer shot); keep any photo that shows something the others don\'t, and always keep ★ photos. When unsure, keep it.')
  }
  // Sparkle's organizeSession, asked in the same chat.
  const tasks = m.entryKinds.map((k) => ASKS[k])
  const keys = m.entryKinds.map((k) => KEY_FOR[k])
  if (placing) {
    tasks.push('placements: for EVERY note and slide photo whose listing above has a note id or photo id and some text, the spoken line (the L number in the transcript) it is about. A note is often typed, and a photo taken, a little after the moment it refers to, so look for the line whose subject matches rather than trusting its time. Each {id, after}: id is the full note or photo id, after is that line\'s number (e.g. 12), or null if no line is a better match than where it already is.')
    keys.push('placements')
  }
  if (tasks.length > 0) {
    extra.push(`Sparkle also saves to the session itself, so do this too and pass it to save_presentation as session_entries, one JSON object with exactly these keys: ${keys.join(', ')}. Grounded strictly in what was captured -- never invent, and never pad a list from filler or small talk:\n${tasks.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`)
  }
  if (unnamed) extra.push('This session has no name yet. Give the talk a short, specific title (its real title if the slides or transcript show it), use it on the page, and pass it as title to save_presentation.')
  extra.push(
    `When the page is finished, call save_presentation with session_id ${session.id} and the complete HTML document as html. That puts it on the session in the Conference Capture app, as if Sparkle had made it, replacing any earlier presentation. Write the whole page before saving: don't show it to the user first unless they asked to review it.`,
  )

  const existing = session.deck_status === 'ready' ? '\n\nThis session already has a presentation; saving replaces it.' : ''
  return `${instructions}\n\nWorking in this chat:\n${extra.map((e) => `- ${e}`).join('\n')}${existing}`
}

/** Finishes a page the way Sparkle does and puts it on the session. */
export async function savePresentation(
  admin: SupabaseClient,
  userId: string,
  sessionId: string,
  html: string,
  title: string,
  entries: Record<string, unknown> | null,
): Promise<string> {
  const m = await loadMaterial(admin, userId, sessionId)
  const { session } = m
  const heartbeat = session.deck_heartbeat_at ? new Date(session.deck_heartbeat_at).getTime() : 0
  if (session.deck_status === 'generating' && Date.now() - heartbeat < BUILD_SILENCE_MS) {
    throw new DeckError(`Sparkle is building a presentation for "${session.title}" in the app right now. Try saving again once it's done; saving then replaces it.`)
  }

  const page = stripCodeFence(html)
  if (!/<html[\s>]/i.test(page) || !/<\/html>/i.test(page)) {
    throw new DeckError('That isn\'t a complete HTML document (from <!doctype html> to </html>). Send the whole page.')
  }

  // Link only the photos and clips the page uses.
  const usedPhotos = m.allPhotos.filter((p) => page.includes(photoToken(p)))
  const usedClips = m.clips.filter((c) => page.includes(clipToken(c)))
  const usedVideos = m.videos.filter((v) => page.includes(videoToken(v)))
  const posterOf = (v: Row) => (typeof v.payload?.poster === 'string' ? v.payload.poster : null)
  const videoLinks = await signedLinks(admin, VIDEOS_BUCKET, usedVideos.flatMap((v) => [String(v.payload!.path), ...(posterOf(v) ? [posterOf(v)!] : [])]))
  const photoLinks = await signedLinks(admin, PHOTOS_BUCKET, usedPhotos.map((p) => p.photo_path!))
  const clipLinks = await signedLinks(admin, VIDEOS_BUCKET, usedClips.map((c) => String(c.payload!.path)))
  const replacements = [
    ...usedPhotos.filter((p) => photoLinks[p.photo_path!]).map((p) => ({ placeholder: photoToken(p), url: photoLinks[p.photo_path!] })),
    ...usedClips.filter((c) => clipLinks[String(c.payload!.path)]).map((c) => ({ placeholder: clipToken(c), url: clipLinks[String(c.payload!.path)] })),
    // The poster first: its token begins with the video's.
    ...usedVideos.filter((v) => posterOf(v) && videoLinks[posterOf(v)!]).map((v) => ({ placeholder: `${videoToken(v)}_POSTER`, url: videoLinks[posterOf(v)!] })),
    ...usedVideos.filter((v) => videoLinks[String(v.payload!.path)]).map((v) => ({ placeholder: videoToken(v), url: videoLinks[String(v.payload!.path)] })),
  ]
  const unknown = [...new Set(page.match(/\b(?:PHOTO|AUDIO|VIDEO)_[0-9a-f]{8}\b/g) ?? [])].filter(
    (t) => !replacements.some((r) => r.placeholder === t),
  )

  const coverToken = /<meta\s+name=["']cc-cover["']\s+content=["'](PHOTO_[0-9a-f]{8})["']/i.exec(page)?.[1]
  const coverPhotoId = usedPhotos.find((p) => photoToken(p) === coverToken)?.id ?? null
  const finalHtml = substitutePhotos(page, replacements)

  const { data: owner } = await admin.from('cc_sessions').select('owner_id').eq('id', sessionId).single()
  const deckPath = `${owner!.owner_id}/${sessionId}/deck.html`
  const { error: uploadError } = await admin.storage
    .from(DECKS_BUCKET)
    .upload(deckPath, new Blob([finalHtml], { type: 'text/html' }), { contentType: 'text/html', upsert: true })
  if (uploadError) throw uploadError

  // Sparkle's organizeSession, before the presentation is marked done: the
  // app counts a session as live while anything in it is newer than its
  // presentation, so the entries saved here must come first.
  const organized = entries ? await saveSessionEntries(admin, m, userId, entries) : null

  const unnamed = !session.title.trim() || DEFAULT_TITLE.test(session.title.trim())
  const newTitle = unnamed && title ? title.slice(0, 200) : null
  const minutes = readMinutes(page)
  const { error: updateError } = await admin
    .from('cc_sessions')
    .update({
      deck_status: 'ready',
      deck_path: deckPath,
      // Just after the last entry (they're spaced a few ms apart).
      deck_generated_at: new Date(Date.now() + 100).toISOString(),
      deck_error: null,
      deck_cover_photo_id: coverPhotoId,
      deck_read_minutes: minutes,
      ...(newTitle ? { title: newTitle } : {}),
    })
    .eq('id', sessionId)
    .eq('owner_id', userId)
  if (updateError) throw updateError

  const shownTitle = newTitle ?? session.title
  const notes = [
    `Saved. "${shownTitle}" now has this presentation in the Conference Capture app (about ${minutes} min to read, ${usedPhotos.length} photo${usedPhotos.length === 1 ? '' : 's'}${usedClips.length ? `, ${usedClips.length} audio clip${usedClips.length === 1 ? '' : 's'}` : ''}${usedVideos.length ? `, ${usedVideos.length} video clip${usedVideos.length === 1 ? '' : 's'}` : ''}${coverPhotoId ? ', with a cover photo' : ''}).`,
  ]
  if (newTitle) notes.push(`The session was renamed "${newTitle}".`)
  if (organized) notes.push(organized)
  else if (m.entryKinds.length > 0) notes.push('No session_entries came with it, so the summary and other entries weren\'t saved to the session; to save them, call save_presentation again with the same page and session_entries.')
  if (unknown.length) notes.push(`These placeholders didn't match any photo or clip in the session and were left as they are: ${unknown.join(', ')}.`)
  return notes.join(' ')
}

/** organizeSession's saving: entries replace the last build's, unplaced
 * notes and photos move to just after the spoken line they're about. Returns
 * what changed, for Claude to tell the user. */
async function saveSessionEntries(
  admin: SupabaseClient,
  m: Material,
  userId: string,
  result: Record<string, unknown>,
): Promise<string> {
  const { session, transcript: spoken, movable, entryKinds: kinds } = m
  const done: string[] = []

  // Placements: just after the named line, a millisecond apart when several
  // land on the same line, in the order they were captured.
  let moved = 0
  if (movable.length > 0 && spoken.length > 0 && Array.isArray(result.placements)) {
    const spokenByNumber = new Map(spoken.map((r, i) => [i + 1, r]))
    const nextSpoken = new Map(spoken.map((r, i) => [r.id, spoken[i + 1]]))
    const perLine = new Map<number, Row[]>()
    for (const p of result.placements as { id?: unknown; after?: unknown }[]) {
      const row = movable.find((r) => r.id === p?.id)
      const line = typeof p?.after === 'number' ? spokenByNumber.get(p.after) : undefined
      if (!row || !line) continue
      const list = perLine.get(p.after as number) ?? []
      list.push(row)
      perLine.set(p.after as number, list)
    }
    const updates: { id: string; at: string }[] = []
    for (const [n, list] of perLine) {
      const line = spokenByNumber.get(n)!
      const base = new Date(line.item_timestamp).getTime()
      const next = nextSpoken.get(line.id)
      const room = next ? new Date(next.item_timestamp).getTime() - base : Infinity
      list.sort((a, b) => a.item_timestamp.localeCompare(b.item_timestamp))
      list.forEach((row, i) => {
        // Inside the gap before the next spoken line, so it reads right after.
        const offset = Math.min(1 + i, Math.max(0, room - 1) * ((i + 1) / (list.length + 1)))
        const at = new Date(base + Math.max(offset, 0.001)).toISOString()
        if (at !== new Date(row.item_timestamp).toISOString()) updates.push({ id: row.id, at })
      })
    }
    for (const u of updates) {
      const { error } = await admin.from('cc_timeline_items').update({ item_timestamp: u.at }).eq('id', u.id).eq('owner_id', userId)
      if (error) throw error
    }
    moved = updates.length
  }
  if (moved > 0) done.push(`moved ${moved} note${moved === 1 ? '' : 's'}/photo${moved === 1 ? '' : 's'} to just after the line they're about`)

  const list = (key: string) => (Array.isArray(result[key]) ? (result[key] as Record<string, unknown>[]) : [])
  const payloads: Partial<Record<EntryKind, Record<string, unknown> | null>> = {}
  // A kind only counts as answered when its key came back; one left out keeps
  // what the session has.
  const answered = (k: EntryKind) => kinds.includes(k) && KEY_FOR[k] in result
  if (answered('summary')) {
    payloads.summary = typeof result.summary === 'string' && result.summary.trim() ? { text: result.summary.trim() } : null
  }
  if (answered('action_items')) {
    const items = list('actionItems').filter((i) => typeof i.text === 'string' && i.text)
      .map((i) => ({ text: String(i.text), context: String(i.context ?? '') }))
    payloads.action_items = items.length ? { items } : null
  }
  if (answered('speaker_bio')) {
    const bio = result.speakerBio as Record<string, unknown> | null
    payloads.speaker_bio = bio && typeof bio === 'object' && typeof bio.name === 'string' && bio.name.trim()
      ? { name: String(bio.name), role: String(bio.role ?? ''), org: String(bio.org ?? ''), description: String(bio.description ?? '') }
      : null
  }
  if (answered('acronyms')) {
    const items = list('acronyms').filter((i) => typeof i.term === 'string' && typeof i.expansion === 'string')
      .map((i) => ({ term: String(i.term), expansion: String(i.expansion) }))
    payloads.acronyms = items.length ? { items } : null
  }
  if (answered('references')) {
    const items = list('references').filter((i) => typeof i.title === 'string' && i.title)
      .map((i) => ({
        title: String(i.title),
        source: String(i.source ?? ''),
        description: String(i.description ?? ''),
        url: typeof i.url === 'string' && i.url ? i.url : null,
      }))
    payloads.references = items.length ? { items } : null
  }
  const savedKinds = Object.keys(payloads) as EntryKind[]

  // Replace what a previous build saved for these kinds.
  const replaced = m.oldEntries.filter((r) => savedKinds.includes(r.subtype as EntryKind)).map((r) => r.id)
  if (replaced.length > 0) {
    const { error } = await admin.from('cc_timeline_items').delete().in('id', replaced).eq('owner_id', userId)
    if (error) throw error
  }

  // The summary sits just before the talk's first moment; the rest go at the
  // end, a beat apart so they keep this order.
  const end = Date.now()
  const order: EntryKind[] = ['action_items', 'speaker_bio', 'acronyms', 'references']
  const newRows = (Object.entries(payloads) as [EntryKind, Record<string, unknown> | null][])
    .filter(([, payload]) => payload)
    .map(([kind, payload]) => ({
      session_id: session.id,
      owner_id: userId,
      type: 'enrichment',
      subtype: kind,
      payload,
      item_timestamp: kind === 'summary'
        ? new Date(new Date(session.started_at).getTime() - 1000).toISOString()
        : new Date(end + order.indexOf(kind) * 10).toISOString(),
    }))
  if (newRows.length > 0) {
    const { error } = await admin.from('cc_timeline_items').insert(newRows)
    if (error) throw error
  }
  const names: Record<EntryKind, string> = {
    summary: 'summary', action_items: 'action items', speaker_bio: 'speaker bio', acronyms: 'acronyms', references: 'references',
  }
  if (newRows.length > 0) done.unshift(`saved the ${newRows.map((r) => names[r.subtype as EntryKind]).join(', ')}`)
  return done.length > 0 ? `In the session it also ${done.join(' and ')}.` : 'Nothing in the session needed changing.'
}

async function signedLinks(admin: SupabaseClient, bucket: string, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return {}
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(unique, PHOTO_LINK_SECONDS)
  if (error) throw error
  const links: Record<string, string> = {}
  for (const link of data ?? []) if (link.path && link.signedUrl && !link.error) links[link.path] = link.signedUrl
  return links
}

function describeClip(startedAt: string, r: Row, transcript: Row[]): { elapsed: string; length: string; said: string } {
  const p = r.payload ?? {}
  const clipStart = typeof p.startedAt === 'number' ? p.startedAt : new Date(r.item_timestamp).getTime()
  const trimStart = Number(p.trimStartMs ?? 0)
  const trimEnd = Number(p.trimEndMs ?? r.duration_ms ?? 0)
  const from = clipStart + trimStart
  const to = clipStart + trimEnd
  const said = transcript
    .filter((t) => {
      const at = new Date(t.item_timestamp).getTime()
      return at >= from - 5_000 && at <= to
    })
    .map((t) => t.text)
    .join(' ')
  const seconds = Math.max(0, Math.round((trimEnd - trimStart) / 1000))
  return {
    elapsed: formatElapsed(startedAt, new Date(from).toISOString()),
    length: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    said,
  }
}

// ---- Copied from generate-deck (keep in step) ------------------------------

function formatElapsed(startedAtIso: string, itemIso: string): string {
  const totalSec = Math.max(0, Math.round((new Date(itemIso).getTime() - new Date(startedAtIso).getTime()) / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = (totalSec % 60).toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function formatQrLinks(startedAt: string, photoRows: { text?: string | null; item_timestamp: string }[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const row of photoRows) {
    for (const line of (row.text ?? '').split('\n')) {
      if (!line.startsWith('QR code: ')) continue
      const link = line.slice('QR code: '.length).trim()
      if (!link || seen.has(link)) continue
      seen.add(link)
      lines.push(`- [${formatElapsed(startedAt, row.item_timestamp)}] ${link}`)
    }
  }
  return lines.length ? lines.join('\n') : '(None.)'
}

function formatSlideText(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const codes = lines.filter((l) => l.startsWith('QR code: ')).map((l) => l.slice('QR code: '.length))
  const flat = lines.filter((l) => !l.startsWith('QR code: ')).join(' / ')
  const qr = codes.length ? ` -- QR code on it links to: ${codes.join(', ')}` : ''
  if (!flat) return qr
  return ` -- text on it: "${flat.length > 600 ? `${flat.slice(0, 600)}…` : flat}"${qr}`
}

function formatHighlights(
  startedAt: string,
  highlights: { item_timestamp: string }[],
  transcriptSegments: { text: string | null; item_timestamp: string }[],
  notes: { text: string | null; item_timestamp: string }[],
): string {
  if (highlights.length === 0) return '(None marked.)'
  return highlights.map((h) => {
    const at = new Date(h.item_timestamp).getTime()
    const near = (iso: string) => {
      const t = new Date(iso).getTime()
      return t >= at - 90_000 && t <= at + 20_000
    }
    const said = transcriptSegments.filter((t) => near(t.item_timestamp)).map((t) => t.text).join(' ')
    const noted = notes.filter((n) => near(n.item_timestamp)).map((n) => `"${n.text}"`).join('; ')
    return `- [${formatElapsed(startedAt, h.item_timestamp)}]${said ? ` -- being said around it: "${said}"` : ''}${noted ? ` -- noted around it: ${noted}` : ''}`
  }).join('\n')
}

function formatEnrichment(rows: { subtype: string | null; payload: Record<string, unknown> | null }[]): string {
  if (rows.length === 0) return '(No enrichment was extracted for this session.)'
  const lines: string[] = []
  for (const row of rows) {
    const p = row.payload ?? {}
    switch (row.subtype) {
      case 'summary':
        lines.push(`Summary: ${p.text}`)
        break
      case 'speaker_bio':
        lines.push(`Speaker: ${p.name} -- ${p.role} at ${p.org}. ${p.description}`)
        break
      case 'action_items':
        for (const item of (Array.isArray(p.items) ? p.items : []) as { text: string; context: string }[]) {
          lines.push(`Action item: ${item.text} (context: ${item.context})`)
        }
        break
      case 'references':
        for (const item of (Array.isArray(p.items) ? p.items : []) as { title: string; source: string; description: string; url: string | null }[]) {
          lines.push(`Reference: ${item.title} -- ${item.source}. ${item.description}${item.url ? ` (${item.url})` : ''}`)
        }
        break
      case 'acronyms':
        for (const item of (Array.isArray(p.items) ? p.items : []) as { term: string; expansion: string }[]) {
          lines.push(`Acronym: ${item.term} = ${item.expansion}`)
        }
        break
    }
  }
  return lines.map((l) => `- ${l}`).join('\n')
}

function presentationRequirements(o: PresentationOptions): string {
  const times = o.chapterTimes
  const structure: string[] = []
  structure.push(`Title block: the talk title${o.speakerBio ? ', the speaker (from the speaker bio, if present)' : ''} and a one-sentence intro of what the talk was about. Compact -- not a full-screen hero.${o.speakerBio ? '' : ' Leave out who the speaker is and their bio.'}`)
  if (o.tldr) {
    structure.push(`TL;DR: the 3 to 6 takeaways someone should leave with, each one or two sentences, so a reader who stops here has the whole point. Build it from the extracted summary if present, and make sure the key moments (below) are in it.${o.quotes ? " Then 2 or 3 of the speaker's strongest lines from the transcript as quotes (no times), tidied only where the transcription garbled a word." : ''}${o.actionItems ? ' Put the action items here too, as a short list, if there are any.' : ''}`)
  }
  if (o.chapterBar) {
    structure.push(`Chapter bar: a header that sticks to the top of the screen once the reader scrolls past the ${o.tldr ? 'TL;DR' : 'title block'}, linking to each chapter by anchor (#id). One row: on a narrow screen it scrolls sideways rather than wrapping. Short chapter names${times ? ', and the chapter\'s elapsed time (e.g. "12:40") beside each' : ''}. With JavaScript, highlight the chapter currently being read; without it, the links still work. Give each chapter heading scroll-margin-top so the bar doesn't cover it after a jump.`)
  }
  const chapterBody = o.length === 'short'
    ? 'Keep it short: each chapter is its heading and one paragraph that sums the chapter up, plus at most one photo or chart if it is essential. No further detail.'
    : 'Open each chapter with its heading and one paragraph that sums the chapter up on its own; wrap everything after that paragraph (further paragraphs, photos, quotes, charts) in a single <div class="cc-more">. The app removes those divs to make a short version for quick sharing, so the page must read well without them, and nothing outside them may point into them.'
  structure.push(`Chapters: the talk divided into 3 to 8 chapters in the order it actually unfolded, each with a heading${times ? ' and its starting elapsed time' : ''}. Synthesize and organize the notes and transcript into clear prose -- don't dump either source verbatim. Use the transcript to fill gaps the notes left out${o.quotes ? ' and to surface direct quotes worth calling out' : ''}, but let the notes drive what the attendee found important. ${chapterBody}`)
  if (o.qa) structure.push('Q&A: if the transcript has audience questions with the speaker\'s answers (usually near the end), a last chapter called "Q&A" with each question, short and tidied, and the gist of the answer. Leave it out entirely if there was no Q&A.')
  if (o.glossary) structure.push('Glossary: a short list of the acronyms and technical terms the talk used, each with a one-line explanation, alphabetical -- in addition to explaining them in the text. Leave it out if there are fewer than three.')
  const closing: string[] = []
  if (o.actionItems && !o.tldr) closing.push('the action items, as a short list, if there are any')
  if (o.references) closing.push('the references (as links where there\'s a URL -- including every link from a QR code on a photo, titled by what the slide says it\'s for) and anything else worth following up on')
  if (closing.length) structure.push(`A short closing section with ${closing.join(', then ')}.`)

  const keyMomentsWhere = o.tldr ? 'belongs in the TL;DR and gets a callout in its chapter' : 'gets a callout in its chapter'
  const rules: string[] = [
    'Return ONLY a single complete HTML document -- no markdown fences, no commentary before or after.',
    'The document must be fully self-contained: all CSS and JavaScript inline in the file, no external resources except Google Fonts if you want them.',
    `Page structure, in this order:\n${structure.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`,
    'Text never overlaps a photo or chart: no text on top of images, no sticky or pinned backgrounds that text scrolls over, no full-bleed image with a caption laid across it. Every photo and chart sits in the flow of the page with its caption below it.',
    o.quotes
      ? `Quotes: set the speaker's own words apart wherever they appear -- ${o.tldr ? 'in the TL;DR and ' : ''}as pull quotes in the chapters -- with a distinct, consistent style that fits the theme (larger or contrasting type, an accent rule or oversized quotation mark${o.speakerBio ? ', the speaker\'s name beneath when known' : ''}). Never put a time on a quote. Keep each one short: a sentence or two.`
      : "No quote callouts: don't set the speaker's words apart as pull quotes; work their points into the prose.",
    o.motion === 'scrolly'
      ? 'Scrollytelling: as the reader scrolls, each chapter\'s heading, paragraphs, photos, quotes and charts ease into place (short, gentle fades and slides, each triggered once as it enters the screen, using IntersectionObserver). Charts may build as they come into view. The page must still be complete without JavaScript and with prefers-reduced-motion: reduce -- add the hidden starting state from script, never from CSS alone, so nothing is invisible if the script doesn\'t run. No parallax and no scroll-jacking: the page scrolls normally.'
      : 'No decorative motion: no fade-ins or slide-ins as things scroll into view, no parallax, no scroll progress bar. Everything is simply there when the reader arrives.',
    o.charts === 'interactive'
      ? 'Charts: when the talk presented a data visualization (a chart, graph or diagram of data on a slide, or one the speaker described), rebuild it in the page as an interactive inline-SVG chart using the real numbers shown -- hover or tap to read exact values, and toggles, filters or a short animated build where that helps explain what the speaker was showing. Put it next to the photo of that slide, and note under it that it\'s a recreation from the talk. Never invent numbers: if the values on the slide can\'t be read, show the photo alone. If the talk had no data visualizations, the page has no interactive charts.'
      : 'Charts: don\'t rebuild charts or make anything interactive; show the photo of the slide and describe what it showed in the text.',
    `The "Remember this" moments are the attendee's own signal of what mattered most. Each one ${keyMomentsWhere}, built from what was being said and shown at that point (a tap usually lands just after the thing it marks, so the transcript just before it is usually what it's about). Don't label them with the phrase "Remember this"; just let them read as the key moments. If there are none, ignore this.`,
    `Notes, transcript lines and photos marked ★ were starred by the attendee afterwards as entries that mattered most. Give them the same weight as the "Remember this" moments: ${o.tldr ? 'in the TL;DR and ' : ''}called out in their chapter. Don't show the ★ itself or call them "starred".`,
    `${o.photos === 'smart' ? 'Choose the photos that together tell the talk\'s whole story: every slide that carries a key point, chart, diagram, result or example, the ones near the key moments, and every ★ photo. Leave out ones that add nothing to the page -- repeats and near-repeats of a slide, blurry or partial shots, title, agenda, transition and thank-you slides -- however many that is. ' : ''}Place each photo ${o.photos === 'smart' ? 'you use ' : ''}in the chapter that matches its elapsed time (not an appendix dumped at the end), ${o.photoLayout === 'gallery' ? 'as a gallery: the chapter\'s photos in a grid of thumbnails (2 or 3 across on a phone, more on a wide screen; each thumbnail shows the whole photo, object-fit: contain on a quiet background, never cropped), and a tap on one opens it full size in a lightbox (a script that shows that same <img> element\'s src, closing with a tap, Escape or a swipe) -- use each placeholder only in its one <img>, never in a link or anywhere else, since the app embeds each photo wherever its placeholder appears; without JavaScript the grid still shows every whole photo. A single photo in a chapter sits full width' : 'full width of the text column, never cropped so a slide\'s content is cut off'}. Reference ${o.photos === 'smart' ? 'each photo you use' : 'EACH photo'} using an <img> tag whose src is EXACTLY its placeholder token, e.g. <img src="PHOTO_1">. Do not invent placeholder names and do not attempt to embed real image data yourself.`,
    'Audio clips (if any are listed): place each one in the chapter that matches its elapsed time, at the point in the text where what\'s said in it fits, as <figure class="cc-audio"><audio controls preload="metadata" src="AUDIO_1"></audio><figcaption>...</figcaption></figure> -- the src EXACTLY its placeholder token. The caption is one line saying what the speaker says in the clip: a short quote of their strongest words in it, or a brief paraphrase if the transcript is garbled. No time in the caption. The clips are recordings the attendee chose to keep, so mark them clearly as the speaker\'s voice (e.g. a small "Listen" label or speaker icon) and style the player to fit the theme, the full width of the text column. ' + (o.audioClips === 'smart' ? 'Use only the clips that add something the text can\'t -- the speaker\'s strongest or most telling moments -- each at most once; leave out the rest.' : 'Use every clip once.') + ' Don\'t invent placeholders.',
    'Video clips (if any are listed): place each one in the chapter that matches its elapsed time, at the point in the text where what it shows fits, as <figure class="cc-video"><video controls playsinline preload="metadata" poster="VIDEO_1_POSTER" src="VIDEO_1"></video><figcaption>...</figcaption></figure> -- src EXACTLY its placeholder token and poster that token followed by _POSTER (leave poster out if the clip has no frames listed). The caption is one line saying what the clip shows, from its frames and what was said during it. No time in the caption. Full width of the text column, the video at its own shape (width 100%, height auto, never cropped), styled to fit the theme. ' + (o.videoClips === 'smart' ? 'Use only the clips that show something the photos and text can\'t -- a demo, an animation, something moving -- each at most once; leave out the rest.' : 'Use every clip once.') + ' Don\'t invent placeholders.',
    'Work acronym expansions into the text where each term first appears, not as a list.',
    'In the <head>, add <meta name="cc-cover" content="PHOTO_n"> naming the ONE photo that best shows what this talk was about -- a key chart, diagram, result or core idea -- never the title slide, an agenda, a photo of the speaker or audience, or a thank-you/questions slide. The app shows it as the talk\'s thumbnail. Leave the tag out if there are no photos.',
    `${o.theme === 'auto' ? 'Pick a visual theme (color palette, type) that fits the subject matter of the talk.' : `Use a ${o.theme} theme (${o.theme === 'dark' ? 'dark background, light text' : 'light background, dark text'}), with type that fits the subject of the talk.`}${/^#[0-9a-fA-F]{6}$/.test(o.accent) ? ` Use ${o.accent} as the accent color (links, rules, highlights, chart emphasis), adjusted only if needed for readable contrast.` : ''} Keep it tasteful and readable: a comfortable text column (about 65 characters wide), generous spacing, legibility over spectacle. On a narrow phone screen keep at least 20px between all text and the left and right edges of the screen (padding on the page or its main column), so nothing touches the edge.`,
  ]
  if (!times) rules.push("Don't show elapsed times (like 12:40) anywhere on the page.")
  rules.push(o.readingLevel === 'plain'
    ? 'Reading level: plain language. Short sentences and everyday words; explain every technical term simply where it first appears, and prefer the plain word wherever one exists.'
    : o.readingLevel === 'general'
      ? 'Reading level: for a smart reader from outside the field. Keep the talk\'s technical terms, but explain each briefly where it first appears.'
      : 'Reading level: for people in the field. Use its technical terms as the speaker did, without explaining the basics.')
  if (o.voice === 'first_person') rules.push("Voice: write as the attendee's own notes, in the first person (\"I came away with...\", \"The speaker showed us...\").")
  if (o.voice === 'brief') rules.push('Voice: write for a busy reader -- short sentences, plain words, bullet points where they help, no flourishes.')
  rules.push(o.language === 'auto'
    ? 'Write in the language the talk was given in.'
    : `Write the whole page in ${o.language}, including headings, the chapter bar and captions. Translate quotes too, and note once near the top that quotes are translated.`)
  rules.push(
    `The file gets shared and opened in many places -- Safari, Chrome, email attachments, and the iOS Files/Messages quick-look preview, which does NOT run JavaScript. The page must be fully readable with JavaScript disabled: all text, photos, charts and chapter links visible and working.${o.charts === 'interactive' ? ' Draw every chart as static SVG markup in the HTML so it shows without scripts, and let script add the interaction on top.' : ''}`,
    "Let the page itself scroll: the document/window is the scroller. Don't put the content inside a fixed-height element with its own overflow scrolling, and don't set overflow: hidden on html or body.",
  )
  return rules.map((r) => `- ${r}`).join('\n')
}

function readMinutes(html: string): number {
  const text = html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  return Math.max(1, Math.round(words / 230))
}

function stripCodeFence(text: string): string {
  let page = text.trim()
  page = page.replace(/^```[a-z]*[ \t]*\r?\n/i, '').replace(/\r?\n?```\s*$/, '')
  const start = page.search(/<!doctype html|<html[\s>]/i)
  if (start > 0) page = page.slice(start)
  const end = page.toLowerCase().lastIndexOf('</html>')
  if (end !== -1) page = page.slice(0, end + '</html>'.length)
  return page
}

function substitutePhotos(html: string, photos: { placeholder: string; url: string }[]): string {
  let result = html
  for (const photo of photos) {
    result = result.split(`"${photo.placeholder}"`).join(`"${photo.url}"`)
    result = result.split(`'${photo.placeholder}'`).join(`'${photo.url}'`)
  }
  return result
}
