import { NextResponse } from 'next/server';
import { localeFromPath } from './lib/i18n/routing';
import { isPublicOnly, publicRoutePolicy, PUBLIC_UNAVAILABLE_MESSAGE } from './lib/deployment/publicMode';
export function proxy(request) {
  if (isPublicOnly()) {
    const policy = publicRoutePolicy(request.nextUrl.pathname, request.nextUrl.search);
    if (policy !== 'public') {
      const headers = { 'Cache-Control': 'no-store', 'Retry-After': '3600' };
      if (policy === 'api' || !['GET', 'HEAD'].includes(request.method)) {
        return NextResponse.json({ error: { code: 'service_unavailable', message: PUBLIC_UNAVAILABLE_MESSAGE } }, { status: 503, headers });
      }
      const target = request.nextUrl.clone();
      const locale = localeFromPath(request.nextUrl.pathname);
      target.pathname = `${locale === 'ru' ? '' : `/${locale}`}/service-unavailable`; target.search = '';
      return NextResponse.redirect(target, { status: 307, headers });
    }
  }
  // Preserve the existing normal-app exclusions and avoid cookies on assets.
  if (/^\/(?:api|admin|pages)(?:\/|$)/.test(request.nextUrl.pathname) || request.nextUrl.pathname.includes('.')) return NextResponse.next();
  const locale = localeFromPath(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-alageum-locale', locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('alageum-locale', locale, { sameSite: 'lax', path: '/' });
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
