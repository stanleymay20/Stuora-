import { defineConfig, devices } from '@playwright/test';
import { approvedPreviewFromEnvironment } from './tests/hosted/previewIdentity';

const operatorApproved = process.env.STUORA_STAGING_ACCEPTANCE === 'I_APPROVE_STAGING_TEST_WRITES';
const verifiedPreview = approvedPreviewFromEnvironment();
if (operatorApproved && !verifiedPreview)
  throw new Error('Stuora staging approval requires an exact verified immutable preview URL and a matching Git checkout SHA.');

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
    baseURL: verifiedPreview ?? 'https://staging-approval-required.invalid',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
  },
});
