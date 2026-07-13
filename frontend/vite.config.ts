import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Allow the app to be reached through a public tunnel (Cloudflare quick
    // tunnel / ngrok) when sharing the local dev instance with colleagues.
    // Vite 7 rejects unknown Host headers by default; scope this to the tunnel
    // providers rather than disabling the check entirely.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // External-API Swagger (and its assets + `/docs/ext-json`) is served by the
      // backend. Proxy it in dev so the Profile "Open API docs" link works from
      // the frontend origin. NOTE: only `/docs/ext*` — `/docs/standards` is a
      // frontend SPA route and must NOT be proxied.
      '/docs/ext': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/sse': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
