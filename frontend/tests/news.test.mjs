import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { validateNewsArticle, validateNewsList } from '../lib/public/news.js';
const marker = registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'server-only' ? { url: 'data:text/javascript,export {}', shortCircuit: true } : specifier === 'next/server' ? { url: 'data:text/javascript,export const connection = async () => {};', shortCircuit: true } : nextResolve(specifier, context); } });
const { loadNews, loadNewsArticle, NewsDeliveryError, newsSource } = await import('../lib/api/newsServer.js');
marker.deregister();
const fixture = () => ({ slug: 'factory-news', title: 'Factory news', locale_code: 'ru', summary: 'Summary', topic: null, date: '2026-10-19', cover: null, published_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z', body: [{ type: 'paragraph', children: [{ type: 'text', text: '<script>escaped</script>' }] }], seo_title: null, seo_description: null });
const card = () => Object.fromEntries(Object.entries(fixture()).filter(([key]) => !['body', 'seo_title', 'seo_description'].includes(key)));
const list = () => ({ data: [card()], pagination: { page: 1, page_size: 12, total: 1, page_count: 1 } });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const env = { NEWS_SOURCE: 'api', API_INTERNAL_BASE_URL: 'http://127.0.0.1:4100/api/v1' };
test('published news rejects drafts, identity mismatches, unsafe blocks and remote covers', () => {
  assert.equal(validateNewsArticle(fixture(), { locale: 'ru' }).id, 'factory-news');
  for (const patch of [{ published_at: null }, { createdBy: 1 }, { locale_code: 'en' }, { date: '2026-02-31' }, { body: [{ type: 'html', html: '<script>' }] }, { cover: { url: 'https://evil.example/x.png', width: 10, height: 10, alt: '' } }]) assert.throws(() => validateNewsArticle({ ...fixture(), ...patch }, { locale: 'ru' }));
  assert.equal(validateNewsList(list(), { locale: 'ru', page: 1, pageSize: 12 }).data.length, 1);
  assert.throws(() => validateNewsList({ ...list(), data: [card(), card()] }, { locale: 'ru', page: 1, pageSize: 12 }));
});
test('API delivery omits credentials, never caches and checks exact published DTOs', async () => {
  let options, url, connected = 0;
  const input = { env, connectionImpl: async () => connected++, fetchImpl: async (u, o) => { url = u; options = o; return json(fixture()); } };
  assert.equal((await loadNewsArticle('ru', 'factory-news', input)).id, 'factory-news'); assert.equal(connected, 1); assert.equal(url, `${env.API_INTERNAL_BASE_URL}/news/factory-news?locale=ru`);
  assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.deepEqual(options.headers, { Accept: 'application/json' });
  assert.equal((await loadNews('ru', 1, 12, { ...input, fetchImpl: async () => json(list()) })).data.length, 1);
  assert.equal(await loadNewsArticle('ru', 'factory-news', { ...input, fetchImpl: async () => new Response(null, { status: 404 }) }), null);
});
test('live outages and malformed responses never fall back to bundled archive', async () => {
  for (const fetchImpl of [async () => new Response(null, { status: 500 }), async () => json({ ...fixture(), published_at: null }), async () => { throw new Error('offline'); }, async () => new Response('x'.repeat(524289), { headers: { 'content-type': 'application/json' } })]) await assert.rejects(() => loadNewsArticle('ru', 'factory-news', { env, fetchImpl }), NewsDeliveryError);
  await assert.rejects(() => loadNews('ru', 1, 12, { env: {} }), NewsDeliveryError);
});
test('static preview is explicit and never connects to backend', async () => {
  assert.equal(newsSource({ ALAGEUM_PUBLIC_ONLY: '1' }), 'static'); assert.equal(newsSource({}), 'api');
  const result = await loadNews('ru', 1, 3, { env: { NEWS_SOURCE: 'static' }, fetchImpl() { assert.fail('No network'); }, connectionImpl() { assert.fail('No request-time API'); } });
  assert.equal(result.data.length, 3); assert.equal(result.pagination.total, 3);
  assert.throws(() => newsSource({ ALAGEUM_PUBLIC_ONLY: '1', NEWS_SOURCE: 'api' }));
});
