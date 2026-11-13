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

  test('critical alert: jaw closes after the message is read (no silent scream before the bubble closes)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openKittyApp(page);
    // Muted: the timeline still drives the jaw, without the autoplay gate or real audio.
    await page.locator('#soundToggleBtn').click();
    await expect(page.locator('#soundIcon')).toHaveText('🔇');

    // Speak a short critical event with a long bubble-close delay and sample the kitty in-page
    // until the bubble closes. Laser rendering is slow under headless software rendering
    // (~1 frame/s), so the stretched gap keeps several samples inside it.
    const frames = await page.evaluate(async () => {
      const dbg = (window as any).__kittyDebug;
      const frames: {
        speaking: boolean;
        bubble: boolean;
        lasers: boolean;
        open: number;
        voiced: number;
      }[] = [];
      dbg.speakEvent(
        {
          id: 'jaw-test',
          natsSubject: 'cncf.events.alerts.critical',
          type: 'io.infrashift.test.critical',
          source: '/tests/kitty',
          severity: 'critical',
          message: 'Critical test alert.',
          time: new Date().toISOString(),
        },
        { bubbleCloseDelayMs: 8000 }
      );
      const t0 = performance.now();
      let spoke = false;
      while (performance.now() - t0 < 45_000) {
        await new Promise((r) => setTimeout(r, 20));
        const f = {
          speaking: dbg.speechEngine.isSpeaking as boolean,
          bubble: !!document.querySelector('[data-testid="speech-bubble"]'),
          lasers: !!document.querySelector('#modeOverlay')?.classList.contains('bg-white'),
          open: dbg.state.screamOpen as number,
          voiced: dbg.speechEngine.smoothedMouthOpen as number,
        };
        frames.push(f);
        spoke ||= f.speaking;
        if (spoke && !f.speaking && !f.bubble) break;
      }
      return frames;
    });

    // The gap: speech has finished, but the bubble (and the lasers) are still up.
    let lastSpoken = -1;
    frames.forEach((f, i) => f.speaking && (lastSpoken = i));
    expect(lastSpoken, 'kitty never started speaking the alert').toBeGreaterThan(-1);
    const gap = frames.slice(lastSpoken + 1).filter((f) => f.bubble);
    expect(gap.every((f) => f.lasers), 'laser overlay should stay on until the bubble closes').toBe(true);

    // In that gap the drawn jaw must follow only what the speech engine voices (the yowl's tail
    // easing shut). The bug added a silent +0.85 "scream" on top while the lasers were still on.
    // Compare against the engine rather than an absolute threshold: headless laser rendering
    // runs at ~1 frame/s, so how far the jaw has eased shut depends on machine load.
    expect(gap.length, 'too few samples inside the bubble-close gap').toBeGreaterThanOrEqual(2);
    for (const f of gap.slice(1)) {
      expect(f.open - f.voiced, 'jaw opened silently after the alert was spoken').toBeLessThan(0.3);
    }
  });

  test('critical alert: the voice waits for the yowl, then the jaw follows the voice alone', async ({
    page,
  }) => {
    await openKittyApp(page);
    // Muted: the preamble and timeline still run, without the autoplay gate or real audio.
    await page.locator('#soundToggleBtn').click();
    await expect(page.locator('#soundIcon')).toHaveText('🔇');

    const result = await page.evaluate(async () => {
      const dbg = (window as any).__kittyDebug;
      const engine = dbg.speechEngine;
      const before = engine.speechStartPerf as number;
      const t0 = performance.now();
      dbg.speakEvent({
        id: 'yowl-sync-test',
        natsSubject: 'cncf.events.alerts.critical',
        type: 'io.infrashift.test.critical',
        source: '/tests/kitty',
        severity: 'critical',
        message: 'Critical test alert.',
        time: new Date().toISOString(),
      });
      while (engine.speechStartPerf === before && performance.now() - t0 < 10_000) {
        await new Promise((r) => setTimeout(r, 5));
      }
      return {
        voiceStartMs: (engine.speechStartPerf as number) - t0,
        roarBurstAtVoiceStart: engine.manualRoarBurst as number,
      };
    });

    // The critical yowl lasts ~0.98s. The voice used to start 360ms in, so the yowl played over
    // the first words while the jaw followed the voice, and the yowl's jaw burst held it open.
    expect(result.voiceStartMs, 'voice started while the yowl was still playing').toBeGreaterThan(950);
    expect(result.roarBurstAtVoiceStart, 'yowl still holding the jaw open').toBe(0);
  });

  test('muting while KITTY is speaking silences her right away; the bubble carries on', async ({
    page,
  }) => {
    await openKittyApp(page);
    // Meow-Speak schedules every meow up front, which is exactly what used to keep playing.
    // The click is also the user gesture that unlocks audio.
    await page.locator('#voiceMeow').click();

    await page.evaluate(() => {
      (window as any).__kittyDebug.speakEvent(
        {
          id: 'mute-test',
          natsSubject: 'cncf.events.info',
          type: 'io.infrashift.test.info',
          source: '/tests/kitty',
          severity: 'info',
          message:
            'This is a long message that keeps the kitty talking for a good while, so muting lands mid-speech.',
          time: new Date().toISOString(),
        },
        { bubbleCloseDelayMs: 5000 }
      );
    });
    await page.waitForFunction(() => (window as any).__kittyDebug.speechEngine.isSpeaking);

    // Sound is audible before muting.
    const outputGain = () =>
      page.evaluate(() => (window as any).__kittyDebug.speechEngine.outputGain?.gain.value ?? null);
    expect(await outputGain()).toBeGreaterThan(0.9);

    await page.locator('#soundToggleBtn').click();
    await expect(page.locator('#soundIcon')).toHaveText('🔇');

    // The already-scheduled meows are silenced, and Web Speech is cancelled...
    await expect.poll(outputGain).toBeLessThan(0.01);
    expect(
      await page.evaluate(() => ({
        muted: (window as any).__kittyDebug.speechEngine.isMuted,
        webSpeech: window.speechSynthesis?.speaking ?? false,
      }))
    ).toEqual({ muted: true, webSpeech: false });
    // ...but the message keeps playing out silently in the bubble.
    await expect(page.getByTestId('speech-bubble')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__kittyDebug.speechEngine.isSpeaking)).toBe(
      true
    );

    // Unmuting restores sound.
    await page.locator('#soundToggleBtn').click();
    await expect(page.locator('#soundIcon')).toHaveText('🔊');
    await expect.poll(outputGain).toBeGreaterThan(0.9);
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

  test('autoplay gate: before any user gesture the welcome event waits, then speaks on the first tap', async ({
    page,
  }) => {
    // Simulate a real browser on first load: audio is blocked until the user interacts.
    // (Playwright's Chromium otherwise allows audio without a gesture.)
    await page.addInitScript(() => ((window as any).__kittyForceAudioLocked = true));
    await openKittyApp(page);

    await expect(page.locator('#eventCountBadge')).toHaveText('1');
    await expect(page.getByTestId('audio-unlock-hint')).toBeVisible();
    // The message is held, not animated in silence.
    await expect(page.getByTestId('speech-bubble')).toBeHidden();
    expect(await page.evaluate(() => (window as any).__kittyDebug.speechEngine.awaitingAudioUnlock)).toBe(true);

    // "Tap anywhere": the hint vanishes during the gesture itself, so tap a stable element.
    await page.locator('.app-header h1').click();

    await expect(page.getByTestId('audio-unlock-hint')).toBeHidden();
    await expect(page.getByTestId('bubble-chunk-text')).toContainText('catnip-scheduler');
  });

  test('autoplay gate: a newer event replaces the one waiting for the unlock', async ({ page }) => {
    await page.addInitScript(() => ((window as any).__kittyForceAudioLocked = true));
    await openKittyApp(page);
    await expect(page.getByTestId('audio-unlock-hint')).toBeVisible();

    // An event arrives (e.g. from a live bus) while still locked: it supersedes the welcome event.
    await page.evaluate(() => {
      (window as any).__kittyDebug.speakEvent({
        id: 'ce-late', natsSubject: 'cncf.late', type: 'io.late', source: 'urn:test',
        severity: 'info', message: 'Newest message wins the queue.', time: new Date().toISOString(),
      });
    });
    await page.keyboard.press('Enter'); // a key press is a user gesture too

    await expect(page.getByTestId('bubble-chunk-text')).toContainText('Newest');
    await expect(page.getByTestId('audio-unlock-hint')).toBeHidden();
  });
});
