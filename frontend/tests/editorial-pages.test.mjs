import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { editorialMetadata, isPageRoute, PAGE_LIMITS, safePageHref, validateEditorialPage, validatePageBlocks } from '../lib/public/pages.js';
import { getPreviewPage, previewPageParams, previewPageProvenance } from '../lib/public/pagesPreview.js';

// Next supplies/enforces this virtual marker. Mock only the marker for Node's
// test runner; all actual loader and validation code executes unchanged.
const marker = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'server-only' ? { url: 'data:text/javascript,export {}', shortCircuit: true } : nextResolve(specifier, context);
} });
const { loadEditorialPage, EditorialPageError } = await import('../lib/api/pagesServer.js');
const { companyDelivery, companyMetadata } = await import('../lib/api/companyServer.js');
marker.deregister();
const fixture = () => getPreviewPage('ru', 'about');
const route = { locale: 'ru', slug: 'about' };
const text = value => ({ type: 'text', text: value });
const paragraph = value => ({ type: 'paragraph', children: [text(value)] });
const env = { API_INTERNAL_BASE_URL: 'http://127.0.0.1:4100/api/v1', PAGES_SOURCE: 'api' };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('editorial routing accepts only exact supported locales and bounded lowercase ASCII slugs', () => {
  for (const locale of ['ru', 'kk', 'en', 'zh', 'uz']) assert.ok(isPageRoute(locale, 'about-us-2'));
  for (const locale of ['RU', 'kz', 'en-US', '', null]) assert.equal(isPageRoute(locale, 'about'), false);
  for (const slug of ['', '../about', 'a/b', 'about?', 'About', '-about', 'a--b', 'a'.repeat(161), null]) assert.equal(isPageRoute('ru', slug), false);
});

test('payloads require matching public identity, exact allowlisted fields and publication timestamps', () => {
  assert.deepEqual(validateEditorialPage(fixture(), route), fixture());
  for (const patch of [{ locale_code: 'en' }, { slug: 'other' }, { published_at: null }, { updated_at: 'yesterday' }, { published_at: '2026-02-31T00:00:00Z' }, { title: '' }, { title: 'x'.repeat(241) }, { seo_title: 'x'.repeat(241) }, { seo_description: 'x'.repeat(501) }, { published: false }, { internal_id: 1 }, { body: '<p>HTML</p>' }]) assert.throws(() => validateEditorialPage({ ...fixture(), ...patch }, route));
  const missing = fixture(); delete missing.seo_title;
  assert.throws(() => validateEditorialPage(missing, route));
  assert.equal(validateEditorialPage({ ...fixture(), seo_title: null, seo_description: null, body: [] }, route).seo_title, null);
});

test('links retain only explicit safe schemes, root paths and ASCII anchors', () => {
  for (const url of ['https://example.com/path?q=value', 'http://example.com/', '/company', '/pages/ru/about#mission', '#mission', 'mailto:info@example.com', 'tel:+77000000000']) assert.equal(safePageHref(url), url);
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com', '/\\evil', 'https://user:pass@example.com', '#', '#кириллица', ' javaScript:foo', 'java\tscript:foo', 'https://example.com/\u00a0', 'ftp://example.com', 'relative', 'x'.repeat(2049)]) assert.equal(safePageHref(url), null);
});

test('Blocks reject media, HTML, unknown fields, unsafe links and malformed nesting', () => {
  for (const body of [
    [{ type: 'html', html: '<script>alert(1)</script>' }],
    [{ type: 'image', image: { url: 'https://example.com/image.jpg' } }],
    [{ ...paragraph('text'), dangerouslySetInnerHTML: { __html: 'bad' } }],
    [{ type: 'paragraph', children: [{ type: 'link', url: 'javascript:alert(1)', children: [text('click')] }] }],
    [text('no parent')], [{ type: 'list-item', children: [text('no list')] }],
    [{ type: 'heading', level: 7, children: [text('bad level')] }],
    [{ type: 'paragraph', children: [{ type: 'text', text: 'bad mark', bold: 'yes' }] }],
    [{ type: 'paragraph', children: [paragraph('nested')] }],
    [{ type: 'list', format: 'ordered', children: [{ type: 'list-item', children: [paragraph('nested')] }] }],
    [{ type: 'paragraph', children: [{ type: 'link', url: '/company', children: [{ type: 'link', url: '/', children: [text('nested')] }] }] }],
    [{ type: '__proto__', children: [] }],
  ]) assert.throws(() => validatePageBlocks(body));
});

