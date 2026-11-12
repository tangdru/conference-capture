import { useEffect, useState } from 'react'
import { useActiveClip } from '../audioClips'

/** The clip button: a mic, or while a clip records, its seconds left (a tap
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
          <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
