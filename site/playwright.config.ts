import { defineConfig, devices } from '@playwright/test';

const PORT = 4323;
const chrome = devices['Desktop Chrome'];

/**
 * Responsive test matrix. Each project is one screen size; every spec runs on all of them.
 * `touch` projects emulate a mobile browser (touch events, mobile viewport, coarse pointer).
 */
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
    baseURL: `http://127.0.0.1:${PORT}/kitty-event-bus-client/`,
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
      // isMobile is only for phone-sized screens (it enables meta-viewport + mobile UA quirks).
      isMobile: touch && Math.min(width, height) < 600,
    },
  })),
  // Tests run against the production build (`make site-test` builds kitty and the site first).
  webServer: {
    // --ignore-lock keeps the server in the foreground (owned by Playwright) even when
    // Astro detects an AI agent / non-interactive caller and would otherwise auto-background.
    command: `bun run preview -- --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/kitty-event-bus-client/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
