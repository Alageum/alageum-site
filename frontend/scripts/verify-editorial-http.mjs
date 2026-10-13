// Reimplemented acceptance: fixture-only HTTP faults, never native CMS proof.
// Run after the normal production Next build. No development server is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { getPreviewPage } from '../lib/public/pagesPreview.js';
import { validateEditorialPage } from '../lib/public/pages.js';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(frontend, '../page-delivery-evidence');
await mkdir(evidence, { recursive: true });
const report = { implementation: 'reimplemented', kind: 'fixture-only-production-next-http', nativeCms: false, startedAt: new Date().toISOString(), cases: [], status: 'running' };
const fixture = validateEditorialPage(getPreviewPage('ru', 'about'), { locale: 'ru', slug: 'about' });
const firstText = fixture.body[0].children[0].text;
const privateText = 'PRIVATE_FAULT_MATRIX_DRAFT_8b930f';
const secondText = 'REPUBLISHED_FAULT_MATRIX_BODY_8b930f';
const htmlText = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const unrelatedText = 'INDEPENDENT_PUBLISHED_PAGE_a932';
const unrelated = { ...structuredClone(fixture), slug: 'independent-page', title: 'Independent page', body: [{ type: 'paragraph', children: [{ type: 'text', text: unrelatedText }] }] };
let mode = 'missing', published = null, reads = 0, web, protocolFailure, firstReadLimit = 0;
const timers = new Set();
const fake = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/v1/pages/')) { response.writeHead(404).end(); return; }
  reads += 1;
  if (request.headers.authorization || request.headers.cookie) {
    protocolFailure = 'Public Page reads must not forward authorization or cookies';
    response.writeHead(500).end(); return;
  }
  const send = () => {
    if (response.destroyed) return;
    response.setHeader('Content-Type', 'application/json');
    const independent = url.pathname === '/api/v1/pages/independent-page';
    if (url.pathname !== `/api/v1/pages/${independent ? unrelated.slug : (published || fixture).slug}` || url.searchParams.get('locale') !== 'ru' || ['missing', 'delayed-missing'].includes(mode) || (!independent && !published && mode === 'normal')) {
      response.writeHead(404).end(JSON.stringify({ error: { code: 'page_not_found' } })); return;
    }
    if (['api-500', 'delayed-500'].includes(mode) || (mode === 'first-read-only' && reads > firstReadLimit) || (mode === 'first-error-only' && reads === firstReadLimit)) { response.writeHead(500).end(JSON.stringify({ error: 'disposable fault' })); return; }
    if (mode === 'malformed-json') { response.writeHead(200).end('{not JSON'); return; }
    const value = structuredClone(independent ? unrelated : published || fixture);
    if (mode === 'unsafe-blocks') value.body = [{ type: 'paragraph', children: [{ type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', text: privateText }] }] }];
    if (mode === 'mismatched-locale') value.locale_code = 'en';
    if (mode === 'unpublished-payload') value.published_at = null;
    response.writeHead(200).end(JSON.stringify(value));
  };
  const delay = mode === 'timeout' ? 6500 : mode.startsWith('delayed-') ? 350 : 0;
  if (!delay) { send(); return; }
  const timer = setTimeout(() => { timers.delete(timer); send(); }, delay);
  timers.add(timer);
  response.on('close', () => { clearTimeout(timer); timers.delete(timer); });
});
const nextLog = createWriteStream(join(evidence, 'fault-matrix-next.log'));
const apiLog = createWriteStream(join(evidence, 'fault-matrix-api.log'));
const closed = child => new Promise(resolveClosed => child.once('close', (code, signal) => resolveClosed({ code, signal })));
async function freePort() {
  const server = createSocketServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = closed(child);
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await done; } finally { clearTimeout(timer); }
}
let origin, apiOrigin;
async function check(name, path, expected, ua, { present, absent = [], sharedShell = false, minimumMs = 0, maximumReads = expected >= 500 ? 2 : 1, exactReads, minimumReads = 0, canonical, staticCompany = false, cmsCompany = false, headers = {} } = {}) {
  const before = reads, started = Date.now();
  const item = { name, userAgent: ua.name, path, expectedStatus: expected, status: 'running' };
  report.cases.push(item);
  try {
    const response = await fetch(`${origin}${path}`, { headers: { 'User-Agent': ua.value, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(18000) });
    const body = await response.text();
    Object.assign(item, { actualStatus: response.status, upstreamReads: reads - before, durationMs: Date.now() - started });
    assert.equal(protocolFailure, undefined);
    assert.equal(response.status, expected, `${name}: hard HTTP status (${ua.name})`);
    assert.ok(item.upstreamReads <= maximumReads, `${name}: expected at most ${maximumReads} upstream reads, saw ${item.upstreamReads}`);
    assert.ok(item.durationMs >= minimumMs, `${name}: timeout must exercise the five-second loader deadline`);
    if (present) { assert.ok(body.includes(htmlText(present)), `${name}: published body missing`); assert.equal(item.upstreamReads, 1); }
    for (const text of absent) assert.ok(!body.includes(htmlText(text)), `${name}: private, stale or fixture content leaked`);
    if (expected !== 200) for (const text of [firstText, privateText, secondText]) assert.ok(!body.includes(htmlText(text)), `${name}: failed requests must not render stale/fixture body`);
    assert.ok(item.upstreamReads >= minimumReads, `${name}: expected at least ${minimumReads} upstream reads`);
    if (exactReads !== undefined) assert.equal(item.upstreamReads, exactReads, `${name}: exact upstream read count`);
    if (canonical) {
      assert.ok(body.includes(`<link rel="canonical" href="${htmlText(canonical)}"`), `${name}: canonical missing`);
      assert.match(body, /<meta name="robots" content="noindex, nofollow"/);
    }
    if (staticCompany) {
      for (const markup of ['corp-about-opening', 'corp-mission', 'id="history"', 'corp-company-links', 'corp-end-note', '/company/aemz-engineers.webp']) assert.ok(body.includes(markup), `${name}: rich static section missing`);
      assert.ok(body.includes('<title>О компании · ALAGEUM Electric</title>'));
      assert.ok(body.includes(htmlText(fixture.seo_description)));
      assert.doesNotMatch(body, /<link rel="canonical"/);
      assert.doesNotMatch(body, /<article class="editorial-page/);
    }
    if (cmsCompany) {
      assert.match(body, /<article class="editorial-page/);
      assert.ok(body.includes(`<title>${htmlText(published.seo_title || published.title)} · ALAGEUM Electric</title>`), `${name}: published SEO title missing or stale`);
      if (published.seo_description) assert.ok(body.includes(`<meta name="description" content="${htmlText(published.seo_description)}"`), `${name}: published SEO description missing or stale`);
      assert.equal((body.match(/<h1(?:>|\s)/g) || []).length, 1);
      for (const markup of ['corp-about-opening', 'class="corp-mission"', 'id="history"', 'corp-end-note', '/company/aemz-engineers.webp']) assert.ok(!body.includes(markup), `${name}: static content appended to CMS`);
    }
    if (sharedShell) {
      assert.match(body, /<header[^>]+class="[^"]*site-header/);
      assert.match(body, /<footer[^>]+class="[^"]*site-footer/);
    }
    assert.ok(!/href=["'][^"']*\/(?:\(site\)|%28site%29)\//i.test(body), `${name}: route group leaked into href`);
    item.status = 'passed';
  } catch (error) { item.status = 'failed'; item.error = error.message; throw error; }
  finally { apiLog.write(`${JSON.stringify(item)}\n`); }
}
async function startNext(overrides = {}) {
  await stop(web);
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const childEnv = { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', API_INTERNAL_BASE_URL: `${apiOrigin}/api/v1`, PAGES_SOURCE: 'api', PAGES_STATIC_PREVIEW: '0', PAGES_SITE_ORIGIN: origin, COMPANY_SOURCE: 'static', ...overrides };
  for (const [key, value] of Object.entries(childEnv)) if (value === undefined) delete childEnv[key];
  web = spawn(process.execPath, [join(frontend, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: frontend, stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });
  web.stdout.pipe(nextLog, { end: false }); web.stderr.pipe(nextLog, { end: false });
  let spawnError;
  web.once('error', error => { spawnError = error; });
  const readinessDeadline = Date.now() + 45000;
  while (true) {
    if (spawnError) throw spawnError;
    assert.ok(web.exitCode === null && web.signalCode === null, 'Production Next exited before readiness');
    try { const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* Bounded startup retry. */ }
    assert.ok(Date.now() < readinessDeadline, 'Production Next readiness deadline exceeded');
    await new Promise(done => setTimeout(done, 200));
  }
}
const userAgents = [
  { name: 'browser', value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' },
  { name: 'bot', value: 'Twitterbot/1.0' },
];
const watchdog = setTimeout(() => { console.error('Fixture HTTP matrix exceeded its 300-second deadline'); process.kill(process.pid, 'SIGTERM'); }, 300000);
async function shutdown() {
  await stop(web);
  for (const timer of timers) clearTimeout(timer);
  fake.closeAllConnections();
  await new Promise(done => fake.close(done));
}
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; report.status = 'failed'; report.error = `Interrupted by ${signal}`; shutdown().finally(() => { writeFile(join(evidence, 'fault-matrix-results.json'), JSON.stringify(report, null, 2)).finally(() => process.exit(1)); }); });
try {
  await new Promise((done, reject) => { fake.once('error', reject); fake.listen(0, '127.0.0.1', done); });
  apiOrigin = `http://127.0.0.1:${fake.address().port}`;
  await startNext();
  // Preserve the complete original 58-case Page and existing-site matrix.
  for (const ua of userAgents) {
    published = null; mode = 'normal';
    await check('private draft', '/pages/ru/about', 404, ua);
    published = structuredClone(fixture);
    await check('publish', '/pages/ru/about', 200, ua, { present: firstText });
    // The fake draft changes; its published snapshot deliberately stays fixed.
    const draft = { ...structuredClone(fixture), body: [{ type: 'paragraph', children: [{ type: 'text', text: privateText }] }] };
    assert.notDeepEqual(draft.body, published.body);
    await check('draft edit remains private', '/pages/ru/about', 200, ua, { present: firstText, absent: [privateText] });
    published.body = [{ type: 'paragraph', children: [{ type: 'text', text: secondText }] }];
    await check('republish is fresh', '/pages/ru/about', 200, ua, { present: secondText, absent: [firstText, privateText] });
    published = null;
    await check('unpublish', '/pages/ru/about', 404, ua);
    published = structuredClone(fixture);
    for (const [name, path, expected, selectedMode] of [
      ['missing', '/pages/ru/missing-page', 404, 'normal'],
      ['delayed missing', '/pages/ru/about', 404, 'delayed-missing'],
      ['wrong locale', '/pages/en/about', 404, 'normal'],
      ['API 500', '/pages/ru/about', 500, 'api-500'],
      ['delayed API 500', '/pages/ru/about', 500, 'delayed-500'],
      ['malformed JSON', '/pages/ru/about', 500, 'malformed-json'],
      ['unsafe Blocks', '/pages/ru/about', 500, 'unsafe-blocks'],
      ['mismatched API locale', '/pages/ru/about', 500, 'mismatched-locale'],
      ['five-second API timeout', '/pages/ru/about', 500, 'timeout'],
    ]) {
      mode = selectedMode;
      await check(name, path, expected, ua, { minimumMs: mode === 'timeout' ? 4800 : 0 });
    }
    mode = 'normal';
    for (const path of ['/', '/company', '/catalog', '/catalog/compare', '/catalog/source', '/selection', '/inquiry', '/manufacturers', '/solutions', '/projects', '/contacts', '/documents', '/workspace', '/login', '/admin/catalog']) {
      await check('existing route and shared shell', path, 200, ua, { maximumReads: 0, sharedShell: true });
    }
  }
  assert.equal(report.cases.length, 58, 'Retain every original HTTP case');
  // Reuse the exact same production build under each runtime selector.
  for (const selection of [undefined, 'static']) {
    await startNext({ COMPANY_SOURCE: selection, API_INTERNAL_BASE_URL: undefined, PAGES_SOURCE: undefined, PAGES_SITE_ORIGIN: undefined });
    for (const ua of userAgents) await check('static company without backend configuration', '/company?source=cms&COMPANY_SOURCE=cms', 200, ua, { exactReads: 0, maximumReads: 0, staticCompany: true, sharedShell: true, headers: { Cookie: 'COMPANY_SOURCE=cms; PAGES_SOURCE=api' } });
  }
  await startNext({ COMPANY_SOURCE: 'cms' });
  const companyPaths = ['/company', '/pages/ru/about'];
  for (const ua of userAgents) {
    mode = 'normal'; published = null;
    for (const path of companyPaths) await check('CMS company private draft', path, 404, ua, { exactReads: 1 });
    published = structuredClone(fixture);
    for (const path of companyPaths) await check('CMS company published authoritative content', path, 200, ua, { present: firstText, canonical: `${origin}/company`, cmsCompany: true, sharedShell: true });
    // A private draft edit changes no published snapshot.
    for (const path of companyPaths) await check('CMS company private revision', path, 200, ua, { present: firstText, absent: [privateText], canonical: `${origin}/company` });
    published.body = [{ type: 'paragraph', children: [{ type: 'text', text: secondText }] }];
    published.seo_title = 'Republished company SEO';
    published.seo_description = 'Fresh published company description.';
    for (const path of companyPaths) await check('CMS company republish is fresh', path, 200, ua, { present: secondText, absent: [firstText, privateText], canonical: `${origin}/company`, cmsCompany: true });
    published.slug = 'about-moved';
    for (const path of companyPaths) await check('CMS company slug moved away', path, 404, ua, { exactReads: 1 });
    await check('moved page retains generic canonical', '/pages/ru/about-moved', 200, ua, { present: secondText, canonical: `${origin}/pages/ru/about-moved` });
    published = structuredClone(fixture);
    for (const path of companyPaths) await check('CMS company restored', path, 200, ua, { present: firstText, canonical: `${origin}/company` });
    published = null;
    for (const path of companyPaths) await check('CMS company unpublished', path, 404, ua, { exactReads: 1 });
    published = structuredClone(fixture);
    for (const selectedMode of ['delayed-missing', 'api-500', 'delayed-500', 'malformed-json', 'unsafe-blocks', 'mismatched-locale', 'unpublished-payload', 'timeout']) {
      mode = selectedMode;
      for (const path of companyPaths) await check(`CMS company ${mode}`, path, mode === 'delayed-missing' ? 404 : 500, ua, { ...(mode === 'delayed-missing' ? { exactReads: 1 } : { minimumReads: 1, maximumReads: 2 }), minimumMs: mode === 'timeout' ? 4800 : mode.startsWith('delayed-') ? 300 : 0 });
    }
    // Only the first upstream read can succeed: metadata and body must consume
    // that one validated snapshot. The next request must observe the outage.
    for (const path of companyPaths) {
      mode = 'first-read-only'; firstReadLimit = reads + 1;
      await check('CMS company metadata and body share first-read snapshot', path, 200, ua, { present: firstText, exactReads: 1, canonical: `${origin}/company`, cmsCompany: true });
      await check('CMS company subsequent request observes outage', path, 500, ua, { minimumReads: 1, maximumReads: 2 });
    }
    // Next creates a fresh RSC error render and re-runs metadata after generic
    // throws. That bounded second all-error read is framework recovery, not an
    // application availability precheck. A recovering metadata read must never
    // change the failed request's hard500 or render successful content.
    for (const path of companyPaths) {
      mode = 'first-error-only'; firstReadLimit = reads + 1;
      await check('CMS first failure stays hard500 despite recovery success', path, 500, ua, { minimumReads: 1, maximumReads: 2 });
      await check('CMS next request independently sees recovered publication', path, 200, ua, { present: firstText, exactReads: 1, canonical: `${origin}/company` });
    }
    mode = 'normal';
    await check('unrelated published page keeps own canonical', '/pages/ru/independent-page', 200, ua, { present: unrelatedText, canonical: `${origin}/pages/ru/independent-page` });
    await check('CMS selector ignores query and cookies', '/company?source=static&COMPANY_SOURCE=static', 200, ua, { present: firstText, cmsCompany: true, canonical: `${origin}/company`, headers: { Cookie: 'COMPANY_SOURCE=static; PAGES_SOURCE=static' } });
  }
  for (const [name, overrides] of [
    ['empty company selector', { COMPANY_SOURCE: '' }],
    ['invalid company selector', { COMPANY_SOURCE: 'CMS' }],
    ['missing canonical origin', { COMPANY_SOURCE: 'cms', PAGES_SITE_ORIGIN: undefined }],
    ['empty canonical origin', { COMPANY_SOURCE: 'cms', PAGES_SITE_ORIGIN: '' }],
    ['invalid canonical origin', { COMPANY_SOURCE: 'cms', PAGES_SITE_ORIGIN: 'https://example.com/path' }],
    ['credential canonical origin', { COMPANY_SOURCE: 'cms', PAGES_SITE_ORIGIN: 'https://user:secret@example.com' }],
    ['static source conflict', { COMPANY_SOURCE: 'cms', PAGES_SOURCE: 'static' }],
    ['empty Page source conflict', { COMPANY_SOURCE: 'cms', PAGES_SOURCE: '' }],
    ['preview mode conflict', { COMPANY_SOURCE: 'cms', PAGES_STATIC_PREVIEW: '1' }],
    ['missing API configuration', { COMPANY_SOURCE: 'cms', API_INTERNAL_BASE_URL: undefined }],
  ]) {
    await startNext(overrides); mode = 'normal'; published = structuredClone(fixture);
    for (const ua of userAgents) {
      for (const path of companyPaths) await check(name, path, 500, ua, { exactReads: 0 });
      if (name.includes('company selector')) {
        await check('invalid company selector leaves unrelated slug independent', '/pages/ru/independent-page', 200, ua, { present: unrelatedText, canonical: `${origin}/pages/ru/independent-page` });
        await check('invalid company selector leaves catalog independent', '/catalog', 200, ua, { exactReads: 0, sharedShell: true });
      }
      if (name === 'invalid canonical origin') await check('generic metadata failure is a hard status before streaming', '/pages/ru/independent-page', 500, ua, { absent: [unrelatedText] });
    }
  }
  await startNext({ COMPANY_SOURCE: 'cms', PAGES_SOURCE: undefined });
  for (const ua of userAgents) await check('CMS accepts unset Page source as API', '/company', 200, ua, { present: firstText, canonical: `${origin}/company`, cmsCompany: true });
  assert.equal(report.cases.length, 196, 'Retain all 58 original and 138 company delivery cases');
  report.frameworkErrorRecovery = 'Next 16.3.8 creates a fresh RSC error render and may read metadata again after a generic error: bounded 1–2 reads, hard500 and no body; successes and 404s use exactly one, preflight config failures zero.';
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  if (!interrupted) await shutdown();
  report.finishedAt = new Date().toISOString();
  await writeFile(join(evidence, 'fault-matrix-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  await Promise.all([new Promise(done => nextLog.end(done)), new Promise(done => apiLog.end(done))]);
  console.log(JSON.stringify({ kind: report.kind, status: report.status, cases: report.cases.length, ...(report.error ? { error: report.error } : {}) }));
}
