// Guided tours (driver.js): one for the home screen, one for a session.
//
// The home tour runs from the menu's Tutorial item, and by itself the first
// time someone opens the app with no sessions. Finishing it queues the
// session tour, which runs the next time a session is opened.
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'

/** Asks the screen to open (or close, with null) the swipe panel on its
 * first row, so a step can show what's behind a swipe. */
export const TOUR_REVEAL_EVENT = 'cc-tour-reveal'
export type TourRevealTarget = 'session-card' | 'timeline-item'

function reveal(target: TourRevealTarget | null) {
  window.dispatchEvent(new CustomEvent<TourRevealTarget | null>(TOUR_REVEAL_EVENT, { detail: target }))
}

/** A step that opens the first row's swipe panel while it's showing. */
function swipeStep(target: TourRevealTarget, element: string, title: string, description: string): DriveStep {
  return {
    element,
    onHighlightStarted: () => reveal(target),
    onDeselected: () => reveal(null),
    popover: { title, description, side: 'bottom', align: 'end' },
  }
}

const HOME_SEEN_KEY = 'cc-tour-home-seen'
const SESSION_PENDING_KEY = 'cc-tour-session-pending'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private mode or storage off: the tour just won't remember.
  }
}

/** Keep only steps whose element is on screen (or that point at nothing). */
function onScreen(steps: DriveStep[]): DriveStep[] {
  return steps.filter((step) => {
    if (!step.element) return true
    const el = typeof step.element === 'string' ? document.querySelector(step.element) : step.element
    if (!el) return false
    const box = (el as Element).getBoundingClientRect()
    return box.width > 0 && box.height > 0
  })
}

function run(steps: DriveStep[], onFinish?: () => void) {
  const shown = onScreen(steps)
  if (shown.length === 0) return
  const tour = driver({
    steps: shown,
    showProgress: shown.length > 1,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'cc-tour',
    overlayColor: '#000',
    overlayOpacity: 0.72,
    stagePadding: 6,
    stageRadius: 14,
    popoverOffset: 12,
    smoothScroll: true,
    // Taps on the highlighted control would leave the tour mid-step.
    disableActiveInteraction: true,
    onDestroyed: () => {
      reveal(null)
      onFinish?.()
    },
  })
  tour.drive()
}

export function shouldAutoStartHomeTour(sessionCount: number): boolean {
  return sessionCount === 0 && read(HOME_SEEN_KEY) === null
}

export function startHomeTour() {
  run(
    [
      {
        popover: {
          title: 'Welcome to Conference Capture',
          description:
            'Capture a talk as it happens: your notes, photos of the slides, and the speaker’s words. Afterwards, turn it into a presentation to keep and share.',
        },
      },
      {
        element: '.new-session-btn',
        popover: {
          title: 'Start a session',
          description: 'Tap when a talk begins. Audio starts recording and transcribing right away.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '.session-card',
        popover: {
          title: 'Your sessions',
          description: 'Tap one to open it. Swipe left on it for more.',
          side: 'bottom',
          align: 'start',
        },
      },
      swipeStep(
        'session-card',
        '.home-screen .swipe-actions',
        'Swipe left on a session',
        'Build its presentation. Once it’s ready: view it, share it, or rebuild it after you add more. The last button deletes the session.',
      ),
      {
        element: '.home-searchbox',
        popover: {
          title: 'Search and ask',
          description:
            'Find anything you captured: titles, notes, transcripts and text on slides. Or type a question and tap Ask Claude at the top of the results to get an answer from all your sessions.',
          side: 'top',
          align: 'end',
        },
      },
      {
        element: '.sort-menu__button',
        popover: {
          title: 'Sort',
          description: 'Newest or oldest first, last activity, name, or sessions with a presentation.',
          side: 'top',
          align: 'end',
        },
      },
      {
        element: '.home-header__menu',
        popover: {
          title: 'Menu',
          description:
            'Presentation options, your account and feedback. Replay this tour from Tutorial. Open a session next and we’ll show you around it.',
          side: 'bottom',
          align: 'end',
        },
      },
    ],
    () => {
      write(HOME_SEEN_KEY, '1')
      write(SESSION_PENDING_KEY, '1')
    },
  )
}

/** Runs the session tour if the home tour queued it. Call once the session
 * screen is on screen. */
export function maybeStartSessionTour() {
  if (read(SESSION_PENDING_KEY) === null) return
  write(SESSION_PENDING_KEY, null)
  run([
    {
      element: '.rec-pill',
      popover: {
        title: 'Recording',
        description: 'Audio records while the session is live. Tap to pause or resume; the time shows how long so far.',
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '.camera-trigger',
      popover: {
        title: 'Slides',
        description: 'Photograph a slide. It’s straightened and its text read, so your presentation can quote it.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '.note-add-row',
      popover: {
        title: 'Notes',
        description: 'Type a note any time. Each one is stamped with when it happened in the talk.',
        side: 'top',
        align: 'start',
      },
    },
    swipeStep(
      'timeline-item',
      '.capture-screen .swipe-actions',
      'Swipe left on anything here',
      'Save a photo to your phone. Star what mattered most and the presentation features it. Leave something out of the presentation and exports. Delete it. Or hold the handle and drag to move it.',
    ),
    {
      element: '.remember-btn',
      popover: {
        title: 'Remember this',
        description: 'Tap the star at a key moment. It saves a short clip and tells the presentation this part mattered.',
        side: 'top',
        align: 'end',
      },
    },
    {
      element: '.ask-btn',
      popover: {
        title: 'Ask',
        description: 'Ask questions about this session. Answers come from what you captured.',
        side: 'top',
        align: 'end',
      },
    },
    {
      popover: {
        title: 'When the talk ends',
        description: 'Go back and swipe left on the session to build its presentation.',
      },
    },
  ])
}
