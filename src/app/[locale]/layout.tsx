import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { ThemeSwitch } from '@/shared/ui/theme-switch';
import { LanguageLink, LanguageSwitch } from './language-switch';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'Shell' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Shell' });
  const target = locale === 'zh-CN' ? 'en' : 'zh-CN';

  return (
    <html lang={locale}>
      <body>
        <a
          href="#main"
          className="focus:bg-surface sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:px-4 focus:py-2"
        >
          {t('skip')}
        </a>
        <header className="border-line bg-surface border-b">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-3 sm:px-8">
            <Link
              href={'/' + locale}
              className="text-primary flex items-center gap-2 rounded-md font-semibold"
            >
              <BookOpen size={23} aria-hidden /> {t('brand')}
            </Link>
            <nav
              aria-label={t('nav')}
              className="flex w-full flex-wrap items-center justify-between gap-y-1 min-[360px]:gap-x-1 sm:w-auto sm:gap-4"
            >
              <Link
                href={'/' + locale}
                className="text-muted hover:bg-accent rounded-md px-1.5 py-2 text-sm max-[359px]:text-xs sm:px-2"
              >
                {t('home')}
              </Link>
              <Link
                href={'/' + locale + '/books'}
                prefetch={false}
                className="hover:bg-accent rounded-md px-1.5 py-2 text-sm font-semibold max-[359px]:text-xs sm:px-2"
              >
                {t('books')}
              </Link>
              <Suspense fallback={<LanguageLink target={target} />}>
                <LanguageSwitch target={target} />
              </Suspense>
              <ThemeSwitch label={t('theme')} />
            </nav>
          </div>
        </header>
        {process.env.BOOKSTORE_BUILD_PROFILE === 'demo' && (
          <p className="bg-accent text-primary px-5 py-2 text-center text-sm font-semibold">
            {t('demo')}
          </p>
        )}
        <main
          id="main"
          className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
