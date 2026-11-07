import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { viewportMetrics, overflowingElements } from './helpers';

/** The pre-synthesized MP3s the kitty package ships (kitty/public/tts → dist/tts → site/public/kitty/tts). */
const TTS_FILES = readdirSync(new URL('../../kitty/public/tts/', import.meta.url)).filter((f) => f.endsWith('.mp3'));

async function waitForKitty(page: Page) {
  await page.waitForFunction(() => {
    const c = document.getElementById('faceCanvas') as HTMLCanvasElement | null;
    const dbg = (window as any).__kittyDebug;
    return !!c && c.width > 0 && !!dbg?.state?.lastFrameMap;
  });
}

test.describe('speaker island', () => {
  test('mounts KITTY full-screen: no scrolling, nothing cut off, round canvas', async ({ page }) => {
    await page.goto('speaker/');
    await expect(page.locator('astro-island[component-export="default"]')).toHaveCount(1);
    await waitForKitty(page);

    const m = await viewportMetrics(page);
    expect(m.innerWidth, 'browser zoomed out because content is wider than the screen').toBe(m.clientWidth);
    expect(m.scrollWidth, `horizontal overflow: ${await overflowingElements(page)}`).toBeLessThanOrEqual(m.clientWidth);
    expect(m.scrollHeight, 'page scrolls vertically').toBeLessThanOrEqual(m.clientHeight);

    const box = (await page.locator('#faceCanvas').boundingBox())!;
    expect(Math.abs(box.width - box.height), 'canvas is not a circle').toBeLessThanOrEqual(1);
    expect(box.width, 'kitty portrait is too small').toBeGreaterThan(Math.min(m.clientWidth, m.clientHeight) * 0.52);

    for (const id of ['#sendEventBtn', '#themeToggleBtn', '#githubLink', '#docsLink']) {
      await expect(page.locator(id), `${id} not in viewport`).toBeInViewport({ ratio: 1 });
    }
  });

  test('docs link goes back to the site, and the theme toggle carries over', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('starlight-theme', 'light');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('speaker/');
    await waitForKitty(page);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await page.locator('#themeToggleBtn').click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await expect(page.locator('#docsLink')).toHaveAttribute('href', '/kitty-event-bus-client/');
    await page.locator('#docsLink').click();
    await expect(page).toHaveURL(/\/kitty-event-bus-client\/$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a critical CloudEvent fires the lasers inside the island', async ({ page }) => {
    await page.goto('speaker/');
    await waitForKitty(page);
    await page.locator('#sendAlertBtn').click();
    await expect(page.locator('#activeEventType')).toHaveText('io.infrashift.gpu.thermal.critical');
  });

  test('pre-synthesized TTS MP3s are hosted under kitty/tts/', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop', 'asset check only needs to run once');
    expect(TTS_FILES.length).toBeGreaterThan(0);
    for (const f of TTS_FILES) {
      const res = await request.get(`kitty/tts/${f}`);
      expect(res.status(), f).toBe(200);
      expect(res.headers()['content-type']).toContain('audio/mpeg');
    }
  });
});

test.describe('standalone <script> example', () => {
  test('mounts KITTY from the IIFE build without leaking styles into the host page', async ({ page }) => {
    await page.goto('examples/standalone/');
    await waitForKitty(page);
    expect(await page.evaluate(() => typeof (window as any).KittyEventBus?.mount)).toBe('function');

    // The host page's own paragraph keeps its browser-default margin: KITTY's reset is scoped to .kitty-app.
    const margin = await page.locator('.host-note').evaluate((el) => getComputedStyle(el).marginTop);
    expect(margin).not.toBe('0px');

    const box = (await page.locator('#faceCanvas').boundingBox())!;
    expect(Math.abs(box.width - box.height), 'canvas is not a circle').toBeLessThanOrEqual(1);
  });
});
