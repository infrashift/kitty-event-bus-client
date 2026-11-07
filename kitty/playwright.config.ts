import { defineConfig, devices } from '@playwright/test';

const PORT = 4331; // dedicated test port (avoids clashing with dev/preview servers on 4321-4322)
const chrome = devices['Desktop Chrome'];

const screens = [
  { name: 'phone', width: 375, height: 667, touch: true },
  { name: 'phone-landscape', width: 667, height: 375, touch: true },
  { name: 'tablet', width: 820, height: 1180, touch: true },
  { name: 'tablet-landscape', width: 1180, height: 820, touch: true },
  { name: 'laptop', width: 1366, height: 768, touch: false },
  { name: 'desktop', width: 1920, height: 1080, touch: false },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: screens.map(({ name, width, height, touch }) => ({
    name,
    use: {
      ...chrome,
      viewport: { width, height },
      deviceScaleFactor: touch ? 2 : 1,
      hasTouch: touch,
      isMobile: touch && Math.min(width, height) < 600,
    },
  })),
  webServer: {
    command: `bun run preview -- --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
