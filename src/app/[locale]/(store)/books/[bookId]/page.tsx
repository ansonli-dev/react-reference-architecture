import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ChevronLeft, CircleCheck, ShoppingBag } from 'lucide-react';
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
import { CheckoutButton, CheckoutForm } from '@/features/checkout/client';
import { demoBookDescription } from '@/mocks/fixtures/catalog';
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
  const checkout =
    process.env.BOOKSTORE_BUILD_PROFILE === 'demo'
      ? await getTranslations({ locale, namespace: 'Checkout' })
      : null;
  const description = checkout
    ? demoBookDescription(book.id, locale)
    : undefined;

  return (
    <>
      <Link
        href={back}
        prefetch={false}
        className="text-primary inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-semibold hover:underline"
      >
        <ChevronLeft size={17} aria-hidden />
        {t('back')}
      </Link>
      <article className="mt-3 grid min-w-0 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-10">
        <BookCover book={book} size="detail" />
        <div className="min-w-0">
          <p className="text-muted text-sm font-medium wrap-anywhere">
            {book.category}
          </p>
          <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight wrap-anywhere sm:text-4xl">
            {book.title}
          </h1>
          <p className="text-muted mt-3 wrap-anywhere">
            {t('author', { name: book.author })}
          </p>
          <div className="border-line bg-surface mt-6 rounded-xl border p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <dl>
                <dt className="sr-only">{t('price')}</dt>
                <dd className="text-3xl font-bold tracking-tight tabular-nums">
                  {formatBookPrice(locale, book)}
                </dd>
              </dl>
              <p className="text-muted inline-flex items-center gap-1.5 text-sm">
                {book.stock > 0 && (
                  <CircleCheck className="text-primary" size={15} aria-hidden />
                )}
                {book.stock ? t('stock', { count: book.stock }) : t('soldOut')}
              </p>
            </div>
            {checkout && (
              <CheckoutForm
                cartPath={'/' + locale + '/cart'}
                operation={{ type: 'add', bookId: book.id }}
                className="mt-4"
              >
                <CheckoutButton
                  label={checkout('add')}
                  pendingLabel={checkout('adding')}
                  blocked={!book.stock}
                >
                  <ShoppingBag aria-hidden />
                </CheckoutButton>
              </CheckoutForm>
            )}
          </div>
          {description && (
            <section aria-labelledby="book-description" className="mt-6">
              <h2 id="book-description" className="text-lg font-semibold">
                {t('aboutBook')}
              </h2>
              <p className="text-muted mt-2 max-w-prose text-base leading-relaxed">
                {description}
              </p>
            </section>
          )}
        </div>
      </article>
    </>
  );
}
