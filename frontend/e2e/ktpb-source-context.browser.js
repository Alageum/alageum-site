import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ktpbIds, ktpbPublicDtos, malformedKtpbDto, ktpbSourceHref, ktpbSourceImage, ktpbFigureKey, ktpbFigureHeading, ktpbLegacyGeometry } from './helpers/ktpb-source-context-fixtures.mjs';
import { measureKtpbReadability } from './helpers/ktpb-source-context-dom.mjs';
import { capturePtmmBrowserEvents } from './helpers/ptmm-browser-events.mjs';

const records = new WeakMap();
const contextFor = (page, id) => page.locator(`[data-source-context-for="${id}"]`);
const memberSelect = page => page.getByLabel('Запись для просмотра', { exact: true });
test.beforeEach(async ({ page }, testInfo) => {
  records.set(page, { events: [capturePtmmBrowserEvents(page, testInfo)], measurements: [], screenshots: [], popupCount: 0 });
});
test.afterEach(async ({ page }, testInfo) => {
  const evidence = records.get(page);
  if (!evidence) throw new Error('Per-case KTPB browser evidence was not initialized');
  // Retain evidence even after an assertion failure; do not infer browser events
  // from the fixture or from the runner's console.
  const results = [];
  for (const recorder of evidence.events) results.push(await recorder.finish());
  const output = testInfo.outputPath('ktpb-observed-dom.json');
  const body = JSON.stringify({ format: 'ktpb-observed-dom-v1', testId: testInfo.testId, project: testInfo.project.name,
    statusAtCaptureFinish: testInfo.status, measurements: evidence.measurements, screenshots: evidence.screenshots }, null, 2);
  if (Buffer.byteLength(body) > 256 * 1024) throw new Error('KTPB DOM evidence exceeded its explicit bound');
  await writeFile(output, body);
  expect(await readFile(output, 'utf8')).toBe(body);
  await testInfo.attach('ktpb-observed-dom.json', { path: output, contentType: 'application/json' });
  for (const events of results) {
    expect(events.retention.saved).toBe(true);
    expect(events.capture.errors).toEqual([]);
    expect(events.capture.pageErrorCount).toBe(0);
    expect(events.capture.droppedEvents).toBe(0);
    expect(events.capture.truncatedEvents).toBe(0);
    expect(events.events.filter(event => event.kind === 'console' && event.level === 'error')).toEqual([]);
  }
});

