import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
const destinations = [
  {
    label: "Карьера",
    href: "/careers",
    heading: "Работа, которая",
    marker: "#workplaces",
  },
  {
    label: "Вакансии",
    href: "/careers/vacancies",
    heading: "Вакансии",
    marker: "input[type=search]",
  },
  {
    label: "Стажировки",
    href: "/careers/internships",
    heading: "Стажировки для студентов",
    marker: ".career-program-directions",
  },
  {
    label: "Отклик",
    href: "/careers/apply",
    heading: "Подготовить отклик",
    marker: "input[name=name]",
  },
];
test("each visible menu destination opens distinct content and is active", async ({
  page,
}, info) => {
  const mobile = info.project.name === "mobile";
  await page.goto("/careers");
  await expect(page.locator(".site-header")).toHaveCount(1);
  const hashes = [];
  for (const item of destinations) {
    await page.goto("/careers");
    if (mobile)
      await page
        .getByRole("button", { name: "Открыть навигацию", exact: true })
        .click();
    const menu = page.locator(
      mobile
        ? "#site-mobile-navigation .site-mobile-group-heading>a"
        : ".site-desktop-nav .site-nav-link",
    );
    await expect(menu).toHaveCount(4);
    expect(
      await menu.evaluateAll((es) => es.map((e) => e.getAttribute("href"))),
    ).toEqual(destinations.map((d) => d.href));
    await expect(page.locator("#site-mega-navigation")).toHaveCount(0);
    await expect(
      page.locator(
        '#site-mobile-navigation button[aria-controls^="site-mobile-group-"]',
      ),
    ).toHaveCount(0);
    await menu.filter({ hasText: new RegExp("^" + item.label + "$") }).click();
    await expect(page).toHaveURL(new RegExp(item.href + "$"));
    await expect(page.locator("h1")).toContainText(item.heading);
    await expect(page.locator(item.marker)).toHaveCount(1);
    await expect(
      page.locator(".site-desktop-nav a[aria-current=page]"),
    ).toHaveAttribute("href", item.href);
    await expect(
      page.locator("#site-mobile-navigation a[aria-current=page]"),
    ).toHaveAttribute("href", item.href);
    hashes.push(
      createHash("sha256")
        .update(
          (await page.locator(".career").innerText()).replace(/\s+/g, " "),
        )
        .digest("hex"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(new Set(hashes).size).toBe(4);
  await page.goto("/careers/vacancies/production-director");
  await expect(
    page.locator(".site-desktop-nav a[aria-current=page]"),
  ).toHaveAttribute("href", "/careers/vacancies");
  await page.goto("/careers/apply?type=internship");
  await expect(
    page.locator(".site-desktop-nav a[aria-current=page]"),
  ).toHaveAttribute("href", "/careers/apply");
  const footer = page.locator(".site-footer nav a");
  const hrefs = await footer.evaluateAll((es) =>
    es.map((e) => e.getAttribute("href")),
  );
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs.filter((h) => h.startsWith("/careers"))).toEqual(
    destinations.map((d) => d.href),
  );
  for (const item of destinations) {
    await page.goto("/careers");
    await page
      .locator(".site-footer nav a")
      .filter({ hasText: new RegExp("^" + item.label + "$") })
      .click();
    await expect(page.locator("h1")).toContainText(item.heading);
    await expect(page).toHaveURL(new RegExp(item.href + "$"));
  }
  for(const [label,href,heading] of [['Предприятия','/manufacturers','Найдите свою точку контакта.'],['Контакты','/contacts','Свяжемся по вашей задаче.']]){
    await page.goto('/careers');await page.locator('.site-footer nav a').filter({hasText:new RegExp('^'+label+'$')}).click();
    await expect(page).toHaveURL(new RegExp(href+'$'));await expect(page.locator('h1')).toContainText(heading);
  }
});
test("locale menus retain the four distinct destinations", async ({ page }) => {
  for (const locale of ["en", "kk"]) {
    await page.goto(`/${locale}/careers`);
    const menu = page.locator(".site-desktop-nav .site-nav-link");
    expect(
      await menu.evaluateAll((es) => es.map((e) => e.getAttribute("href"))),
    ).toEqual(destinations.map((d) => `/${locale}${d.href}`));
    await page.goto(`/${locale}/careers/apply?type=internship`);
    await expect(
      page.locator(".site-desktop-nav a[aria-current=page]"),
    ).toHaveAttribute("href", `/${locale}/careers/apply`);
  }
});
