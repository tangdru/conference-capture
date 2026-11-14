// Guided tours (driver.js): one for the home screen, one for a session.
//
// The home tour runs from the menu's Tutorial item, and by itself the first
// time someone opens the app with no sessions. Finishing it queues the
// session tour, which runs the next time a session is opened. Connecting to
// Claude queues the Claude tour, for the next time the session list shows.
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
const CLAUDE_PENDING_KEY = 'cc-tour-claude-pending'

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
          description: 'Tap one to open it. Once its presentation is built, the card shows a slide and the speaker, and a tap opens the presentation. Swipe left on it for more.',
          side: 'bottom',
          align: 'start',
        },
      },
      swipeStep(
        'session-card',
        '.home-screen .swipe-actions',
        'Swipe left on a session',
        'Edit opens the session itself. The sparkle builds its presentation in Claude, or once it’s ready, share it or rebuild it after you add more. Pin keeps a session at the top of the list. The last button deletes it.',
      ),
      {
        element: '.home-chat',
        popover: {
          title: 'Ask Claude',
          description:
            'Opens the Claude app to ask about all your talks: what was said, what’s on the slides, what to follow up on. Connect Claude once to use it.',
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
        title: 'Ask Claude about this talk',
        description: 'Opens the Claude app ready to ask about this session. Answers come from what you captured.',
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

/** Queues the Claude tour (after tapping Connect to Claude). */
export function queueClaudeTour() {
  write(CLAUDE_PENDING_KEY, '1')
}

/** Runs the Claude tour if connecting queued it. Call when the session list
 * is on screen, e.g. on coming back from adding the connector in Claude. */
export function maybeStartClaudeTour() {
  if (read(CLAUDE_PENDING_KEY) === null) return
  if (document.querySelector('.driver-popover')) return
  write(CLAUDE_PENDING_KEY, null)
  run([
    {
      popover: {
        title: 'Claude is connected',
        description:
          'Once you tap Add in Claude, it can read your talks. Here’s where to use it. If you haven’t added it yet, open menu › Use in Claude.',
      },
    },
    {
      element: '.home-chat',
      popover: {
        title: 'Ask Claude',
        description: 'Opens a new Claude chat about your sessions. Ask anything across all your talks.',
        side: 'top',
        align: 'end',
      },
    },
    swipeStep(
      'session-card',
      '.home-screen .swipe-actions',
      'Make a presentation',
      'Swipe left on a session and tap the sparkle. Claude opens ready to write the presentation with your Presentation options. Tap send: it saves the presentation back here, with the summary, action items and other entries added to the session.',
    ),
    {
      popover: {
        title: 'Inside a session',
        description: 'The speech bubble at the bottom right opens Claude ready to ask about that one talk.',
      },
    },
  ])
}
