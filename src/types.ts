export type SessionStatus = 'recording' | 'suspended' | 'enriching' | 'complete'
export type DeckStatus = 'none' | 'queued' | 'generating' | 'ready' | 'error'

export interface NoteItem {
  id: string
  type: 'note'
  text: string
  timestamp: number
  addedLater?: boolean
  excluded?: boolean
  /** Starred from the swipe menu: an entry that mattered, weighted up in the presentation and Ask. */
  starred?: boolean
  /** Explicit display/export order, set once the user drags this item -- absent means "sort by timestamp." */
  position?: number
}

export interface PhotoItem {
  id: string
  type: 'photo'
  /** Object URL for immediate display. Present once resolved (freshly captured, or lazily fetched from storage). */
  dataUrl?: string
  /** Storage path in the cc-photos bucket — the persisted source of truth. */
  photoPath: string
  caption: string
  /** Text read off the photo on-device (SlideScanner); '' when there was none. Absent until processed. */
  slideText?: string
  /** Still on the phone, queued to upload in the background (native only). */
  uploading?: boolean
  timestamp: number
  addedLater?: boolean
  excluded?: boolean
  starred?: boolean
  /** Explicit display/export order, set once the user drags this item -- absent means "sort by timestamp." */
  position?: number
}

export interface VideoItem {
  id: string
  type: 'video'
  /** Object URL for immediate playback. Present once resolved (freshly captured, or lazily fetched from storage). */
  dataUrl?: string
  /** Storage path in the cc-videos bucket — the persisted source of truth. */
  videoPath: string
  durationMs: number
  timestamp: number
  addedLater?: boolean
  excluded?: boolean
  starred?: boolean
}

export interface TranscriptItem {
  id: string
  type: 'transcript'
  text: string
  timestamp: number
  durationMs: number
  excluded?: boolean
  starred?: boolean
}

/** "Remember this": a tap marking the moment as one that mattered, so the
 * presentation gives it -- and what was said around it -- more weight. */
export interface HighlightItem {
  id: string
  type: 'highlight'
  timestamp: number
  excluded?: boolean
  starred?: boolean
}

interface BaseEnrichmentItem {
  id: string
  type: 'enrichment'
  timestamp: number
  excluded?: boolean
  starred?: boolean
}

export interface EnrichmentSummaryItem extends BaseEnrichmentItem {
  subtype: 'summary'
  text: string
}

/** All of a session's action items in one entry, not one row per item --
 * read together like a short list, not scattered through the timeline. */
export interface EnrichmentActionItemsItem extends BaseEnrichmentItem {
  subtype: 'action_items'
  items: { text: string; context: string }[]
}

/** All of a session's references in one entry -- see EnrichmentActionItemsItem. */
export interface EnrichmentReferencesItem extends BaseEnrichmentItem {
  subtype: 'references'
  items: { title: string; source: string; description: string; url: string | null }[]
}

export interface EnrichmentSpeakerBioItem extends BaseEnrichmentItem {
  subtype: 'speaker_bio'
  name: string
  role: string
  org: string
  description: string
}

/** All of a session's acronyms in one entry -- see EnrichmentActionItemsItem. */
export interface EnrichmentAcronymsItem extends BaseEnrichmentItem {
  subtype: 'acronyms'
  items: { term: string; expansion: string }[]
}

export type EnrichmentItemData =
  | EnrichmentSummaryItem
  | EnrichmentActionItemsItem
  | EnrichmentReferencesItem
  | EnrichmentSpeakerBioItem
  | EnrichmentAcronymsItem

export type TimelineItemData = NoteItem | PhotoItem | VideoItem | TranscriptItem | HighlightItem | EnrichmentItemData

export interface Session {
  id: string
  title: string
  status: SessionStatus
  startedAt: number
  /** Milliseconds of recorded time accumulated across resumes, not counting the current live span. */
  accumulatedMs: number
  /** Set while status is 'recording' — the wall-clock time the current live span began. */
  liveSpanStartedAt: number | null
  items: TimelineItemData[]
  deckStatus: DeckStatus
  /** Path in the cc-decks bucket once deckStatus is 'ready'. */
  deckPath: string | null
  deckError: string | null
  deckGeneratedAt: number | null
  enrichmentError: string | null
  /** Last time Enhancement successfully ran, or null if it never has. Gates
   * whether Enhancement can run again -- it needs new transcript captured
   * after this moment to have anything to do. */
  lastEnrichedAt: number | null
  /** Last time any field on this session (or its items) was saved. */
  updatedAt: number
  /** When the user pinned it to the top of the home list, or null. */
  pinnedAt: number | null
  /** The slide Sparkle chose as the talk's most telling image, if any. */
  deckCoverPhotoId: string | null
  /** About how long the presentation takes to read, if known. */
  deckReadMinutes: number | null
}
