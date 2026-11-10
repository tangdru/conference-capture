import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tangdru.conferencecapture',
  appName: 'Conference Capture',
  webDir: 'dist',
  // The app's own dark background behind the web view, so starting up goes
  // dark launch screen -> app, not via a white flash while the page loads.
  backgroundColor: '#0F0F0D',
  plugins: {
    // Don't resize the web view for the keyboard: screens lift themselves,
    // animated with it (see src/hooks/useKeyboardHeight.ts).
    Keyboard: { resize: 'none' },
  },
}

export default config