test('Blocks enforce top-level, child, depth, node and text budgets', () => {
  assert.throws(() => validatePageBlocks(Array.from({ length: 201 }, () => paragraph('x'))));
  assert.throws(() => validatePageBlocks([{ type: 'paragraph', children: Array.from({ length: 201 }, () => text('x')) }]));
  assert.throws(() => validatePageBlocks([paragraph('x'.repeat(PAGE_LIMITS.text + 1))]));
  assert.throws(() => validatePageBlocks(Array.from({ length: 11 }, () => ({ type: 'paragraph', children: Array.from({ length: 200 }, () => text('x')) }))));
  let nested = { type: 'list-item', children: [text('deep')] };
  for (let depth = 0; depth < 10; depth++) nested = { type: 'list', format: 'unordered', children: [nested] };
  assert.throws(() => validatePageBlocks([nested]));
});

test('React Blocks rendering escapes text, clamps body H1 only and fetches no media', async () => {
  const require = createRequire(import.meta.url);
  const { transform, loadBindings } = require('next/dist/build/swc');
  const file = new URL('../components/public/EditorialBlocks.js', import.meta.url);
  const input = (await readFile(file, 'utf8')).replace("'../../lib/public/pages.js'", JSON.stringify(new URL('../lib/public/pages.js', import.meta.url).href));
  await loadBindings();
  const compiled = await transform(input, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  const { default: Blocks } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const body = [
    paragraph('<script>alert("x")</script>'),
    { type: 'heading', level: 1, children: [text('Section')] },
    ...[2, 3, 4, 5, 6].map(level => ({ type: 'heading', level, children: [text(`Section ${level}`)] })),
    { type: 'paragraph', children: [{ ...text('Marked'), bold: true, italic: true, underline: true, strikethrough: true, code: true }, { type: 'link', url: 'https://example.com/?a=1&b=2', children: [text('Link')] }] },
    { type: 'list', format: 'ordered', children: [{ type: 'list-item', children: [text('One')] }, { type: 'list', format: 'unordered', children: [{ type: 'list-item', children: [text('Nested')] }] }] },
    { type: 'quote', children: [text('Quote')] }, { type: 'code', children: [text('a < b')] },
  ];
  const html = renderToStaticMarkup(createElement(Blocks, { body }));
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script|<img|<iframe|<h1|javascript:/);
  assert.match(html, /<h2>Section<\/h2>/);
  for (const level of [2, 3, 4, 5, 6]) assert.ok(html.includes(`<h${level}>Section ${level}</h${level}>`));
  for (const tag of ['h2', 'strong', 'em', 'u', 's', 'code', 'ol', 'ul', 'li', 'blockquote', 'pre']) assert.ok(html.includes(`<${tag}>`), tag);
  assert.match(html, /<li class="editorial-list-nested"><ul>/);
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.throws(() => renderToStaticMarkup(createElement(Blocks, { body: [{ type: 'image', image: { url: 'https://example.com/' } }] })));
});

test('preview contains exactly one RU page copied verbatim from the extracted company source', async () => {
  assert.deepEqual(previewPageParams(), [{ locale: 'ru', slug: 'about' }]);
  const company = await source('components/public/StaticCompanyPage.js');
  const page = fixture();
  for (const value of [page.title, page.seo_title, page.seo_description, ...page.body.flatMap(block => block.children.map(child => child.text))]) assert.ok(company.includes(value), value);
  assert.equal(previewPageProvenance.sourceFile, 'frontend/components/public/StaticCompanyPage.js');
  assert.equal(previewPageProvenance.sourceUrl, 'https://alageum.com/ru/kompaniya/o-nas');
  assert.equal(previewPageProvenance.reviewedAt, '2026-10-12');
  for (const locale of ['en', 'kk', 'uz', 'zh']) assert.equal(getPreviewPage(locale, 'about'), null);
  assert.equal(getPreviewPage('ru', 'unknown'), null);
  page.title = 'changed'; assert.equal(fixture().title, 'О компании');
});

test('metadata stays noindex/nofollow and canonical requires an explicit origin', () => {
  const metadata = editorialMetadata(fixture());
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(metadata.title, 'О компании'); assert.equal(metadata.alternates, undefined);
  assert.deepEqual(editorialMetadata(fixture(), 'https://preview.example.com').alternates, { canonical: 'https://preview.example.com/pages/ru/about' });
  for (const origin of ['https://user:pass@example.com', 'https://example.com/company', 'https://example.com?token=secret', 'javascript:bad']) assert.throws(() => editorialMetadata(fixture(), origin));
});

test('loader fetches exact locale with no cache, credentials, sessions or redirects', async () => {
  let calls = 0;
  let requestSignal;
  const result = await loadEditorialPage('ru', 'about', { env, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:4100/api/v1/pages/about?locale=ru');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/json' }); assert.ok(options.signal instanceof AbortSignal);
    requestSignal = options.signal;
    return json(fixture());
  } });
  assert.equal(calls, 1); assert.deepEqual(result, fixture());
  assert.equal(requestSignal.aborted, true, 'completed fetch resources are released');
});

