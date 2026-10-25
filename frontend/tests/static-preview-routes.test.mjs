import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { careerPages, jobs } from '../lib/ecosystem/careers.js';
import { news } from '../lib/ecosystem/news.js';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const read = (root, path) => readFile(join(root, path), 'utf8');
async function put(root, path, source) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), source);
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'alageum-preview-routes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const entry of ['app', 'components', 'lib', 'package.json', 'jsconfig.json']) {
    await cp(join(frontend, entry), join(root, entry), { recursive: true });
  }
  await mkdir(join(root, 'public'));
  await mkdir(join(root, 'scripts'));
  await cp(join(frontend, 'scripts/verify-source-context-build.mjs'), join(root, 'scripts/verify-source-context-build.mjs'));
  await put(root, 'node_modules/next/dist/bin/next', `
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const stage = process.argv[3];
writeFileSync(join(process.cwd(), 'build-env.json'), JSON.stringify(Object.fromEntries(
 ['NEWS_SOURCE', 'PAGES_SOURCE', 'PAGES_STATIC_PREVIEW', 'NEXT_PUBLIC_CATALOG_SOURCE', 'COMPANY_SOURCE'].map(key => [key, process.env[key]])
)));
if (process.env.PREVIEW_TEST_FAIL === '1') process.exit(42);
mkdirSync(join(stage, 'out'), { recursive: true });
writeFileSync(join(stage, 'out/index.html'), 'fixture export');
`);
  return root;
}
function invoke(root, extra = {}) {
  return spawnSync(process.execPath, [join(frontend, 'scripts/build-preview.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, COMPANY_SOURCE: 'static', NEWS_SOURCE: 'api', PAGES_SOURCE: 'api', ...extra },
  });
}
async function routeFiles(root, prefix = 'app') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await routeFiles(root, path));
    else if (entry.name === 'page.js') result.push(path);
  }
  return result;
}
function generatedParams(source, bindings) {
  const body = source.match(/export function generateStaticParams\(\) \{ ([^\n]+) \}/)?.[1];
  assert.ok(body, 'Expected explicit preview parameter generator');
  return new Function(...Object.keys(bindings), body)(...Object.values(bindings));
}

test('preview enumerates bundled routes and locales without restricting the live CMS', async t => {
  const root = await fixture(t);
  const untouched = [
    'app/layout.js', 'app/[locale]/layout.js', 'app/(site)/careers/[slug]/page.js',
    'app/(site)/news/[slug]/page.js', 'app/[locale]/(site)/news/[slug]/page.js',
    'app/(site)/client/projects/[id]/page.js', 'app/(site)/client/documents/[id]/print/page.js',
    'app/(site)/workspace/page.js', 'components/ecosystem/ClientWorkspace.js', 'lib/api/newsServer.js',
  ];
  const before = new Map(await Promise.all(untouched.map(async path => [path, await read(root, path)])));
  const result = invoke(root);
  assert.equal(result.status, 0, result.stderr);
  const stage = join(root, '.preview-build');
  assert.deepEqual(JSON.parse(await read(root, 'build-env.json')), {
    NEWS_SOURCE: 'static', PAGES_SOURCE: 'static', PAGES_STATIC_PREVIEW: '1',
    NEXT_PUBLIC_CATALOG_SOURCE: 'static', COMPANY_SOURCE: 'static',
  });
  for (const [path, source] of before) assert.equal(await read(root, path), source, `Live source modified: ${path}`);
  assert.doesNotMatch(await read(root, 'app/(site)/news/[slug]/page.js'), /generateStaticParams|dynamicParams/);
  for (const [route, bindings, expected] of [
    ['careers/[slug]', { careerPages }, [...Object.keys(careerPages), 'workplaces', 'team', 'process'].map(slug => ({ slug }))],
    ['careers/vacancies/[id]', { jobs }, jobs.map(({ id }) => ({ id }))],
    ['news/[slug]', { previewNews: news }, news.map(({ id }) => ({ slug: id }))],
    ['client/[section]', {}, ['projects', 'orders', 'documents', 'support', 'profile'].map(section => ({ section }))],
    ['company/[section]', { pages: { achievements: {}, social: {}, production: {}, assets: {} } }, ['achievements', 'social', 'production', 'assets', 'history'].map(section => ({ section }))],
  ]) {
    const canonical = await read(stage, `app/(site)/${route}/page.js`);
    assert.deepEqual(generatedParams(canonical, bindings), expected);
    const localized = await read(stage, `app/[locale]/(site)/${route}/page.js`);
    assert.ok(localized.includes(`export { generateStaticParams } from '@/app/(site)/${route}/page'`));
  }
  assert.deepEqual(generatedParams(await read(stage, 'app/[locale]/layout.js'), {}), ['ru', 'kk', 'en'].map(locale => ({ locale })));
  for (const path of await routeFiles(stage)) {
    // Locale-only pages inherit the locale layout's params. Other dynamic pages
    // must explicitly enumerate records, including future routes added later.
    if (/\[(?!locale\])[^/]+\]/.test(path)) {
      assert.match(await read(stage, path), /generateStaticParams/, `${path} is not exportable`);
      assert.match(await read(stage, path), /dynamicParams = false/, `${path} allows runtime paths`);
    }
  }
  assert.doesNotMatch(await read(stage, 'app/layout.js'), /next\/headers|headers\(\)|cookies\(\)/);
  const document = await read(stage, 'components/StaticPreviewDocument.js');
  assert.match(document, /localeFromPath\(usePathname\(\)/);
  assert.match(document, /<html lang=\{locale\}/);
  assert.match(document, /<LocaleProvider locale=\{locale\}/);
  assert.match(document, /data-static-preview/);
  assert.match(await read(stage, 'next.config.mjs'), /NEXT_PUBLIC_SITE_MODE: 'public-only'/);
  assert.match(await read(stage, 'next.config.mjs'), /experimental: \{ cpus: 2 \}/);
  const workspace = await read(stage, 'components/ecosystem/ClientWorkspace.js');
  assert.match(workspace, /Статический предпросмотр/);
  assert.match(workspace, /В этой статической копии они отключены/);
  assert.match(workspace, /copy\[useLocale\(\)\]/);
  assert.match(workspace, /They are disabled in this static copy/);
  assert.match(workspace, /Бұл статикалық көшірмеде олар өшірілген/);
  assert.doesNotMatch(workspace, /createProject|router\.push|<form/);
  assert.doesNotMatch(await read(stage, 'app/(site)/workspace/page.js'), /redirect|headers/);
  assert.match(await read(stage, 'app/service-unavailable/page.js'), /ClientWorkspace/);
  for (const group of ['(site)', '[locale]/(site)']) {
    for (const path of ['client/projects/[id]', 'client/documents/[id]']) {
      await assert.rejects(access(join(stage, 'app', group, path)), { code: 'ENOENT' });
    }
  }
});

