import { isPageRoute, validatePageBlocks } from './pages.js';
const fail = () => { throw new Error('Invalid published news response'); };
const text = (value, max, nullable = false) => { if (nullable && value === null) return null; if (typeof value !== 'string' || value.length > max || (!nullable && !value.trim())) fail(); return value; };
const stamp = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail(); return value; };
const cardFields = ['slug', 'title', 'locale_code', 'summary', 'topic', 'date', 'cover', 'published_at', 'updated_at'];
export function validateNewsArticle(value, { locale, slug, detail = true }) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isPageRoute(locale, value.slug) || value.locale_code !== locale || (slug && value.slug !== slug)) fail();
  const fields = detail ? [...cardFields, 'body', 'seo_title', 'seo_description'] : cardFields;
  if (Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value, key))) fail();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date)) || new Date(value.date).toISOString().slice(0, 10) !== value.date) fail();
  let cover = null;
  if (value.cover !== null) {
    const c = value.cover;
    if (!c || Object.keys(c).sort().join() !== 'alt,height,url,width' || typeof c.url !== 'string' || !/^\/uploads\/[\p{L}\p{N}_-]+\.(?:png|jpe?g|webp)$/u.test(c.url) || !Number.isSafeInteger(c.width) || c.width < 1 || !Number.isSafeInteger(c.height) || c.height < 1 || c.width * c.height > 16 * 1024 * 1024) fail();
    cover = { url: c.url, alt: text(c.alt, 300, true) || '', width: c.width, height: c.height };
  }
  const result = { id: value.slug, title: text(value.title, 240), text: text(value.summary, 1200), topic: text(value.topic, 120, true), date: value.date, photo: cover?.url, cover,
    publishedAt: stamp(value.published_at), updatedAt: stamp(value.updated_at) };
  if (detail) Object.assign(result, { body: validatePageBlocks(value.body), seoTitle: text(value.seo_title, 240, true), seoDescription: text(value.seo_description, 500, true) });
  return result;
}
export function validateNewsList(value, { locale, page, pageSize }) {
  if (!value || Object.keys(value).sort().join() !== 'data,pagination' || !Array.isArray(value.data) || value.data.length > pageSize) fail();
  const p = value.pagination;
  if (!p || Object.keys(p).sort().join() !== 'page,page_count,page_size,total' || p.page !== page || p.page_size !== pageSize || !Number.isSafeInteger(p.total) || p.total < 0 || p.page_count !== Math.ceil(p.total / pageSize)) fail();
  const data = value.data.map(item => validateNewsArticle(item, { locale, detail: false }));
  if (new Set(data.map(item => item.id)).size !== data.length) fail();
  return { data, pagination: p };
}
