/** Line icons for note and photo counts, drawn in the text's own color.
 * By default each sits in a padded size x size square; pass `capHeight` to
 * crop to the drawing itself and make it exactly that tall, so it lines up
 * with the cap height of the text beside it. */
interface StatIconProps {
  size?: number
  capHeight?: number
}

// The drawings' bounds (stroke included) within their viewBoxes.
const NOTE_BOUNDS = { x: 1.3, y: 1.8, w: 14.9, h: 14.9 }
const PHOTO_BOUNDS = { x: 3.25, y: 4.25, w: 17.5, h: 15.5 }

function frame(viewBoxSize: number, bounds: typeof NOTE_BOUNDS, { size = 13, capHeight }: StatIconProps) {
  if (capHeight === undefined) {
    return { width: size, height: size, viewBox: `0 0 ${viewBoxSize} ${viewBoxSize}` }
  }
  return {
    width: (capHeight * bounds.w) / bounds.h,
    height: capHeight,
    viewBox: `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,
  }
}

export function NoteIcon(props: StatIconProps) {
  return (
    <svg {...frame(18, NOTE_BOUNDS, props)} fill="none" aria-hidden="true">
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

export function PhotoIcon(props: StatIconProps) {
  return (
    <svg {...frame(24, PHOTO_BOUNDS, props)} fill="none" aria-hidden="true">
      <path
        d="M4 8.5A1.5 1.5 0 015.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
