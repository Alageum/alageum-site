import 'server-only';
import { connection } from 'next/server';
import { PAGE_LOCALES, isPageRoute } from '../public/pages.js';
import { validateNewsArticle, validateNewsList } from '../public/news.js';
import { news as staticNews } from '../ecosystem/news.js';
export class NewsDeliveryError extends Error { constructor(message) { super(message); this.name = 'NewsDeliveryError'; } }
export function newsSource(env = process.env) {
  const source = env.NEWS_SOURCE || (env.ALAGEUM_PUBLIC_ONLY === '1' || env.PAGES_STATIC_PREVIEW === '1' ? 'static' : 'api');
  if (!['api', 'static'].includes(source)) throw new NewsDeliveryError('NEWS_SOURCE must be api or static');
  if (env.ALAGEUM_PUBLIC_ONLY === '1' && source !== 'static') throw new NewsDeliveryError('Public-only builds require static news');
  return source;
}
async function request(path, { env, fetchImpl, timeoutMs }) {
  let base;
  try { base = new URL(env.API_INTERNAL_BASE_URL); } catch { throw new NewsDeliveryError('News API is not configured'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !/^\/api\/v1\/?$/.test(base.pathname)) throw new NewsDeliveryError('News API is not configured');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${base.href.replace(/\/$/, '')}/news${path}`, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') || !response.body) { await response.body?.cancel(); throw new Error(); }
    const reader = response.body.getReader(); let bytes = 0, body = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
    try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 512 * 1024) throw new Error(); body += decoder.decode(value, { stream: true }); } return JSON.parse(body + decoder.decode()); }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch { throw new NewsDeliveryError('News is temporarily unavailable'); }
  finally { clearTimeout(timer); controller.abort(); }
}
const options = input => ({ env: process.env, fetchImpl: fetch, timeoutMs: 5000, connectionImpl: connection, ...input });
export async function loadNews(locale = 'ru', page = 1, pageSize = 12, input) {
  const opts = options(input);
  if (!PAGE_LOCALES.includes(locale) || !Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new NewsDeliveryError('Invalid news request');
  if (newsSource(opts.env) === 'static') return { data: staticNews.slice((page - 1) * pageSize, page * pageSize), pagination: { page, page_size: pageSize, total: staticNews.length, page_count: Math.ceil(staticNews.length / pageSize) } };
  await opts.connectionImpl();
  const response = await request(`?locale=${locale}&page=${page}&page_size=${pageSize}`, opts);
  try { return validateNewsList(response, { locale, page, pageSize }); } catch { throw new NewsDeliveryError('News is temporarily unavailable'); }
}
export async function loadNewsArticle(locale, slug, input) {
  const opts = options(input);
  if (!isPageRoute(locale, slug)) return null;
  if (newsSource(opts.env) === 'static') return staticNews.find(item => item.id === slug) || null;
  await opts.connectionImpl();
  const response = await request(`/${encodeURIComponent(slug)}?locale=${locale}`, opts);
  if (response === null) return null;
  try { return validateNewsArticle(response, { locale, slug }); } catch { throw new NewsDeliveryError('News is temporarily unavailable'); }
}
