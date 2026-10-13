import { expect } from '@playwright/test';

export async function prepareTopCapture(page) {
  await page.evaluate(() => document.fonts.ready);
  // A route scroll can outlive the content checks. Retry capture positioning,
  // then verify the real viewport after two frames instead of a synchronous zero.
  await expect.poll(() => page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      visualTop: window.visualViewport?.pageTop ?? null,
    };
  }), { message: 'Screenshot viewport must settle at the document top' }).toEqual({ scrollX: 0, scrollY: 0, visualTop: 0 });
  await expect(page.getByRole('banner')).toBeInViewport();
}
