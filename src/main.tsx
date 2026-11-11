import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedDeckPage } from './screens/SharedDeckPage'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

// Hide iOS's ⌃ ⌄ ✓ bar above the keyboard; every field has its own way out.
if (Capacitor.getPlatform() === 'ios') {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
  // Stop iOS scrolling the whole page to reveal a focused field; screens
  // lift themselves instead.
  Keyboard.setScroll({ isDisabled: true }).catch(() => {})
}

// A shared presentation's link (?p=<token>) opens it on its own, no sign-in.
const sharedToken = new URLSearchParams(window.location.search).get('p')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {sharedToken ? <SharedDeckPage token={sharedToken} /> : <App />}
  </StrictMode>,
)
