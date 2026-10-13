import { expect, test } from '@playwright/test';
import { ptmmIds, ptmmPublicDtos, malformedPtmmDto, ptmmUnitCaveat, ptmmSourceHref, dimensionLabels } from './helpers/ptmm-qualification-fixtures.mjs';
import { measurePtmmReadability, measurePtmmRenderedUnit } from './helpers/ptmm-qualification-dom.mjs';
import { capturePtmmBrowserEvents } from './helpers/ptmm-browser-events.mjs';

const contextFor = (page, id) => page.locator(`[data-ptmm-dimension-context="${id}"]`);
const browserEvidence = new WeakMap();
test.beforeEach(async ({ page }, testInfo) => {
  browserEvidence.set(page, capturePtmmBrowserEvents(page, testInfo));
});
test.afterEach(async ({ page }, testInfo) => {
  const recorder = browserEvidence.get(page);
  if (!recorder) throw new Error('Browser event capture was not initialized for this case');
  const result = await recorder.finish();
  testInfo.annotations.push({ type: 'browser-events', description: JSON.stringify({
    status: result.capture.status, eventCount: result.capture.eventCount, pageErrorCount: result.capture.pageErrorCount, droppedEvents: result.capture.droppedEvents,
    truncatedEvents: result.capture.truncatedEvents, errors: result.capture.errors, retention: result.retention,
  }) });
  expect(result.retention.saved, 'Per-case page console/pageerror evidence must survive assertion failures').toBe(true);
  expect(result.capture.errors.filter(error => error.stage.startsWith('read-')), 'Actual browser events must be readable').toEqual([]);
  expect(result.capture.pageErrorCount, 'No uncaught page error, including events beyond the retention cap').toBe(0);
});

function retainReadabilityGeometry(measured, label) {
  if (!measured.diagnostics?.rawCellWidthOverflow || measured.violations.length) return;
  // Keep a bounded witness of any full-Range/word difference even on success.
  // This can confirm or refute the hosted hanging-space hypothesis.
  const annotations = test.info().annotations, type = 'readability-range-geometry';
  if (annotations.filter(item => item.type === type).length < 6) {
    annotations.push({ type, description: JSON.stringify({ label, ...measured.diagnostics }) });
  } else if (!annotations.some(item => item.type === `${type}-truncated`)) {
    annotations.push({ type: `${type}-truncated`, description: 'Further geometry witnesses omitted after six per case' });
  }
}
async function expectReadableNode(node, label) {
  await expect(node).toHaveCount(1);
  await node.scrollIntoViewIfNeeded();
  await expect(node).toBeVisible();
  const measured = await node.evaluate(measurePtmmReadability);
  retainReadabilityGeometry(measured, label);
  expect(measured.violations, `${label}: text must be visible and reachable through every clipping/scrolling ancestor; geometry=${JSON.stringify(measured.diagnostics)}`).toEqual([]);
}
async function expectReadable(context, mode) {
  // The reviewed component has exactly one direct source-value span and one
  // strong caveat. Wrapper bounds/text alone cannot prove those are visible.
  const value = context.locator(':scope > span');
  const warning = context.locator(':scope > strong');
  await expectReadableNode(value, 'Source value');
  await expectReadableNode(warning, 'Applicability and unit caveat');
  const detail = context.locator('xpath=ancestor::dd[1]');
  const unit = await detail.count() ? detail.locator('xpath=..').locator(':scope > span.catalog-spec-text')
    : mode === 'static' ? value : context.locator('xpath=ancestor::tr[1]').locator(':scope > th');
  if (unit !== value) await expectReadableNode(unit, 'Rendered unit');
  const link = context.getByRole('link', { name: 'Стр. 68', exact: true });
  await link.scrollIntoViewIfNeeded();
  const linkMeasured = await link.evaluate(measurePtmmReadability, { requireTargetInViewport: true });
  expect(linkMeasured.violations, `The source link must be visible after ordinary scrolling; geometry=${JSON.stringify(linkMeasured.diagnostics)}`).toEqual([]);
  await link.click({ trial: true });
}
async function expectQualified(page, dto, mode) {
  const contexts = contextFor(page, dto.public_key);
  await expect(contexts).toHaveCount(2);
  const dimensions = dto.specs.technicalSpecs.filter(spec => dimensionLabels.includes(spec.label));
  for (const spec of dimensions) {
    const family = spec.label === dimensionLabels[0] ? 'ПТМ' : 'ТДЕ';
    const context = contexts.filter({ hasText: `${family} в таблице источника:` });
    await expect(context).toHaveCount(1);
    await expect(context).toContainText(spec.value);
    await expect(context).toContainText(`Применимость этих размеров к ${dto.translations.ru.name} не подтверждена.`);
    await expect(context).toContainText(ptmmUnitCaveat);
    await expect(context.getByRole('link', { name: 'Стр. 68', exact: true })).toHaveAttribute('href', ptmmSourceHref);
    expect(await context.evaluate(element => !element.closest('details'))).toBe(true);
    const rendered = await context.evaluate(measurePtmmRenderedUnit, { mode, label: spec.label, value: spec.value, family });
    expect(rendered.actual, `${rendered.kind}: stored unit must be rendered outside the caveat`).toBe(rendered.expected);
    expect(rendered.valid).toBe(true);
    await expectReadable(context, mode);
  }
}
async function expectNoPageOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function visitSourceAndReturn(page, id) {
  await contextFor(page, id).first().getByRole('link', { name: 'Стр. 68', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/source\?page=68$/);
  await expect(page.getByLabel('Страница исходного каталога')).toHaveValue('68');
  const image = page.locator('img[src="/catalog-source/page-068.webp"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.goBack();
  await expect(contextFor(page, id)).toHaveCount(2);
}
async function installApiFixture(page, state) {
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: state.rows.length, items: state.rows } }));
}

