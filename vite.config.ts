import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

// VITE_E2E=1 (end-to-end test build only) swaps MediaPipe for a stub that returns the synthetic archer's pose.
const e2eBuild = process.env.VITE_E2E === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  resolve: {
    alias: e2eBuild ? { '@mediapipe/tasks-vision': fileURLToPath(new URL('./e2e/support/mediapipeStub.ts', import.meta.url)) } : {},
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
