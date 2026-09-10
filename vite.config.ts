import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this repo at https://<user>.github.io/conference-capture/
export default defineConfig({
  base: '/conference-capture/',
  plugins: [react()],
})
