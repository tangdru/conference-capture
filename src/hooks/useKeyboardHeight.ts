import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

/**
 * How much of the screen the on-screen keyboard covers, in CSS pixels.
 *
 * In the app the web view is never resized for the keyboard (see
 * capacitor.config.ts), so screens shrink themselves by this amount, with a
 * CSS transition, to look like the keyboard is pushing them up. The height
 * arrives as the keyboard *starts* sliding, so the two move together.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const show = Keyboard.addListener('keyboardWillShow', (info) => setHeight(info.keyboardHeight))
      const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0))
      return () => {
        show.then((h) => h.remove())
        hide.then((h) => h.remove())
      }
    }

    // Web: measure how much of the layout viewport the keyboard hides.
    const vv = window.visualViewport
    if (!vv) return
    let settle = 0
    const measure = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0)
      const covered = Math.max(0, window.innerHeight - vv.height)
      setHeight(covered > 80 ? covered : 0)
    }
    const onChange = () => {
      measure()
      window.clearTimeout(settle)
      settle = window.setTimeout(measure, 350)
    }
    vv.addEventListener('resize', onChange)
    vv.addEventListener('scroll', onChange)
    window.addEventListener('focusin', onChange)
    window.addEventListener('focusout', onChange)
    return () => {
      window.clearTimeout(settle)
      vv.removeEventListener('resize', onChange)
      vv.removeEventListener('scroll', onChange)
      window.removeEventListener('focusin', onChange)
      window.removeEventListener('focusout', onChange)
    }
  }, [])

  return height
}
