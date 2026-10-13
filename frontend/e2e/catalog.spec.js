import { expect, test } from "@playwright/test";
import catalogRelease from "../../backend-node/data/catalog-release.json" with { type: "json" };
import measurementColumnReview from "../../docs/catalog-transformers-2026/review/measurement-column-completion/prototype-independent-review.json" with { type: "json" };
import { expectCatalogViewport, expectReceivesPointer } from "./helpers/catalog-viewport";

const selectionKey = "alageum.catalog.selection.v1";
const catalogRows = (page) => page.getByRole("region", { name: "Таблица оборудования, прокрутка по горизонтали" }).locator("tbody tr");
const foundCount = (page) => page.getByRole("status").filter({ hasText: "Найдено:" });

async function openFilters(page) {
  const toggle = page.getByRole("button", { name: /Параметры и категории/ });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  return page.getByRole("complementary", { name: "Фильтры каталога" });
}

async function expectShell(page) {
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "ALAGEUM Electric — главная" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectDecodedImage(image) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0 && element.naturalHeight > 0), {
    message: "The referenced source image must load and decode, not merely have a valid-looking src",
  }).toBe(true);
}

async function attachSourceEvidence(table, testInfo, name) {
  await testInfo.attach(`${name}.png`, { body: await table.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  if (await table.evaluate(element => element.scrollWidth > element.clientWidth + 1)) {
    await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await testInfo.attach(`${name}-right-columns.png`, { body: await table.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    await table.evaluate(element => { element.scrollLeft = 0; });
  }
}

async function canvasEvidence(canvas, testInfo, name, previous = null, minimumInkRatio = 0.01) {
  const png = await canvas.screenshot({ animations: "disabled" });
  // Decode actual Playwright screenshots with built-in browser APIs. Detached
  // 2D canvases neither modify the page nor depend on optional native packages.
  const metrics = await canvas.page().evaluate(async ({ current, previous }) => {
    async function decode(base64) {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const copy = document.createElement("canvas");
      copy.width = image.naturalWidth;
      copy.height = image.naturalHeight;
      const context = copy.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, copy.width, copy.height);
    }
    const image = await decode(current);
    const before = previous ? await decode(previous) : null;
    if (before && (before.width !== image.width || before.height !== image.height)) throw new Error("Canvas size changed during rotation");
    let darkPixels = 0;
    let changedPixels = 0;
    const colors = new Set();
    // Ignore the focus ring and edges. The empty radial background is lighter
    // than 200, so DOM readiness or a blank canvas cannot pass this check.
    for (let y = 12; y < image.height - 12; y += 1) {
      for (let x = 12; x < image.width - 12; x += 1) {
        const offset = (y * image.width + x) * 4;
        const rgb = [...image.data.subarray(offset, offset + 3)];
        if (Math.min(...rgb) < 200) darkPixels += 1;
        colors.add(rgb.map(value => Math.floor(value / 8)).join(","));
        if (before && rgb.reduce((sum, value, channel) => sum + Math.abs(value - before.data[offset + channel]), 0) > 30) changedPixels += 1;
      }
    }
    return { width: image.width, height: image.height, darkPixels, colors: colors.size, changedPixels };
  }, { current: png.toString("base64"), previous: previous?.png.toString("base64") || null });
  await testInfo.attach(`${name}.png`, { body: png, contentType: "image/png" });
  await testInfo.attach(`${name}-pixels.json`, { body: Buffer.from(JSON.stringify(metrics)), contentType: "application/json" });
  expect(metrics.darkPixels, "A real rendered model must occupy the interior of the canvas").toBeGreaterThan(metrics.width * metrics.height * minimumInkRatio);
  expect(metrics.colors, "A rendered model must have more than the empty background's colors").toBeGreaterThan(12);
  return { png, ...metrics };
}

test("demo catalog opens without backend requests and shares the site shell", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (request) => { if (/\/api\/v1\//.test(request.url())) apiRequests.push(request.url()); });
  await page.goto("/catalog?source=demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Найдите оборудование\s*по параметрам/);
  await expect(page.getByText("Демонстрационный каталог", { exact: true })).toBeVisible();
  await expect(foundCount(page)).toHaveText("Найдено: 9");
  await expect(catalogRows(page)).toHaveCount(6);
  await expectShell(page);
  expect(apiRequests).toEqual([]);
});

test("search persists in the URL and handles empty results and reset", async ({ page }) => {
  await page.goto("/catalog?source=demo");
  await page.getByLabel("Поиск по каталогу").fill("DEMO-001");
  await page.getByLabel("Поиск по каталогу").press("Enter");
  await expect(page).toHaveURL(/q=DEMO-001/);
  await expect(catalogRows(page)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Demo Transformer A", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Поиск по каталогу")).toHaveValue("DEMO-001");
  await page.getByLabel("Поиск по каталогу").fill("нет-такого-оборудования");
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(page.getByRole("heading", { name: "По этим параметрам ничего не найдено" })).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  await expect(foundCount(page)).toHaveText("Найдено: 9");
  await expect(page.getByLabel("Поиск по каталогу")).toHaveValue("");
});

test("category and parameter filters survive reload and back-forward navigation", async ({ page }) => {
  await page.goto("/catalog?source=demo");
  const filters = await openFilters(page);
  await filters.getByRole("button", { name: /^Трансформаторы/ }).click();
  await expect(foundCount(page)).toHaveText("Найдено: 5");
  await filters.getByLabel("Охлаждение", { exact: true }).selectOption("Сухое");
  await expect(foundCount(page)).toHaveText("Найдено: 2");
  await filters.getByLabel("Мощность, кВА", { exact: true }).selectOption("1600");
  await expect(foundCount(page)).toHaveText("Найдено: 1");
  await expect(page).toHaveURL(/power=1600/);
  await page.goBack();
  await expect(foundCount(page)).toHaveText("Найдено: 2");
  await page.goForward();
  await expect(foundCount(page)).toHaveText("Найдено: 1");
  await page.reload();
  await expect(foundCount(page)).toHaveText("Найдено: 1");
  await expect(page.getByRole("link", { name: "Демо · сухой трансформатор 1600", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сбросить все", exact: true }).click();
  await expect(foundCount(page)).toHaveText("Найдено: 9");
});

test("pagination and sorting update results without losing the catalog", async ({ page }) => {
  await page.goto("/catalog?source=demo");
  await page.getByRole("button", { name: "Следующая страница", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(catalogRows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Следующая страница", exact: true })).toBeDisabled();
  await page.getByLabel("Сортировка", { exact: true }).selectOption("power-asc");
  await expect(page).toHaveURL(/sort=power-asc/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(catalogRows(page)).toHaveCount(6);
  await expect(catalogRows(page).first().getByRole("cell").nth(2)).toHaveText("630");
  await page.getByLabel("Сортировка", { exact: true }).selectOption("power-desc");
  await expect(catalogRows(page).first().getByRole("cell").nth(2)).toHaveText("1600");
});

test("details disclose unknown specs and documents and support keyboard tabs", async ({ page }) => {
  await page.goto("/catalog/demo-001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo Transformer A");
  await expect(page.getByRole("tabpanel").locator("dd")).toHaveText(["—", "—", "—", "—", "—"]);
  await page.getByRole("tab", { name: /^Документы/ }).click();
  await expect(page.getByRole("heading", { name: "Документы ещё не добавлены" })).toBeVisible();
  await expect(page.locator("a[download]")).toHaveCount(0);
  await page.getByRole("tab", { name: /^Документы/ }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Описание", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Описание позиции" })).toBeVisible();
  await page.getByRole("tab", { name: "Описание", exact: true }).press("Home");
  await expect(page.getByRole("tab", { name: "Характеристики", exact: true })).toHaveAttribute("aria-selected", "true");
  await expectShell(page);
});

test("unknown product has a useful recovery route", async ({ page }) => {
  await page.goto("/catalog/unknown-product");
  await expect(page.getByRole("heading", { name: "Позиция не найдена" })).toBeVisible();
  await page.getByRole("link", { name: "Вернуться в каталог", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(foundCount(page)).toHaveText(`Найдено: ${catalogRelease.recordCount}`);
});

test("comparison deep links expose differences and handle removal", async ({ page }) => {
  await page.goto("/catalog/compare?ids=demo-001,demo-002");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сравнение оборудования");
  await expect(page.getByRole("rowheader", { name: "Категория", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Только различия", exact: true }).check();
  await expect(page.getByRole("rowheader", { name: "Категория", exact: true })).toHaveCount(0);
  const powerRow = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Номинальная мощность", exact: true }) });
  await expect(powerRow.getByRole("cell")).toHaveText(["—", "630 кВА"]);
  await expectShell(page);
  await page.getByRole("button", { name: "Убрать DEMO-002 из сравнения", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Выберите минимум две позиции" })).toBeVisible();
});

test("comparison selection enforces four positions and supports a direct link", async ({ page }) => {
  await page.goto("/catalog?source=demo&category=transformers");
  for (const sku of ["DEMO-001", "DEMO-002", "DEMO-003", "DEMO-004"]) {
    await page.getByRole("checkbox", { name: `Сравнить ${sku}`, exact: true }).check();
  }
  await page.getByRole("checkbox", { name: "Сравнить DEMO-005", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Сравнить DEMO-005", exact: true })).not.toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: "Для сравнения можно выбрать до 4 позиций" })).toBeVisible();
  await page.getByRole("link", { name: /^Сравнить \(4\)/ }).click();
  await expect(page.getByText("Выбрано: 4 из 4", { exact: true })).toBeVisible();
  await page.goto("/catalog/compare?ids=demo-001,unknown,demo-001,demo-002,demo-003,demo-004,demo-005");
  await expect(page.getByText("Выбрано: 4 из 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Убрать DEMO-005 из сравнения", exact: true })).toHaveCount(0);
});

test("comparison clear follows filter history and remains cleared after reload", async ({ page }) => {
  await page.goto("/catalog?source=demo&category=transformers");
  const checkbox = page.getByRole("checkbox", { name: "Сравнить DEMO-001", exact: true });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByLabel("Поиск по каталогу").fill("DEMO-001");
  await page.getByRole("button", { name: /^Найти/ }).click();
  await expect(page).toHaveURL(/q=DEMO-001/);
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(page).not.toHaveURL(/compare=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/q=DEMO-001/);
  await expect(checkbox).toBeChecked();
  await page.goForward();
  await expect(page).toHaveURL(/q=DEMO-001/);
  await expect(checkbox).not.toBeChecked();
  await page.reload();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
});

test("local selection persists repeated adds, bounds quantities, exports and removes", async ({ page }) => {
  await page.goto("/selection");
  await expect(page.getByRole("heading", { name: "В подборке пока нет оборудования" })).toBeVisible();
  await page.goto("/catalog/demo-001");
  await page.getByRole("button", { name: "В подборку DEMO-001", exact: true }).click();
  await page.getByRole("button", { name: "В подборку DEMO-001", exact: true }).click();
  await page.getByRole("link", { name: "Открыть подборку →", exact: true }).click();
  const quantity = page.getByRole("spinbutton", { name: "Количество DEMO-001", exact: true });
  await expect(quantity).toHaveValue("2");
  await quantity.fill("0");
  await quantity.press("Tab");
  await expect(quantity).toHaveValue("1");
  await quantity.fill("10000");
  await quantity.press("Tab");
  await expect(quantity).toHaveValue("999");
  await quantity.fill("3");
  await quantity.press("Tab");
  await page.reload();
  await expect(quantity).toHaveValue("3");
  await expectShell(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Скачать список CSV/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("alageum-selection.csv");
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk.toString("utf8");
  expect(csv).toContain('ДЕМО — не заказ');
  expect(csv).toContain('"DEMO-001";"Demo Transformer A";"3"');
  await page.getByRole("button", { name: "Удалить DEMO-001", exact: true }).click();
  await expect(page.getByRole("heading", { name: "В подборке пока нет оборудования" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "В подборке пока нет оборудования" })).toBeVisible();
});

test("malformed saved selection is ignored without crashing", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "invalid-json"), selectionKey);
  await page.goto("/selection");
  await expect(page.getByRole("heading", { name: "В подборке пока нет оборудования" })).toBeVisible();
  await expectShell(page);
});

test("blocked local storage keeps the current selection usable and explains its limit", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === window.localStorage) throw new DOMException("Storage blocked", "SecurityError");
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage) throw new DOMException("Storage blocked", "SecurityError");
      return originalSet.call(this, key, value);
    };
  });
  await page.goto("/catalog/demo-001");
  await page.getByRole("button", { name: "В подборку DEMO-001", exact: true }).click();
  await page.getByRole("link", { name: "Открыть подборку →", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Количество DEMO-001", exact: true })).toHaveValue("1");
  await expect(page.getByRole("status").filter({ hasText: "Хранилище браузера недоступно" })).toBeVisible();
});

test("explicit API errors never silently substitute demo products", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/v1/catalog/products?*", async (route) => {
    attempts += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Catalog temporarily unavailable" } }) });
  });
  await page.goto("/catalog?source=api");
  await expect(page.getByRole("alert", { name: "Ошибка каталога" })).toContainText("Сервер каталога недоступен");
  await expect(page.getByRole("link", { name: "Demo Transformer A", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("alert", { name: "Ошибка каталога" })).toBeVisible();
  await page.getByRole("link", { name: "Справочный статический каталог", exact: true }).click();
  await expect(foundCount(page)).toHaveText(`Найдено: ${catalogRelease.recordCount}`);
});

test("shared navigation closes after Escape and a route change", async ({ page, isMobile }) => {
  // Also cover the fully hydrated public catalog before retaining the original
  // demo navigation/Escape flow below. Both desktop and mobile must fit.
  await page.goto("/catalog");
  await expectCatalogViewport(page);
  await expectReceivesPointer(isMobile
    ? page.getByRole("button", { name: "Открыть навигацию", exact: true })
    : page.locator('.site-nav-link[href="/company"]'));
  await page.goto("/catalog?source=demo");
  await expectCatalogViewport(page);
  const header = page.getByRole("banner");
  if (isMobile) {
    await header.getByRole("button", { name: "Открыть навигацию", exact: true }).click();
    await expect(header.getByRole("navigation", { name: "Мобильная навигация", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(header.getByRole("button", { name: "Открыть навигацию", exact: true })).toHaveAttribute("aria-expanded", "false");
    await header.getByRole("button", { name: "Открыть навигацию", exact: true }).click();
    await header.getByRole("navigation", { name: "Мобильная навигация", exact: true }).getByRole("link", { name: "Компания", exact: true }).click();
    await expect(page).toHaveURL(/\/company$/);
    await expect(header.getByRole("button", { name: "Открыть навигацию", exact: true })).toHaveAttribute("aria-expanded", "false");
  } else {
    const catalog = header.getByRole("navigation", { name: "Основная навигация", exact: true }).getByRole("link", { name: "Каталог", exact: true });
    await catalog.focus();
    await expect(catalog).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(catalog).toHaveAttribute("aria-expanded", "false");
    await expect(catalog).toBeFocused();
    await catalog.press("ArrowDown");
    await expect(header.locator("#site-mega-navigation").getByRole("link", { name: /^Трансформаторы/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/category=transformers/);
    await expect(catalog).toHaveAttribute("aria-expanded", "false");
  }
  await expectShell(page);
});

test("imported catalog distinguishes families from model and template references", async ({ page }) => {
  await page.goto("/catalog?category=protection&recordKind=family");
  await expect(foundCount(page)).toHaveText("Найдено: 6");
  await expect(catalogRows(page)).toHaveCount(6);
  await expectShell(page);
  await page.reload();
  await expect(foundCount(page)).toHaveText("Найдено: 6");
});

test("imported model shows row-specific voltage and original page links", async ({ page }) => {
  await page.goto("/catalog/cat-yatp-v001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ЯТП-0.25-220-12У3");
  await expect(page.locator(".summary-specs")).toContainText("220 → 12 В");
  await page.getByRole("tab", { name: /^Документы/ }).click();
  await page.getByRole("tabpanel", { name: /^Документы/ }).getByRole("link", { name: "стр. 65", exact: true }).click();
  await expect(page).toHaveURL(/catalog\/source\/?\?page=65/);
  await expect(page.getByRole("img", { name: /страница 65$/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ЯТП-0.25-220-12У3");
});

test("source viewer keeps damaged labels disclosed and supports repeated navigation", async ({ page }) => {
  await page.goto("/catalog/source?page=30");
  await expect(page.getByText(/Две подписи над габаритными чертежами повреждены/)).toBeVisible();
  await page.getByRole("button", { name: "Далее →", exact: true }).click();
  await expect(page.getByLabel("Страница исходного каталога")).toHaveValue("31");
  await page.getByRole("button", { name: "← Назад", exact: true }).click();
  await expect(page.getByLabel("Страница исходного каталога")).toHaveValue("30");
  await page.getByLabel("Страница исходного каталога").selectOption("104");
  await expect(page.getByRole("button", { name: "Далее →", exact: true })).toBeDisabled();
  await expectShell(page);
});

test("comparison retains exact 12 V versus 24 V differences", async ({ page }) => {
  await page.goto("/catalog/compare?ids=cat-yatp-v001,cat-yatp-v002");
  await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Номинальное вторичное напряжение", exact: true }) })).toContainText("12 В");
  await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Номинальное вторичное напряжение", exact: true }) })).toContainText("24 В");
  await page.getByLabel("Только различия").check();
  await expect(page.getByRole("rowheader", { name: "Номинальное вторичное напряжение", exact: true })).toBeVisible();
});


test("category navigation preserves individual models and global search", async ({ page }) => {
  await page.goto("/catalog");
  await expect(foundCount(page)).toHaveText(`Найдено: ${catalogRelease.recordCount}`);
  await expect(page.getByRole("button", { name: `Все товары (${catalogRelease.recordCount})`, exact: true })).toBeVisible();
  const filters = await openFilters(page);
  await filters.getByRole("button", { name: /^Трансформаторы/ }).click();
  await expect(foundCount(page)).toHaveText("Найдено: 590");
  await filters.getByRole("button", { name: /^Масляные трансформаторы/ }).click();
  await expect(page).toHaveURL(/equipmentType=oil-transformer/);
  await expect(catalogRows(page)).toHaveCount(6);
  await page.getByRole("button", { name: `Все товары (${catalogRelease.recordCount})`, exact: true }).click();
  await expect(foundCount(page)).toHaveText(`Найдено: ${catalogRelease.recordCount}`);
  await page.getByLabel("Поиск по каталогу").fill("ЯТП-0.25-220-12У3");
  await page.getByLabel("Поиск по каталогу").press("Enter");
  await expect(page.locator('tr[data-product-id="cat-yatp-v001"]')).toBeVisible();
  await expect(foundCount(page)).toHaveText("Найдено: 1");
  await page.reload();
  await expect(foundCount(page)).toHaveText("Найдено: 1");
  await page.getByRole("button", { name: "Сбросить все", exact: true }).click();
  await expect(foundCount(page)).toHaveText(`Найдено: ${catalogRelease.recordCount}`);
  await page.goBack();
  await expect(foundCount(page)).toHaveText("Найдено: 1");
  await page.goForward();
  await expect(foundCount(page)).toHaveText(`Найдено: ${catalogRelease.recordCount}`);
  await expectShell(page);
});

test("global parameter filters keep exact variant identities", async ({ page }) => {
  await page.goto("/catalog");
  const filters = await openFilters(page);
  await filters.getByLabel("Напряжение", { exact: true }).selectOption("220 → 12 В");
  await expect(page.locator('tr[data-product-id="cat-yatp-v001"]')).toBeVisible();
  await expect(page).not.toHaveURL(/category=/);
  await page.getByRole("checkbox", { name: "Сравнить ЯТП-0.25-220-12У3", exact: true }).check();
  await page.getByRole("button", { name: "В подборку ЯТП-0.25-220-12У3", exact: true }).click();
  await page.goto("/selection");
  await expect(page.getByRole("spinbutton", { name: "Количество ЯТП-0.25-220-12У3", exact: true })).toHaveValue("1");
});

test("shared 3D is on demand and has a no-WebGL fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (/webgl/i.test(kind)) return null;
      return original.call(this, kind, ...args);
    };
  });
  await page.goto("/catalog/cat-kik");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByText("Иллюстративная 3D-модель типа; не CAD и не чертёж конкретного исполнения", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Открыть 3D-модель", exact: true }).click();
  await expect(page.getByText(/3D недоступно в этом браузере/)).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText(/3D недоступно в этом браузере/)).toBeVisible();
  await expectShell(page);
});

test("source-only and unverified products now have readable SVG icons", async ({ page }) => {
  for (const id of ["cat-2ktpg-25-3150", "cat-skip", "cat-atp-2x25", "cat-vru"]) {
    await page.goto(`/catalog/${id}`);
    const icon = page.locator(`.model-type-label [data-product-icon="${id}"]`);
    await expect(icon.locator("svg")).toBeVisible();
    await expect(icon.locator("img")).toHaveCount(0);
    await expect(icon).not.toHaveAttribute("data-icon-type", "equipment");
    if (id === "cat-vru") {
      await expect(icon).toHaveAttribute("data-icon-confidence", "typical");
      await expect(icon.locator(".product-icon-approximation")).toHaveText("≈");
      await expect(page.getByText("Условная схема типа", {exact:true})).toBeVisible();
    }
    await expectShell(page);
  }
});

test("catalog rows use only shared vectors and variants carry their own icon", async ({ page }) => {
  await page.goto("/catalog?category=protection");
  const rows = catalogRows(page);
  await expect(rows).toHaveCount(6);
  await expect(rows.locator("[data-product-icon] svg")).toHaveCount(6);
  await expect(rows.locator(".product-thumb img")).toHaveCount(0);
  await page.goto("/catalog/cat-bktp-modular");
  const variants = page.locator(".variant-grid [data-product-icon]");
  await expect(variants).toHaveCount(2);
  await expect(variants.nth(0)).not.toHaveAttribute("data-icon-type", await variants.nth(1).getAttribute("data-icon-type"));
});


test("transformer source: 843 records retain exact admitted identities and keep source-only comparisons separate", async ({ page }) => {
  expect(catalogRelease.recordCount).toBe(843);
  await page.goto("/catalog");
  await expect(foundCount(page)).toHaveText("Найдено: 843");
  await page.getByLabel("Поиск по каталогу").fill("alageum-tmg-standard-16");
  await page.getByLabel("Поиск по каталогу").press("Enter");
  await expect(page.locator('tr[data-product-id="alageum-tmg-standard-16"]')).toBeVisible();
  await expect(page.locator('tr[data-product-id="alageum-tmg-standard-16"]')).toContainText("ТМГ-16");
  await page.goto("/catalog/alageum-tmg-standard-400");
  await expect(page.getByRole("heading", { name: "Позиция не найдена" })).toBeVisible();
  await page.goto("/catalog/tmg-400");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("400");
});

test("transformer source: physical page175 stays in the2026 PDF across repeated navigation and history", async ({ page }) => {
  await page.goto("/catalog/source?source=transformers-2026&page=175");
  await expect(page.getByLabel("Исходное издание")).toHaveValue("transformers-2026");
  await expect(page.getByLabel("Страница исходного каталога")).toHaveValue("175");
  await expect(page.locator('.source-page-image img')).toHaveAttribute('src', '/catalog-source/transformers-2026/page-175.webp');
  await expectDecodedImage(page.locator('.source-page-image img'));
  await page.getByRole("button", { name: "Далее →", exact: true }).click();
  await expect(page).toHaveURL(/source=transformers-2026&page=176/);
  await expectDecodedImage(page.locator('.source-page-image img'));
  await page.goBack();
  await expect(page.getByLabel("Страница исходного каталога")).toHaveValue("175");
  await page.goForward();
  await expect(page.getByLabel("Страница исходного каталога")).toHaveValue("176");
  await page.getByLabel("Страница исходного каталога").selectOption("187");
  await expect(page.getByRole("button", { name: "Далее →", exact: true })).toBeDisabled();
  await expectDecodedImage(page.locator('.source-page-image img'));
  await page.getByLabel("Исходное издание").selectOption("substations");
  await expect(page.getByLabel("Страница исходного каталога")).toHaveValue("1");
  await expect(page.locator('.source-page-image img')).toHaveAttribute('src', '/catalog-source/page-001.webp');
  await expectDecodedImage(page.locator('.source-page-image img'));
  await expectShell(page);
});

test("transformer source: reactors preserve kVAr and document fallback without transformer geometry", async ({ page }) => {
  await page.goto("/catalog?category=reactors");
  await expect(foundCount(page)).toHaveText("Найдено: 24");
  const filters = await openFilters(page);
  await expect(filters.getByLabel("Мощность, кВА", { exact: true })).toHaveCount(0);
  const id="tr2026-family-asia-shunt-reactor-configurations";
  await page.goto(`/catalog/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Шунтирующие реакторы");
  await expect(page.getByRole("button", { name: /Открыть 3D-модель/ })).toHaveCount(0);
  await expect(page.locator(`[data-product-icon="${id}"]`).first()).toHaveAttribute("data-icon-confidence", "source-only");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator(".catalog-configuration summary").first().click();
  await expect(page.locator(".catalog-configuration").first()).toContainText("кВАр");
  await page.getByRole("tab", { name: /^Документы/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("187 физических страниц");
  await expect(page.getByRole("tabpanel").getByRole("link", { name: "стр. 176", exact: true })).toHaveAttribute("href", "/catalog/source?source=transformers-2026&page=176");
});

test("transformer source: exact power filter opens the admitted card and preserves its selection and source", async ({ page }) => {
  await page.goto("/catalog?category=transformers");
  const filters = await openFilters(page);
  await filters.getByLabel("Мощность, кВА", { exact: true }).selectOption("16");
  await expect(page).toHaveURL(/power=16/);
  await page.getByLabel("Поиск по каталогу").fill("alageum-tmg-standard-16");
  await page.getByLabel("Поиск по каталогу").press("Enter");
  await expect(catalogRows(page)).toHaveCount(1);
  const row = page.locator('tr[data-product-id="alageum-tmg-standard-16"]');
  await expect(row.locator("[data-product-icon]")).toHaveAttribute("data-icon-type", "tr26-corrugated-small");
  await expect(row.locator("[data-product-icon] svg")).toBeVisible();
  await page.reload();
  await expect(catalogRows(page)).toHaveCount(1);
  await expectCatalogViewport(page);
  await row.getByRole("link", { name: "ТМГ-16 (стандартный)", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ТМГ-16 (стандартный)");
  await expect(page.locator(".summary-specs")).toContainText("16");
  await expect(page.locator('[data-equipment-model="tr26-corrugated-small"]')).toHaveAttribute("data-model-status", "idle");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "В подборку ТМГ-16", exact: true }).click();
  await page.getByRole("button", { name: "В подборку ТМГ-16", exact: true }).click();
  await page.getByRole("link", { name: "Открыть подборку →", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Количество ТМГ-16", exact: true })).toHaveValue("2");
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Количество ТМГ-16", exact: true })).toHaveValue("2");
  await page.goBack();
  await page.getByRole("tab", { name: /^Документы/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "стр. 6", exact: true }).click();
  await expect(page).toHaveURL(/source=transformers-2026&page=6/);
  await expectDecodedImage(page.locator(".source-page-image img"));
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ТМГ-16 (стандартный)");
  await expectShell(page);
});

for (const specimen of [
  { id: "alageum-tmg-standard-16", type: "tr26-corrugated-small" },
  { id: "alageum-2026-tsl-20kv-100", type: "tr26-dry-cast-open" },
  { id: "alageum-tdn-16000-110-cu-cu-bd1c6d05", type: "tr26-hv-tdn-16" },
  { id: "tmg-400", type: "oil-transformer" },
]) {
  test(`transformer source: real WebGL renders, rotates, closes and reopens ${specimen.id}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`/catalog/${specimen.id}`);
    const viewer = page.locator(`[data-equipment-model="${specimen.type}"]`);
    await expect(viewer).toHaveAttribute("data-model-status", "idle");
    await expect(viewer.locator(`svg[data-equipment-type="${specimen.type}"]`)).toBeVisible();
    await expect(viewer).toContainText("Иллюстративная 3D-модель типа; не CAD и не чертёж конкретного исполнения");
    await expect(page.locator("canvas")).toHaveCount(0);
    await viewer.getByRole("button", { name: "Открыть 3D-модель", exact: true }).click();
    // Deliberately fail if WebGL is unavailable. The separate forced-fallback
    // case verifies graceful degradation, but never substitutes for render QA.
    await expect(viewer).toHaveAttribute("data-model-status", "ready", { timeout: 30_000 });
    const canvas = viewer.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate(element => {
      const gl = element.getContext("webgl2") || element.getContext("webgl");
      return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0);
    })).toBe(true);
    const before = await canvasEvidence(canvas, testInfo, `${specimen.id}-opened`);
    await viewer.getByRole("button", { name: "Повернуть модель влево", exact: true }).click();
    await viewer.getByRole("button", { name: "Повернуть модель влево", exact: true }).click();
    const rotated = await canvasEvidence(canvas, testInfo, `${specimen.id}-rotated`, before);
    expect(rotated.changedPixels, "Rotate must change the rendered pixels").toBeGreaterThan(before.width * before.height * 0.005);
    await canvas.press("ArrowRight");
    await canvas.press("+");
    await canvas.press("Home");
    await viewer.getByRole("button", { name: "Приблизить модель", exact: true }).click();
    await viewer.getByRole("button", { name: "Отдалить модель", exact: true }).click();
    await viewer.getByRole("button", { name: "Сброс", exact: true }).click();
    await viewer.getByRole("button", { name: "Закрыть 3D-модель", exact: true }).click();
    await expect(viewer).toHaveAttribute("data-model-status", "idle");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "Открыть 3D-модель", exact: true })).toBeFocused();
    await viewer.getByRole("button", { name: "Открыть 3D-модель", exact: true }).click();
    await expect(viewer).toHaveAttribute("data-model-status", "ready");
    await canvasEvidence(canvas, testInfo, `${specimen.id}-reopened`);
    await viewer.getByRole("button", { name: "Закрыть 3D-модель", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expectShell(page);
    expect(pageErrors).toEqual([]);
  });
}

test("transformer source: shared construction survives family navigation without inventing a family model", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/catalog/alageum-tmg-standard-16");
  const type = "tr26-corrugated-small";
  const viewer = page.locator(`[data-equipment-model="${type}"]`);
  await viewer.getByRole("button", { name: "Открыть 3D-модель", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-model-status", "ready", { timeout: 30_000 });
  await page.locator(".family-back-link a").click();
  await expect(page).toHaveURL(/\/catalog\/tr2026-family-tmg-standard$/);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-equipment-model]")).toHaveCount(0);
  await expect(page.locator('.model-type-label [data-product-icon]')).toHaveAttribute("data-icon-confidence", "source-only");
  await expectDecodedImage(page.locator(".product-visual img"));
  const variant = page.locator('.variant-grid a[href="/catalog/alageum-tmg-standard-25"]');
  await expect(variant.locator("[data-product-icon]")).toHaveAttribute("data-icon-type", type);
  await variant.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ТМГ-25 (стандартный)");
  await expect(viewer).toHaveAttribute("data-model-status", "idle");
  await viewer.getByRole("button", { name: "Открыть 3D-модель", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-model-status", "ready");
  await canvasEvidence(viewer.locator("canvas"), testInfo, "shared-construction-tmg25");
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\/tr2026-family-tmg-standard$/);
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.goForward();
  await expect(viewer).toHaveAttribute("data-model-status", "idle");
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("catalog source: independently approved icon-only records keep their source image and no 3D", async ({ page }) => {
  const id = "cat-ptm-tded";
  await page.goto(`/catalog/${id}`);
  await expect(page.locator(`.model-type-label [data-product-icon="${id}"]`)).toHaveAttribute("data-icon-type", "source69-paired-protection-examples-icon");
  await expect(page.locator(`.model-type-label [data-product-icon="${id}"]`)).toHaveAttribute("data-icon-confidence", "source-based");
  await expect(page.locator("[data-equipment-model]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Открыть 3D-модель", exact: true })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expectDecodedImage(page.locator(".product-visual img"));
  await page.getByRole("tab", { name: /^Документы/ }).click();
  await page.getByRole("tabpanel").getByRole("link", { name: "стр. 69", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/source\?page=69$/);
  await expectDecodedImage(page.locator(".source-page-image img"));
  await page.goBack();
  await expect(page.locator("[data-equipment-model]")).toHaveCount(0);
  await expectShell(page);
});

test("transformer source: unavailable WebGL retains the separately approved icon across retries", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /webgl/i.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
  await page.goto("/catalog/alageum-tmg-standard-16");
  const viewer = page.locator('[data-equipment-model="tr26-corrugated-small"]');
  await viewer.getByRole("button", { name: "Открыть 3D-модель", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-model-status", "error");
  await expect(viewer).toContainText("Выше показана отдельно проверенная иконка");
  await expect(viewer.locator('svg[data-equipment-type="tr26-corrugated-small"]')).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-model-status", "error");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator(".product-original-illustration summary").click();
  await expectDecodedImage(page.locator(".product-original-illustration img"));
  await expectShell(page);
});

test('catalog completion: family preview requires an explicit child and releases it on reset', async ({ page }, testInfo) => {
  await page.goto('/catalog/tr2026-family-tmg-standard');
  const selector = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
  await expect(selector).toHaveValue('');
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  await selector.selectOption('alageum-tmg-standard-16');
  await expect(page.locator('[data-selected-member]')).toHaveAttribute('data-selected-member', 'alageum-tmg-standard-16');
  await expect(page.locator('[data-equipment-model]')).toHaveAttribute('data-equipment-model', 'tr26-corrugated-small');
  await page.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(page.locator('[data-equipment-model]')).toHaveAttribute('data-model-status', 'ready');
  await canvasEvidence(page.locator('canvas'), testInfo, 'family-selected-member');
  await selector.selectOption('');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  await selector.selectOption('alageum-tmg-standard-25');
  await expect(page.locator('[data-equipment-model]')).toHaveAttribute('data-model-status', 'idle');
  await expectShell(page);
});

test('catalog completion: duplicate designations show separate source voltage evidence', async ({ page }) => {
  await page.goto('/catalog/tr2026-family-tmpn-top');
  const selector = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
  for (const voltage of ['1250', '1900', '1902']) {
    await expect(selector.locator('option').filter({ hasText: new RegExp(`ТМПН-160/3.*${voltage} В`) })).toHaveCount(1);
  }
  await selector.selectOption('alageum-2026-tmpn-p62-r4');
  await expect(page.locator('.family-selected-record')).toContainText('Номинальное напряжение ВН: 1900 В');
  await page.getByRole('link', { name: 'Открыть отдельную карточку →', exact: true }).click();
  await expect(page).toHaveURL(/alageum-2026-tmpn-p62-r4$/);
  await expect(page.locator('.product-summary-text')).toContainText('1900 В');
  await page.goBack();
  await expect(selector).toHaveValue('');
  await expectShell(page);
});

test('catalog completion: source contradictions and power classes stay explicit', async ({ page }) => {
  await page.goto('/catalog/alageum-2026-ts-10');
  await expect(page.locator('.summary-specs')).toContainText('ВН: 380 кВ');
  await expect(page.locator('.summary-specs')).toContainText('Класс напряжения: 0,66 кВ');
  await expect(page.locator('.product-summary .catalog-data-warning')).toBeVisible();
  await page.locator('.imported-specifications .catalog-data-warning summary').click();
  await expect(page.locator('.imported-specifications .catalog-data-warning')).toContainText('inconsistent');
  await page.goto('/catalog/alageum-2026-znom35-config1');
  await expect(page.locator('.summary-specs')).toContainText('Предельная мощность: 1,0 кВА');
  await expect(page.locator('.summary-specs')).toContainText('Мощность в классе0,5: 0,15 кВА');
  await expect(page.locator('.product-summary')).not.toContainText('nominal-winding-voltage');
  await expectShell(page);
});

test('catalog completion: source construction alternatives never silently default and reset their viewer', async ({ page }, testInfo) => {
  await page.goto('/catalog/alageum-2026-ts-10');
  const selector = page.getByRole('combobox', { name: 'Конструкция для просмотра', exact: true });
  await expect(selector).toHaveValue('');
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  const options = await selector.locator('option').evaluateAll(items => items.map(item => item.value).filter(Boolean));
  expect(options).toHaveLength(2);
  await selector.selectOption(options[0]);
  await expect(page.locator('[data-construction-choice]')).toHaveAttribute('data-construction-choice', options[0]);
  const firstType = await page.locator('[data-equipment-model]').getAttribute('data-equipment-model');
  await page.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(page.locator('[data-equipment-model]')).toHaveAttribute('data-model-status', 'ready');
  await canvasEvidence(page.locator('canvas'), testInfo, 'selected-construction-alternative');
  await selector.selectOption(options[1]);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('[data-equipment-model]')).toHaveAttribute('data-model-status', 'idle');
  await expect(page.locator('[data-equipment-model]')).not.toHaveAttribute('data-equipment-model', firstType);
  await selector.selectOption('');
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  await page.reload();
  await expect(selector).toHaveValue('');
  await expectShell(page);
});

test('catalog completion: AsiaTrafo family overview shows technical source data and keeps factory context reachable', async ({ page }) => {
  await page.goto('/catalog/tr2026-family-asia-two-winding-110-pbv');
  await expect(page.locator('[data-family-document-page]')).toHaveAttribute('data-family-document-page', '167');
  await expectDecodedImage(page.locator('.family-source-document img'));
  await expect(page.locator('.family-source-document')).toContainText('не фотография изделия');
  await expect(page.getByRole('link', { name: 'Обзор завода · стр. 166', exact: true })).toHaveAttribute('href', '/catalog/source?source=transformers-2026&page=166');
  await page.getByRole('link', { name: 'Открыть техническую страницу 167 →', exact: true }).click();
  await expect(page).toHaveURL(/source=transformers-2026&page=167/);
  await page.goBack();
  await expect(page.locator('[data-family-document-page]')).toHaveAttribute('data-family-document-page', '167');
  await expectShell(page);
});

test('identity completion: source comparison keeps dimensions and series context separated from the canonical card', async ({ page }, testInfo) => {
  await page.goto('/catalog/tmg-400');
  const panel = page.locator('[data-catalog-source-panel="alageum-tmg-standard-400"]');
  await expect(panel).toBeVisible();
  const length = panel.locator('[data-source-field="Lmm"]');
  await expect(length).toContainText('1294');
  await expect(length).toContainText('1309');
  await expect(length).toContainText('Единица в источнике не указана');
  await attachSourceEvidence(panel.locator('.source-comparison-wrap'), testInfo, 'tmg400-source-comparison');
  await panel.locator('.catalog-source-facts summary').filter({ hasText: 'Общие сведения серии' }).click();
  await expect(panel).toContainText('Климатические диапазоны и опции не приписываются одному конкретному исполнению');
  await expect(panel.getByRole('button', { name: /В подборку/ })).toHaveCount(0);
  await page.locator('.catalog-related-references a[href="/catalog/alageum-tmg-copper-400"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('медными обмотками');
  await testInfo.attach('tmg400-copper-overview.png', { body: await page.locator('.product-overview').screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await expect(page.locator('[data-catalog-source-panel]')).toHaveCount(0);
  await expectShell(page);
});

test('identity completion: new executions are explicit family members and mixed TSL never gets a default construction', async ({ page }) => {
  await page.goto('/catalog/tr2026-family-tsl-loss-a');
  const member = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
  await expect(member).toHaveValue('');
  await expect(member.locator('option[value="alageum-2026-tsl-a-630"]')).toContainText('потерь А');
  await member.selectOption('alageum-2026-tsl-a-630');
  await expect(page.locator('[data-selected-member]')).toHaveAttribute('data-selected-member', 'alageum-2026-tsl-a-630');
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  const construction = page.getByRole('combobox', { name: 'Конструкция для просмотра', exact: true });
  await expect(construction).toHaveValue('');
  await expect(construction.locator('option')).toHaveCount(3);
  await page.getByRole('link', { name: 'Открыть отдельную карточку →', exact: true }).click();
  await expect(page).toHaveURL(/alageum-2026-tsl-a-630$/);
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  await expect(page.locator('.family-back-link a')).toHaveAttribute('href', '/catalog/tr2026-family-tsl-loss-a');
  await page.goBack();
  await expect(member).toHaveValue('');
  await expectShell(page);
});

test('identity completion: dry TS classification and fifteen reactor table rows remain explicit', async ({ page }) => {
  await page.goto('/catalog/alageum-2026-ts-10');
  await expect(page.locator('.model-type-label a')).toHaveAttribute('href', '/catalog?category=transformers&equipmentType=dry-transformer');
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  await page.goto('/catalog/tr2026-family-asia-shunt-reactor-configurations');
  await expect(page.locator('.summary-specs')).toContainText('По строкам таблицы');
  await expect(page.locator('.summary-specs')).toContainText('25000 кВАр');
  await expect(page.locator('.summary-specs')).toContainText('500 кВ');
  const labels = page.locator('.catalog-configuration summary');
  await expect(labels).toHaveCount(15);
  expect(new Set(await labels.allTextContents()).size).toBe(15);
  await expect(labels.first()).toContainText('110 кВ; 25000 кВАр');
  await expect(labels.last()).toContainText('500 кВ; 180000 кВАр');
  await expect(page.getByRole('combobox', { name: 'Запись для просмотра', exact: true })).toHaveCount(0);
  await expect(page.locator('a[href^="/catalog/alageum-suntiruusij-"]')).toHaveCount(0);
  await expectShell(page);
});

test('identity completion: NTMI read alias preserves source unit disagreements and canonical comparison ID', async ({ page }, testInfo) => {
  await page.goto('/catalog/alageum-2026-ntmi-6');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('НТМИ-6');
  const panel = page.locator('[data-catalog-source-panel="alageum-2026-ntmi-6"]');
  await expect(panel.locator('[data-source-field="maximumPowerValue"]')).toContainText('630 ВА');
  await expect(panel.locator('[data-source-field="maximumPowerValue"]')).toContainText('630 кВА');
  await expect(panel).toContainText('кА (заголовок сайта)');
  await testInfo.attach('ntmi6-card-summary.png', { body: await page.locator('.product-summary').screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await attachSourceEvidence(panel.locator('.source-comparison-wrap'), testInfo, 'ntmi6-source-units');
  await expect(page.locator('.product-actions a')).toHaveAttribute('href', '/catalog?compare=ntmi-6');
  await expectShell(page);
});

test('identity completion: API alias rejects a reused canonical key instead of opening an unrelated UUID', async ({ page }) => {
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [{ id: '10000000-0000-4000-8000-000000000001', public_key: 'ntmi-6', slug: 'ntmi-6', category_public_key: 'transformers', translations: { ru: { name: 'Запись с другим UUID' } }, specs: {}, provenance: {}, media: [], comparable: false, price_mode: 'on_request', currency: 'KZT' }] } }));
  await page.goto('/catalog/alageum-2026-ntmi-6?source=api');
  await expect(page.getByRole('heading', { name: 'Товар недоступен', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Запись с другим UUID', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-catalog-source-panel]')).toHaveCount(0);
  await page.goto('/catalog/ntmi-6?source=api');
  await expect(page.getByRole('heading', { name: 'Запись с другим UUID', exact: true })).toBeVisible();
  await expect(page.locator('[data-catalog-source-panel]')).toHaveCount(0);
});

test('identity completion: reviewed SHR11 panel renders with its scoped caption and does not bind PR variants', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/catalog/cat-pr-shr11-v002');
  const viewer = page.locator('[data-equipment-model="open-distribution-panel"]');
  await expect(viewer).toHaveAttribute('data-model-status', 'idle');
  await expect(page.locator('.visual-provenance')).toContainText('На ПР и ПР-11 не распространяется');
  await expect(page.getByRole('link', { name: 'Источник сопоставления ШР11 ↗', exact: true })).toHaveAttribute('href', 'https://alageum.com/ru/katalog/shkafy-upravleniya/shr11');
  await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
  await canvasEvidence(viewer.locator('canvas'), testInfo, 'reviewed-shr11-panel');
  await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
  await page.locator('.product-original-illustration summary').click();
  await expectDecodedImage(page.locator('.product-original-illustration img'));
  for (const id of ['cat-pr-shr11-v001', 'cat-pr-shr11-v003']) {
    await page.goto(`/catalog/${id}`);
    await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  }
  await expectShell(page);
});

test('family source references: static links open the exact panel and preserve family selection through history', async ({ page }, testInfo) => {
  await page.goto('/catalog/tr2026-family-tmg-standard');
  const references = page.getByRole('region', { name: 'Сопоставления источников этой серии', exact: true });
  await expect(references.locator('a')).toHaveCount(4);
  const member = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
  await expect(member).toHaveValue('');
  await expect(member.locator('option[value="tmg-400"]')).toHaveCount(0);
  const summary = await page.locator('.summary-specs').textContent();
  const link = references.locator('[data-source-reference="alageum-tmg-standard-400"]');
  await expect(link).toHaveAttribute('href', '/catalog/tmg-400#source-panel-alageum-tmg-standard-400');
  await link.click();
  await expect(page).toHaveURL(/\/catalog\/tmg-400#source-panel-alageum-tmg-standard-400$/);
  const panel = page.locator('#source-panel-alageum-tmg-standard-400');
  await expect(panel).toBeInViewport();
  await expect(panel.locator('[data-source-field="Lmm"]')).toContainText('1309');
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\/tr2026-family-tmg-standard$/);
  await expect(member).toHaveValue('');
  await expect(page.locator('.summary-specs')).toHaveText(summary);
  await expect(references.locator('a')).toHaveCount(4);
  await testInfo.attach('family-source-reference-list.png', { body: await references.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await page.goForward();
  await expect(panel).toBeInViewport();
  await expectShell(page);
});

test('family source references: API links wait for a guarded panel and omit a reused target UUID', async ({ page }) => {
  const [{ productById }, { familyPresentationBindings }, { catalogIdentityCompletion }] = await Promise.all([
    import('../lib/catalog/data.js'), import('../lib/catalog/familyPresentation.js'), import('../lib/catalog/identityCompletion.js'),
  ]);
  const family = productById('tr2026-family-tmg-standard');
  const target = productById('tmg-400');
  const dto = (record, id) => ({ id, public_key: record.id, slug: record.id, sku: record.sku, category_public_key: record.category,
    translations: { ru: { name: record.name, description: record.description } }, specs: record, provenance: record,
    media: record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption }] : [], price_mode: 'on_request', currency: 'KZT', comparable: true });
  const familyDto = dto(family, familyPresentationBindings[family.id].database_id);
  let targetDto = dto(target, catalogIdentityCompletion.guards[target.id].databaseId);
  await page.route('**/api/v1/catalog/products?*', async route => {
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({ json: { total: 2, items: [familyDto, targetDto] } });
  });
  await page.goto('/catalog/tr2026-family-tmg-standard?source=api');
  const references = page.getByRole('region', { name: 'Сопоставления источников этой серии', exact: true });
  await expect(references.locator('a')).toHaveCount(1);
  const link = references.locator('a');
  await expect(link).toHaveAttribute('href', '/catalog/tmg-400?source=api#source-panel-alageum-tmg-standard-400');
  await link.click();
  await expect(page).toHaveURL(/\/catalog\/tmg-400\?source=api#source-panel-alageum-tmg-standard-400$/);
  const panel = page.locator('#source-panel-alageum-tmg-standard-400');
  await expect(panel).toBeInViewport();
  await page.goBack();
  await expect(references.locator('a')).toHaveCount(1);
  targetDto = { ...targetDto, id: '10000000-0000-4000-8000-000000000001' };
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(family.name);
  await expect(references).toHaveCount(0);
  await expectShell(page);
});

test('NTMI source preview: explicit 3D, page96 scan and gallery history preserve the canonical card', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    window.__ntmiWebglContexts = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).startsWith('webgl')) window.__ntmiWebglContexts++;
      return original.call(this, type, ...args);
    };
  });
  await page.goto('/catalog/alageum-2026-ntmi-6');
  const preview = page.locator('[data-source-preview="alageum-2026-ntmi-6"]');
  const viewer = preview.locator('[data-equipment-model="tr26-instrument-three-triangle"]');
  await expect(viewer).toHaveAttribute('data-model-status', 'idle');
  await expect(preview).toContainText('18.03.2026, стр. 96');
  await expect(preview).toContainText('не CAD, не размеры и не точная модель исполнения');
  await expect(page.locator('.product-overview [data-equipment-model]')).toHaveAttribute('data-equipment-model', 'instrument-transformer');
  await expect(page.locator('.product-actions a')).toHaveAttribute('href', '/catalog?compare=ntmi-6');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__ntmiWebglContexts)).toBe(0);
  await preview.locator('details summary').click();
  await expectDecodedImage(preview.locator('img'));
  await expect(preview.locator('img')).toHaveAttribute('src', /page-096\.webp/);
  await testInfo.attach('ntmi6-source-preview-idle.png', { body: await preview.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await preview.locator('details summary').click();
  await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ntmiWebglContexts)).toBeGreaterThan(0);
  await canvasEvidence(viewer.locator('canvas'), testInfo, 'ntmi6-source-preview-active');
  await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'idle');
  await expect(viewer.locator('canvas')).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toBeFocused();
  await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'ready');
  const sourceLink = preview.getByRole('link', { name: 'Открыть чертёж в каталоге: стр. 96', exact: true });
  await expect(sourceLink).toHaveAttribute('href', '/catalog/source?source=transformers-2026&page=96');
  await sourceLink.click();
  await expect(page).toHaveURL(/\/catalog\/source\?source=transformers-2026&page=96$/);
  await expect(page.locator('[data-source-preview]')).toHaveCount(0);
  await expectDecodedImage(page.locator('img[src*="page-096.webp"]'));
  await page.goBack();
  await expect(viewer).toHaveAttribute('data-model-status', 'idle');
  await expect(viewer.locator('canvas')).toHaveCount(0);
  await page.goto('/catalog/ntmi-10');
  await expect(page.locator('[data-source-preview="alageum-2026-ntmi-10"] [data-equipment-model]')).toHaveAttribute('data-model-status', 'idle');
  await expect(page.locator('[data-source-preview="alageum-2026-ntmi-6"]')).toHaveCount(0);
  await expectShell(page);
});

test('NTMI source preview: exact API records work while reused UUIDs and edited source shapes stay closed', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const [{ productById }, { ntmiSourcePreviewManifest }] = await Promise.all([import('../lib/catalog/data.js'), import('../lib/catalog/ntmiSourcePreview.js')]);
  let records = ['ntmi-6', 'ntmi-10'].map(id => {
    const record = productById(id);
    return { id: ntmiSourcePreviewManifest.records[id].databaseId, public_key: id, slug: id, sku: record.sku,
      category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
      specs: record, provenance: record, media: record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption }] : [], comparable: true, price_mode: 'on_request', currency: 'KZT' };
  });
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: records.length, items: records } }));
  for (const id of ['ntmi-6', 'ntmi-10']) {
    await page.goto(`/catalog/alageum-2026-${id}?source=api`);
    const preview = page.locator(`[data-source-preview="alageum-2026-${id}"]`);
    await expect(preview.locator('[data-equipment-model]')).toHaveAttribute('data-model-status', 'idle');
    await expect(preview.getByRole('link')).toHaveAttribute('href', '/catalog/source?source=transformers-2026&page=96');
    await preview.locator('details summary').click();
    await expectDecodedImage(preview.locator('img'));
    await preview.locator('details summary').click();
  }
  const viewer = page.locator('[data-source-preview] [data-equipment-model]');
  await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
  await canvasEvidence(viewer.locator('canvas'), testInfo, 'ntmi10-api-source-preview');
  records = records.map(record => ({ ...record, id: '10000000-0000-4000-8000-000000000001' }));
  await page.goto('/catalog/ntmi-10?source=api');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('НТМИ-10');
  await expect(page.locator('[data-source-preview]')).toHaveCount(0);
  await page.goto('/catalog/alageum-2026-ntmi-10?source=api');
  await expect(page.getByRole('heading', { name: 'Товар недоступен', exact: true })).toBeVisible();
  await expect(page.locator('[data-source-preview]')).toHaveCount(0);
  records = records.map(record => ({ ...record, id: ntmiSourcePreviewManifest.records[record.public_key].databaseId, specs: { ...record.specs, power: 1 } }));
  await page.goto('/catalog/ntmi-6?source=api');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('НТМИ-6');
  await expect(page.locator('[data-source-preview]')).toHaveCount(0);
  await expectShell(page);
});

