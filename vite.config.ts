import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The iOS build number (CURRENT_PROJECT_VERSION), shown in the app's menu.
const appBuild =
  readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8').match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1] ?? '?'

// GitHub Pages serves this repo at https://<user>.github.io/conference-capture/
// The iOS build overrides this with --base=/ (see ios:sync), since Capacitor
// serves the app from capacitor://localhost/.
export default defineConfig({
  base: '/conference-capture/',
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify(appBuild) },
})