async function retainScreenshot(page, name, target = page) {
  const evidence = records.get(page), testInfo = test.info();
  if (evidence.screenshots.length >= 6) throw new Error('KTPB screenshot count exceeded six per case');
  const output = testInfo.outputPath(`${name}.png`);
  const options = { animations: 'disabled', scale: 'css' };
  if (target === page) options.fullPage = false;
  const png = await target.screenshot(options);
  expect(png.byteLength, 'Each retained viewport/canvas PNG stays below 2 MiB').toBeLessThanOrEqual(2 * 1024 * 1024);
  await writeFile(output, png);
  expect((await readFile(output)).equals(png)).toBe(true);
  evidence.screenshots.push({ name, bytes: png.byteLength, sha256: createHash('sha256').update(png).digest('hex') });
  await testInfo.attach(`${name}.png`, { path: output, contentType: 'image/png' });
  return png;
}
async function readable(page, node, label, requireTargetInViewport = false) {
  await expect(node).toHaveCount(1);
  await node.scrollIntoViewIfNeeded();
  await expect(node).toBeVisible();
  const measurement = await node.evaluate(measureKtpbReadability, { requireTargetInViewport });
  const evidence = records.get(page);
  if (evidence.measurements.length >= 128) throw new Error('KTPB measurement count exceeded its explicit bound');
  evidence.measurements.push({ label, ...measurement });
  expect(measurement.violations, `${label}: ${JSON.stringify(measurement.diagnostics)}`).toEqual([]);
}
async function sourcePanel(page, id, { failed = false } = {}) {
  const panel = contextFor(page, id);
  await expect(page.locator('[data-source-context-for]')).toHaveCount(1);
  await expect(panel.getByRole('heading', { level: 3 })).toHaveText(ktpbFigureHeading);
  await expect(panel).toContainText('Заголовок страницы содержит 35/10(6)');
  await expect(panel).toContainText(id === ktpbIds[0]
    ? 'Его соответствие исполнениям семейства, включая 110/35/10(6), не установлено.'
    : 'Наличие ступени 35 кВ этим чертежом не подтверждено.');
  const figure = panel.locator(`[data-source-figure="${ktpbFigureKey}"]`);
  await expect(figure).toHaveCount(1);
  await expect(figure.locator('li')).toHaveCount(4);
  const image = figure.locator('img');
  if (failed) {
    await expect(image).toHaveCount(0);
    await expect(figure.getByRole('status')).toHaveText('Исходное изображение недоступно. Откройте полную страницу каталога.');
    await readable(page, figure.getByRole('status'), `${id}: failed-image fallback`);
  } else {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('src', ktpbSourceImage);
    await expect(image).toHaveAttribute('alt', /Полная страница 56.*расположен боком/);
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth === 1406 && element.naturalHeight === 1988)).toBe(true);
    const bounds = await image.evaluate(element => {
      const rect = element.getBoundingClientRect(), parent = element.closest('figure').getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
        parentLeft: parent.left, parentRight: parent.right, viewportWidth: innerWidth, viewportHeight: innerHeight, objectFit: style.objectFit };
    });
    records.get(page).measurements.push({ label: `${id}: source-image`, ...bounds });
    expect(bounds.width).toBeGreaterThan(100); expect(bounds.height).toBeGreaterThan(100);
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft - 1); expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight + 1);
    expect(bounds.left).toBeGreaterThanOrEqual(-1); expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
    expect(bounds.top).toBeGreaterThanOrEqual(-1); expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
    expect(bounds.objectFit).toBe('contain');
  }
  const texts = panel.locator('h3, h4, p, li');
  for (let i = 0; i < await texts.count(); i++) await readable(page, texts.nth(i), `${id}: source text ${i}`);
  const link = panel.getByRole('link', { name: 'Открыть страницу 56 целиком (новая вкладка)', exact: true });
  await expect(link).toHaveAttribute('href', ktpbSourceHref);
  await expect(link).toHaveAttribute('target', '_blank');
  await readable(page, link, `${id}: full-page source link`, true);
  await link.click({ trial: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function visitSource(page, id) {
  const selection = await memberSelect(page).count() ? await memberSelect(page).inputValue() : null;
  const evidence = records.get(page), info = test.info();
  let popup;
  const capture = opened => {
    if (++evidence.popupCount > 2) throw new Error('Unexpected additional KTPB source popup');
    const scope = `source-popup-${evidence.popupCount}`;
    const scopedInfo = {
      testId: info.testId, title: `${info.title}: ${scope}`, project: info.project, retry: info.retry, workerIndex: info.workerIndex,
      get status() { return info.status; }, get expectedStatus() { return info.expectedStatus; },
      outputPath: (...segments) => info.outputPath(scope, ...segments),
      attach: (name, options) => info.attach(`${scope}-${name}`, options),
    };
    evidence.events.push(capturePtmmBrowserEvents(opened, scopedInfo));
  };
  // Install before navigation; capture starts as soon as the new Page is
  // exposed by Playwright. No claim is made about events before that boundary.
  page.context().on('page', capture);
  try {
    const popupPromise = page.waitForEvent('popup');
    await contextFor(page, id).getByRole('link', { name: 'Открыть страницу 56 целиком (новая вкладка)', exact: true }).click();
    popup = await popupPromise;
    await expect(popup).toHaveURL(/\/catalog\/source\?page=56$/);
    await expect(popup.getByLabel('Страница исходного каталога')).toHaveValue('56');
    const image = popup.locator(`img[src="${ktpbSourceImage}"]`);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth === 1406)).toBe(true);
  } finally {
    page.context().off('page', capture);
    if (popup) await popup.close();
  }
  if (selection !== null) await expect(memberSelect(page)).toHaveValue(selection);
  await expect(contextFor(page, id)).toHaveCount(1);
}
async function canvasPixels(page, canvas, name, before = null) {
  const png = await retainScreenshot(page, name, canvas);
  const pixels = await page.evaluate(async ({ current, previous }) => {
    async function decode(data) {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const copy = document.createElement('canvas'); copy.width = image.naturalWidth; copy.height = image.naturalHeight;
      const context = copy.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, copy.width, copy.height);
    }
    const image = await decode(current), old = previous ? await decode(previous) : null;
    if (old && (old.width !== image.width || old.height !== image.height)) throw new Error('Canvas dimensions changed during rotation');
    let darkPixels = 0, changedPixels = 0;
    const colors = new Set();
    for (let y = 12; y < image.height - 12; y++) for (let x = 12; x < image.width - 12; x++) {
      const offset = (y * image.width + x) * 4, rgb = [...image.data.subarray(offset, offset + 3)];
      if (Math.min(...rgb) < 200) darkPixels++;
      colors.add(rgb.map(value => Math.floor(value / 8)).join(','));
      if (old && rgb.reduce((sum, value, channel) => sum + Math.abs(value - old.data[offset + channel]), 0) > 30) changedPixels++;
    }
    return { width: image.width, height: image.height, darkPixels, colors: colors.size, changedPixels };
  }, { current: png.toString('base64'), previous: before?.toString('base64') || null });
  records.get(page).measurements.push({ label: name, ...pixels });
  expect(pixels.darkPixels).toBeGreaterThan(pixels.width * pixels.height * 0.01);
  expect(pixels.colors).toBeGreaterThan(12);
  if (before) expect(pixels.changedPixels).toBeGreaterThan(pixels.width * pixels.height * 0.005);
  return png;
}
async function installApi(page, state) {
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: state.rows.length, items: state.rows } }));
}
async function legacyProvenance(viewer) {
  const provenance = viewer.locator('xpath=..').locator(':scope > .visual-provenance');
  await expect(provenance.locator(':scope > strong')).toHaveText('Общая схема конструкции по иллюстрации серии');
  await expect(provenance.getByRole('link', { name: 'стр. 55', exact: true })).toHaveAttribute('href', '/catalog/source?page=55');
  await expect(provenance).toContainText('не CAD и не модель конкретного исполнения');
}
async function openRecord(page, id, mode, state) {
  if (mode === 'api') await installApi(page, state);
  await page.goto(`/catalog/${id}${mode === 'api' ? '?source=api' : ''}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(state.rows.find(row => row.public_key === id).translations.ru.name);
}
async function rejectAndRestore(page, state, id, kind) {
  const original = state.rows;
  state.rows = original.map(row => row.public_key === id ? malformedKtpbDto(row, kind) : row);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(original.find(row => row.public_key === id).translations.ru.name);
  await expect(contextFor(page, id)).toHaveCount(0);
  if (kind === 'owner-edit') await expect(page.locator('.technical-specs')).toContainText('999');
  state.rows = original;
  await page.reload();
  await sourcePanel(page, id);
}

for (const mode of ['static', 'api']) {
  test(`${mode} KTPB 110: source qualification, full-page link and malformed provenance`, async ({ page }) => {
    const state = { rows: ktpbPublicDtos() }, id = ktpbIds[2];
    await openRecord(page, id, mode, state);
    await sourcePanel(page, id);
    await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
    await retainScreenshot(page, 'qualified-110-caption');
    await visitSource(page, id);
    if (mode === 'api') for (const kind of ['uuid', 'source']) await rejectAndRestore(page, state, id, kind);
  });

  test(`${mode} KTPB family: preserve 35 kV geometry and separate 110/220 selection`, async ({ page }) => {
    const state = { rows: ktpbPublicDtos() };
    await openRecord(page, ktpbIds[0], mode, state);
    await sourcePanel(page, ktpbIds[0]);
    await expect(memberSelect(page)).toHaveValue('');
    const viewer = page.locator(`[data-equipment-model="${ktpbLegacyGeometry}"]`);
    await expect(viewer).toHaveCount(1);
    await legacyProvenance(viewer);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready');
    const canvas = viewer.locator('canvas');
    const before = await canvasPixels(page, canvas, 'existing-35-model');
    await viewer.getByRole('button', { name: 'Повернуть модель вправо', exact: true }).click();
    await canvasPixels(page, canvas, 'existing-35-model-rotated', before);
    await memberSelect(page).selectOption(ktpbIds[1]);
    await expect(page.locator('[data-source-context-for]')).toHaveCount(0);
    await expect(viewer).toHaveCount(1); await expect(page.locator('canvas')).toHaveCount(0);
    await legacyProvenance(viewer);
    await expect(page.locator('.family-selected-record')).toHaveAttribute('data-selected-member', ktpbIds[1]);
    await memberSelect(page).selectOption(ktpbIds[2]);
    await sourcePanel(page, ktpbIds[2]);
    await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
    await expect(page.locator('.family-selected-record .catalog-button')).toHaveAttribute('href', `/catalog/${ktpbIds[2]}${mode === 'api' ? '?source=api' : ''}`);
    await visitSource(page, ktpbIds[2]);
    await memberSelect(page).selectOption(ktpbIds[3]);
    await expect(page.locator('[data-source-context-for], [data-equipment-model], canvas')).toHaveCount(0);
    await expect(page.locator('.family-selected-record')).toHaveAttribute('data-selected-member', ktpbIds[3]);
    await memberSelect(page).selectOption('');
    await sourcePanel(page, ktpbIds[0]); await expect(viewer).toHaveCount(1);
    await legacyProvenance(viewer);
    await retainScreenshot(page, 'family-reset-caption');
    if (mode === 'api') await rejectAndRestore(page, state, ktpbIds[0], 'owner-edit');
  });

  test(`${mode} KTPB 110: failed image preserves caption, source link and reload recovery`, async ({ page }) => {
    const state = { rows: ktpbPublicDtos() }, id = ktpbIds[2];
    const broken = route => route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('invalid-image-for-decode-test') });
    await page.route(`**${ktpbSourceImage}`, broken);
    await openRecord(page, id, mode, state);
    // Lazy image loading must reach the actual source image before its fallback.
    await contextFor(page, id).locator(`[data-source-figure="${ktpbFigureKey}"]`).scrollIntoViewIfNeeded();
    await sourcePanel(page, id, { failed: true });
    await retainScreenshot(page, 'detail-image-failure');
    await page.unroute(`**${ktpbSourceImage}`, broken);
    await visitSource(page, id);
    await page.reload(); await sourcePanel(page, id);
    await retainScreenshot(page, 'detail-image-recovered');
    if (mode === 'api') {
      const original = state.rows; state.rows = [];
      await page.reload(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Товар недоступен');
      await expect(page.locator('[data-source-context-for], [data-equipment-model]')).toHaveCount(0);
      state.rows = original; await page.reload(); await sourcePanel(page, id);
    }
  });

  test(`${mode} KTPB family: failed image, selection and overview recovery`, async ({ page }) => {
    const state = { rows: ktpbPublicDtos() };
    const broken = route => route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from('invalid-image-for-decode-test') });
    await page.route(`**${ktpbSourceImage}`, broken);
    await openRecord(page, ktpbIds[0], mode, state);
    await contextFor(page, ktpbIds[0]).locator(`[data-source-figure="${ktpbFigureKey}"]`).scrollIntoViewIfNeeded();
    await sourcePanel(page, ktpbIds[0], { failed: true });
    await expect(page.locator(`[data-equipment-model="${ktpbLegacyGeometry}"]`)).toHaveCount(1);
    await retainScreenshot(page, 'family-image-failure');
    await page.unroute(`**${ktpbSourceImage}`, broken);
    await memberSelect(page).selectOption(ktpbIds[2]); await sourcePanel(page, ktpbIds[2]);
    await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
    await memberSelect(page).selectOption(''); await sourcePanel(page, ktpbIds[0]);
    await expect(page.locator(`[data-equipment-model="${ktpbLegacyGeometry}"]`)).toHaveCount(1);
    await visitSource(page, ktpbIds[0]);
    await retainScreenshot(page, 'family-image-recovered');
  });
}
