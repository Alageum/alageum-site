export const locales = ['ru', 'kk', 'en'];
export function localeFromPath(path = '/') { const match = path.match(/^\/(ru|kk|en)(?:\/|$)/); return match?.[1] || 'ru'; }
export function stripLocale(path = '/') { return path.replace(/^\/(ru|kk|en)(?=\/|$)/, '') || '/'; }
export function localizedHref(href, locale = 'ru') {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/') || href.startsWith('/admin/') || /\.[a-z0-9]+(?:\?|$)/i.test(href)) return href;
  const path = stripLocale(href);
  return locale === 'ru' ? path : `/${locale}${path === '/' ? '' : path}`;
}
