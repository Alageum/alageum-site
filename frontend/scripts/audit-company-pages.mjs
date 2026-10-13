import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { manufacturers, projects } from '../lib/public/content.js';
import { solutions } from '../lib/public/solutions.js';
const base = process.env.COMPANY_AUDIT_URL || 'http://127.0.0.1:3280';
const out = process.env.COMPANY_AUDIT_OUTPUT || '../artifacts/company-pages';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const routes = [
  ['home', '/'], ['company', '/company'], ['geography', '/manufacturers'],
  ...manufacturers.map(item => [`factory-${item.id}`, `/manufacturers/${item.id}`]),
  ['projects', '/projects'], ...projects.map(item => [`project-${item.id}`, `/projects/${item.id}`]),
  ['solutions', '/solutions'], ...solutions.map(item => [`solution-${item.id}`, `/solutions/${item.id}`]),
  ['contacts', '/contacts'], ['documents', '/documents'], ['privacy', '/data-policy'],
  ['catalog', '/catalog'], ['product', '/catalog/tmg-630'], ['compare', '/catalog/compare'],
  ['selection', '/selection'], ['inquiry', '/inquiry'], ['workspace', '/workspace'],
];
const result = [];
for (const [label, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844], ['narrow', 320, 780]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [name, route] of routes) {
    const errors = []; const listener = error => errors.push(error.message); page.on('pageerror', listener);
    const response = await page.goto(base + route, { waitUntil: 'networkidle' });
    // Every actual image is brought into view; keep production lazy loading intact.
    for (const image of await page.locator('main img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.complete ? undefined : new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }));
    }
    await page.locator('footer.site-footer').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const audit = await page.evaluate(() => ({
      width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
      images: [...document.querySelectorAll('main img')].every(img => img.complete && img.naturalWidth > 0),
      headings: [...document.querySelectorAll('main h1')].map(el => el.textContent),
      corporate: Boolean(document.querySelector('.corp-investor')),
      palette: Object.fromEntries(['--brand-red', '--ink', '--line'].map(key => [key, getComputedStyle(document.documentElement).getPropertyValue(key).trim()])),
    }));
    await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
    result.push({ page: name, route, viewport: label, status: response.status(), ...audit, errors });
    page.off('pageerror', listener);
    await writeFile(`${out}/visual-audit.json`, JSON.stringify(result, null, 2));
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(result, null, 2));
if (result.some(item => item.status >= 400 || item.documentWidth > item.width + 1 || !item.images || item.headings.length !== 1 || item.errors.length)) process.exitCode = 1;
