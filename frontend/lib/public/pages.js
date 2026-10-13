// Reimplemented editorial contract. This is a bounded text template, not a page builder.
export const PAGE_LOCALES = Object.freeze(['ru', 'kk', 'en', 'zh', 'uz']);
export const PAGE_LIMITS = Object.freeze({ blocks: 200, children: 200, nodes: 2000, depth: 8, text: 100000, bytes: 512 * 1024 });
const marks = ['bold', 'italic', 'underline', 'strikethrough', 'code'];
const pageFields = ['slug', 'title', 'locale_code', 'body', 'seo_title', 'seo_description', 'published_at', 'updated_at'];
const fields = { text: ['type', 'text', ...marks], link: ['type', 'url', 'children'], paragraph: ['type', 'children'], heading: ['type', 'level', 'children'], list: ['type', 'format', 'children'], 'list-item': ['type', 'children'], quote: ['type', 'children'], code: ['type', 'children'] };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => { throw new Error('Invalid editorial page response'); };

export function isPageRoute(locale, slug) {
  return PAGE_LOCALES.includes(locale) && typeof slug === 'string' && slug.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function safePageHref(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function validatePageBlocks(body) {
  if (!Array.isArray(body) || body.length > PAGE_LIMITS.blocks) fail();
  const budget = { nodes: 0, text: 0 };
  function visit(node, context, depth) {
    if (!object(node) || ++budget.nodes > PAGE_LIMITS.nodes || depth > PAGE_LIMITS.depth) fail();
    if (!Object.hasOwn(fields, node.type) || Object.keys(node).some(key => !fields[node.type].includes(key))) fail();
    const children = nextContext => {
      if (!Array.isArray(node.children) || node.children.length > PAGE_LIMITS.children) fail();
      return node.children.map(child => visit(child, nextContext, depth + 1));
    };
    if (node.type === 'text' && ['inline', 'link', 'item'].includes(context)) {
      if (typeof node.text !== 'string' || (budget.text += node.text.length) > PAGE_LIMITS.text) fail();
      const result = { type: 'text', text: node.text };
      for (const mark of marks) {
        if (node[mark] !== undefined && typeof node[mark] !== 'boolean') fail();
        if (node[mark]) result[mark] = true;
      }
      return result;
    }
    if (node.type === 'link' && ['inline', 'item'].includes(context)) {
      if (!safePageHref(node.url)) fail();
      return { type: 'link', url: node.url, children: children('link') };
    }
    if (node.type === 'list-item' && context === 'list') return { type: 'list-item', children: children('item') };
    if (node.type === 'list' && ['block', 'list', 'item'].includes(context)) {
      if (!['ordered', 'unordered'].includes(node.format)) fail();
      return { type: 'list', format: node.format, children: children('list') };
    }
    if (context !== 'block') fail();
    if (['paragraph', 'quote', 'code'].includes(node.type)) return { type: node.type, children: children('inline') };
    if (node.type === 'heading') {
      if (!Number.isInteger(node.level) || node.level < 1 || node.level > 6) fail();
      // The template owns the only h1.
      return { type: 'heading', level: Math.max(2, node.level), children: children('inline') };
    }
    // Media, HTML, custom Blocks and malformed nesting fail closed.
    fail();
  }
  return body.map(node => visit(node, 'block', 0));
}

function stringField(value, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > max || (!nullable && !value.trim())) fail();
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) fail();
  return value;
}

export function validateEditorialPage(value, { locale, slug }) {
  if (!object(value) || !isPageRoute(locale, slug) || value.slug !== slug || value.locale_code !== locale) fail();
  if (Object.keys(value).length !== pageFields.length || !pageFields.every(key => Object.hasOwn(value, key))) fail();
  return { slug, locale_code: locale, title: stringField(value.title, 240), body: validatePageBlocks(value.body),
    seo_title: stringField(value.seo_title, 240, true), seo_description: stringField(value.seo_description, 500, true),
    published_at: timestamp(value.published_at), updated_at: timestamp(value.updated_at) };
}

export function editorialMetadata(page, siteOrigin) {
  let canonical;
  if (siteOrigin) {
    const url = new URL(siteOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PAGES_SITE_ORIGIN must be an HTTP(S) origin without credentials');
    canonical = `${url.origin}/pages/${page.locale_code}/${page.slug}`;
  }
  return { title: page.seo_title || page.title, description: page.seo_description || undefined,
    ...(canonical ? { alternates: { canonical } } : {}), robots: { index: false, follow: false } };
}
