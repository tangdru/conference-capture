import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this repo at https://<user>.github.io/conference-capture/
// The iOS build overrides this with --base=/ (see ios:sync), since Capacitor
// serves the app from capacitor://localhost/.
export default defineConfig({
  base: '/conference-capture/',
  plugins: [react()],
})
