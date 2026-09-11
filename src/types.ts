export type SessionStatus = 'recording' | 'suspended' | 'enriching' | 'complete'

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
  dataUrl: string
  caption: string
  timestamp: number
  addedLater?: boolean
}

export type TimelineItemData = NoteItem | PhotoItem

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
}
