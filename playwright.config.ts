import { defineConfig, devices } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8408/cadam';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROME_BIN ||
        '/home/steve/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
