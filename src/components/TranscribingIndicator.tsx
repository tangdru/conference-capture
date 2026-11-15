import { formatShortElapsed } from '../format'
import './TranscribingIndicator.css'

export type TranscribingState = 'listening' | 'quiet' | 'error' | 'off'

interface TranscribingIndicatorProps {
  state: TranscribingState
  /** Words were heard in the last few seconds: the bars move. */
  hearing: boolean
  /** Time recorded so far in this session, in ms. */
  recordedMs: number
  /** Why it stopped, for 'error'. */
  message?: string | null
}

// Stands in for the scrolling transcript while it's hidden during a talk
// (Session options > Show transcript while live off), so you can trust it's
// still listening: moving bars as words are heard and the time recorded, at
// the top of the timeline; amber when nothing has been heard for a while, red
// if it stopped.
export function TranscribingIndicator({ state, hearing, recordedMs, message }: TranscribingIndicatorProps) {
  const label =
    state === 'off'
      ? 'Not transcribing'
      : state === 'error'
        ? 'Transcription stopped'
        : state === 'quiet'
          ? 'Not hearing anything'
          : 'Transcribing'
  const detail =
    state === 'off'
      ? 'Live transcript is off in Session options'
      : state === 'error'
        ? message || 'Pause and resume to try again'
        : state === 'quiet'
          ? 'Still listening. Is the mic covered?'
          : null
  return (
    <div
      className={`transcribing transcribing--${state}${hearing && state === 'listening' ? ' is-hearing' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${label}, ${formatShortElapsed(recordedMs)} recorded.${detail ? ` ${detail}` : ''}`}
    >
      <span className="transcribing__bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="transcribing__text" aria-hidden="true">
        <span className="transcribing__top">
          <span className="transcribing__label">{label}</span>
          <span className="transcribing__time">{formatShortElapsed(recordedMs)} recorded</span>
        </span>
        {detail && <span className="transcribing__detail">{detail}</span>}
      </span>
    </div>
  )
}
