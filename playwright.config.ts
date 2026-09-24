import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
    { name: 'chromium-390', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    // Playwright's WebKit build on Windows occasionally crashes the browser process itself (before any page
    // loads); a crashed browser is relaunched on retry. Real Safari on a phone is not covered by this.
    { name: 'webkit-390', retries: 2, use: { ...devices['iPhone 13'], trace: 'off' } },
  ],
});
