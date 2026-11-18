import 'server-only';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, ReceiptText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatPrice } from '@/shared/lib/format-price';
import { Button } from '@/shared/ui/button';
import type { OrderPage } from '../model';

export async function OrderList({
  locale,
  orderPage,
  page,
  placed,
  renderCover,
}: {
  locale: string;
  orderPage: OrderPage;
  page: number;
  placed?: string;
  renderCover: (bookId: string, title: string) => ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  const ordersPath = '/' + locale + '/orders';
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
                        {formatPrice(locale, {
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
                      {renderCover(line.bookId, line.title)}
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
                            price: formatPrice(locale, {
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