test('NTMI source preview: unavailable WebGL retains only the separately reviewed icon and source links', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).startsWith('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/catalog/ntmi-6');
  const preview = page.locator('[data-source-preview]'), viewer = preview.locator('[data-equipment-model]');
  await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'error');
  await expect(viewer).toContainText('Выше показана отдельно проверенная иконка');
  await expect(viewer.locator('canvas')).toHaveCount(0);
  await expect(preview.getByRole('link')).toHaveAttribute('href', '/catalog/source?source=transformers-2026&page=96');
  await viewer.getByRole('button', { name: 'Попробовать снова', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'error');
  await expectShell(page);
});

const sourceAssetAccessories = [
  { id: 'alageum-2026-relay-tr100', type: 'tr26-accessory-relay-tr100', query: 'ТР-100' },
  { id: 'alageum-2026-sensor-pt100', type: 'tr26-accessory-probe-pt100', query: 'pt-100' },
  { id: 'alageum-2026-damper-ek290', type: 'tr26-accessory-damper-ek290', query: 'ЕК-290' },
];
async function sourceAssetDto(id) {
  const [{ productById }, { sourceAssetCompletionManifest }] = await Promise.all([
    import('../lib/catalog/data.js'), import('../lib/catalog/models/sourceAssetCompletion.js'),
  ]);
  const record = productById(id), entry = sourceAssetCompletionManifest.records[id];
  return { id: entry.database_id, public_key: id, slug: id, sku: record.sku,
    category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
    specs: record, provenance: record, media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
    comparable: true, price_mode: 'on_request', currency: 'KZT' };
}
async function observeSourceAssetContexts(page) {
  await page.addInitScript(() => {
    window.__sourceAssetContexts = { created: 0, lost: 0 };
    const seen = new WeakSet(), original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      const context = original.call(this, kind, ...args);
      if (/webgl/i.test(kind) && context && !seen.has(context)) {
        seen.add(context); window.__sourceAssetContexts.created++;
        this.addEventListener('webglcontextlost', () => { window.__sourceAssetContexts.lost++; });
      }
      return context;
    };
  });
}
for (const specimen of sourceAssetAccessories) for (const mode of ['static', 'api']) {
  test(`bounded source assets: ${mode} ${specimen.id} renders real geometry and releases it across close and navigation`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await observeSourceAssetContexts(page);
    if (mode === 'api') {
      const dto = await sourceAssetDto(specimen.id);
      await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [dto] } }));
    }
    await page.goto(`/catalog?source=${mode}&q=${encodeURIComponent(specimen.query)}`);
    const listing = page.locator(`[data-product-icon="${specimen.id}"]`);
    await expect(listing).toHaveAttribute('data-icon-type', specimen.type);
    await expect(listing).toHaveAttribute('title', /Иллюстративная внешняя форма по фото на стр. 85/);
    await expect(listing.locator('svg')).toBeVisible();
    expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
    await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
    const viewer = page.locator(`[data-equipment-model="${specimen.type}"]`);
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(viewer.locator(`svg[data-equipment-type="${specimen.type}"]`)).toBeVisible();
    await expect(page.locator('.visual-provenance')).toContainText('Скрытые поверхности условные');
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
    // The photographed PT100 is a thin cable/probe silhouette, so its required
    // foreground area is lower than a solid tank, while real pixels remain required.
    const inkRatio = specimen.type === 'tr26-accessory-probe-pt100' ? 0.002 : 0.01;
    const canvas = viewer.locator('canvas');
    const opened = await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-opened`, null, inkRatio);
    await viewer.getByRole('button', { name: 'Повернуть модель влево', exact: true }).click();
    await viewer.getByRole('button', { name: 'Повернуть модель влево', exact: true }).click();
    const rotated = await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-rotated`, opened, inkRatio);
    expect(rotated.changedPixels).toBeGreaterThan(opened.width * opened.height * 0.001);
    await canvas.press('Home');
    await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts.lost)).toBe(1);
    await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toBeFocused();
    await page.locator('.product-original-illustration summary').click();
    await expectDecodedImage(page.locator('.product-original-illustration img'));
    await expect(page.locator('.product-original-illustration img')).toHaveAttribute('src', /page-085\.webp/);
    await page.locator('.product-original-illustration summary').click();
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready');
    const source = page.locator('.visual-provenance').getByRole('link', { name: 'стр. 85', exact: true });
    await expect(source).toHaveAttribute('href', '/catalog/source?source=transformers-2026&page=85');
    await source.click();
    await expect(page).toHaveURL(/source=transformers-2026&page=85$/);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expectDecodedImage(page.locator('.source-page-image img'));
    await page.goBack();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expectShell(page); expect(errors).toEqual([]);
  });
}

