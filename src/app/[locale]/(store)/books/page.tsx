import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BookCard,
  CatalogFilters,
  catalogHref,
} from '@/features/catalog/client';
import { parseCatalogQuery, type CatalogQuery } from '@/features/catalog/model';
import { routing, type Locale } from '@/i18n/routing';
import { readCatalog, readCatalogCategories } from '@/server/catalog.server';
import { reportCatalogFailure } from '@/server/observability/catalog.server';
import { ApiFailure } from '@/shared/api/error';
import { ActionNotice } from '@/shared/ui/action-notice';

type BooksProps = PageProps<'/[locale]/books'>;

export async function generateMetadata({ params }: BooksProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'Catalog' });
  return { title: t('title') };
}

export default async function BooksPage({ params, searchParams }: BooksProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Catalog' });

  return (
    <>
      <h1 className="mb-6 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
        {t('title')}
      </h1>
      <Suspense
        fallback={
          <p
            role="status"
            className="border-line bg-surface text-muted rounded-lg border p-5"
          >
            {t('loading')}
          </p>
        }
      >
        <CatalogContent locale={locale} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CatalogContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: BooksProps['searchParams'];
}) {
  await connection();
  // eslint-disable-next-line react-hooks/purity -- Times this request without affecting rendered output.
  const startedAt = performance.now();
  const t = await getTranslations({ locale, namespace: 'Catalog' });
  const base = '/' + locale + '/books';
  const input = { ...(await searchParams) };
  // Native GET forms use an empty value for the cleared filters.
  if (input.q === '') delete input.q;
  if (input.category === '') delete input.category;
  let query: CatalogQuery;
  try {
    query = parseCatalogQuery(input);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    return (
      <ActionNotice message={t('invalid')} href={base} action={t('reset')} />
    );
  }

  let data;
  let categories;
  try {
    [data, categories] = await Promise.all([
      readCatalog(locale, query),
      readCatalogCategories(),
    ]);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    reportCatalogFailure('page.catalog.list', error, startedAt);
    return (
      <ActionNotice
        message={t('unavailable')}
        href={catalogHref(base, query)}
        action={t('retry')}
      />
    );
  }

  return (
    <>
      <CatalogFilters
        base={base}
        query={query}
        categories={categories}
        labels={{
          category: t('category'),
          allCategories: t('allCategories'),
          search: t('search'),
          searchHint: t('searchHint'),
          apply: t('apply'),
        }}
      />
      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-x-4">
        <p
          role="status"
          aria-atomic="true"
          className="text-muted text-sm wrap-anywhere"
        >
          {data.books.length
            ? t('results', { count: data.books.length })
            : t('empty')}
          {query.category &&
            ' ' + t('resultsCategory', { category: query.category })}
          {query.q && ' ' + t('resultsQuery', { q: query.q })}
        </p>
        {(query.category || query.q) && (
          <Link
            className="text-primary inline-flex min-h-11 items-center rounded-sm text-sm hover:underline"
            href={base}
            prefetch={false}
          >
            {t('reset')}
          </Link>
        )}
      </div>
      {data.books.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {data.books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              href={catalogHref(base + '/' + book.id, query)}
              locale={locale}
              stock={
                book.stock ? t('stock', { count: book.stock }) : t('soldOut')
              }
            />
          ))}
        </div>
      )}
      {(data.page > 1 || data.hasNext) && (
        <nav
          aria-label={t('pagination')}
          className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm"
        >
          {data.page > 1 && (
            <Link
              prefetch={false}
              className="text-primary hover:bg-accent flex min-h-11 items-center gap-1 rounded-md px-3"
              href={catalogHref(base, { ...query, page: data.page - 1 })}
            >
              <ChevronLeft size={16} aria-hidden />
              {t('previous')}
            </Link>
          )}
          <span aria-current="page" className="text-muted">
            {t('page', { page: data.page })}
          </span>
          {data.hasNext && (
            <Link
              prefetch={false}
              className="text-primary hover:bg-accent flex min-h-11 items-center gap-1 rounded-md px-3"
              href={catalogHref(base, { ...query, page: data.page + 1 })}
            >
              {t('next')}
              <ChevronRight size={16} aria-hidden />
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
