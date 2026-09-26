import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const DAY = 24 * 60 * 60

// The API runs on :8000; proxying keeps the browser on one origin so SuperTokens
// session cookies work without CORS configuration in development.
export default defineConfig({
  plugins: [
    react(),
    // Makes the web app installable, and keeps it and what people last viewed on the device
    // so it opens offline. The service worker only exists in production builds: to try it,
    // run `npm run build && npm run preview` alongside the API.
    VitePWA({
      // An open app shows a "New version" bar (components/AppStatus) instead of reloading itself.
      registerType: 'prompt',
      injectRegister: false,
      // The icons are already stored with the rest of the built files (globPatterns below).
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'TheFamilyVine',
        short_name: 'FamilyVine',
        description: 'Your family tree, shared with your family.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f6f3',
        theme_color: '#f7f6f3',
        // Made from the favicon by `npm run gen:icons` (see pwa-assets.config.js).
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Look after the page from the very first visit, so its data is kept for offline use too.
        // (Updates still wait for "Reload".)
        clientsClaim: true,
        // Pages open offline from the stored app; the API's own paths never get the page instead.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // A photo's files never change, so a stored copy is always right.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /^\/api\/trees\/[^/]+\/photos\/[^/]+\/(thumb|full)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fv-photos',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * DAY },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Everything else the API returns comes fresh from the server, and the last copy is
            // used only when the server can't be reached. Sign-in is left alone entirely.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fv-api',
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * DAY },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  // A server that's down or restarting (e.g. mid-deploy) counts as unreachable too.
                  fetchDidSucceed: async ({ response }) => {
                    if (response.status >= 500) throw new Error(`Server error ${response.status}`)
                    return response
                  },
                },
              ],
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fv-font-styles' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fv-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' },
  },
})