test('bounded source assets: API wrong UUID, edited identity and changed raw media suppress every accessory model and icon', async ({ page }) => {
  test.setTimeout(90_000);
  let current;
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [current] } }));
  for (const specimen of sourceAssetAccessories) {
    const original = await sourceAssetDto(specimen.id);
    for (const patch of [
      { id: '10000000-0000-4000-8000-000000000001' },
      { translations: { ru: { ...original.translations.ru, name: 'Отредактированная запись владельца' } } },
      { media: [{ ...original.media[0], path: '/catalog-source/transformers-2026/page-086.webp' }] },
    ]) {
      current = { ...original, ...patch };
      await page.goto(`/catalog/${specimen.id}?source=api`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
      await expect(page.locator(`svg[data-equipment-type="${specimen.type}"]`)).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.goto('/catalog?source=api');
      const icon = page.locator(`[data-product-icon="${specimen.id}"]`);
      await expect(icon).toHaveAttribute('data-icon-confidence', 'source-only');
      await expect(icon).not.toHaveAttribute('data-icon-type', specimen.type);
    }
  }
});

test('bounded source assets: all three no-WebGL fallbacks retain honest icons, source page85 and retry controls', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/i.test(kind) ? null : original.call(this, kind, ...args); };
  });
  for (const specimen of sourceAssetAccessories) {
    await page.goto(`/catalog/${specimen.id}`);
    const viewer = page.locator(`[data-equipment-model="${specimen.type}"]`);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'error');
    await expect(viewer.locator(`svg[data-equipment-type="${specimen.type}"]`)).toBeVisible();
    await expect(viewer).toContainText('Выше показана отдельно проверенная иконка');
    await expect(page.locator('canvas')).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Попробовать снова', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'error');
    await expect(page.locator('.visual-provenance')).toContainText('Скрытые поверхности условные');
    await page.locator('.product-original-illustration summary').click();
    await expectDecodedImage(page.locator('.product-original-illustration img'));
    await expect(page.locator('.visual-provenance a')).toHaveAttribute('href', '/catalog/source?source=transformers-2026&page=85');
  }
  await expectShell(page);
});

