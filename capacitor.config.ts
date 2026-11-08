import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tangdru.conferencecapture',
  appName: 'Conference Capture',
  webDir: 'dist',
  plugins: {
    // Don't resize the web view for the keyboard: screens lift themselves,
    // animated with it (see src/hooks/useKeyboardHeight.ts).
    Keyboard: { resize: 'none' },
  },
}

export default config