for (const mode of ['static', 'api']) {
  for (const [index, id] of ptmmIds.entries()) test(`${mode} PTMM ${id}: adjacent source and unit caveats, source link and restored state`, async ({ page }) => {
    const [original] = ptmmPublicDtos([id]), state = { rows: [original] };
    if (mode === 'api') await installApiFixture(page, state);
    const href = `/catalog/${id}${mode === 'api' ? '?source=api' : ''}`;
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(original.translations.ru.name);
    await expectQualified(page, original, mode);
    await expect(page.locator('details.catalog-data-warning[open]')).toHaveCount(0);
    await expectNoPageOverflow(page);
    await visitSourceAndReturn(page, id);
    await expectQualified(page, original, mode);
    if (mode === 'api') {
      // Three distinct owner edits, exercised across the three existing cases.
      // None may borrow static data or the reviewed record's applicability note.
      const kind = ['dimension', 'uuid', 'source'][index];
      state.rows = [malformedPtmmDto(original, kind)];
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(original.translations.ru.name);
      await expect(contextFor(page, id)).toHaveCount(0);
      if (kind === 'dimension') await expect(page.locator('.technical-specs')).toContainText('111×222×333');
      state.rows = [original];
      await page.reload();
      await expectQualified(page, original, mode);
    }
  });

  test(`${mode} PTMM comparison: all six caveats, source links and qualified differences`, async ({ page }) => {
    const originals = ptmmPublicDtos(), state = { rows: originals };
    if (mode === 'api') await installApiFixture(page, state);
    await page.goto(`/catalog/compare?${mode === 'api' ? 'source=api&' : ''}ids=${ptmmIds.join(',')}`);
    await expect(page.locator('[data-ptmm-dimension-context]')).toHaveCount(6);
    for (const dto of originals) await expectQualified(page, dto, mode);
    await expectNoPageOverflow(page);
    if (mode === 'static') {
      const differences = page.getByLabel('Только различия');
      await differences.check();
      for (const dto of originals) await expectQualified(page, dto, mode);
      await differences.uncheck();
      // Equal numbers must not erase the different evidence status.
      await page.goto('/catalog/compare?ids=cat-ptm-tded-v001,cat-ptm-tded-v002');
      await page.getByLabel('Только различия').check();
      await expectQualified(page, originals[0], mode);
      const dimensions = page.locator('tbody tr').filter({ has: page.locator('th', { hasText: /^Габаритные размеры В×Ш×Г$/ }) });
      await expect(dimensions).toHaveCount(1);
      await expect(dimensions.locator('td').first()).toHaveText('800×600×380 мм');
    } else {
      state.rows = [malformedPtmmDto(originals[0], 'dimension'), ...originals.slice(1)];
      await page.reload();
      await expect(contextFor(page, originals[0].public_key)).toHaveCount(0);
      await expect(page.locator('tbody')).toContainText('111×222×333');
      for (const dto of originals.slice(1)) await expectQualified(page, dto, mode);
      state.rows = originals;
      await page.reload();
      await expect(page.locator('[data-ptmm-dimension-context]')).toHaveCount(6);
    }
    await visitSourceAndReturn(page, originals[0].public_key);
    await expectQualified(page, originals[0], mode);
  });
}
