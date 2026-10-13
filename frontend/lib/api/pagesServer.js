import 'server-only';
import { isPageRoute, PAGE_LIMITS, validateEditorialPage } from '../public/pages.js';

export class EditorialPageError extends Error {
  constructor(message) { super(message); this.name = 'EditorialPageError'; }
}

function apiBase(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^\/api\/v1\/?$/.test(url.pathname)) throw new Error();
    return url.href.replace(/\/$/, '');
  } catch { throw new EditorialPageError('API_INTERNAL_BASE_URL must be an explicit HTTP(S) /api/v1 base without credentials'); }
}

async function boundedJson(response) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new EditorialPageError('Editorial API returned an invalid content type');
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > PAGE_LIMITS.bytes)) throw new EditorialPageError('Editorial API response is too large');
  if (!response.body) throw new EditorialPageError('Editorial API returned an empty response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > PAGE_LIMITS.bytes) throw new EditorialPageError('Editorial API response is too large');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// No session client, cookies or Authorization headers. null means absent only;
// API/configuration errors never select bundled content.
export async function loadEditorialPage(locale, slug, { env = process.env, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!isPageRoute(locale, slug)) return null;
  const source = env.PAGES_SOURCE || 'api';
  if (source === 'static') {
    if (env.PAGES_STATIC_PREVIEW !== '1') throw new EditorialPageError('Static pages are restricted to the disposable build-preview adapter');
    const { getPreviewPage } = await import('../public/pagesPreview.js');
    const page = getPreviewPage(locale, slug);
    return page ? validateEditorialPage(page, { locale, slug }) : null;
  }
  if (source !== 'api') throw new EditorialPageError('PAGES_SOURCE must be api or static');
  const url = `${apiBase(env.API_INTERNAL_BASE_URL)}/pages/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200) { await response.body?.cancel(); throw new EditorialPageError(`Editorial API request failed (${response.status})`); }
    return validateEditorialPage(await boundedJson(response), { locale, slug });
  } catch (error) {
    if (error instanceof EditorialPageError) throw error;
    // Never echo an upstream body, credential or endpoint in a public error.
    throw new EditorialPageError(controller.signal.aborted ? 'Editorial API request timed out' : 'Editorial API response is unavailable or invalid');
  } finally { clearTimeout(timer); controller.abort(); }
}
