import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ru', 'kk'],
  // Accept-Language still wins for ru/kk/en browsers; 'en' is only the fallback when the
  // browser advertises none of the supported locales (international launch). Stage 6.8.
  defaultLocale: 'en',
});
