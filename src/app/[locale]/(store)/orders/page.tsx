import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  parseOrdersPage,
  shopperIdSchema,
  type OrderPage,
} from '@/features/checkout/model';
import { OrderList } from '@/features/checkout/server';
import { routing, type Locale } from '@/i18n/routing';
import { readShop } from '@/server/shop.server';
import { ApiFailure } from '@/shared/api/error';
import { ActionNotice } from '@/shared/ui/action-notice';
import { CheckoutSignIn } from '../../checkout-sign-in';
import { renderBookThumbnail } from '../book-thumbnail';

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
      return <CheckoutSignIn locale={locale} returnTo={href} intent="orders" />;
    return (
      <ActionNotice
        message={t('notices.unavailable')}
        href={href}
        action={t('retry')}
      />
    );
  }
  return (
    <OrderList
      locale={locale}
      orderPage={orderPage}
      page={page}
      placed={placed}
      renderCover={renderBookThumbnail}
    />
  );
}
