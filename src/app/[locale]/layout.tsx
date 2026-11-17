import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Library, ReceiptText, ShoppingBag } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { ThemeSwitch } from '@/shared/ui/theme-switch';
import { LanguageSwitch } from './language-switch';
import { SkipLink } from './skip-link';
import { StoreLink } from './store-link';
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
  const language = target === 'en' ? 'English' : '简体中文';
  const shop = process.env.BOOKSTORE_BUILD_PROFILE === 'demo';

  return (
    <html lang={locale}>
      <body>
        <SkipLink label={t('skip')} />
        <header className="border-line bg-surface border-b">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 sm:px-8 sm:py-3">
            <Link
              href={'/' + locale + '/books'}
              className="flex min-h-11 items-center gap-2.5 rounded-md font-bold tracking-tight"
            >
              <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg">
                <BookOpen size={18} aria-hidden />
              </span>
              {t('brand')}
            </Link>
            <nav
              aria-label={t('nav')}
              className="flex w-full flex-wrap items-center gap-x-1 gap-y-1 sm:w-auto sm:gap-x-3"
            >
              <StoreLink href={'/' + locale + '/books'}>
                <Library
                  size={16}
                  aria-hidden
                  className="hidden min-[480px]:block"
                />{' '}
                {t('books')}
              </StoreLink>
              {shop && (
                <>
                  <StoreLink href={'/' + locale + '/cart'}>
                    <ShoppingBag
                      size={16}
                      aria-hidden
                      className="hidden min-[480px]:block"
                    />{' '}
                    {t('cart')}
                  </StoreLink>
                  <StoreLink href={'/' + locale + '/orders'}>
                    <ReceiptText
                      size={16}
                      aria-hidden
                      className="hidden min-[480px]:block"
                    />{' '}
                    {t('orders')}
                  </StoreLink>
                </>
              )}
              <Suspense
                fallback={
                  <span
                    aria-hidden
                    className="inline-flex min-h-11 items-center px-2 text-sm font-medium"
                  >
                    {language}
                  </span>
                }
              >
                <LanguageSwitch target={target} label={language} />
              </Suspense>
              <ThemeSwitch label={t('theme')} />
            </nav>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-[1240px] px-4 pt-7 pb-16 sm:px-8 sm:pt-10"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
