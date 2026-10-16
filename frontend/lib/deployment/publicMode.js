// This value is fixed by Next at build time. Changing deployment capability
// requires rebuilding; it is not a user/query-controlled authorization switch.
export function isPublicOnly() { return process.env.NEXT_PUBLIC_SITE_MODE === 'public-only'; }
export const PUBLIC_UNAVAILABLE_MESSAGE = 'Личный кабинет и отправка данных временно недоступны. Каталог и локальные черновики доступны без входа.';
const privateRoots = ['api', 'admin', 'cms', 'b2b', 'account', 'login', 'register', 'verify-email', 'forgot-password', 'reset-password', 'ai', 'pages'];
export function publicRoutePolicy(pathname, search = '') {
  let path;
  try { path = decodeURIComponent(pathname); } catch { return 'api'; }
  path = path.replace(/^\/(?:ru|kk|en)(?=\/|$)/, '');
  const root = path.split('/')[1];
  if (['catalog', 'selection', 'inquiry'].includes(root) && new URLSearchParams(search).get('source') === 'api') return 'unavailable';
  if (root === 'catalog' && /^\/catalog\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/|$)/i.test(path)) return 'unavailable';
  return privateRoots.includes(root) ? root === 'api' ? 'api' : 'unavailable' : 'public';
}
