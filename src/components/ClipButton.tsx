import { useEffect, useState } from 'react'
import { useActiveClip } from '../audioClips'

/** The clip button: a waveform, or while a clip records, its seconds left (a tap
 * then stops it early). */
export function ClipButton({ className, onTap }: { className: string; onTap: () => void }) {
  const active = useActiveClip()
  const [now, setNow] = useState(Date.now())
  const left = active ? Math.ceil((active.endsAt - now) / 1000) : 0
  const counting = left > 0

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [active])

  return (
    <button
      className={`${className}${counting ? ` ${className}--recording` : ''}`}
      onClick={onTap}
      aria-label={counting ? `Recording clip, ${left} seconds left. Tap to stop` : 'Record a clip: 15 seconds before and 45 after'}
    >
      {counting ? (
        <span className="clip-btn__count mono-timestamp">{left}</span>
      ) : (
        <svg className="inline-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4.8 6.9v10.2M8.5 9.2v5.6M12.1 3.6v16.8M15.8 6.9v10.2M19.4 8.7v6.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
