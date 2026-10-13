import { NextResponse } from 'next/server';
import { localeFromPath } from './lib/i18n/routing';
export function proxy(request) {
  const locale = localeFromPath(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-alageum-locale', locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('alageum-locale', locale, { sameSite: 'lax', path: '/' });
  return response;
}
export const config = { matcher: ['/((?!api|_next|admin|pages|.*\\..*).*)'] };
