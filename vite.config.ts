import { fileURLToPath } from 'node:url'
import { defaultClientConditions, defineConfig } from 'vite'
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
    // ONNX Runtime (voice notes) without its wasm bundled in: the runtime is self-hosted in public/ort
    // (npm run ort:wasm), so the build does not emit a second 27 MB copy of it.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Only the matched packages go into these groups, not what they import: otherwise Vite's small preload
          // helper lands in the MediaPipe chunk and every page loads MediaPipe to reach it.
          includeDependenciesRecursively: false,
          groups: [
            // WebLLM (the optional private coach) gets a chunk of its own, so the service worker can leave it
            // out of the install and cache it only for athletes who use it (see pwa.config.ts).
            { name: 'webllm', test: /[\\/]node_modules[\\/]@mlc-ai[\\/]web-llm[\\/]/ },
            // MediaPipe on its own, so the pages that do not track anyone never load it.
            { name: 'mediapipe', test: /[\\/]node_modules[\\/]@mediapipe[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
