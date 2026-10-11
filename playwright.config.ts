import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/web',
  fullyParallel: true,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-web', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'python3 -m http.server 4173 --directory dist', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
