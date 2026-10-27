import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;
const CI = Boolean(process.env.CI);

// The app is built with VITE_E2E=1, which swaps the MediaPipe pose model for a stub that returns the
// synthetic archer's landmarks (see vite.config.ts and e2e/support/mediapipeStub.ts). The build goes to
// dist-e2e so the normal dist/ is never touched.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    env: { VITE_E2E: '1' },
    reuseExistingServer: !CI,
    timeout: 240_000,
  },
});
