import { defineConfig, devices } from '@playwright/test';
const port = process.env.STARSHIP_TEST_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e', timeout: 600000, expect: { timeout: 30000 }, workers: 1,
  use: { baseURL, viewport: { width: 1664, height: 936 }, trace: process.env.TRACE ? 'retain-on-failure' : 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1664, height: 936 } } }, { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } }],
  webServer: { command: `npm run preview -- --port ${port} --strictPort`, url: baseURL, reuseExistingServer: !process.env.CI },
});
