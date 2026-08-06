import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Set the base path to the repository name for GitHub Pages sub-directory hosting
  base: '/ryudai-book-selection/',
})