for (const specimen of [
  { id: 'alageum-tmgi-x4k3-63', type: 'tr26-corrugated-small', drawingPage: 30 },
  { id: 'alageum-tmgi-x4k3-1000', type: 'tr26-corrugated-large', drawingPage: 31 },
]) test(`bounded source assets: X4K3 ${specimen.drawingPage} discloses the naming mismatch for static, API and selected-family previews`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const dto = await sourceAssetDto(specimen.id);
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [dto] } }));
  for (const mode of ['static', 'api']) {
    await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ТМГ и-');
    const provenance = page.locator('.visual-provenance');
    await expect(provenance).toContainText(`Представительная внешняя компоновка Х4К3 по чертежу на стр. ${specimen.drawingPage}`);
    await expect(provenance).toContainText('В таблице серия обозначена ТМГи, в подписи чертежа — ТМГвэ');
    await expect(provenance).toContainText('Точное соответствие серии и комплектации не подтверждено');
    await expect(provenance.getByRole('link')).toHaveAttribute('href', `/catalog/source?source=transformers-2026&page=${specimen.drawingPage}`);
    const viewer = page.locator(`[data-equipment-model="${specimen.type}"]`);
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
    await canvasEvidence(viewer.locator('canvas'), testInfo, `${mode}-${specimen.id}`);
    await expect(provenance).toBeVisible();
    await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
    await page.locator('.product-original-illustration summary').click();
    await expectDecodedImage(page.locator('.product-original-illustration img'));
    await expect(page.locator('.product-original-illustration img')).toHaveAttribute('src', /page-028\.webp/);
  }
  await page.goto('/catalog/tr2026-family-tmgi-x4k3');
  await page.getByRole('combobox', { name: 'Запись для просмотра', exact: true }).selectOption(specimen.id);
  const selected = page.locator(`[data-selected-member="${specimen.id}"]`);
  await expect(selected.locator('.visual-provenance')).toContainText('В таблице серия обозначена ТМГи, в подписи чертежа — ТМГвэ');
  await expect(selected.locator('.visual-provenance a')).toHaveAttribute('href', `/catalog/source?source=transformers-2026&page=${specimen.drawingPage}`);
  await page.getByRole('combobox', { name: 'Запись для просмотра', exact: true }).selectOption('');
  await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
  await expectShell(page);
});

