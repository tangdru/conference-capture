import type { Session } from '../types'
import { formatSessionSubtitle } from '../format'
import './ReviewStub.css'

interface ReviewStubProps {
  session: Session
  onBack: () => void
}

export function ReviewStub({ session, onBack }: ReviewStubProps) {
  const notes = session.items.filter((i) => i.type === 'note').length
  const photos = session.items.filter((i) => i.type === 'photo').length

  return (
    <div className="review-stub">
      <header className="review-stub__header">
        <button className="review-stub__back" onClick={onBack} aria-label="Back to home">
          ‹
        </button>
        <h1>{session.title}</h1>
      </header>
      <p className="review-stub__subtitle">{formatSessionSubtitle(session.startedAt)}</p>
      <p className="review-stub__stats">
        📝 {notes} notes &nbsp; 📷 {photos} photos
      </p>
      <div className="review-stub__notice">
        Review, AI enrichment, and export aren't designed yet — this session's captures are safe
        and waiting for Task 8 onward in the design plan.
      </div>
    </div>
  )
}
