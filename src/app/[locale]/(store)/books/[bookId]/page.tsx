import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ChevronLeft } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BookCover,
  CatalogNotice,
  catalogHref,
  formatBookPrice,
} from '@/features/catalog/client';
import {
  parseBookId,
  parseCatalogQuery,
  type CatalogQuery,
} from '@/features/catalog/model';
import { routing } from '@/i18n/routing';
import { readBook, supportsCatalogSearch } from '@/server/catalog.server';
import { reportCatalogFailure } from '@/server/observability/catalog.server';
import { ApiFailure } from '@/shared/api/error';
import Loading from '../loading';

type DetailsProps = PageProps<'/[locale]/books/[bookId]'>;

// The localized shell metadata is the fallback. No details are fetched for metadata.
export default function BookDetailsPage({
  params,
  searchParams,
}: DetailsProps) {
  return (
    <Suspense fallback={<Loading />}>
      <BookDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BookDetails({ params, searchParams }: DetailsProps) {
  await connection();
  // eslint-disable-next-line react-hooks/purity -- Times this request without affecting rendered output.
  const startedAt = performance.now();
  const { locale, bookId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Catalog' });
  const base = '/' + locale + '/books';

  let id: string;
  try {
    id = parseBookId(bookId);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    notFound();
  }

  const { category, page, q } = await searchParams;
  let sourceQuery: CatalogQuery = { page: 1 };
  try {
    sourceQuery = parseCatalogQuery({
      category,
      page,
      q: supportsCatalogSearch ? q : undefined,
    });
  } catch (error) {
    if (!(error instanceof ApiFailure) || error.code !== 'INVALID_INPUT')
      throw error;
  }
  const back = catalogHref(base, sourceQuery);

  let book;
  try {
    book = await readBook(locale, id);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    reportCatalogFailure('page.catalog.detail', error, startedAt);
    return (
      <>
        <Link href={back} prefetch={false} className="text-primary underline">
          {t('back')}
        </Link>
        <CatalogNotice
          message={t('unavailable')}
          href={catalogHref(base + '/' + id, sourceQuery)}
          action={t('retry')}
        />
      </>
    );
  }
  if (!book) notFound();

  return (
    <>
      <Link
        href={back}
        prefetch={false}
        className="text-primary inline-flex items-center gap-1 rounded-sm text-sm font-semibold hover:underline"
      >
        <ChevronLeft size={17} aria-hidden />
        {t('back')}
      </Link>
      <article className="mt-6 grid gap-7 sm:grid-cols-[minmax(14rem,1fr)_2fr] sm:gap-10">
        <BookCover category={book.category} detail />
        <div className="self-center">
          <p className="text-muted text-sm font-medium wrap-anywhere">
            {book.category}
          </p>
          <h1 className="font-display mt-2 text-4xl leading-tight wrap-anywhere sm:text-5xl">
            {book.title}
          </h1>
          <p className="text-muted mt-4 text-lg wrap-anywhere">{book.author}</p>
          <dl className="border-line mt-7 border-t pt-5">
            <dt className="sr-only">{t('price')}</dt>
            <dd className="text-primary text-2xl font-semibold">
              {formatBookPrice(locale, book)}
            </dd>
          </dl>
          <p className="text-muted mt-3 text-sm">
            {book.stock ? t('stock', { count: book.stock }) : t('soldOut')}
          </p>
        </div>
      </article>
    </>
  );
}
