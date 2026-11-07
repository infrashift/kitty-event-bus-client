import { expect, type Page } from '@playwright/test';

/**
 * Measures the page against the *layout* viewport. On emulated phones, content wider
 * than the screen makes the browser zoom out (innerWidth grows past clientWidth),
 * which would otherwise hide horizontal overflow, so we report that too.
 */
export async function viewportMetrics(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return {
      clientWidth: de.clientWidth,
      clientHeight: de.clientHeight,
      scrollWidth: de.scrollWidth,
      scrollHeight: de.scrollHeight,
      innerWidth: window.innerWidth,
    };
  });
}

/** Elements that stick out past the right edge of the layout viewport (for useful failure messages). */
export async function overflowingElements(page: Page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed') {
        out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} (right=${Math.round(r.right)})`);
      }
    }
    return out.slice(0, 10);
  });
}

/**
 * On narrow screens Starlight moves the sidebar, social icons and theme picker into a
 * popover menu (`button.sl-menu-button` → `#starlight__sidebar`). Opens it if it's collapsed.
 */
export async function openMobileMenuIfCollapsed(page: Page) {
  const button = page.locator('button.sl-menu-button');
  if (!(await button.isVisible())) return;
  const pane = page.locator('#starlight__sidebar');
  await expect(async () => {
    if (!(await pane.evaluate((el) => el.matches(':popover-open')))) await button.click();
    expect(await pane.evaluate((el) => el.matches(':popover-open'))).toBe(true);
  }).toPass({ timeout: 5_000 });
}
