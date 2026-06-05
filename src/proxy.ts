import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export const proxy = createMiddleware(routing);

export const config = {
  // Exclude `api` so route handlers (e.g. /api/analytics) are NOT locale-redirected
  // by the i18n proxy (which would rewrite /api/analytics → /ru/api/analytics → 404).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
