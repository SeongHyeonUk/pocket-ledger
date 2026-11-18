import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: { output: { manualChunks: id => {
      if (id.includes('/@firebase/firestore/')) return 'firestore'
    } } },
  },
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    workbox: { clientsClaim: true, globPatterns: ['**/*.{js,css,html,png,webmanifest}'], navigateFallbackDenylist: [/^\/__\//] },
    manifest: {
      name: 'Pocket Ledger',
      short_name: 'Pocket Ledger',
      lang: 'ko',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#112e26',
      background_color: '#eef4f0',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  })],
})
