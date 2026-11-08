// The app icon's two rings as a vector, for headers. Geometry from
// design/assets/make-app-icon.py (teal box 205..933, magenta 144..759 x
// 126..741); line widths are fixed in screen pixels so the rings stay
// legible this small, magenta about twice the teal like the icon.
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="100 82 880 898" fill="none" aria-hidden="true">
      <circle cx="569" cy="569" r="361" stroke="#00f0e0" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx="451.5" cy="433.5" r="302" stroke="#ff2d78" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