// This independent review, rather than the runtime binding being tested, fixes
// the required page-specific disclosure for the three accepted records.
const measurementColumnType = 'tr26-measurement-column-zom-znom-source';
const measurementColumnRecords = measurementColumnReview.records;
const measurementColumnDisclosure = specimen => [specimen.requiredMainVisibleWording,
  measurementColumnReview.requiredVisibleSimplificationNote, specimen.requiredSourceContextCaveat];

async function measurementColumnDto(id) {
  const [{ productById }, { measurementColumn2026CompletionManifest }, { familyPresentationBindings }] = await Promise.all([
    import('../lib/catalog/data.js'), import('../lib/catalog/models/measurementColumn2026Completion.js'),
    import('../lib/catalog/familyPresentation.js'),
  ]);
  const record = productById(id);
  const entry = measurementColumn2026CompletionManifest.records[id] || familyPresentationBindings[id];
  return { id: entry.database_id, public_key: id, slug: id, sku: record.sku,
    category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
    specs: record, provenance: record, media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
    comparable: true, price_mode: 'on_request', currency: 'KZT' };
}

async function expectMeasurementColumnDisclosure(panel, specimen) {
  const provenance = panel.locator('.visual-provenance');
  await expect(provenance).toBeVisible();
  for (const wording of measurementColumnDisclosure(specimen)) {
    await expect(provenance).toContainText(wording);
    await expect(provenance.getByText(wording, { exact: false })).toBeVisible();
  }
  await expect(provenance).not.toContainText('стр. 99/100');
  await expect(provenance.getByRole('link', { name: `стр. ${specimen.sourcePage}`, exact: true }))
    .toHaveAttribute('href', `/catalog/source?source=transformers-2026&page=${specimen.sourcePage}`);
}

async function measurementColumnPanelEvidence(panel, specimen, testInfo, name) {
  await expectMeasurementColumnDisclosure(panel, specimen);
  // Capture the whole visual stack, including the caveats below the canvas.
  // Canvas-only crops cannot demonstrate that the source context remains visible.
  await testInfo.attach(`${name}-full-panel.png`, { body: await panel.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await testInfo.attach(`${name}-source-caveat.png`, { body: await panel.locator('.visual-provenance').screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await testInfo.attach(`${name}-panel-context.json`, { body: Buffer.from(JSON.stringify({
    recordId: specimen.id, sourcePage: specimen.sourcePage,
    status: await panel.locator('[data-equipment-model]').getAttribute('data-model-status'),
    disclosure: await panel.locator('.visual-provenance').innerText(),
    bounds: await panel.boundingBox(),
  })), contentType: 'application/json' });
}

async function expectMeasurementColumnIconSurface(svg, testInfo, name) {
  const { measurementColumn2026IconDefinitions } = await import('../lib/catalog/models/measurementColumn2026Icons.js');
  const layers = measurementColumn2026IconDefinitions[measurementColumnType].layers;
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('stroke-width', '1.1');
  await expect(svg.locator('g')).toHaveAttribute('transform', 'translate(2 1) scale(.94)');
  expect(await svg.locator('path[data-feature]').evaluateAll(paths => paths.map(path => ({
    feature: path.getAttribute('data-feature'), d: path.getAttribute('d'), solid: path.hasAttribute('fill'),
  })))).toEqual(layers.map(({ feature, d, solid }) => ({ feature, d, solid })));
  await expect(svg.locator('path[data-feature^="cover-bushing-"]')).toHaveCount(5);
  for (const layer of layers.filter(layer => layer.solid)) {
    await expect(svg.locator(`path[data-feature="${layer.feature}"]`))
      .toHaveAttribute('fill', /var\(--equipment-icon-surface,\s*#fff\)/);
  }
  const metrics = await svg.evaluate(element => {
    const transparent = color => color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
    let surfaceElement = element;
    while (surfaceElement && transparent(getComputedStyle(surfaceElement).backgroundColor)) surfaceElement = surfaceElement.parentElement;
    const surface = surfaceElement ? getComputedStyle(surfaceElement).backgroundColor : null;
    return { surface, backgroundImage: surfaceElement ? getComputedStyle(surfaceElement).backgroundImage : null,
      fills: [...element.querySelectorAll('path[fill]')].map(path => ({
        feature: path.dataset.feature, fill: getComputedStyle(path).fill, opacity: getComputedStyle(path).fillOpacity,
      })) };
  });
  expect(metrics.surface, 'The opaque icon must have an actual containing surface').toBeTruthy();
  expect(metrics.backgroundImage, 'The icon occlusion fill must not sit on a gradient').toBe('none');
  for (const path of metrics.fills) {
    expect(path.fill, `${name}: ${path.feature} must occlude using its actual background`).toBe(metrics.surface);
    expect(path.opacity).toBe('1');
  }
  await testInfo.attach(`${name}-icon-surface.json`, { body: Buffer.from(JSON.stringify(metrics)), contentType: 'application/json' });
}

for (const specimen of measurementColumnRecords) for (const mode of ['static', 'api']) {
  test(`measurement column completion: ${mode} ${specimen.id} keeps caveats through render, rotation, reopen and history`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await observeSourceAssetContexts(page);
    if (mode === 'api') {
      const dto = await measurementColumnDto(specimen.id);
      await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [dto] } }));
    }
    const suffix = mode === 'api' ? '?source=api' : '';
    await page.goto(`/catalog/${specimen.id}${suffix}`);
    const panel = page.locator('.product-visual-stack');
    const viewer = panel.locator(`[data-equipment-model="${measurementColumnType}"]`);
    const icon = viewer.locator(`svg[data-equipment-type="${measurementColumnType}"]`);
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
    await expectMeasurementColumnIconSurface(icon, testInfo, `${mode}-${specimen.id}-idle`);
    await measurementColumnPanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-idle`);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
    const canvas = viewer.locator('canvas');
    await expect.poll(() => canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0);
    })).toBe(true);
    const opened = await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-open`);
    await measurementColumnPanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-open`);
    await viewer.getByRole('button', { name: 'Повернуть модель влево', exact: true }).click();
    await viewer.getByRole('button', { name: 'Повернуть модель влево', exact: true }).click();
    const rotated = await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-rotated`, opened);
    expect(rotated.changedPixels).toBeGreaterThan(opened.width * opened.height * 0.001);
    await measurementColumnPanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-rotated`);
    await canvas.press('Home');
    await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts.lost)).toBe(1);
    await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toBeFocused();
    await expectMeasurementColumnDisclosure(panel, specimen);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready');
    await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-reopened`);
    await panel.locator('.visual-provenance').getByRole('link', { name: `стр. ${specimen.sourcePage}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`source=transformers-2026&page=${specimen.sourcePage}$`));
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts.lost)).toBe(2);
    await expectDecodedImage(page.locator('.source-page-image img'));
    await page.goBack();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expectMeasurementColumnDisclosure(panel, specimen);
    await panel.locator('.product-original-illustration summary').click();
    await expectDecodedImage(panel.locator('.product-original-illustration img'));
    await expect(panel.locator('.product-original-illustration img')).toHaveAttribute('src', new RegExp(`page-${String(specimen.sourcePage).padStart(3, '0')}\\.webp`));
    await expectShell(page);
    expect(errors).toEqual([]);
  });
}

for (const mode of ['static', 'api']) test(`measurement column completion: ${mode} rapid close cancels lazy activation without resurrecting a canvas`, async ({ page }) => {
  test.setTimeout(60_000);
  const specimen = measurementColumnRecords[0];
  await observeSourceAssetContexts(page);
  if (mode === 'api') {
    const dto = await measurementColumnDto(specimen.id);
    await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [dto] } }));
  }
  await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
  const viewer = page.locator(`[data-equipment-model="${measurementColumnType}"]`);
  await expect(viewer).toHaveAttribute('data-model-status', 'idle');
  let releaseImports;
  const importGate = new Promise(resolve => { releaseImports = resolve; });
  const imports = [];
  const holdImport = async route => { imports.push(route.request()); await importGate; await route.continue(); };
  await page.route('**/_next/static/chunks/**', holdImport);
  try {
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'loading');
    await expect.poll(() => imports.length).toBeGreaterThan(0);
    await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
  } finally {
    releaseImports();
    // Keep the released interceptor until this isolated page fixture tears down.
    // Removing its last route can handle held requests before route.continue().
  }
  await Promise.all(imports.map(async request => {
    const response = await request.response();
    expect(response, `The held chunk must receive a response: ${request.url()}`).not.toBeNull();
    expect(response.ok(), `The held chunk must load successfully: ${request.url()}`).toBe(true);
    expect(await response.finished(), `The held chunk response must finish: ${request.url()}`).toBeNull();
  }));
  await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
  await expectMeasurementColumnDisclosure(page.locator('.product-visual-stack'), specimen);
  await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
  await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts)).toEqual({ created: 1, lost: 1 });
});

test('measurement column completion: API UUID, edited shape and raw media guards suppress all three records', async ({ page }) => {
  test.setTimeout(90_000);
  let current;
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [current] } }));
  for (const specimen of measurementColumnRecords) {
    const original = await measurementColumnDto(specimen.id);
    for (const patch of [
      { id: '10000000-0000-4000-8000-000000000001' },
      { specs: { ...original.specs, execution: 'Изменённое исполнение владельца' } },
      { media: [{ ...original.media[0], path: `/catalog-source/transformers-2026/page-${specimen.sourcePage === 99 ? '100' : '099'}.webp` }] },
    ]) {
      current = { ...original, ...patch };
      await page.goto(`/catalog/${specimen.id}?source=api`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
      await expect(page.locator(`svg[data-equipment-type="${measurementColumnType}"]`)).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.goto('/catalog?source=api');
      const icon = page.locator(`[data-product-icon="${specimen.id}"]`);
      await expect(icon).toHaveAttribute('data-icon-confidence', 'source-only');
      await expect(icon).not.toHaveAttribute('data-icon-type', measurementColumnType);
    }
  }
});

for (const mode of ['static', 'api']) test(`measurement column completion: ${mode} no-WebGL retry preserves all page-specific caveats and source scans`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/i.test(kind) ? null : original.call(this, kind, ...args); };
  });
  if (mode === 'api') {
    const dtos = await Promise.all(measurementColumnRecords.map(specimen => measurementColumnDto(specimen.id)));
    await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: dtos.length, items: dtos } }));
  }
  for (const specimen of measurementColumnRecords) {
    await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
    const panel = page.locator('.product-visual-stack');
    const viewer = panel.locator(`[data-equipment-model="${measurementColumnType}"]`);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'error');
    await expect(viewer).toContainText('Выше показана отдельно проверенная иконка');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expectMeasurementColumnIconSurface(viewer.locator(`svg[data-equipment-type="${measurementColumnType}"]`), testInfo, `${mode}-${specimen.id}-fallback`);
    await measurementColumnPanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-fallback`);
    await viewer.getByRole('button', { name: 'Попробовать снова', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'error');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expectMeasurementColumnDisclosure(panel, specimen);
    await panel.locator('.product-original-illustration summary').click();
    await expectDecodedImage(panel.locator('.product-original-illustration img'));
    await expect(panel.locator('.product-original-illustration img')).toHaveAttribute('src', new RegExp(`page-${String(specimen.sourcePage).padStart(3, '0')}\\.webp`));
  }
  await expectShell(page);
});

