export type SessionStatus = 'recording' | 'suspended' | 'enriching' | 'complete'
export type DeckStatus = 'none' | 'generating' | 'ready' | 'error'

export interface NoteItem {
  id: string
  type: 'note'
  text: string
  timestamp: number
  addedLater?: boolean
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
}

export type TimelineItemData = NoteItem | PhotoItem | VideoItem

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
  /** Last time any field on this session (or its items) was saved. */
  updatedAt: number
}
