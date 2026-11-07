import { test, expect } from '@playwright/test';
import { viewportMetrics, overflowingElements, openMobileMenuIfCollapsed } from './helpers';

const REPO = 'https://github.com/infrashift/kitty-event-bus-client';
const PAGES = [
  '',
  'features/',
  'guides/running/',
  'guides/cloudevents/',
  'guides/live-nats/',
  'guides/voices/',
  'guides/calibration/',
  'guides/embedding/',
  'guides/architecture/',
  'guides/development/',
  'changelog/',
  'contributing/',
  'sponsor/',
  'license/',
];

test.describe('site', () => {
  for (const path of PAGES) {
    test(`/${path} renders without horizontal scrolling`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('main h1, .hero h1').first()).toBeVisible();

      const m = await viewportMetrics(page);
      expect(m.innerWidth, 'browser zoomed out because content is wider than the screen').toBe(m.clientWidth);
      expect(m.scrollWidth, `horizontal overflow: ${await overflowingElements(page)}`).toBeLessThanOrEqual(m.clientWidth);
    });
  }

  test('home page hero links to the speaker, GitHub, and Infrashift.io', async ({ page }) => {
    await page.goto('');
    const hero = page.locator('.hero');
    await expect(hero.getByRole('link', { name: 'Launch the Speaker' })).toHaveAttribute('href', '/kitty-event-bus-client/speaker/');
    await expect(hero.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', REPO);
    await expect(hero.getByRole('link', { name: 'Infrashift.io' })).toHaveAttribute('href', 'https://infrashift.io');

    await hero.getByRole('link', { name: 'Launch the Speaker' }).click();
    await expect(page).toHaveURL(/\/kitty-event-bus-client\/speaker\/$/);
    await expect(page.locator('#faceCanvas')).toBeVisible();
  });

  test('header has GitHub and Infrashift.io icons (in the menu on small screens)', async ({ page }) => {
    await page.goto('features/');
    await openMobileMenuIfCollapsed(page);

    await expect(page.locator(`a[href="${REPO}"]:visible`).first()).toBeVisible();
    await expect(page.locator('a[href="https://infrashift.io"]:visible').first()).toBeVisible();
    // Every docs page links to its source on GitHub (the site lives in site/).
    await expect(page.locator(`a[href^="${REPO}/edit/main/site/"]`)).toHaveCount(1);
  });

  test('light/dark toggle works and carries over to the speaker', async ({ page }) => {
    await page.goto('features/');
    await openMobileMenuIfCollapsed(page);

    await page.locator('starlight-theme-select select:visible').first().selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('starlight-theme-select select:visible').first().selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('starlight-theme-select select:visible').first().selectOption('dark');

    await page.goto('speaker/');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test("KITTY's stylesheet is only loaded on the speaker page", async ({ page }) => {
    await page.goto('features/');
    const kittyRules = await page.evaluate(() =>
      [...document.styleSheets].some((s) => {
        try {
          return [...s.cssRules].some((r) => r.cssText.includes('kitty-app'));
        } catch {
          return false;
        }
      }),
    );
    expect(kittyRules).toBe(false);
  });

  test('every internal link resolves', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'link check only needs to run once');
    const seen = new Set<string>();
    for (const path of PAGES) {
      await page.goto(path);
      const hrefs = await page.locator('a[href^="/kitty-event-bus-client/"]').evaluateAll((as) =>
        as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('#')[0]),
      );
      hrefs.forEach((h) => seen.add(h));
    }
    expect(seen.size).toBeGreaterThan(8);
    for (const href of seen) {
      const res = await request.get(new URL(href, info.project.use.baseURL).toString());
      expect(res.status(), href).toBe(200);
    }
  });
});