for (const mode of ['static', 'api']) test(`measurement column completion: ${mode} listing surfaces and comparison keep three distinct records`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await observeSourceAssetContexts(page);
  if (mode === 'api') {
    const dtos = await Promise.all(measurementColumnRecords.map(specimen => measurementColumnDto(specimen.id)));
    await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: dtos.length, items: dtos } }));
  }
  for (const specimen of measurementColumnRecords) {
    await page.goto(`/catalog?source=${mode}&q=${encodeURIComponent(specimen.sourcePage === 99 ? 'ЗОМ' : 'ЗНОМ')}`);
    const row = page.locator('.catalog-table tbody tr').filter({ has: page.locator(`[data-product-icon="${specimen.id}"]`) });
    const icon = row.locator(`[data-product-icon="${specimen.id}"]`);
    await expect(icon).toHaveAttribute('data-icon-type', measurementColumnType);
    for (const wording of measurementColumnDisclosure(specimen)) expect(await icon.getAttribute('title')).toContain(wording);
    const svg = icon.locator('svg');
    await page.getByRole('heading', { level: 1 }).hover();
    await expectMeasurementColumnIconSurface(svg, testInfo, `${mode}-${specimen.id}-listing-normal`);
    await row.hover();
    await expectMeasurementColumnIconSurface(svg, testInfo, `${mode}-${specimen.id}-listing-hover`);
    await row.getByRole('checkbox').check();
    await page.getByRole('heading', { level: 1 }).hover();
    await expect(row.getByRole('checkbox')).toBeChecked();
    await expectMeasurementColumnIconSurface(svg, testInfo, `${mode}-${specimen.id}-listing-selected`);
    await testInfo.attach(`${mode}-${specimen.id}-selected-row.png`, { body: await row.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  }
  await page.goto(`/catalog/compare?${mode === 'api' ? 'source=api&' : ''}ids=${measurementColumnRecords.map(specimen => specimen.id).join(',')}`);
  for (const specimen of measurementColumnRecords) {
    const icon = page.locator(`.comparison-table [data-product-icon="${specimen.id}"]`);
    await expect(icon).toHaveAttribute('data-icon-type', measurementColumnType);
    for (const wording of measurementColumnDisclosure(specimen)) expect(await icon.getAttribute('title')).toContain(wording);
    await expectMeasurementColumnIconSurface(icon.locator('svg'), testInfo, `${mode}-${specimen.id}-comparison`);
    await expect(page.locator(`.comparison-table a[href="/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}"]`)).toBeVisible();
  }
  const highVoltage = page.locator('.comparison-table tbody tr').filter({ has: page.getByRole('rowheader', { name: mode === 'api' ? 'ВН, кВ' : 'ВН', exact: true }) });
  await expect(highVoltage.getByRole('cell')).toHaveText(mode === 'api' ? ['27,5', '27,5', '35/√3'] : ['27,5 кВ', '27,5 кВ', '35/√3 кВ']);
  for (const [label, values] of [['Масса не более полная', ['20', '80', '80']], ['Масса не более масла', ['80', '20', '20']]]) {
    const mass = page.locator('.comparison-table tbody tr').filter({ has: page.getByRole('rowheader', { name: `${label}${mode === 'api' ? ', кг' : ''}`, exact: true }) });
    await expect(mass.getByRole('cell')).toHaveText(values.map(value => `${value}${mode === 'api' ? '' : ' кг'}`));
  }
  const printedPower = page.locator('.comparison-table tbody tr').filter({ has: page.getByRole('rowheader', { name: mode === 'api' ? 'Номинальная мощность, кВ' : 'Номинальная мощность', exact: true }) }).filter({ hasText: '1,25' });
  await expect(printedPower.getByRole('cell')).toHaveText([mode === 'api' ? '1,25' : '1,25 кВ', '—', '—']);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
  await attachSourceEvidence(page.locator('.comparison-table-wrap'), testInfo, `${mode}-measurement-column-comparison`);
});

for (const familyId of ['tr2026-family-zom', 'tr2026-family-znom']) for (const mode of ['static', 'api']) {
  test(`measurement column completion: ${mode} ${familyId} requires an explicit member and preserves selected context`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await observeSourceAssetContexts(page);
    const specimens = measurementColumnRecords.filter(specimen => familyId.endsWith('-zom') ? specimen.sourcePage === 99 : specimen.sourcePage === 100);
    if (mode === 'api') {
      const dtos = await Promise.all([familyId, ...specimens.map(specimen => specimen.id)].map(measurementColumnDto));
      await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: dtos.length, items: dtos } }));
    }
    await page.goto(`/catalog/${familyId}${mode === 'api' ? '?source=api' : ''}`);
    const selector = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
    await expect(selector).toHaveValue('');
    await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    for (const specimen of specimens) {
      const option = selector.locator(`option[value="${specimen.id}"]`);
      await expect(option).toContainText(`стр. ${specimen.sourcePage}`);
      await expect(option).toContainText(specimen.id.endsWith('config2') ? '35/√3' : '27,5');
      await selector.selectOption(specimen.id);
      const selected = page.locator(`[data-selected-member="${specimen.id}"]`);
      const panel = selected.locator('.product-visual-stack');
      const viewer = panel.locator(`[data-equipment-model="${measurementColumnType}"]`);
      await expect(viewer).toHaveAttribute('data-model-status', 'idle');
      await expectMeasurementColumnIconSurface(selected.locator('.family-selected-heading svg'), testInfo, `${mode}-${specimen.id}-family-heading`);
      await measurementColumnPanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-family-idle`);
      await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
      await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
      await canvasEvidence(viewer.locator('canvas'), testInfo, `${mode}-${specimen.id}-family-open`);
      await measurementColumnPanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-family-open`);
      await testInfo.attach(`${mode}-${specimen.id}-family-context.png`, { body: await selected.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
      await expect(selected.getByRole('link', { name: 'Открыть отдельную карточку →', exact: true }))
        .toHaveAttribute('href', `/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
      await selector.selectOption('');
      await expect(page.locator('[data-equipment-model]')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts.created === window.__sourceAssetContexts.lost)).toBe(true);
    }
    await expectShell(page);
  });
}

// Fixed review expectations: never infer acceptance or visible caveats from the
// runtime manifests that these hosted browser cases are meant to exercise.
const protectionExampleDisclosure = 'Упрощённая иллюстрация примера из каталога. Мелкие элементы бокового вида и их пространственное расположение воспроизведены не полностью; см. исходный чертёж на стр. 69. Размеры, материалы и комплектация исполнения не утверждаются. Не CAD.';
const protectionFamilyDisclosure = 'Парный символ двух отдельно подписанных примеров со стр. 69; не общий корпус семейства и не внешний вид табличного исполнения. Мелкие элементы боковых видов опущены.';
const protectionFamilyIcon = 'source69-paired-protection-examples-icon';
const protectionExampleRecords = [
  { id: 'cat-ptm-tded-v012', type: 'source69-ptm-u1-example', omission: 'Опущены: малый боковой прямоугольник, короткие элементы под козырьком, точная конструкция опор.' },
  { id: 'cat-ptm-tded-v013', type: 'source69-tde9-u3-example', omission: 'Опущены: два верхних круглых элемента бокового вида, боковой прямоугольник, нижний боковой выступ.' },
];

async function sourceContextDto(id) {
  const [{ productById }, { createHash }] = await Promise.all([import('../lib/catalog/data.js'), import('node:crypto')]);
  const record = productById(id);
  // The unchanged import namespace from backend-node/src/domain/catalog-identity.js.
  const bytes = createHash('sha1').update(Buffer.from('541788eefbf04d859d33e593b82f303c', 'hex')).update(`product:${id}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  const databaseId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { id: databaseId, public_key: id, slug: id, sku: record.sku,
    category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
    specs: record, provenance: record, media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
    comparable: true, price_mode: 'on_request', currency: 'KZT' };
}

async function routeSourceContextRecords(page, ids) {
  const dtos = await Promise.all(ids.map(sourceContextDto));
  await page.context().route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: dtos.length, items: dtos } }));
}

async function expectProtectionExampleDisclosure(panel, specimen) {
  const provenance = panel.locator('.visual-provenance').filter({ hasText: protectionExampleDisclosure });
  await expect(provenance).toBeVisible();
  for (const wording of [protectionExampleDisclosure, specimen.omission]) {
    await expect(provenance).toContainText(wording);
    await expect(provenance.getByText(wording, { exact: false })).toBeVisible();
  }
  const fullSource = panel.locator(`[data-protection-example="${specimen.id}"]`);
  await expect(fullSource.getByRole('link', { name: 'Полная страница 69', exact: true })).toHaveAttribute('href', '/catalog/source?page=69');
  await expect(fullSource.getByRole('link', { name: 'Полный исходный чертёж · стр. 69', exact: true })).toHaveAttribute('href', '/catalog-source/page-069.webp');
  await expect(fullSource).toBeVisible();
  expect(await provenance.evaluate(element => Boolean(element.closest('details, select, [hidden]')))).toBe(false);
}

