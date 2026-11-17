import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-CN', 'en'],
  defaultLocale: 'zh-CN',
  localePrefix: 'always',
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];

export function localeFromHeader(value: string | null): Locale {
  for (const item of value?.split(',') ?? []) {
    const requested = item.split(';')[0].trim().toLowerCase();
    const locale = routing.locales.find(
      (candidate) => candidate.toLowerCase() === requested,
    );
    if (locale) return locale;
  }
  return routing.defaultLocale;
}
