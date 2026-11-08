import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

// Hide iOS's ⌃ ⌄ ✓ bar above the keyboard; every field has its own way out.
if (Capacitor.getPlatform() === 'ios') {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
