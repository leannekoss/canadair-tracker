import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Les chemins /api/* sont les mêmes en dev et en prod :
// - dev  : proxys ci-dessous (ordre important — du plus spécifique au plus générique)
// - prod : /api/traces et /api/photos → fonctions serverless Vercel (headers requis),
//          le live airplanes.live est appelé en direct (CORS ouvert), cf. src/lib/api.js
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Traces tar1090 (exige le header Referer, sinon 403) — /api/traces?hex=xxxxxx
      '/api/traces': {
        target: 'https://globe.airplanes.live',
        changeOrigin: true,
        rewrite: (path) => {
          const hex = new URL(path, 'http://x').searchParams.get('hex') ?? '';
          return `/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`;
        },
        headers: { Referer: 'https://globe.airplanes.live/' },
      },
      // Photos planespotters (exige un User-Agent avec contact) — /api/photos?hex=xxxxxx
      '/api/photos': {
        target: 'https://api.planespotters.net',
        changeOrigin: true,
        rewrite: (path) => {
          const hex = new URL(path, 'http://x').searchParams.get('hex') ?? '';
          return `/pub/photos/hex/${hex}`;
        },
        headers: { 'User-Agent': 'CanadairTracker/1.0 (+mailto:hcasalis@gmail.com)' },
      },
      // API live airplanes.live (v2/mil, v2/type, ...)
      '/api': {
        target: 'https://api.airplanes.live',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
