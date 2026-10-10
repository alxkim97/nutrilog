import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

export default defineConfig({
  // Relative asset paths so the Electron build can load dist/index.html off disk (file://).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'vendor', test: /node_modules/ },
          ],
        },
      },
    },
  },
  server: {
    host: true, // reachable from a phone on the LAN during dev
    watch: { ignored: ['**/release/**', '**/dist/**', '**/legacy/**'] },
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false, // registered below via swUpdate.js-friendly plain registration in main.js
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'NutriLog',
        short_name: 'NutriLog',
        description: 'Personal macro tracker',
        theme_color: '#0d0b1a',
        background_color: '#0d0b1a',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
})
