import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const phase = process.argv[2] || "before";
const base = process.env.E2E_BASE_URL || "http://localhost:3101";
const out = new URL("../../docs/career/navigation/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
const results = [];
for (const [device, width] of [
  ["desktop", 1440],
  ["mobile", 390],
]) {
  const page = await browser.newPage({
    viewport: { width, height: 960 },
    reducedMotion: "reduce",
  });
  await page.goto(base + "/careers");
  const entries = [];
  if (device === "desktop") {
    const links = page.locator(".site-desktop-nav .site-nav-link");
    for (let i = 0; i < (await links.count()); i++) {
      const link = links.nth(i);
      entries.push({
        surface: "navbar",
        label: (await link.innerText()).trim(),
        href: await link.getAttribute("href"),
      });
      await link.hover();
      if (await link.getAttribute("aria-controls")) {
        await page.waitForFunction(() =>
          document
            .querySelector("#site-mega-navigation")
            ?.classList.contains("is-open"),
        );
        entries.push(
          ...(await page
            .locator("#site-mega-navigation .site-mega-link")
            .evaluateAll((es) =>
              es.map((e) => ({
                surface: "dropdown",
                label: e.innerText.replace(/\n.*/s, "").trim(),
                href: e.getAttribute("href"),
              })),
            )),
        );
      }
    }
  } else {
    await page
      .getByRole("button", { name: "Открыть навигацию", exact: true })
      .click();
    const groups = page.locator(".site-mobile-group");
    for (let i = 0; i < (await groups.count()); i++) {
      const group = groups.nth(i);
      entries.push(
        ...(await group
          .locator(".site-mobile-group-heading>a")
          .evaluateAll((es) =>
            es.map((e) => ({
              surface: "mobile",
              label: e.innerText.trim(),
              href: e.getAttribute("href"),
            })),
          )),
      );
      const button = group.locator("button");
      if (
        (await button.count()) &&
        (await button.getAttribute("aria-expanded")) !== "true"
      )
        await button.click();
      entries.push(
        ...(await group
          .locator(".site-mobile-group-links a")
          .evaluateAll((es) =>
            es.map((e) => ({
              surface: "mobile-dropdown",
              label: e.innerText.trim(),
              href: e.getAttribute("href"),
            })),
          )),
      );
    }
  }
  entries.push(
    ...(await page.locator(".brand-header-contact").evaluateAll((es) =>
      es.map((e) => ({
        surface: "header-cta",
        label: e.innerText.trim(),
        href: e.getAttribute("href"),
      })),
    )),
  );
  entries.push(
    ...(await page.locator(".site-footer nav a").evaluateAll((es) =>
      es.map((e) => ({
        surface: "footer",
        label: e.innerText.trim(),
        href: e.getAttribute("href"),
      })),
    )),
  );
  for (const source of [
    "/careers",
    "/careers/vacancies",
    "/careers/internships",
    "/careers/apply",
    "/careers/apply?type=internship",
    "/careers/vacancies/production-director",
    "/careers/vacancies/construction-director",
  ]) {
    await page.goto(base + source);
    entries.push(
      ...(await page.locator(".career a").evaluateAll(
        (es, source) =>
          es.map((e) => ({
            surface: "content",
            source,
            label: e.innerText.replace(/\s+/g, " ").trim(),
            href: e.getAttribute("href"),
          })),
        source,
      )),
    );
  }
  await page.goto(base + "/careers/vacancies");
  await page.getByRole("button", { name: "Показать все публикации" }).click();
  entries.push(
    ...(await page
      .locator(".career-job a")
      .evaluateAll((es) =>
        es.map((e) => ({
          surface: "vacancy-result",
          source: "/careers/vacancies",
          label: e.innerText.trim(),
          href: e.getAttribute("href"),
        })),
      )),
  );
  const cache = new Map();
  for (const entry of entries) {
    if (!entry.href?.startsWith("/") && !entry.href?.startsWith("#")) {
      entry.result = "external-or-other-section";
      continue;
    }
    const target = entry.href.startsWith("#")
      ? (entry.source || "/careers") + entry.href
      : entry.href;
    if (!cache.has(target)) {
      const response = await page.goto(base + target);
      await page.locator("h1").first().waitFor();
      const content = await page.locator(".site-main").innerText();
      const hash = new URL(page.url()).hash;
      cache.set(target, {
        url: page.url().replace(base, ""),
        status: response.status(),
        heading: await page.locator("h1").first().innerText(),
        contentHash: createHash("sha256")
          .update(content.replace(/\s+/g, " ").trim())
          .digest("hex"),
        anchorExists: hash ? (await page.locator(hash).count()) > 0 : true,
      });
    }
    Object.assign(entry, cache.get(target));
  }
  results.push({ device, entries });
  await page.close();
}
await browser.close();
await writeFile(
  new URL(`${phase}.json`, out),
  JSON.stringify(results, null, 2),
);
console.log(
  `${phase}: ${results.map((r) => `${r.device} ${r.entries.length} links`).join(", ")}`,
);
