import { expect } from '@playwright/test';

// Wait for the actual table, not the loading shell: the mobile viewport
// inflated only after catalog hydration in the failing hosted trace.
export async function expectCatalogViewport(page) {
  await expect(page.locator('.catalog-table')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const width = page.viewportSize().width;
  await expect.poll(() => page.evaluate(expectedWidth => ({
    // Mobile must retain the exact device width; desktop may reserve a scrollbar.
    viewportFits: expectedWidth <= 620 ? window.innerWidth === expectedWidth : window.innerWidth <= expectedWidth && window.innerWidth >= document.documentElement.clientWidth,
    rootFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    scrollX: window.scrollX,
    visualScale: Math.round((window.visualViewport?.scale ?? 1) * 1000) / 1000,
  }), width), { message: 'Hydrated catalog must retain its configured viewport without document overflow or zoom' }).toEqual({ viewportFits: true, rootFits: true, scrollX: 0, visualScale: 1 });
  if (width <= 620) {
    const tableRegion = page.getByRole('region', { name: 'Таблица оборудования, прокрутка по горизонтали' });
    await expect(tableRegion).toHaveCSS('overflow-x', 'auto');
    expect(await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth), 'Wide equipment table must remain scrollable within its own region').toBe(true);
    await tableRegion.focus();
    await tableRegion.press('ArrowRight');
    await expect.poll(() => tableRegion.evaluate(element => element.scrollLeft), { message: 'Keyboard input must scroll the table horizontally' }).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollX), 'Table scrolling must not displace the document').toBe(0);
  }
}

export async function expectReceivesPointer(locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  }), { message: 'The real navigation control must receive pointer input at its center' }).toBe(true);
}
