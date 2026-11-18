import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ArrowLeft, CircleCheck, ReceiptText } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BookCover,
  CatalogNotice,
  formatBookPrice,
} from '@/features/catalog/client';
import {
  parseOrdersPage,
  shopperIdSchema,
  type OrderPage,
} from '@/features/checkout/model';
import { routing, type Locale } from '@/i18n/routing';
import { readShop } from '@/server/shop.server';
import { ApiFailure } from '@/shared/api/error';
import { Button } from '@/shared/ui/button';

import { CheckoutSignIn } from '../../checkout-sign-in';

type Props = PageProps<'/[locale]/orders'>;

export default async function OrdersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t('orders')}
      </h1>
      <Suspense
        fallback={
          <p role="status" className="text-muted mt-5">
            {t('loading')}
          </p>
        }
      >
        <OrderHistory locale={locale} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrderHistory({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Props['searchParams'];
}) {
  await connection();
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  const query = await searchParams;
  const placed = shopperIdSchema.safeParse(query.placed).data;
  const page = parseOrdersPage(query.page) ?? 1;
  const ordersPath = '/' + locale + '/orders';
  let orderPage: OrderPage;
  try {
    orderPage = await (await readShop()).orders(page);
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    const href = ordersPath + (page > 1 ? '?page=' + page : '');
    if (error.code === 'UNAUTHENTICATED')
      return <CheckoutSignIn locale={locale} returnTo={href} />;
    return (
      <CatalogNotice
        message={t('notices.unavailable')}
        href={href}
        action={t('retry')}
      />
    );
  }
  const { orders, hasNext } = orderPage;
  const catalog = await getTranslations({ locale, namespace: 'Catalog' });
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <>
      {orders.some((order) => order.id === placed) && (
        <p
          role="status"
          className="bg-accent text-primary mt-6 flex items-center gap-2 rounded-lg p-4 font-semibold"
        >
          <CircleCheck size={19} aria-hidden /> {t('placed')}
        </p>
      )}
      {orders.length === 0 ? (
        <div className="border-line bg-surface mt-6 grid justify-items-center gap-4 rounded-xl border px-4 py-12 text-center">
          <span className="bg-accent text-primary grid size-12 place-items-center rounded-xl">
            <ReceiptText size={23} aria-hidden />
          </span>
          <p className="text-muted">{t('emptyOrders')}</p>
          <Button asChild size="lg">
            <Link href={'/' + locale + '/books'} prefetch={false}>
              {t('browse')}
            </Link>
          </Button>
        </div>
      ) : (
        <ol className="mt-6 space-y-4">
          {orders.map(
            ({ id, currency, totalMinor, createdAt, lines, status }) => (
              <li
                key={id}
                className="border-line bg-surface overflow-hidden rounded-xl border"
              >
                <div className="border-line bg-accent/55 flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold wrap-anywhere">
                      {t('order', { id })}
                    </h2>
                    {createdAt && (
                      <p className="text-muted mt-2 text-xs">
                        {t('orderedAt')}{' '}
                        <time dateTime={createdAt}>
                          {date.format(new Date(createdAt))}
                        </time>
                      </p>
                    )}
                  </div>
                  <div className="text-sm sm:text-right">
                    <p className="font-semibold tabular-nums">
                      <span className="text-muted mr-2 font-normal">
                        {t('total')}
                      </span>
                      <span>
                        {formatBookPrice(locale, {
                          priceMinor: totalMinor,
                          currency,
                        })}
                      </span>
                    </p>
                    <p className="text-primary mt-1 text-xs font-medium">
                      {t(status ? 'orderStatus.' + status : 'placedStatus')}
                    </p>
                  </div>
                </div>
                <ul className="divide-line divide-y px-4 sm:px-5">
                  {lines.map((line) => (
                    <li
                      key={line.bookId}
                      className="flex items-center gap-3 py-3"
                    >
                      <BookCover
                        book={{ id: line.bookId, title: line.title }}
                        size="thumbnail"
                      />
                      <div className="flex min-w-0 grow flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                        <Link
                          href={'/' + locale + '/books/' + line.bookId}
                          prefetch={false}
                          className="hover:text-primary rounded-sm text-sm font-semibold wrap-anywhere hover:underline"
                        >
                          {line.title}
                        </Link>
                        <span className="text-muted text-sm">
                          {t('orderLine', {
                            quantity: line.quantity,
                            price: formatBookPrice(locale, {
                              ...line,
                              currency,
                            }),
                          })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ol>
      )}
      {orderPage.page !== undefined && (page > 1 || hasNext) && (
        <nav
          aria-label={t('pagination')}
          className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm"
        >
          {page > 1 && (
            <Link
              className="text-primary underline"
              prefetch={false}
              href={ordersPath + (page > 2 ? '?page=' + (page - 1) : '')}
            >
              {catalog('previous')}
            </Link>
          )}
          <span aria-current="page">{catalog('page', { page })}</span>
          {hasNext && page < 100 && (
            <Link
              className="text-primary underline"
              prefetch={false}
              href={ordersPath + '?page=' + (page + 1)}
            >
              {catalog('next')}
            </Link>
          )}
        </nav>
      )}
      {orders.length > 0 && (
        <Link
          href={'/' + locale + '/books'}
          prefetch={false}
          className="text-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium hover:underline"
        >
          <ArrowLeft size={16} aria-hidden /> {t('browse')}
        </Link>
      )}
    </>
  );
}