async function protectionExamplePanelEvidence(panel, specimen, testInfo, name) {
  await expectProtectionExampleDisclosure(panel, specimen);
  await testInfo.attach(`${name}-panel-and-caveats.png`, { body: await panel.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await testInfo.attach(`${name}-caveat.png`, { body: await panel.locator('.visual-provenance').filter({ hasText: protectionExampleDisclosure }).screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}

async function expectPinnedSourceBytes(page, path, sha256) {
  const response = await page.request.get(path);
  expect(response.ok(), `The deployed source asset must be available: ${path}`).toBe(true);
  const { createHash } = await import('node:crypto');
  expect(createHash('sha256').update(await response.body()).digest('hex'), `The deployed bytes must be the reviewed source: ${path}`).toBe(sha256);
}

for (const specimen of protectionExampleRecords) for (const mode of ['static', 'api']) {
  test(`protection source examples: ${mode} ${specimen.id} renders, rotates, reopens and disposes with its complete caveat`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await observeSourceAssetContexts(page);
    if (mode === 'api') await routeSourceContextRecords(page, [specimen.id]);
    const suffix = mode === 'api' ? '?source=api' : '';
    await page.goto(`/catalog/${specimen.id}${suffix}`);
    const panel = page.locator('.product-visual-stack');
    const viewer = panel.locator(`[data-equipment-model="${specimen.type}"]`);
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(viewer.locator(`svg[data-equipment-type="${specimen.type}"]`)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
    await protectionExamplePanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-idle`);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
    const canvas = viewer.locator('canvas');
    await expect.poll(() => canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth && gl.drawingBufferHeight);
    })).toBe(true);
    const opened = await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-opened`);
    await protectionExamplePanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-opened`);
    await viewer.getByRole('button', { name: 'Повернуть модель влево', exact: true }).click();
    await viewer.getByRole('button', { name: 'Повернуть модель влево', exact: true }).click();
    const rotated = await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-rotated`, opened);
    expect(rotated.changedPixels).toBeGreaterThan(opened.width * opened.height * 0.001);
    await protectionExamplePanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-rotated`);
    await canvas.press('Home');
    await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts.lost)).toBe(1);
    await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toBeFocused();
    await expectProtectionExampleDisclosure(panel, specimen);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready');
    await canvasEvidence(canvas, testInfo, `${mode}-${specimen.id}-reopened`);
    await panel.getByRole('link', { name: 'Полная страница 69', exact: true }).click();
    await expect(page).toHaveURL(/\/catalog\/source\?page=69$/);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts.lost)).toBe(2);
    await expectDecodedImage(page.locator('.source-page-image img'));
    await expectPinnedSourceBytes(page, '/catalog-source/page-069.webp', '4f0833448f3519f9519a2e09fa62b4c28016665b4cd8e95c7341b17042ff5885');
    await testInfo.attach(`${mode}-${specimen.id}-full-page69.png`, { body: await page.locator('.source-page-image').screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    await page.goBack();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expectProtectionExampleDisclosure(panel, specimen);
    await page.goForward();
    await expectDecodedImage(page.locator('.source-page-image img'));
    await page.goBack();
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    await expectProtectionExampleDisclosure(panel, specimen);
    await expectShell(page);
    expect(errors).toEqual([]);
  });
}

for (const specimen of protectionExampleRecords) for (const mode of ['static', 'api']) {
  test(`protection source examples: ${mode} ${specimen.id} lazy close cannot resurrect a canvas`, async ({ page }) => {
    test.setTimeout(60_000);
    await observeSourceAssetContexts(page);
    if (mode === 'api') await routeSourceContextRecords(page, [specimen.id]);
    await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
    const viewer = page.locator(`[data-equipment-model="${specimen.type}"]`);
    await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    let releaseImports;
    const importGate = new Promise(resolve => { releaseImports = resolve; });
    const imports = [];
    const holdImport = async route => { imports.push(route.request()); await importGate; await route.continue(); };
    await page.route('**/_next/static/chunks/**', holdImport);
    try {
      await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
      await expect(viewer).toHaveAttribute('data-model-status', 'loading');
      await expect.poll(() => imports.length).toBeGreaterThan(0);
      await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
      await expect(viewer).toHaveAttribute('data-model-status', 'idle');
    } finally {
      releaseImports();
      // Preserve the released interceptor until the isolated fixture tears down;
      // removing the last route can handle a held request before continue().
    }
    await Promise.all(imports.map(async request => {
      const response = await request.response();
      expect(response, `The held chunk must receive a response: ${request.url()}`).not.toBeNull();
      expect(response.ok(), `The held chunk must load successfully: ${request.url()}`).toBe(true);
      expect(await response.finished(), `The held chunk response must finish: ${request.url()}`).toBeNull();
    }));
    await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toBeFocused();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => window.__sourceAssetContexts.created)).toBe(0);
    await expectProtectionExampleDisclosure(page.locator('.product-visual-stack'), specimen);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
    await viewer.getByRole('button', { name: 'Закрыть 3D-модель', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts)).toEqual({ created: 1, lost: 1 });
  });
}

for (const mode of ['static', 'api']) test(`protection source examples: ${mode} no-WebGL retries preserve icons, omissions and full-page links`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/i.test(kind) ? null : original.call(this, kind, ...args); };
  });
  if (mode === 'api') await routeSourceContextRecords(page, protectionExampleRecords.map(specimen => specimen.id));
  for (const specimen of protectionExampleRecords) {
    await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
    const panel = page.locator('.product-visual-stack');
    const viewer = panel.locator(`[data-equipment-model="${specimen.type}"]`);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'error');
    await expect(viewer.locator(`svg[data-equipment-type="${specimen.type}"]`)).toBeVisible();
    await expect(viewer).toContainText('Выше показана отдельно проверенная иконка');
    await expect(page.locator('canvas')).toHaveCount(0);
    await protectionExamplePanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-no-webgl`);
    await viewer.getByRole('button', { name: 'Попробовать снова', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'error');
    await expectProtectionExampleDisclosure(panel, specimen);
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  await expectShell(page);
});

for (const mode of ['static', 'api']) test(`protection source examples: ${mode} listing and selected family retain distinct icons without extending table-row authority`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const ids = ['cat-ptm-tded', ...Array.from({ length: 13 }, (_, index) => `cat-ptm-tded-v${String(index + 1).padStart(3, '0')}`)];
  const { productById } = await import('../lib/catalog/data.js');
  await observeSourceAssetContexts(page);
  if (mode === 'api') await routeSourceContextRecords(page, ids);
  for (const specimen of [...protectionExampleRecords, { id: 'cat-ptm-tded', type: protectionFamilyIcon }]) {
    const familyFilter = specimen.id === 'cat-ptm-tded' ? '&recordKind=family' : '';
    await page.goto(`/catalog?source=${mode}&q=${encodeURIComponent(productById(specimen.id).sku)}${familyFilter}`);
    const icon = page.locator(`.catalog-table [data-product-icon="${specimen.id}"]`);
    await expect(icon).toHaveAttribute('data-icon-type', specimen.type);
    await expect(icon).toHaveAttribute('data-icon-confidence', 'source-based');
    expect(await icon.getAttribute('title')).toContain(specimen.omission ? protectionExampleDisclosure : protectionFamilyDisclosure);
    if (specimen.omission) expect(await icon.getAttribute('title')).toContain(specimen.omission);
    await testInfo.attach(`${mode}-${specimen.id}-listing.png`, { body: await icon.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  await page.goto(`/catalog/cat-ptm-tded${mode === 'api' ? '?source=api' : ''}`);
  const selector = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
  await expect(selector).toHaveValue('');
  await expect(page.locator('[data-protection-example="cat-ptm-tded"]')).toContainText(protectionFamilyDisclosure);
  await expect(page.locator('[data-equipment-model], [data-source-context-for], canvas')).toHaveCount(0);
  for (const specimen of protectionExampleRecords) {
    await selector.selectOption(specimen.id);
    const selected = page.locator(`[data-selected-member="${specimen.id}"]`);
    await expect(selected.locator('.family-selected-heading [data-product-icon]')).toHaveAttribute('data-icon-type', specimen.type);
    const panel = selected.locator('.product-visual-stack');
    const viewer = panel.locator(`[data-equipment-model="${specimen.type}"]`);
    await viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout: 30_000 });
    await canvasEvidence(viewer.locator('canvas'), testInfo, `${mode}-${specimen.id}-family`);
    await protectionExamplePanelEvidence(panel, specimen, testInfo, `${mode}-${specimen.id}-family`);
  }
  await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts)).toEqual({ created: 2, lost: 1 });
  for (const id of ids.slice(1, 12)) {
    await selector.selectOption(id);
    const selected = page.locator(`[data-selected-member="${id}"]`);
    await expect(selected.locator('.family-selected-heading [data-product-icon]')).toHaveAttribute('data-icon-confidence', 'typical');
    await expect(selected.locator('[data-equipment-model], [data-protection-example], canvas')).toHaveCount(0);
    await expect(selected.getByRole('link', { name: 'Открыть отдельную карточку →', exact: true })).toHaveAttribute('href', `/catalog/${id}${mode === 'api' ? '?source=api' : ''}`);
  }
  await expect.poll(() => page.evaluate(() => window.__sourceAssetContexts)).toEqual({ created: 2, lost: 2 });
  await selector.selectOption('');
  await expect(page.locator('[data-source-context-for], [data-selected-member], canvas')).toHaveCount(0);
  await expect(page.locator('[data-protection-example="cat-ptm-tded"]')).toContainText(protectionFamilyDisclosure);
  await expectShell(page);
});

for (const id of ['cat-ptm-tded-v012', 'cat-ptm-tded-v013', 'cat-ptm-tded']) test(`protection source examples: ${id} rejects API UUID, shape and raw-media mutations`, async ({ page }) => {
  test.setTimeout(90_000);
  const original = await sourceContextDto(id);
  let current;
  await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [current] } }));
  for (const patch of [
    { id: '10000000-0000-4000-8000-000000000001' },
    { specs: { ...original.specs, execution: 'Изменённое исполнение владельца' } },
    { specs: { ...original.specs, variantSpecs: [{ label: 'Климатическое исполнение', value: 'УХЛ4', unit: '', page: 69 }] } },
    { provenance: { ...original.provenance, sourceTitle: 'Изменённый источник' } },
    { media: [{ ...original.media[0], path: '/catalog-source/page-069.webp' }] },
  ]) {
    current = { ...original, ...patch };
    await page.goto(`/catalog/${id}?source=api`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-protection-example], [data-equipment-model], svg[data-equipment-type^="source69-"], canvas')).toHaveCount(0);
    await page.goto(`/catalog?source=api&q=${encodeURIComponent(original.sku)}`);
    const icon = page.locator(`.catalog-table [data-product-icon="${id}"]`);
    await expect(icon).not.toHaveAttribute('data-icon-type', /^source69-/);
    await expect(icon).not.toHaveAttribute('data-icon-confidence', 'source-based');
  }
});

const sourceContextStatus = 'Конструкция этого исполнения по источнику не установлена.';
const sourceContextFigures = {
  left: { key: 'shnn-page35-left-general-view', page: 35, path: '/catalog-source-context/page-035-left-example-native.png', width: 555, height: 670,
    sha256: 'ea51ffaee32846265f721a227c96d4232df972c8087a00926e076520b2c2bdb0',
    title: 'Пример общего вида ШНН с автоматическим выключателем',
    caption: 'Левый пример со стр. 35. В легенде указаны автоматический выключатель, сборная и нулевая шины. Обозначение конкретного исполнения не приведено.',
    legend: ['1-Автоматический выключатель,', '2-сборная шина,', '3-нулевая шина.'] },
  right: { key: 'shnn-page35-right-general-view', page: 35, path: '/catalog-source-context/page-035-right-example-native.png', width: 575, height: 730,
    sha256: '6cd424ebf7804951f216d9b0a4f6883b3bf756693db5bc9638c8783f755c0819',
    title: 'Пример общего вида ШНН со счётчиками и предохранителями',
    caption: 'Правый пример со стр. 35. В легенде указаны счётчики, выключатели-разъединители планочного типа с предохранителями, сборная, нулевая и отходящая шины. Обозначение и число отходящих линий конкретного исполнения не приведены.',
    legend: ['1-Счётчики,', '2-выключатели-разъединители планочного типа с предохранителями,', '3-сборная шина,', '4-нулевая шина,', '5-отходящая шина.'] },
  ptm: { key: 'ptm-page69-labelled-example', page: 69, path: '/catalog-source-context/source-ptm.png', width: 875, height: 430,
    sha256: 'da13e87eb4899d6d32d38f5f2d60b624360ec09e3338b70b315240658769f874', exemplar: 'cat-ptm-tded-v012',
    title: 'Пример из источника: ПТМ(Д)-У1',
    caption: 'Пример из источника: ПТМ(Д)-У1, стр. 69. В табличной записи климатическое исполнение не уточнено; этот пример не устанавливает её исполнение, размеры или комплектацию.',
    legend: ['ПТМ(Д)-У1'] },
  tde: { key: 'tde-page69-labelled-example', page: 69, path: '/catalog-source-context/source-tde.png', width: 875, height: 415,
    sha256: '7c59a4fb95ef6a8bd39f6ae6c7573c508c6f33a6c46b85b30fc15b850fe921a8', exemplar: 'cat-ptm-tded-v013',
    title: 'Пример из источника: ТДЕ(Д)-9-У3',
    caption: 'Пример из источника: ТДЕ(Д)-9-У3, стр. 69. В табличной записи климатическое исполнение не уточнено; этот пример не устанавливает её исполнение, размеры или комплектацию.',
    legend: ['ТДЕ(Д)-9-У3'] },
};
const sourceContextRecords = [
  ...Array.from({ length: 18 }, (_, index) => ({ id: `cat-shnn-v${String(index + 1).padStart(3, '0')}`, figures: ['left', 'right'] })),
  ...['001', '004', '007', '010'].map(number => ({ id: `cat-ptm-tded-v${number}`, figures: ['ptm'] })),
  ...['003', '011'].map(number => ({ id: `cat-ptm-tded-v${number}`, figures: ['tde'] })),
];
const sourceContextBatches = Array.from({ length: 4 }, (_, index) => sourceContextRecords.slice(index * 6, index * 6 + 6));
const sourceContextExcluded = ['cat-shnn', 'cat-ptm-tded', 'cat-ptm-tded-v002', 'cat-ptm-tded-v005', 'cat-ptm-tded-v006', 'cat-ptm-tded-v008', 'cat-ptm-tded-v009', 'cat-ptm-tded-v012', 'cat-ptm-tded-v013'];

async function expectSourceContext(page, specimen, mode, failedFigure = null) {
  const context = page.locator(`[data-source-context-for="${specimen.id}"]`);
  await expect(context).toBeVisible();
  await expect(page.locator('[data-source-context-for]')).toHaveCount(1);
  await expect(context.getByText(sourceContextStatus, { exact: true })).toBeVisible();
  expect(await context.evaluate(element => Boolean(element.closest('details, select, [hidden]')))).toBe(false);
  await expect(context.locator('select, button, canvas, [data-equipment-model]')).toHaveCount(0);
  await expect(context.locator('[data-source-figure]')).toHaveCount(specimen.figures.length);
  const sourcePage = sourceContextFigures[specimen.figures[0]].page;
  if (sourcePage === 35) {
    await expect(context.getByRole('heading', { level: 3 })).toHaveText('Примеры общего вида ШНН из каталога');
    await expect(context.getByText('На стр. 35 приведены два примера общего вида. Они не подписаны обозначениями строк; соответствие выбранному исполнению не подтверждено.', { exact: true })).toBeVisible();
  }
  for (const key of specimen.figures) {
    const expected = sourceContextFigures[key];
    const figure = context.locator(`[data-source-figure="${expected.key}"]`);
    await expect(figure.getByRole('heading', { level: 4 })).toHaveText(expected.title);
    await expect(figure.getByText(expected.caption, { exact: true })).toBeVisible();
    await expect(figure.locator('figcaption li')).toHaveText(expected.legend);
    const sourceLink = figure.locator(':scope > a');
    // Lazy loading must be triggered by reaching the source in the real page.
    await sourceLink.scrollIntoViewIfNeeded();
    await expect(sourceLink).toHaveAttribute('href', `/catalog/source?page=${expected.page}`);
    await expect(sourceLink).toHaveAttribute('target', '_blank');
    await expect(sourceLink).toHaveAttribute('rel', /noopener/);
    if (key === failedFigure) {
      await expect(figure.locator('img')).toHaveCount(0);
      await expect(figure.getByRole('status')).toHaveText('Исходное изображение недоступно. Откройте полную страницу каталога.');
    } else {
      await expect(figure.locator('img')).toHaveAttribute('src', expected.path);
      await expectDecodedImage(figure.locator('img'));
      expect(await figure.locator('img').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight }))).toEqual({ width: expected.width, height: expected.height });
    }
    if (expected.exemplar) {
      await expect(figure.getByRole('link', { name: 'Отдельная запись примера из источника (новая вкладка)', exact: true }))
        .toHaveAttribute('href', `/catalog/${expected.exemplar}${mode === 'api' ? '?source=api' : ''}`);
    }
  }
  const footer = context.getByRole('link', { name: `Открыть страницу ${sourcePage} целиком (новая вкладка)`, exact: true });
  await expect(footer).toHaveAttribute('href', `/catalog/source?page=${sourcePage}`);
  await expect(footer).toHaveAttribute('target', '_blank');
  await expect(context).toContainText('Шкафные конструкции · 02.09.2024');
  return context;
}

