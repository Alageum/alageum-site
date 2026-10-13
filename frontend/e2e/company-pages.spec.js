import { expect, test } from '@playwright/test';
for (const [route, title] of [['/', 'Производство'], ['/company','Производственная база'], ['/manufacturers','География компетенций'], ['/contacts','Начнём сотрудничество']]) {
  test(`${route} renders a complete responsive public page without runtime errors`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // New photography below the fold remains lazy; inspect each image after it enters view.
    if (route === '/') await page.getByRole('button', { name: 'Приостановить движение логотипов' }).click();
    for (const image of await page.locator('main img:not(.partner-group[aria-hidden] img)').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    // Keep the historical general-suite collection contract intact; new visual
    // regressions are explicit steps within the existing route cases.
    if (route === '/contacts') await test.step('sales details retain strong contrast on the corporate contact panel', async () => {
      await page.goto('/contacts');
      const panel = page.locator('.corp-contact-main');
      await expect(panel).toBeVisible();
      const colors = await panel.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, phone: getComputedStyle(el.querySelector('.corp-contact-phone')).color }));
      const luminance = color => {
        const rgb = color.match(/\d+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const contrast = color => {
        const values = [luminance(color), luminance(colors.background)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
      };
      expect(contrast(colors.color)).toBeGreaterThanOrEqual(7);
      expect(contrast(colors.phone)).toBeGreaterThanOrEqual(7);
    });
    if (route === '/') await test.step('equipment card arrows retain icon size and corporate palette stays neutral', async () => {
      await page.goto('/');
      const arrows = page.locator('.corp-equipment-card .corp-card-arrow .corp-arrow');
      await expect(arrows).toHaveCount(5);
      for (const arrow of await arrows.all()) {
        const rect = await arrow.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
        expect(rect).toEqual({ width: 18, height: 18 });
      }
      // The 2026-10-13 handoff intentionally replaced green-gray with neutral
      // gray. Keep this independent literal assertion aligned with that design.
      await expect(page.locator('.corp-cta')).toHaveCSS('background-color', 'rgb(30, 30, 30)');
    });
    if (route === '/company') await test.step('all solution cards fit a 320px viewport', async () => {
      await page.setViewportSize({ width: 320, height: 780 });
      await page.goto('/solutions');
      await expect(page.locator('.site-solution-row')).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      for (const card of await page.locator('.site-solution-row').all()) {
        const rect = await card.boundingBox();
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(320);
      }
    });
    if (route === '/manufacturers') await test.step('catalog receives shared colors without corporate layout classes', async () => {
      await page.goto('/catalog');
      await expect(page.locator('.corp-investor')).toHaveCount(0);
      await expect(page.locator('.catalog-workspace')).toBeVisible();
      const palette = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return ['--brand-red', '--ink', '--line'].map(name => style.getPropertyValue(name).trim().toLowerCase());
      });
      expect(palette).toEqual(['#ce1727', '#1d1d1b', '#c6c6c6']);
      await page.goto('/catalog/tmg-630');
      await expect(page.locator('.corp-investor')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.goto('/catalog/compare');
      await expect(page.locator('.corp-investor')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
    expect(errors).toEqual([]);
  });
}
test('home catalog and city links preserve useful destination state', async ({ page }) => {
  await page.goto('/');
  // Wait for one complete category card before interacting. Persistent
  // duplicates still fail rather than silently choosing one of them.
  const substationCard = page.locator('.corp-equipment-card').filter({ hasText: 'Подстанции' });
  await expect(substationCard).toHaveCount(1);
  await expect(substationCard.getByRole('heading', { level: 3, name: 'Подстанции', exact: true })).toBeVisible();
  await expect(substationCard).toHaveAttribute('href', '/catalog?category=substations');
  await substationCard.click();
  await expect(page).toHaveURL(/category=substations/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goBack();
  await page.locator('.corp-city-links a').filter({ hasText: 'Алматы' }).click();
  await expect(page).toHaveURL(/city=/);
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(2);
});
test('city map and list share URL state, repeat selection and survive back/forward/reload', async ({ page }) => {
  await page.goto('/manufacturers');
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Показать предприятия: Алматы', exact: true }).click();
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveText('Показано предприятий: 2');
  await page.reload();
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(2);
  const kentau = page.locator('.corp-city-filter').getByRole('button', { name: /^Кентау/ });
  await kentau.click(); await kentau.click();
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(1);
  await expect(page.locator('.corp-enterprise-card h3')).toHaveText('Кентауский трансформаторный завод');
  await page.goBack(); await expect(page.locator('.corp-enterprise-card')).toHaveCount(2);
  await page.goForward(); await expect(page.locator('.corp-enterprise-card')).toHaveCount(1);
  await page.locator('.corp-city-filter').getByRole('button', { name: /Все предприятия/ }).click();
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(8);
  await expect(page).not.toHaveURL(/city=/);
});
test('invalid city falls back to all entries and all profile links work', async ({ page }) => {
  await page.goto('/manufacturers?city=Unknown');
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(8);
  await page.locator('.corp-enterprise-bottom').first().click();
  await expect(page).toHaveURL(/\/manufacturers\/ktz/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Кентауский');
});
test('regional contact search handles Russian casing, empty states and reset', async ({ page }) => {
  await page.goto('/contacts');
  const search = page.getByRole('searchbox', { name: 'Найти отдел продаж по городу' });
  await expect(page.locator('.corp-office')).toHaveCount(11);
  await search.fill('  аЛмАтЫ ');
  await expect(page.locator('.corp-office')).toHaveCount(1);
  await expect(page.locator('.corp-office a[href="mailto:almaty@alageum.com"]')).toBeVisible();
  await search.fill('несуществующий');
  await expect(page.getByRole('heading', { name: 'Этот город пока не указан в списке' })).toBeVisible();
  await page.getByRole('button', { name: 'Показать все города' }).click();
  await expect(search).toHaveValue(''); await expect(page.locator('.corp-office')).toHaveCount(11);
  await search.fill('Уральск'); await page.getByRole('button', { name: 'Очистить поиск города' }).click();
  await expect(page.locator('.corp-office')).toHaveCount(11);
});
test('contact actions have correct destinations and FAQ can open and close repeatedly', async ({ page }) => {
  await page.goto('/contacts');
  // Check the accessible link while Next replaces any hidden streamed copy.
  const phone = page.getByRole('main').getByRole('link', { name: '+7 771 005 22 22', exact: true });
  await expect(phone).toHaveCount(1);
  await expect(phone).toHaveAttribute('href','tel:+77710052222');
  await expect(page.getByRole('main').getByRole('link', { name: 'sales@alageum.com', exact: true })).toHaveAttribute('href','mailto:sales@alageum.com');
  const prepare = page.getByRole('complementary');
  await expect(prepare).toContainText('не отправляет заявку на сервер');
  // The failure trace retained a hidden page copy outside the main landmark.
  // Interact with the active FAQ, while still rejecting duplicates within it.
  const main = page.getByRole('main');
  const summary = main.getByText('Можно ли приехать на предприятие?', { exact: true });
  const answer = main.getByText('Сначала уточните адрес, часы приёма', { exact: false });
  await expect(main).toHaveCount(1);
  await expect(summary).toHaveCount(1);
  await expect(summary).toBeVisible();
  await expect(answer).toHaveCount(1);
  await expect(answer).not.toBeVisible();
  await summary.click(); await expect(answer).toBeVisible();
  await summary.click(); await expect(answer).not.toBeVisible();
  await summary.click(); await expect(answer).toBeVisible();
  // The final DOM must also contain only one canonical sales link.
  await expect(page.locator('.corp-contact-phone')).toHaveCount(1);
  await prepare.getByRole('link', { name: /Подготовить запрос/ }).click();
  await expect(page).toHaveURL(/\/inquiry/); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
test('keyboard selection works and reduced motion avoids animated page transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/manufacturers');
  const button = page.locator('.corp-city-filter').getByRole('button', { name: /^Шымкент/ });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.corp-enterprise-card')).toHaveCount(1);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-pressed','true');
});

test('redesigned journeys keep content within the screen and preserve a single main landmark', async ({ page }) => {
  const routes = ['/solutions', '/solutions/distribution', '/solutions/industry', '/solutions/infrastructure', '/projects', '/projects/petropavlovsk', '/projects/nur-esil', '/projects/yassy', '/projects/nura', '/manufacturers/ktz', '/manufacturers/asia-trafo', '/manufacturers/aemz', '/manufacturers/utz', '/manufacturers/petz', '/manufacturers/elmo', '/documents', '/data-policy', '/inquiry', '/selection', '/workspace', '/login', '/ai'];
  // Includes the narrow screen that previously let a long solution heading
  // expand its grid track beyond the visible page.
  if (test.info().project.name.includes('mobile')) await page.setViewportSize({ width: 320, height: 780 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('.brand-experience')).toHaveCount(1);
    const overflow = await page.locator('.site-page-heading, .site-solution-row, .brand-production-feature, .corp-geography, .corp-contact-hero, .selection-layout, .inquiry-layout, .brand-login, .workspace-heading').evaluateAll(elements => elements.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
    }).map(el => el.className));
    expect(overflow, route).toEqual([]);
    const splitWords = await page.getByRole('main').locator('h1, h2, h3').evaluateAll(elements => elements.flatMap(el => {
      if (!el.getBoundingClientRect().width) return [];
      const issues = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        if (rect.width > el.clientWidth + 1) issues.push({ word: match[0], width: Math.round(rect.width), available: el.clientWidth });
      }
      return issues;
    }));
    expect(splitWords, `Whole words fit on ${route}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await page.goto('/');
  const heroImage = page.getByRole('main').locator('.corp-hero-image video');
  await expect(heroImage).toHaveCount(1);
  await expect(heroImage).toBeVisible();
  await expect.poll(() => heroImage.evaluate(video => video.readyState >= 2 && video.videoWidth > 0)).toBe(true);
  await page.screenshot({ path: `test-results/brand/home-${test.info().project.name}.png` });
});

test('motion adds scroll feedback, honors reduced motion immediately and stays outside catalog', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.brand-scroll-progress')).toHaveCount(1);
  await page.locator('.corp-group-statement').scrollIntoViewIfNeeded();
  await expect(page.locator('.brand-experience')).toHaveAttribute('data-scrolled', 'true');
  await expect.poll(() => page.locator('.brand-scroll-progress').evaluate(el => getComputedStyle(el).transform)).not.toBe('matrix(0, 0, 0, 1, 0, 0)');
  // Toggling the OS preference must stop both CSS and Web Animations effects,
  // including an entrance already in progress, while keeping content visible.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.corp-cta').scrollIntoViewIfNeeded();
  await expect(page.locator('.corp-cta')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('.brand-experience').evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.goto('/catalog');
  await expect(page.locator('.brand-scroll-progress')).toHaveCount(0);
  await expect(page.locator('.technical-experience')).toHaveCount(1);
});

test('entrances wait until a substantial part of the block is inside the screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.entranceSamples = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.matches('.corp-project-visual')) {
        const rect = this.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, innerHeight - 120) - Math.max(rect.top, 0));
        window.entranceSamples.push({ top: rect.top, height: rect.height, visible, viewport: innerHeight });
      }
      return animate.apply(this, args);
    };
  });
  await page.goto('/');
  const card = page.locator('.corp-project-visual').first();
  await expect(card).toBeVisible();
  // Merely intersecting the viewport must not consume the one-time animation.
  await card.evaluate(el => window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - innerHeight + 20, behavior: 'instant' }));
  await expect(page.locator('.brand-experience')).toHaveAttribute('data-scrolled', 'true');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.entranceSamples)).toEqual([]);
  await card.evaluate(el => window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - innerHeight + 120 + el.getBoundingClientRect().height * .45, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.entranceSamples.length)).toBeGreaterThan(0);
  const samples = await page.evaluate(() => window.entranceSamples);
  for (const sample of samples) {
    expect(sample.visible / sample.height).toBeGreaterThanOrEqual(.34);
    expect(sample.top).toBeLessThan(sample.viewport - 120);
  }
});

test('expanded project portfolio filters work, case routes open and words fit', async ({ page }) => {
  if (test.info().project.name.includes('mobile')) await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/projects');
  await expect(page.locator('[data-project-case]')).toHaveCount(16);
  const gaps = await page.locator('.project-case-visual').evaluateAll(elements => elements.filter(el => Math.abs(el.getBoundingClientRect().width - el.parentElement.getBoundingClientRect().width) > 2).length);
  expect(gaps).toBe(0);
  await page.getByRole('button', { name: /^Реконструкция/ }).click();
  await expect(page.locator('[data-project-case]')).toHaveCount(2);
  await expect(page.getByRole('status')).toHaveText('Кейсов в подборке: 2');
  await page.getByRole('button', { name: /^Поставка оборудования/ }).click();
  await expect(page.locator('[data-project-case]')).toHaveCount(6);
  await page.getByRole('button', { name: /^Все кейсы/ }).click();
  await expect(page.locator('[data-project-case]')).toHaveCount(16);
  await page.locator('.project-featured').evaluate(el => window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 100, behavior: 'instant' }));
  await page.screenshot({ path: `test-results/brand/projects-${test.info().project.name}.png` });
  for (const slug of ['batys', 'kunay', 'kairat', 'hub-aktau', 'astana-substations', 'aktau-substations', 'dostyk-pavlodar', 'keramika', 'expo-2017', 'burnoye-solar', 'ereymentau-wind', 'gorodskaya']) {
    await page.goto(`/projects/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.project-detail-facts')).toBeVisible();
    const overflow = await page.getByRole('main').locator('h1, h2, h3, .project-detail-facts strong').evaluateAll(elements => elements.flatMap(el => {
      if (!el.getBoundingClientRect().width) return [];
      const result = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        if (range.getBoundingClientRect().width > el.clientWidth + 1) result.push(match[0]);
      }
      return result;
    }));
    expect(overflow, slug).toEqual([]);
  }
});

