import { defineConfig, devices } from '@playwright/test';

// Real hosted acceptance. NEVER invoked by normal CI or tests/web mocks.
// Strict exact staging host; separate authenticated browser contexts.
// Do not record traces/screenshots/videos because login credentials are entered.
export default defineConfig({
  testDir: './tests/hosted/browser',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
  },
});
