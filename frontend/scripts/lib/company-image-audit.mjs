import { expect } from '@playwright/test';

// A hidden responsive image or Next's streamed duplicate is not a rendered
// image. Include offscreen/lazy images: :visible does not require intersection
// with the viewport, so each still has to scroll, load and decode successfully.
export async function auditRenderedImages(page, { timeout = 5000 } = {}) {
  const main = page.getByRole('main');
  await expect(main).toHaveCount(1, { timeout });
  const images = await main.locator('img:visible').all();
  for (const image of images) {
    await image.scrollIntoViewIfNeeded({ timeout });
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0), {
      timeout, message: 'Every rendered public-page image must load and decode',
    }).toBe(true);
  }
  return images.length;
}
