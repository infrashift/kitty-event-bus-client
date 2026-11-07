import { type Page } from '@playwright/test';

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

export async function overflowingElements(page: Page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed') {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} (right=${Math.round(r.right)})`
        );
      }
    }
    return out.slice(0, 10);
  });
}