test('missing expected source or failed Next build cannot replace the last successful preview', async t => {
  const root = await fixture(t);
  await put(root, 'preview-dist/index.html', 'last good preview');
  const failure = invoke(root, { PREVIEW_TEST_FAIL: '1' });
  assert.equal(failure.status, 42, failure.stderr);
  assert.equal(await read(root, 'preview-dist/index.html'), 'last good preview');
  await rm(join(root, 'app/(site)/news/[slug]/page.js'));
  const missing = invoke(root);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ENOENT/);
  assert.equal(await read(root, 'preview-dist/index.html'), 'last good preview');
});

test('real exported HTML has static snapshots, correct languages and no fake private routes', { skip: process.env.ALAGEUM_PREVIEW_OUTPUT_TEST !== '1' }, async () => {
  const output = join(frontend, 'preview-dist');
  for (const [prefix, locale] of [['', 'ru'], ['ru/', 'ru'], ['kk/', 'kk'], ['en/', 'en']]) {
    for (const path of ['index.html', 'careers/about/index.html', 'careers/vacancies/production-director/index.html', 'news/domestic-production/index.html', 'client/projects/index.html', 'service-unavailable/index.html']) {
      const html = await read(output, `${prefix}${path}`);
      assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`), `${prefix}${path}`);
      assert.match(html, /data-static-preview/);
      assert.doesNotMatch(html, /Новости временно недоступны/);
      if (path.startsWith('client/') || path.startsWith('service-unavailable/')) {
        const copy = {
          ru: ['Статический предпросмотр', 'В этой статической копии они отключены', 'Контакты компании'],
          kk: ['Статикалық алдын ала қарау', 'Бұл статикалық көшірмеде олар өшірілген', 'Компанияның байланыс деректері'],
          en: ['Static preview', 'They are disabled in this static copy', 'Company contacts'],
        }[locale];
        assert.ok(html.includes(`<h1>${copy[0]}</h1>`), `${prefix}${path} title is not localized`);
        for (const text of copy.slice(1)) assert.ok(html.includes(text), `${prefix}${path} copy is not localized`);
        if (locale !== 'ru') assert.doesNotMatch(html, /В этой статической копии они отключены/);
        assert.doesNotMatch(html, /<form\b/);
      }
    }
  }
  for (const path of ['healthz', 'b2b', 'login', 'admin', 'account', 'client/projects/[id]', 'client/documents/[id]']) {
    await assert.rejects(access(join(output, path)), { code: 'ENOENT' });
  }
  assert.match(await read(output, 'pages/ru/about/index.html'), /О компании/);
});
