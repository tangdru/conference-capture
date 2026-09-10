import { useEffect, useRef, useState } from 'react'
import './NoteInput.css'

interface NoteInputProps {
  onCommit: (text: string) => void
}

export function NoteInput({ onCommit }: NoteInputProps) {
  const [active, setActive] = useState(false)
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (active) textareaRef.current?.focus()
  }, [active])

  function commit() {
    const trimmed = text.trim()
    if (trimmed) onCommit(trimmed)
    setText('')
    setActive(false)
  }

  function cancel() {
    setText('')
    setActive(false)
  }

  if (!active) {
    return (
      <button
        className="note-pill"
        onClick={() => setActive(true)}
        aria-label="Add a note"
      >
        Tap to add a note...
      </button>
    )
  }

  return (
    <div className="note-input-active">
      <textarea
        ref={textareaRef}
        className="note-input-active__field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
          // Return is preserved for paragraph breaks — it does not commit.
        }}
        placeholder="Type a note..."
        rows={1}
      />
      <button
        className="commit-button"
        onClick={commit}
        aria-label="Commit note"
        disabled={!text.trim()}
      >
        <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
          <circle cx="13" cy="13" r="11" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <path
            d="M8 13.5l3 3 7-7.5"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
