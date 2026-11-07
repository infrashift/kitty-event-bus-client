import { test, expect } from '@playwright/test';
import { wsconnect, headers, type NatsConnection } from '@nats-io/nats-core';

/**
 * End-to-end against a real NATS server: the browser connects over WebSocket via
 * /speaker/?nats=…, the test publishes CloudEvents from Node, and KITTY must speak them.
 *
 * Needs a server with WebSocket enabled, e.g. `make nats` (nats/kitty-dev.conf), then:
 *   NATS_WS_URL=ws://localhost:8080 make site-test
 * Skipped when NATS_WS_URL is unset. CI starts a server and sets it.
 */
const NATS_WS_URL = process.env.NATS_WS_URL;

test.describe('live NATS', () => {
  test.skip(!NATS_WS_URL, 'set NATS_WS_URL (e.g. ws://localhost:8080) to run against a real NATS server');

  let nc: NatsConnection;
  test.beforeAll(async () => {
    nc = await wsconnect({ servers: NATS_WS_URL!, name: 'kitty-e2e-publisher' });
  });
  test.afterAll(async () => {
    await nc?.drain();
  });

  test('speaks structured- and binary-mode CloudEvents published to NATS', async ({ page }, info) => {
    // A subject prefix unique to this test run + screen size, so parallel runs don't cross-talk.
    const prefix = `kittye2e${info.project.name.replace(/\W/g, '')}${Date.now()}`;
    await page.goto(`speaker/?nats=${encodeURIComponent(NATS_WS_URL!)}&subject=${prefix}.>`);
    await expect(page.locator('#natsStatus')).toContainText('Live NATS');
    await expect(page.locator('#natsStatus')).toHaveAttribute('data-ok', 'true');
    // A live bus gets no unprompted welcome event, and is read-only unless &publish=1.
    await expect(page.locator('#eventCountBadge')).toHaveText('0');
    await expect(page.locator('#sendEventBtn')).toHaveCount(0);
    await expect(page.locator('#listeningLabel')).toContainText(`${prefix}.>`);

    // Structured mode: the JSON payload is the whole CloudEvent.
    nc.publish(
      `${prefix}.k8s.pods.ready`,
      JSON.stringify({
        specversion: '1.0',
        id: 'e2e-structured-1',
        source: 'urn:e2e',
        type: 'io.e2e.structured',
        time: new Date().toISOString(),
        datacontenttype: 'application/json',
        data: { message: 'Structured mode reached the cat.', severity: 'info' },
      }),
    );
    await expect(page.locator('#activeEventType')).toHaveText('io.e2e.structured');
    await expect(page.getByTestId('bubble-chunk-text')).toContainText('Structured mode');
    await expect(page.locator('#eventCountBadge')).toHaveText('1');

    // Binary mode: attributes in ce-* headers, payload is the data. Critical → lasers.
    const h = headers();
    h.set('ce-specversion', '1.0');
    h.set('ce-id', 'e2e-binary-1');
    h.set('ce-source', 'urn:e2e');
    h.set('ce-type', 'io.e2e.binary');
    h.set('ce-severity', 'critical');
    nc.publish(`${prefix}.alerts.gpu`, JSON.stringify({ message: 'Binary mode reached the cat.' }), { headers: h });
    await expect(page.locator('#activeEventType')).toHaveText('io.e2e.binary');
    // ce-severity: critical switches the app into Laser Alert mode while the cat speaks.
    await expect(page.locator('#modeOverlay')).toHaveClass(/shadow-sm/);

    // Messages outside the subscribed subject are ignored.
    nc.publish('some.other.subject', JSON.stringify({ specversion: '1.0', type: 'io.e2e.ignored', source: 'x', id: 'x', data: { message: 'nope' } }));
    await page.waitForTimeout(500);
    await expect(page.locator('#eventCountBadge')).toHaveText('2');

    // The inspector shows the live envelope and says it's a live bus, with no publisher.
    await page.locator('#inspectorBtn').click();
    await expect(page.locator('#inspectorSubject')).toHaveText(`${prefix}.>`);
    await expect(page.locator('#inspectorBusKind')).toHaveText('live NATS');
    await expect(page.getByTestId('inspector-drawer')).toContainText('"type": "io.e2e.binary"');
    await expect(page.locator('#publishCustomBtn')).toHaveCount(0);
  });

  test('decodes UTF-8 data_base64 and speaks non-object payloads as sent', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'decoder checks only need to run once');
    const prefix = `kittye2edecode${Date.now()}`;
    await page.goto(`speaker/?nats=${encodeURIComponent(NATS_WS_URL!)}&subject=${prefix}.>`);
    await expect(page.locator('#natsStatus')).toHaveAttribute('data-ok', 'true');

    const json = JSON.stringify({ message: 'Température critique — 96°C', severity: 'info' });
    nc.publish(
      `${prefix}.b64`,
      JSON.stringify({
        specversion: '1.0', id: 'b64', source: 'urn:e2e', type: 'io.e2e.base64',
        data_base64: Buffer.from(json, 'utf8').toString('base64'),
      }),
    );
    await expect(page.locator('#activeEventType')).toHaveText('io.e2e.base64');
    await expect(page.getByTestId('bubble-chunk-text')).toContainText('Température');

    // A bare JSON number is spoken as the number, not replaced by a fallback.
    nc.publish(`${prefix}.temp`, '96');
    await expect(page.locator('#activeEventType')).toHaveText('io.nats.message');
    await page.locator('#inspectorBtn').click();
    await expect(page.getByTestId('inspector-drawer')).toContainText('"message": "96"');
  });

  test('with &publish=1 the demo buttons publish inside the subscribed subject', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'publish round-trip only needs to run once');
    const prefix = `kittye2epub${Date.now()}`;
    const received: string[] = [];
    const sub = nc.subscribe('>', { callback: (_e, m) => received.push(m.subject) });
    await page.goto(`speaker/?nats=${encodeURIComponent(NATS_WS_URL!)}&subject=${prefix}.>&publish=1`);
    await expect(page.locator('#natsStatus')).toHaveAttribute('data-ok', 'true');
    await page.locator('#sendAlertBtn').click();
    // The preset's cncf.alerts.gpu.thermal is mapped under the subscription, never to cncf.*
    await expect.poll(() => received).toContain(`${prefix}.alerts.gpu.thermal`);
    expect(received.some((s) => s.startsWith('cncf.'))).toBe(false);
    // …and KITTY hears it back from the server.
    await expect(page.locator('#activeEventType')).toHaveText('io.infrashift.gpu.thermal.critical');
    sub.unsubscribe();
  });

  test('a bad server URL falls back to the demo bus with an error notice', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'only needs to run once');
    await page.goto(`speaker/?nats=${encodeURIComponent('ws://127.0.0.1:9')}`);
    await expect(page.locator('#natsStatus')).toHaveAttribute('data-ok', 'false', { timeout: 15_000 });
    await expect(page.locator('#natsStatus')).toContainText('Showing the demo bus');
    // The demo bus is running: its welcome event was published.
    await expect(page.locator('#eventCountBadge')).toHaveText('1');
  });

  test('the plain <script> example connects too (NATS client from a CDN)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'only needs to run once');
    const prefix = `kittye2estandalone${Date.now()}`;
    await page.goto(`examples/standalone/?nats=${encodeURIComponent(NATS_WS_URL!)}&subject=${prefix}.>`);
    await expect(page.locator('#bus')).toContainText('live NATS');
    await page.waitForFunction(() => !!(window as any).__kittyDebug?.state?.lastFrameMap);
    nc.publish(
      `${prefix}.hello`,
      JSON.stringify({ specversion: '1.0', id: 's1', source: 'urn:e2e', type: 'io.e2e.standalone', data: { message: 'Hello from NATS.' } }),
    );
    await expect(page.locator('#activeEventType')).toHaveText('io.e2e.standalone');
  });
});
