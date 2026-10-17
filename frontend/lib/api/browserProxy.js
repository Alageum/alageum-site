// Server-only Next configuration helper. Never expose this target through a
// NEXT_PUBLIC variable: the browser must keep using its own /api/v1 origin.
export function browserApiRewrites(env = process.env) {
  const value = env.API_INTERNAL_BASE_URL;
  if (value === undefined || value === '') return [];
  let url;
  try { url = new URL(value); } catch {
    throw new Error('API_INTERNAL_BASE_URL must be an explicit HTTP(S) /api/v1 base without credentials');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || !/^\/api\/v1\/?$/.test(url.pathname)) {
    throw new Error('API_INTERNAL_BASE_URL must be an explicit HTTP(S) /api/v1 base without credentials');
  }
  return [{ source: '/api/v1/:path*', destination: `${url.origin}/api/v1/:path*` }];
}
