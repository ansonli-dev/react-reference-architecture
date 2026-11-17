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
  CatalogNotice,
  catalogHref,
} from '@/features/catalog/client';
import { parseCatalogQuery, type CatalogQuery } from '@/features/catalog/model';
import { routing, type Locale } from '@/i18n/routing';
import {
  readCatalog,
  readCatalogCategories,
  supportsCatalogSearch,
} from '@/server/catalog.server';
import { reportCatalogFailure } from '@/server/observability/catalog.server';
import { ApiFailure } from '@/shared/api/error';

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
      <h1 className="font-display mb-8 text-4xl leading-tight sm:text-6xl">
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
      <CatalogNotice message={t('invalid')} href={base} action={t('reset')} />
    );
  }

  if (query.q && !supportsCatalogSearch) {
    return (
      <CatalogNotice
        message={t('unsupported')}
        href={base}
        action={t('reset')}
      />
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
      <CatalogNotice
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
        search={supportsCatalogSearch}
        labels={{
          category: t('category'),
          allCategories: t('allCategories'),
          search: t('search'),
          searchHint: t('searchHint'),
          apply: t('apply'),
        }}
      />
      <p
        role="status"
        aria-atomic="true"
        className={
          data.books.length
            ? 'text-muted mt-5 text-sm'
            : 'border-line bg-surface mt-7 rounded-lg border p-5'
        }
      >
        {data.books.length
          ? t('results', { count: data.books.length })
          : t('empty')}
        {query.category &&
          ' ' + t('resultsCategory', { category: query.category })}
        {query.q && ' ' + t('resultsQuery', { q: query.q })}
      </p>
      {data.books.length > 0 && (
        <div className="mt-3 grid gap-4 min-[490px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
              className="text-primary hover:bg-accent flex items-center gap-1 rounded-md px-2 py-2"
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
              className="text-primary hover:bg-accent flex items-center gap-1 rounded-md px-2 py-2"
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
