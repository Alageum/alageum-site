export const locales = ['ru', 'kk', 'en'];
export function localeFromPath(path = '/') { const match = path.match(/^\/(ru|kk|en)(?:\/|$)/); return match?.[1] || 'ru'; }
export function stripLocale(path = '/') { return path.replace(/^\/(ru|kk|en)(?=\/|$)/, '') || '/'; }
export function localizedHref(href, locale = 'ru') {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/') || href.startsWith('/admin/')) return href;
  const [pathname] = href.split(/[?#]/, 1);
  if (/\.[a-z0-9]+$/i.test(pathname)) return href;
  const path = stripLocale(pathname);
  const suffix = href.slice(pathname.length);
  return locale === 'ru' ? `${path}${suffix}` : `/${locale}${path === '/' ? '' : path}${suffix}`;
}
