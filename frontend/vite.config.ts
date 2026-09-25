import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API runs on :8000; proxying keeps the browser on one origin so SuperTokens
// session cookies work without CORS configuration in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' },
  },
})
