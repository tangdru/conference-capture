import { Capacitor, registerPlugin } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

/** ios/App/App/FeelPlugin.swift: the soft and rigid impacts. */
const Feel = registerPlugin<{ impact(options: { style: 'soft' | 'rigid' }): Promise<void> }>('Feel')

const native = Capacitor.isNativePlatform()

/** The app's haptics, by what they mean -- only in the iPhone app. */
export const feel = {
  /** A faint tick: a gesture has gone far enough (let go now and it acts),
   * or a swipe menu snapped open. */
  tick() {
    if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  },
  /** A crisp click: recording starts or resumes. */
  rigid() {
    if (native) void Feel.impact({ style: 'rigid' }).catch(() => {})
  },
  /** A cushioned bump: recording pauses, or a clip finishes by itself. */
  soft() {
    if (native) void Feel.impact({ style: 'soft' }).catch(() => {})
  },
  /** A solid tap: something lands, e.g. a presentation fully closed. */
  thud() {
    if (native) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
  },
}
