import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-CN', 'en'],
  defaultLocale: 'zh-CN',
  localePrefix: 'always',
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