async function sourceContextReachabilityEvidence(page, context, specimen, testInfo, name) {
  const viewport = page.viewportSize();
  for (const key of specimen.figures) {
    const figure = context.locator(`[data-source-figure="${sourceContextFigures[key].key}"]`);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toBeInViewport();
    // Scroll each readable part of a tall figure in its real page position.
    // Detached screenshots alone can hide sticky/grid clipping.
    for (const part of await figure.locator(':scope > a, figcaption h4, figcaption p, figcaption li, figcaption a').all()) {
      await part.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await expect(part).toBeInViewport({ ratio: 0.99 });
      const bounds = await part.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.y).toBeGreaterThanOrEqual(-1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(await part.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if (await part.evaluate(element => element.tagName === 'A')) await expectReceivesPointer(part);
    }
    await testInfo.attach(`${name}-${key}-caption-viewport.png`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    await testInfo.attach(`${name}-${key}-whole-figure.png`, { body: await figure.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  }
  const footer = context.locator(':scope > p').last();
  await footer.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect(footer).toBeInViewport({ ratio: 0.99 });
  await expectReceivesPointer(footer.getByRole('link'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await testInfo.attach(`${name}-footer-viewport.png`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await testInfo.attach(`${name}-complete-context.png`, { body: await context.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
}

for (const [batchIndex, specimens] of sourceContextBatches.entries()) for (const mode of ['static', 'api']) {
  test(`source context: ${mode} exact admission batch ${batchIndex + 1} retains original rows and literal labelled sources`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const { productById } = await import('../lib/catalog/data.js');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'api') await routeSourceContextRecords(page, specimens.map(specimen => specimen.id));
    for (const specimen of specimens) {
      await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(productById(specimen.id).name);
      const context = await expectSourceContext(page, specimen, mode);
      await expect(page.locator('[data-equipment-model], canvas, [data-construction-choice]')).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: 'Конструкция для просмотра', exact: true })).toHaveCount(0);
      await expect(page.locator('.product-visual-stack')).toHaveAttribute('data-product-visual', productById(specimen.id).familyId);
      if (specimen === specimens[0]) await sourceContextReachabilityEvidence(page, context, specimen, testInfo, `${mode}-${specimen.id}`);
      await expectShell(page);
    }
    expect(errors).toEqual([]);
  });
}

for (const [batchIndex, specimens] of sourceContextBatches.entries()) {
  test(`source context: API mutation batch ${batchIndex + 1} rejects every admitted UUID, shape and raw-media change`, async ({ page }) => {
    test.setTimeout(180_000);
    let current;
    await page.route('**/api/v1/catalog/products?*', route => route.fulfill({ json: { total: 1, items: [current] } }));
    for (const specimen of specimens) {
      const original = await sourceContextDto(specimen.id);
      for (const patch of [
        { id: '10000000-0000-4000-8000-000000000001' },
        { specs: { ...original.specs, technicalSpecs: [...original.specs.technicalSpecs, { label: 'Правка владельца', value: 'Изменено', unit: '', page: 69 }] } },
        { media: [{ ...original.media[0], path: `/catalog-source/page-${specimen.id.startsWith('cat-shnn') ? '035' : '069'}.webp` }] },
      ]) {
        current = { ...original, ...patch };
        await page.goto(`/catalog/${specimen.id}?source=api`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(original.translations.ru.name);
        await expect(page.locator('[data-source-context-for], [data-equipment-model^="source69-"], canvas')).toHaveCount(0);
      }
    }
  });
}

for (const mode of ['static', 'api']) test(`source context: ${mode} families, ambiguous table designations and separate examples remain excluded`, async ({ page }) => {
  test.setTimeout(90_000);
  if (mode === 'api') await routeSourceContextRecords(page, sourceContextExcluded);
  for (const id of sourceContextExcluded) {
    await page.goto(`/catalog/${id}${mode === 'api' ? '?source=api' : ''}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-source-context-for]')).toHaveCount(0);
  }
});

for (const key of ['left', 'right', 'ptm', 'tde']) for (const mode of ['static', 'api']) {
  test(`source context: ${mode} failed ${key} image retains its own caption and full-page links without substitution`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const specimen = sourceContextRecords.find(record => record.figures.includes(key));
    if (mode === 'api') await routeSourceContextRecords(page, [specimen.id]);
    await page.route(`**${sourceContextFigures[key].path}`, route => route.abort('failed'));
    await page.goto(`/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
    const context = await expectSourceContext(page, specimen, mode, key);
    await expect(page.locator('canvas, [data-equipment-model]')).toHaveCount(0);
    await sourceContextReachabilityEvidence(page, context, specimen, testInfo, `${mode}-${key}-failed`);
    await expect(context.locator('img')).toHaveCount(specimen.figures.length - 1);
    await page.reload();
    await expectSourceContext(page, specimen, mode, key);
  });
}

for (const familyId of ['cat-shnn', 'cat-ptm-tded']) for (const mode of ['static', 'api']) {
  test(`source context: ${mode} ${familyId} switching keeps selected rows and keyboard source links at 320px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 760 });
    const specimens = familyId === 'cat-shnn' ? [sourceContextRecords[0], sourceContextRecords[17]] : [sourceContextRecords[18], sourceContextRecords[22]];
    const { productById } = await import('../lib/catalog/data.js');
    if (mode === 'api') await routeSourceContextRecords(page, [familyId, ...specimens.map(specimen => specimen.id), ...specimens.flatMap(specimen => specimen.figures.map(key => sourceContextFigures[key].exemplar).filter(Boolean))]);
    await page.goto(`/catalog/${familyId}${mode === 'api' ? '?source=api' : ''}`);
    const selector = page.getByRole('combobox', { name: 'Запись для просмотра', exact: true });
    await expect(selector).toHaveValue('');
    await expect(page.locator('[data-source-context-for]')).toHaveCount(0);
    for (const specimen of specimens) {
      await selector.selectOption(specimen.id);
      const selected = page.locator(`[data-selected-member="${specimen.id}"]`);
      await expect(selected.locator('.family-selected-heading strong')).toHaveText(productById(specimen.id).name);
      await expect(selected.locator('.family-selected-heading [data-product-icon]')).toHaveAttribute('data-icon-confidence', 'typical');
      await expect(selected.getByRole('link', { name: 'Открыть отдельную карточку →', exact: true })).toHaveAttribute('href', `/catalog/${specimen.id}${mode === 'api' ? '?source=api' : ''}`);
      const context = await expectSourceContext(page, specimen, mode);
      await sourceContextReachabilityEvidence(page, context, specimen, testInfo, `${mode}-${specimen.id}-320px-family`);
      await expect(selected.locator('canvas, [data-equipment-model]')).toHaveCount(0);
      const originalUrl = page.url();
      const first = sourceContextFigures[specimen.figures[0]];
      const links = [context.getByRole('link', { name: `Открыть страницу ${first.page} целиком (новая вкладка)`, exact: true })];
      if (first.exemplar) links.push(context.getByRole('link', { name: 'Отдельная запись примера из источника (новая вкладка)', exact: true }));
      for (const link of links) {
        await link.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(link).toBeFocused();
        await expect(link).toHaveCSS('outline-style', 'solid');
        await expect(link).toHaveAttribute('target', '_blank');
        const popupPromise = page.waitForEvent('popup');
        await page.keyboard.press('Enter');
        const popup = await popupPromise;
        await expect(popup).toHaveURL(new URL(await link.getAttribute('href'), originalUrl).href);
        if ((await link.getAttribute('href')).startsWith('/catalog/source')) {
          await expectDecodedImage(popup.locator('.source-page-image img'));
          await expect(popup.locator('.source-page-image img')).toHaveAttribute('src', new RegExp(`page-${String(first.page).padStart(3, '0')}\\.webp`));
        } else {
          await expect(popup.getByRole('heading', { level: 1 })).toHaveText(productById(first.exemplar).name);
          await expect(popup.locator('[data-equipment-model]')).toHaveAttribute('data-model-status', 'idle');
        }
        await popup.close();
        await expect(page).toHaveURL(originalUrl);
        await expect(selector).toHaveValue(specimen.id);
        await expectSourceContext(page, specimen, mode);
      }
    }
    await selector.selectOption('');
    await expect(page.locator('[data-selected-member], [data-source-context-for], canvas')).toHaveCount(0);
    await expectShell(page);
  });
}

// Verify deployed bytes in the same hosted job that decodes the PNGs and captures
// their visible pixels. No runtime manifest is the oracle for this assertion.
test('source context: all four deployed PNGs match reviewed literal source crops', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  for (const key of ['left', 'right', 'ptm', 'tde']) {
    const expected = sourceContextFigures[key];
    const specimen = sourceContextRecords.find(record => record.figures.includes(key));
    await page.goto(`/catalog/${specimen.id}`);
    const context = await expectSourceContext(page, specimen, 'static');
    await expectPinnedSourceBytes(page, expected.path, expected.sha256);
    await testInfo.attach(`${key}-reviewed-png-pixels.png`, { body: await context.locator(`[data-source-figure="${expected.key}"] img`).screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  }
});


// Exact imported-baseline presentation corrections from the independent DTO audit.
const correctedCurrentSummaries = [
  {
    "id": "cat-shnn-v001",
    "value": "1000 А"
  },
  {
    "id": "cat-shnn-v002",
    "value": "1600 А"
  },
  {
    "id": "cat-shnn-v003",
    "value": "2000 А"
  },
  {
    "id": "cat-shnn-v004",
    "value": "2500 А"
  },
  {
    "id": "cat-shnn-v005",
    "value": "3200 А"
  },
  {
    "id": "cat-shnn-v006",
    "value": "4000 А"
  },
  {
    "id": "cat-shnn-v007",
    "value": "5000 А"
  },
  {
    "id": "cat-shnn-v008",
    "value": "1000 А"
  },
  {
    "id": "cat-shnn-v009",
    "value": "1600 А"
  },
  {
    "id": "cat-shnn-v010",
    "value": "2000 А"
  },
  {
    "id": "cat-shnn-v011",
    "value": "2500 А"
  },
  {
    "id": "cat-shnn-v012",
    "value": "3200 А"
  },
  {
    "id": "cat-shnn-v013",
    "value": "4000 А"
  },
  {
    "id": "cat-shnn-v014",
    "value": "5000 А"
  },
  {
    "id": "cat-yatp-v001",
    "value": "6 А · 10 А · 25 А"
  },
  {
    "id": "cat-yatp-v002",
    "value": "6 А · 10 А · 16 А"
  },
  {
    "id": "cat-yatp-v003",
    "value": "6 А · 10 А"
  },
  {
    "id": "cat-yatp-v004",
    "value": "6 А · 10 А · 40 А"
  },
  {
    "id": "cat-yatp-v005",
    "value": "6 А · 10 А · 25 А"
  },
  {
    "id": "cat-yatp-v006",
    "value": "6 А · 10 А · 16 А"
  },
  {
    "id": "cat-yatp-v007",
    "value": "6 А · 10 А · 63 А"
  },
  {
    "id": "cat-yatp-v008",
    "value": "6 А · 10 А · 31,5 А"
  },
  {
    "id": "cat-yatp-v009",
    "value": "6 А · 10 А · 25 А"
  }
];
for (let offset = 0; offset < correctedCurrentSummaries.length; offset += 8) {
  const specimens = correctedCurrentSummaries.slice(offset, offset + 8);
  test(`source-specific API summaries: batch ${Math.floor(offset / 8) + 1} keeps each variant current`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await routeSourceContextRecords(page, specimens.map(item => item.id));
    for (const specimen of specimens) {
      await page.goto(`/catalog/${specimen.id}?source=api`);
      const summary = page.locator('.product-summary .member-evidence-specs > div').filter({ has: page.getByText('Ток по каталогу', { exact: true }) });
      await expect(summary.locator('dd')).toHaveText(specimen.value);
      await summary.scrollIntoViewIfNeeded();
      await testInfo.attach(`${specimen.id}-source-specific-current.png`, { body: await summary.screenshot(), contentType: 'image/png' });
    }
  });
}

for (const mode of ['static', 'api']) test(`source-specific family summaries: ${mode} SHNN and YATP keep their own currents`, async ({ page }) => {
  if (mode === 'api') await routeSourceContextRecords(page, ['cat-shnn', 'cat-shnn-v004', 'cat-yatp', 'cat-yatp-v001']);
  for (const [familyId, id, value] of [['cat-shnn', 'cat-shnn-v004', '2500 А'], ['cat-yatp', 'cat-yatp-v001', '6 А · 10 А · 25 А']]) {
    await page.goto(`/catalog/${id}${mode === 'api' ? '?source=api' : ''}`);
    const detail = page.locator('.product-summary dl > div').filter({ has: page.getByText('Ток по каталогу', { exact: true }) });
    await expect(detail.locator('dd')).toHaveText(value);
    await page.goto(`/catalog/${familyId}${mode === 'api' ? '?source=api' : ''}`);
    await page.getByRole('combobox', { name: 'Запись для просмотра' }).selectOption(id);
    const summary = page.locator(`[data-selected-member="${id}"] .member-evidence-specs > div`).filter({ has: page.getByText('Ток по каталогу', { exact: true }) });
    await expect(summary.locator('dd')).toHaveText(value);
  }
});

for (const mode of ['static', 'api']) test(`source comparison values: ${mode} preserves both winding facts for all three copper transformers`, async ({ page }, testInfo) => {
  const ids = [25, 40, 63].map(power => `alageum-2026-tmg-20kv-copper-${power}`);
  if (mode === 'api') await routeSourceContextRecords(page, ids);
  await page.goto(`/catalog/compare?${mode === 'api' ? 'source=api&' : ''}ids=${ids.join(',')}`);
  const row = page.locator('.comparison-table tbody tr').filter({ has: page.locator('th').filter({ hasText: /^Обмотки$/ }) });
  await expect(row.locator('td')).toHaveCount(3);
  for (const cell of await row.locator('td').all()) await expect(cell).toHaveText('медные · трехфазные, двухобмоточные');
  await row.scrollIntoViewIfNeeded();
  await testInfo.attach(`${mode}-complete-winding-facts.png`, { body: await row.screenshot(), contentType: 'image/png' });
});


test('source-specific API current filters exclude inherited family ranges', async ({ page }) => {
  await routeSourceContextRecords(page, ['cat-shnn-v003', 'cat-shnn-v004', 'cat-yatp-v001', 'cat-yatp-v002']);
  for (const [current, expected] of [['2500 А', 'cat-shnn-v004'], ['16 А', 'cat-yatp-v002'], ['до 5000 А', null]]) {
    await page.goto(`/catalog?source=api&current=${encodeURIComponent(current)}`);
    await expect(foundCount(page)).toHaveText(`Найдено: ${expected ? 1 : 0}`);
    await expect(page.locator('.catalog-table tbody tr')).toHaveCount(expected ? 1 : 0);
    if (expected) await expect(page.locator(`.catalog-table [data-product-icon="${expected}"]`)).toBeVisible();
  }
});
