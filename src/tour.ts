// The guided tour (driver.js): one tour on the session list that covers the
// whole flow, from capturing a talk to sharing its presentation. What's
// inside a session is drawn in a popover, so nobody is walked through it
// while they're trying to take notes.
//
// It runs from the menu's Tutorial item, and by itself the first time
// someone opens the app with no sessions. Connecting to Claude queues a
// one-card Claude tour, for the next time the session list shows.
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

/** A step that may show centred instead when its element isn't there (no
 * sessions yet, say). */
type Step = DriveStep & { centerIfMissing?: boolean }

/** A step that opens the first session's swipe panel while it's showing. */
function swipeStep(element: string, title: string, description: string): Step {
  return {
    element,
    centerIfMissing: true,
    onHighlightStarted: () => reveal('session-card'),
    onDeselected: () => reveal(null),
    popover: { title, description, side: 'bottom', align: 'end' },
  }
}

// The session screen's own icons, for the drawing in step 3.
const ICON = {
  camera:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 015.5 7H8l1-2h6l1 2h2.5A1.5 1.5 0 0120 8.5v9A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5v-9z" stroke="var(--accent)" stroke-width="1.6"/><circle cx="12" cy="13" r="3.2" stroke="var(--accent)" stroke-width="1.6"/></svg>',
  star:
    '<svg viewBox="1.2 1.4 21.6 20.8" fill="none" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.2 1.3-6.5-4.9-4.5 6.6-.8L12 2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  clip:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.8 6.9v10.2M8.5 9.2v5.6M12.1 3.6v16.8M15.8 6.9v10.2M19.4 8.7v6.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  ask:
    '<svg viewBox="2.2 2.7 19.6 18.6" fill="none" aria-hidden="true"><path d="M4 5.5A2 2 0 016 3.5h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4.5 4v-4H6a2 2 0 01-2-2v-9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
}

/** The bottom of a session while a talk records, with what each part does. */
const SESSION_BAR = `
<div class="tour-bar" aria-hidden="true">
  <span class="tour-bar__rec"><span class="tour-bar__dot"></span>12:40</span>
  <span class="tour-bar__camera">${ICON.camera}</span>
  <span class="tour-bar__end">
    <span class="tour-bar__btn">${ICON.star}</span>
    <span class="tour-bar__btn">${ICON.clip}</span>
    <span class="tour-bar__btn tour-bar__btn--ask">${ICON.ask}</span>
  </span>
</div>
<ul class="tour-legend">
  <li><span class="tour-legend__icon"><span class="tour-bar__dot"></span></span><span>Tap the timer to pause or resume.</span></li>
  <li><span class="tour-legend__icon tour-legend__icon--accent">${ICON.camera}</span><span>Tap for a slide photo; it’s straightened and its text read. Hold the shutter for a video clip.</span></li>
  <li><span class="tour-legend__icon">${ICON.star}</span><span>Remember this: mark a key moment.</span></li>
  <li><span class="tour-legend__icon">${ICON.clip}</span><span>Chui’s audio: keep the speaker’s voice. Turn it on in Session options.</span></li>
  <li><span class="tour-legend__icon">${ICON.ask}</span><span>Ask Claude about this talk.</span></li>
  <li><span class="tour-legend__icon tour-legend__plus">+</span><span>Add a note any time; it’s stamped with the moment.</span></li>
</ul>`

const HOME_SEEN_KEY = 'cc-tour-home-seen'
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

/** Keep only steps whose element is on screen (or that point at nothing);
 * a step marked centerIfMissing shows centred instead of being dropped. */
function onScreen(steps: Step[]): DriveStep[] {
  const shown: DriveStep[] = []
  for (const { centerIfMissing, ...step } of steps) {
    if (!step.element) {
      shown.push(step)
      continue
    }
    const el = typeof step.element === 'string' ? document.querySelector(step.element) : step.element
    const box = el ? (el as Element).getBoundingClientRect() : null
    if (box && box.width > 0 && box.height > 0) shown.push(step)
    else if (centerIfMissing) {
      const { side: _side, align: _align, ...popover } = step.popover ?? {}
      shown.push({ popover })
    }
  }
  return shown
}

function run(steps: Step[], onFinish?: () => void) {
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
            'Capture a talk as it happens, star what matters, and turn it into a presentation to keep and share. Here’s how, in eight steps.',
        },
      },
      {
        element: '.new-session-btn',
        popover: {
          title: 'Start a session',
          description: 'Tap when a talk begins. Recording and the live transcript start right away.',
          side: 'top',
          align: 'start',
        },
      },
      {
        popover: {
          title: 'During the talk',
          description: SESSION_BAR,
          popoverClass: 'cc-tour cc-tour--wide',
        },
      },
      {
        popover: {
          title: 'After the talk',
          description:
            'Swipe left on anything in a session to star it, leave it out, save it or delete it. Tap a clip to trim it. What you star is what the presentation’s Starred and Smart choices pick from.',
        },
      },
      swipeStep(
        '.home-screen .swipe-actions',
        'Make a presentation',
        'Swipe left on a session and tap the sparkle. Claude writes the presentation with your Presentation options and saves it back here. Then tapping the session opens it.',
      ),
      swipeStep(
        '.home-screen .swipe-actions',
        'Share it',
        'Once the presentation is ready, the sparkle becomes Share. Link: anyone with it can open the presentation. Download: a file to AirDrop, email or keep. Clips are left out unless you turn them on in Session options.',
      ),
      {
        element: '.home-chat',
        popover: {
          title: 'Ask Claude',
          description:
            'Ask about all your talks here, or about one from inside it. Turn it on once in menu › Use in Claude.',
          side: 'top',
          align: 'end',
        },
      },
      {
        element: '.home-header__menu',
        popover: {
          title: 'Options',
          description:
            'Session options: how capturing works, like the transcript, Chui’s audio and video clips. Presentation options: what goes in, like which photos and clips, Q&A, a glossary and the reading level. Replay this tour from Tutorial.',
          side: 'bottom',
          align: 'end',
        },
      },
    ],
    () => write(HOME_SEEN_KEY, '1'),
  )
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
      element: '.home-chat',
      centerIfMissing: true,
      popover: {
        title: 'Claude is connected',
        description:
          'Once you tap Add in Claude, it can read your talks. Ask about all of them here, or one from inside it; the sparkle on a session makes its presentation. Not added yet? Open menu › Use in Claude.',
        side: 'top',
        align: 'end',
      },
    },
  ])
}
