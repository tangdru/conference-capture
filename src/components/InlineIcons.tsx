/** Small line icons that sit inside a line of text, drawn in the text's own
 * color. Each viewBox is cropped to the drawing itself (stroke included), and
 * the .inline-icon class sizes it to the text's cap height -- so whatever the
 * font size, an icon is exactly as tall as the capitals beside it. Put them in
 * containers that align to the baseline so they sit on it like a letter. */

export function NoteIcon() {
  return (
    <svg className="inline-icon" viewBox="1.3 1.8 14.9 14.9" fill="none" aria-hidden="true">
      <path
        d="M12.5 2.5l3 3L6 15l-4 1 1-4L12.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 4.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PhotoIcon() {
  return (
    <svg className="inline-icon" viewBox="3.25 4.25 17.5 15.5" fill="none" aria-hidden="true">
      <path
        d="M4 8.5A1.5 1.5 0 015.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function WarningIcon() {
  return (
    <svg className="inline-icon" viewBox="1.6 2.6 20.8 18.3" fill="none" aria-hidden="true">
      <path d="M12 3.5L21.5 20H2.5L12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="10" x2="12" y2="14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg className="inline-icon" viewBox="3.75 5.75 18.5 14.5" aria-hidden="true">
      <path
        d="M5 13.5l5.5 5.5L21 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A ready presentation (the swipe row's board on a stand, cropped). */
export function PresentationIcon() {
  return (
    <svg className="inline-icon" viewBox="1.5 3 23 21.5" fill="none" aria-hidden="true">
      <path d="M2.5 4h21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="4" width="18" height="12.5" rx="1" stroke="currentColor" strokeWidth="2" />
      <path
        d="M13 16.5V20M13 20l-4 3.5M13 20l4 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 13v-2.5M13 13V8.5M17 13v-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Something failed: an exclamation mark in a circle. */
export function ErrorIcon() {
  return (
    <svg className="inline-icon" viewBox="1 1 22 22" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </svg>
  )
}