test('invalid route parameters are absent without contacting the API', async () => {
  const options = { env, fetchImpl: () => { throw new Error('must not fetch'); } };
  assert.equal(await loadEditorialPage('kz', 'about', options), null);
  assert.equal(await loadEditorialPage('ru', '../about', options), null);
});

test('missing config and credential-bearing or malformed bases fail before fetch', async () => {
  for (const base of [undefined, '/api/v1', 'https://user:secret@example.com/api/v1', 'https://example.com/api/v1?secret=x', 'https://example.com/api', 'ftp://example.com/api/v1']) await assert.rejects(loadEditorialPage('ru', 'about', { env: { API_INTERNAL_BASE_URL: base }, fetchImpl: () => { throw new Error('must not fetch'); } }), /API_INTERNAL_BASE_URL/);
});

test('only API404 is absent; all other errors remain errors with no bundled-content fallback', async () => {
  assert.equal(await loadEditorialPage('ru', 'about', { env, fetchImpl: async () => new Response(null, { status: 404 }) }), null);
  for (const status of [204, 301, 400, 401, 403, 422, 500, 503]) await assert.rejects(loadEditorialPage('ru', 'about', { env, fetchImpl: async () => new Response(null, { status }) }), error => error instanceof EditorialPageError && error.message.includes(String(status)));
  await assert.rejects(loadEditorialPage('ru', 'about', { env, fetchImpl: async () => { throw new Error('secret upstream body'); } }), error => !error.message.includes('secret') && /unavailable/.test(error.message));
});

test('loader rejects malformed JSON, non-JSON and non-public/mismatched payloads', async () => {
  for (const response of [
    () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{bad json', { headers: { 'Content-Type': 'application/json' } }),
    () => json({ ...fixture(), locale_code: 'en' }),
    () => json({ ...fixture(), published_at: null }),
    () => json({ ...fixture(), body: [{ type: 'image', image: { url: 'https://example.com/' } }] }),
  ]) await assert.rejects(loadEditorialPage('ru', 'about', { env, fetchImpl: async () => response() }), EditorialPageError);
});

test('loader bounds declared and streamed response bytes', async () => {
  await assert.rejects(loadEditorialPage('ru', 'about', { env, fetchImpl: async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(PAGE_LIMITS.bytes + 1) } }) }), /too large/);
  await assert.rejects(loadEditorialPage('ru', 'about', { env, fetchImpl: async () => new Response(' '.repeat(PAGE_LIMITS.bytes + 1), { headers: { 'Content-Type': 'application/json' } }) }), /too large/);
});

test('loader aborts a slow request instead of falling back to a fixture', async () => {
  let aborted = false;
  await assert.rejects(loadEditorialPage('ru', 'about', { env, timeoutMs: 20, fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }) }), /timed out/);
  assert.equal(aborted, true);
});

test('explicit disposable-preview mode is required and cannot fabricate translations', async () => {
  await assert.rejects(loadEditorialPage('ru', 'about', { env: { PAGES_SOURCE: 'static' } }), /disposable/);
  await assert.rejects(loadEditorialPage('ru', 'about', { env: { PAGES_SOURCE: 'unknown' } }), /PAGES_SOURCE/);
  const options = { env: { PAGES_SOURCE: 'static', PAGES_STATIC_PREVIEW: '1' }, fetchImpl: () => { throw new Error('must not fetch'); } };
  assert.deepEqual(await loadEditorialPage('ru', 'about', options), fixture());
  assert.equal(await loadEditorialPage('en', 'about', options), null);
  assert.equal(await loadEditorialPage('ru', 'missing', options), null);
});

test('live route stays server-only and dynamic; static params exist only in disposable preview', async () => {
  const routeSource = await source('app/pages/[locale]/[slug]/page.js');
  const loaderSource = await source('lib/api/pagesServer.js');
  const previewSource = await source('scripts/build-preview.mjs');
  assert.match(loaderSource, /^import 'server-only'/);
  assert.doesNotMatch(routeSource, /generateStaticParams|dynamicParams|force-static/);
  assert.match(routeSource, /if \(!page\) notFound\(\)/);
  assert.match(previewSource, /PAGES_SOURCE: 'static', PAGES_STATIC_PREVIEW: '1'/);
  assert.match(previewSource, /previewPageParams as generateStaticParams/);
  assert.match(previewSource, /app\/\(site\)\/catalog\/\[slug\]\/page.js/);
});

