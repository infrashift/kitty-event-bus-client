import { test, expect, type Page } from '@playwright/test';
import { viewportMetrics, overflowingElements } from './helpers';

type Feature = 'leftEye' | 'rightEye' | 'mouth';

async function openKittyApp(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const c = document.getElementById('faceCanvas') as HTMLCanvasElement | null;
    const dbg = (window as any).__kittyDebug;
    return !!c && c.width > 0 && !!dbg?.state?.lastFrameMap;
  });
}

async function featureOnScreen(page: Page, feature: Feature) {
  return page.evaluate((f) => {
    const dbg = (window as any).__kittyDebug;
    const subj = dbg.SUBJECTS[dbg.state.subjectIndex][f];
    const map = dbg.state.lastFrameMap;
    const r = document.getElementById('faceCanvas')!.getBoundingClientRect();
    return {
      x: r.left + (map.mapX(subj.x) / 800) * r.width,
      y: r.top + (map.mapY(subj.y) / 800) * r.height,
      ux: subj.x as number,
      uy: subj.y as number,
      rx: subj.rx as number,
    };
  }, feature);
}

test.describe('kitty-event-bus-client', () => {
  test('fits the viewport exactly: no scrolling, nothing cut off, round kitty canvas', async ({
    page,
  }) => {
    await openKittyApp(page);
    const m = await viewportMetrics(page);

    expect(
      m.innerWidth,
      'browser zoomed out because content is wider than the screen'
    ).toBe(m.clientWidth);
    expect(
      m.scrollWidth,
      `horizontal overflow: ${await overflowingElements(page)}`
    ).toBeLessThanOrEqual(m.clientWidth);
    expect(m.scrollHeight, 'page scrolls vertically').toBeLessThanOrEqual(m.clientHeight);

    const box = (await page.locator('#faceCanvas').boundingBox())!;
    expect(Math.abs(box.width - box.height), 'canvas is not a circle').toBeLessThanOrEqual(1);
    expect(box.width, 'kitty portrait is too small').toBeGreaterThan(
      Math.min(m.clientWidth, m.clientHeight) * 0.52
    );
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(m.clientWidth + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(m.clientHeight + 0.5);

    for (const id of [
      '#sendEventBtn',
      '#voicePersonaFemale',
      '#voicePersonaNzMale',
      '#modeOverlay',
      '#calibrateBtn',
      '#themeToggleBtn',
      '#githubLink',
      '#docsLink',
    ]) {
      await expect(page.locator(id), `${id} not in viewport`).toBeInViewport({ ratio: 1 });
    }
    await expect(page.locator('#voicePersonaNzMale')).toHaveText('Male');

    const eventBox = (await page.locator('#activeEventType').boundingBox())!;
    const sendBtnBox = (await page.locator('#sendEventBtn').boundingBox())!;
    expect(
      eventBox.y + eventBox.height,
      'NATS message text should be positioned above Send CloudEvent button'
    ).toBeLessThanOrEqual(sendBtnBox.y + 4);
  });

  test('canvas backing store tracks its on-screen size (crisp HiDPI)', async ({ page }) => {
    await openKittyApp(page);
    const { css, px, dpr } = await page.evaluate(() => {
      const c = document.getElementById('faceCanvas') as HTMLCanvasElement;
      return {
        css: c.getBoundingClientRect().width,
        px: c.width,
        dpr: Math.min(devicePixelRatio, 2),
      };
    });
    expect(Math.abs(px - css * dpr)).toBeLessThanOrEqual(2);
  });

  test('chunks long CloudEvent messages and refreshes the speech bubble when speech hits the end of each chunk', async ({
    page,
  }) => {
    await openKittyApp(page);

    // Trigger a 3-chunk message with fast deterministic reading floor and short auto-close delay
    await page.evaluate(() => {
      const dbg = (window as any).__kittyDebug;
      dbg.speakEvent(
        {
          id: 'ce-test-chunking',
          natsSubject: 'cncf.k8s.chunk.test',
          type: 'io.cncf.k8s.chunk.test',
          source: 'urn:k8s:test',
          severity: 'info',
          message:
            'First chunk of the cloud event message here, and now the second chunk replaces the bubble cleanly!',
          time: new Date().toISOString(),
        },
        { maxWordsPerChunk: 8, minChunkMs: 450, msPerWord: 50, bubbleCloseDelayMs: 250 }
      );
    });

    // Verify Chunk 1 / 3 is displayed first and the cat's jaw opens while speaking
    await expect(page.getByTestId('chunk-indicator')).toHaveText('1 / 3');
    await expect(page.getByTestId('bubble-chunk-text')).toContainText('First chunk');
    await expect(page.getByTestId('bubble-chunk-text')).not.toContainText('second chunk');

    await expect
      .poll(async () => page.evaluate(() => (window as any).__kittyDebug.state.screamOpen))
      .toBeGreaterThan(0.05);

    // Wait for speech to reach the end of chunk 1 and refresh the bubble with chunk 2 / 3
    await expect(page.getByTestId('chunk-indicator')).toHaveText('2 / 3', { timeout: 5000 });
    await expect(page.getByTestId('bubble-chunk-text')).toContainText('second chunk replaces');

    // Wait for the kitty to finish reading the final chunk and verify the speech bubble closes shortly after
    await expect(page.getByTestId('speech-bubble')).toBeHidden({ timeout: 5000 });
  });

  test('critical CloudEvent triggers ocular plasma lasers and logs in the NATS inspector drawer', async ({
    page,
  }, info) => {
    await openKittyApp(page);

    if (info.project.name === 'desktop') {
      await page.screenshot({
        path: info.outputPath('kitty-speaking-normal.png'),
      });
    }

    await page.locator('#sendAlertBtn').click();
    await expect(page.locator('#activeEventType')).toHaveText('io.infrashift.gpu.thermal.critical');

    if (info.project.name === 'desktop') {
      await page.waitForTimeout(600);
      await page.screenshot({
        path: info.outputPath('kitty-laser-alert.png'),
      });
    }

    // Open the NATS Inspector Drawer and verify the CloudEvent v1.0 JSON envelope
    await page.locator('#inspectorBtn').click();
    const drawer = page.getByTestId('inspector-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('"specversion": "1.0"');
    await expect(drawer).toContainText('io.infrashift.gpu.thermal.critical');

    if (info.project.name === 'desktop') {
      await page.screenshot({
        path: info.outputPath('kitty-nats-inspector.png'),
      });
    }

    // Publish a custom CloudEvent from the inspector composer
    await page.locator('#customMessageInput').fill('Custom NATS message spoken by kitty.');
    await page.locator('#publishCustomBtn').click();
    await page.locator('#closeInspectorBtn').click();

    await expect(page.getByTestId('bubble-chunk-text')).toContainText(
      'Custom NATS message spoken by kitty.'
    );

    // Switch between Female and Male voice personas
    await page.locator('#voicePersonaNzMale').click();
    await expect(page.getByTestId('speech-bubble')).toBeVisible();
    await page.locator('#voicePersonaFemale').click();
    await expect(page.getByTestId('speech-bubble')).toBeVisible();
  });

  test('theme persists via starlight-theme in localStorage', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('starlight-theme', 'dark'));
    await openKittyApp(page);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.locator('#themeToggleBtn').click();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => localStorage.getItem('starlight-theme'))).toBe('light');
  });

  test('calibration: mouse drag moves an eye, scroll wheel resizes it', async ({ page }, info) => {
    test.skip(!!info.project.use.hasTouch, 'mouse-only test');
    await openKittyApp(page);
    await page.locator('#calibrateBtn').click();
    await expect(page.locator('#hoverGuide')).toContainText('Scroll wheel');

    const eye = await featureOnScreen(page, 'leftEye');
    await page.mouse.move(eye.x, eye.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await featureOnScreen(page, 'leftEye')).rx).toBeGreaterThan(eye.rx);

    await page.mouse.down();
    await page.mouse.move(eye.x + 20, eye.y + 10, { steps: 5 });
    await page.mouse.up();
    const moved = await featureOnScreen(page, 'leftEye');
    expect(moved.ux).toBeGreaterThan(eye.ux + 5);
  });

  test('calibration: touch drag moves an eye, pinch resizes it', async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, 'touch-only test');
    await openKittyApp(page);
    await page.locator('#calibrateBtn').tap();
    await expect(page.locator('#hoverGuide')).toContainText('Pinch');

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p, id) => ({ ...p, id })),
      } as any);

    const eye = await featureOnScreen(page, 'rightEye');
    await touch('touchStart', [{ x: eye.x, y: eye.y }]);
    await touch('touchMove', [{ x: eye.x - 15, y: eye.y + 8 }]);
    await touch('touchEnd', []);
    const moved = await featureOnScreen(page, 'rightEye');
    expect(moved.ux).toBeLessThan(eye.ux - 5);

    const c = await featureOnScreen(page, 'rightEye');
    await touch('touchStart', [{ x: c.x - 10, y: c.y }]);
    await touch('touchStart', [
      { x: c.x - 10, y: c.y },
      { x: c.x + 10, y: c.y },
    ]);
    await touch('touchMove', [
      { x: c.x - 25, y: c.y },
      { x: c.x + 25, y: c.y },
    ]);
    await touch('touchEnd', []);
    const pinched = await featureOnScreen(page, 'rightEye');
    expect(pinched.rx).toBeGreaterThan(c.rx * 1.5);
  });
});
