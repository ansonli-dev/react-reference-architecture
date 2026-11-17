import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const localize = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale =
    pathname === '/'
      ? routing.defaultLocale
      : routing.locales.find((candidate) => pathname === '/' + candidate);
  if (locale) {
    const url = request.nextUrl.clone();
    url.pathname = '/' + locale + '/books';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (
    routing.locales.some(
      (candidate) => pathname === '/' + candidate + '/books',
    ) &&
    request.nextUrl.searchParams.has('variant')
  ) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('variant');
    return NextResponse.redirect(url);
  }
  return localize(request);
}

export const config = {
  matcher: ['/', '/zh-CN/:path*', '/en/:path*'],
};