test('editorial ancestry has no loading boundary while the existing site retains its loader', async () => {
  for (const path of ['app/loading.js', 'app/company/loading.js', 'app/pages/loading.js', 'app/pages/[locale]/loading.js', 'app/pages/[locale]/[slug]/loading.js']) await assert.rejects(access(new URL(`../${path}`, import.meta.url)), { code: 'ENOENT' });
  await access(new URL('../app/(site)/loading.js', import.meta.url));
  const layout = await source('app/layout.js');
  assert.doesNotMatch(layout, /Suspense|loading/);
  assert.match(layout, /<ExperienceShell>\{children\}<\/ExperienceShell>/);
  const shell = await source('components/ExperienceShell.js');
  assert.doesNotMatch(shell, /Suspense|loading/);
  assert.match(shell, /<SiteHeader \/>/); assert.match(shell, /<SiteFooter \/>/);
  for (const path of ['app/(site)/page.js', 'app/company/page.js', 'app/(site)/catalog/page.js', 'app/(site)/inquiry/page.js']) await access(new URL(`../${path}`, import.meta.url));
});


test('company selection defaults to static without requiring or reading Page configuration', () => {
  for (const selected of [undefined, 'static']) assert.deepEqual(companyDelivery({ COMPANY_SOURCE: selected, PAGES_SOURCE: 'bad', API_INTERNAL_BASE_URL: 'bad', PAGES_SITE_ORIGIN: 'bad' }), { source: 'static' });
  for (const selected of ['', 'CMS', ' static', 'cms ', 'api', 'false']) assert.throws(() => companyDelivery({ COMPANY_SOURCE: selected }), /COMPANY_SOURCE/);
});

test('CMS company requires live Page mode and a valid explicit canonical origin', () => {
  const valid = { COMPANY_SOURCE: 'cms', PAGES_SITE_ORIGIN: 'https://preview.example.com' };
  for (const source of [undefined, 'api']) {
    const config = companyDelivery({ ...valid, PAGES_SOURCE: source });
    assert.deepEqual(config, { source: 'cms', canonical: 'https://preview.example.com/company' });
    assert.deepEqual(companyMetadata(fixture(), config), { title: fixture().seo_title, description: fixture().seo_description, robots: { index: false, follow: false }, alternates: { canonical: config.canonical } });
  }
  for (const source of ['', 'static', 'unknown']) assert.throws(() => companyDelivery({ ...valid, PAGES_SOURCE: source }), /PAGES_SOURCE/);
  assert.throws(() => companyDelivery({ ...valid, PAGES_STATIC_PREVIEW: '1' }), /preview/);
  for (const origin of [undefined, '', ' ', '/company', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com#hash', 'javascript:bad']) assert.throws(() => companyDelivery({ ...valid, PAGES_SITE_ORIGIN: origin }));
});

test('company and generic routes resolve metadata and content together before rendering', async () => {
  const company = await source('app/company/page.js');
  const generic = await source('app/pages/[locale]/[slug]/page.js');
  assert.match(company, /export const dynamic = 'force-dynamic'/);
  assert.match(company, /const getCompany = cache\(async/);
  assert.match(company, /if \(config.source === 'static'\) return/);
  assert.match(company, /page: null, metadata: staticMetadata/);
  assert.equal((company.match(/await loadEditorialPage\(/g) || []).length, 1);
  assert.match(company, /loadEditorialPage\('ru', 'about'\)/);
  assert.match(company, /return \(await getCompany\(\)\).metadata/);
  assert.match(generic, /locale === 'ru' && slug === 'about' \? companyDelivery\(\) : null/);
  assert.match(generic, /return \{ page, metadata \}/);
  assert.match(generic, /return \(await getPage\(locale, slug\)\).metadata/);
  for (const value of [company, await source('lib/api/companyServer.js')]) assert.doesNotMatch(value, /searchParams|cookies\(|NEXT_PUBLIC_COMPANY/);
  await assert.rejects(access(new URL('../app/(site)/company/page.js', import.meta.url)), { code: 'ENOENT' });
});

test('preview rejects CMS and invalid company selectors before mutating disposable staging or output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'company-preview-guard-'));
  try {
    for (const directory of ['.preview-build', 'preview-dist']) {
      await mkdir(join(root, directory));
      await writeFile(join(root, directory, 'sentinel.txt'), `unchanged ${directory}`);
    }
    for (const selection of ['cms', '', 'invalid']) {
      const result = spawnSync(process.execPath, [new URL('../scripts/build-preview.mjs', import.meta.url).pathname], { cwd: root, env: { ...process.env, COMPANY_SOURCE: selection }, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Static preview requires COMPANY_SOURCE unset or static/);
      for (const directory of ['.preview-build', 'preview-dist']) assert.equal(await readFile(join(root, directory, 'sentinel.txt'), 'utf8'), `unchanged ${directory}`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
