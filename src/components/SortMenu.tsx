import { useEffect, useRef, useState } from 'react'
import './SortMenu.css'

export type SessionSort = 'started' | 'oldest' | 'activity' | 'name' | 'deck'

export const SORT_OPTIONS: { value: SessionSort; label: string }[] = [
  { value: 'started', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'activity', label: 'Last activity' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'deck', label: 'Has presentation' },
]

interface SortMenuProps {
  value: SessionSort
  onChange: (value: SessionSort) => void
}

// A small iOS-style pull-down menu: the button shows the sort icon, the menu
// ticks the current choice.
export function SortMenu({ value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = SORT_OPTIONS.find((o) => o.value === value)?.label

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        className={`sort-menu__button${open ? ' sort-menu__button--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort sessions, currently ${current}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 4v16M7 20l-3.5-3.5M7 20l3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 20V4M17 4l-3.5 3.5M17 4l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="sort-menu__list" role="menu" aria-label="Sort sessions by">
          <p className="sort-menu__heading">Sort by</p>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              role="menuitemradio"
              aria-checked={option.value === value}
              className="sort-menu__item"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span className="sort-menu__check" aria-hidden="true">
                {option.value === value && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
