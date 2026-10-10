export type SessionStatus = 'recording' | 'suspended' | 'enriching' | 'complete'
export type DeckStatus = 'none' | 'generating' | 'ready' | 'error'

export interface NoteItem {
  id: string
  type: 'note'
  text: string
  timestamp: number
  addedLater?: boolean
  excluded?: boolean
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
  timestamp: number
  addedLater?: boolean
  excluded?: boolean
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
}

export interface TranscriptItem {
  id: string
  type: 'transcript'
  text: string
  timestamp: number
  durationMs: number
  excluded?: boolean
}

interface BaseEnrichmentItem {
  id: string
  type: 'enrichment'
  timestamp: number
  excluded?: boolean
}

export interface EnrichmentSummaryItem extends BaseEnrichmentItem {
  subtype: 'summary'
  text: string
}

export interface EnrichmentActionItem extends BaseEnrichmentItem {
  subtype: 'action_item'
  text: string
  context: string
}

export interface EnrichmentReferenceItem extends BaseEnrichmentItem {
  subtype: 'reference'
  title: string
  source: string
  description: string
  url: string | null
}

export interface EnrichmentSpeakerBioItem extends BaseEnrichmentItem {
  subtype: 'speaker_bio'
  name: string
  role: string
  org: string
  description: string
}

export interface EnrichmentAcronymItem extends BaseEnrichmentItem {
  subtype: 'acronym'
  term: string
  expansion: string
}

export type EnrichmentItemData =
  | EnrichmentSummaryItem
  | EnrichmentActionItem
  | EnrichmentReferenceItem
  | EnrichmentSpeakerBioItem
  | EnrichmentAcronymItem

export type TimelineItemData = NoteItem | PhotoItem | VideoItem | TranscriptItem | EnrichmentItemData

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
  /** Last time any field on this session (or its items) was saved. */
  updatedAt: number
}
