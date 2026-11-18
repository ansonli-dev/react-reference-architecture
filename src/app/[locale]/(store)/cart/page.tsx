import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BookCover,
  CatalogNotice,
  formatBookPrice,
} from '@/features/catalog/client';
import { CheckoutButton, CheckoutForm } from '@/features/checkout/client';
import {
  checkoutNoticeSchema,
  maxBookQuantity,
  shopperIdSchema,
  type CartGroup,
  type OrderQuote,
} from '@/features/checkout/model';
import { routing, type Locale } from '@/i18n/routing';
import {
  checkoutEnabled,
  integratedEnabled,
} from '@/server/config/runtime.server';
import { readShop } from '@/server/shop.server';
import { ApiFailure } from '@/shared/api/error';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import { CheckoutSignIn } from '../../checkout-sign-in';

type Props = PageProps<'/[locale]/cart'>;

export default async function CartPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t('cart')}
      </h1>
      <Suspense
        fallback={
          <p role="status" className="text-muted mt-5">
            {t('loading')}
          </p>
        }
      >
        <CartContent locale={locale} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CartContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Props['searchParams'];
}) {
  await connection();
  if (!checkoutEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  const { notice: rawNotice, quote: rawQuote } = await searchParams;
  const quoteId = shopperIdSchema.safeParse(rawQuote).data;
  let notice = checkoutNoticeSchema.safeParse(rawNotice).data;
  const returnTo =
    '/' + locale + '/cart' + (quoteId ? '?quote=' + quoteId : '');
  let groups: CartGroup[];
  let quote: OrderQuote | null = null;
  try {
    const shop = await readShop();
    if (quoteId) {
      quote = await shop.quote(quoteId).catch((error: unknown) => {
        if (error instanceof ApiFailure && error.code === 'RESOURCE_NOT_FOUND')
          return null;
        throw error;
      });
      if (!quote) notice = 'quoteMissing';
    }
    groups = quote ? [] : await shop.cart();
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;
    if (error.code === 'UNAUTHENTICATED')
      return <CheckoutSignIn locale={locale} returnTo={returnTo} />;
    return (
      <CatalogNotice
        message={t('notices.unavailable')}
        href={returnTo}
        action={t('retry')}
      />
    );
  }
  return (
    <>
      {notice && (
        <p
          role="alert"
          className="border-input bg-surface mt-6 rounded-lg border p-4"
        >
          {t('notices.' + notice)}
        </p>
      )}
      {quote ? (
        <QuoteConfirmation locale={locale} quote={quote} />
      ) : groups.length === 0 ? (
        <div className="border-line bg-surface mt-6 grid justify-items-center gap-4 rounded-xl border px-4 py-12 text-center">
          <span className="bg-accent text-primary grid size-12 place-items-center rounded-xl">
            <ShoppingBag size={22} aria-hidden />
          </span>
          <p className="text-muted">{t('emptyCart')}</p>
          <Button asChild size="lg">
            <Link href={'/' + locale + '/books'} prefetch={false}>
              {t('browse')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-7">
            {groups.map((group) => (
              <CurrencyCart
                key={group.currency}
                locale={locale}
                group={group}
              />
            ))}
          </div>
          <Link
            href={'/' + locale + '/books'}
            prefetch={false}
            className="text-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium hover:underline"
          >
            <ArrowLeft size={16} aria-hidden /> {t('browse')}
          </Link>
        </>
      )}
    </>
  );
}

async function CurrencyCart({
  locale,
  group,
}: {
  locale: Locale;
  group: CartGroup;
}) {
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  const catalog = await getTranslations({ locale, namespace: 'Catalog' });
  const { currency, lines, totalMinor, revision } = group;
  const cartPath = '/' + locale + '/cart';
  const unavailable = lines.some((line) => line.quantity > line.stock);
  return (
    <section
      aria-labelledby={'cart-' + currency}
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)] lg:gap-6"
    >
      <div className="border-line bg-surface rounded-xl border">
        <h2
          id={'cart-' + currency}
          className="border-line border-b px-4 py-4 text-base font-semibold sm:px-5"
        >
          {new Intl.DisplayNames(locale, { type: 'currency' }).of(currency)}
        </h2>
        <ul className="divide-line divide-y">
          {lines.map((line) => (
            <li
              key={line.bookId}
              className="flex items-start gap-3 px-4 py-5 sm:gap-4 sm:px-5"
            >
              <BookCover
                book={{ id: line.bookId, title: line.title }}
                size="thumbnail"
              />
              <div className="min-w-0 grow">
                <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1">
                  <Link
                    href={'/' + locale + '/books/' + line.bookId}
                    prefetch={false}
                    className="hover:text-primary rounded-sm text-base font-semibold wrap-anywhere hover:underline"
                  >
                    {line.title}
                  </Link>
                  <span className="text-muted text-sm tabular-nums">
                    {t('unitPrice', {
                      price: formatBookPrice(locale, { ...line, currency }),
                    })}
                  </span>
                </div>
                {line.quantity > line.stock && (
                  <p className="text-muted mt-2 text-sm">
                    {line.stock
                      ? catalog('stock', { count: line.stock })
                      : catalog('soldOut')}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CheckoutForm
                    cartPath={cartPath}
                    operation={{
                      type: 'update',
                      bookId: line.bookId,
                      etag: line.etag,
                    }}
                    className="flex items-center gap-2"
                  >
                    <label htmlFor={'qty-' + line.bookId} className="sr-only">
                      {t('quantity')}
                    </label>
                    <Input
                      id={'qty-' + line.bookId}
                      key={line.quantity}
                      name="quantity"
                      type="number"
                      min={1}
                      max={maxBookQuantity}
                      required
                      defaultValue={line.quantity}
                      className="h-11 w-14"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-11 px-3"
                    >
                      {t('update')}
                    </Button>
                  </CheckoutForm>
                  <CheckoutForm
                    cartPath={cartPath}
                    operation={{
                      type: 'remove',
                      bookId: line.bookId,
                      etag: line.etag,
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      aria-label={t('remove', { title: line.title })}
                      className="text-muted h-11 px-3"
                    >
                      {t('removeLabel')}
                    </Button>
                  </CheckoutForm>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <CheckoutForm
        cartPath={cartPath}
        operation={{ type: 'quote', currency, revision }}
        className="border-line bg-surface rounded-xl border p-4 sm:p-5"
      >
        <h3 className="text-lg font-bold">{t('summary')}</h3>
        <p className="text-muted mt-1 text-sm">
          {t('itemCount', {
            count: lines.reduce((sum, line) => sum + line.quantity, 0),
          })}
        </p>
        <div className="border-line mt-4 flex flex-wrap items-baseline justify-between gap-3 border-t pt-4">
          <span className="font-medium">{t('subtotal')}</span>
          {totalMinor !== null && (
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {formatBookPrice(locale, { priceMinor: totalMinor, currency })}
            </p>
          )}
        </div>
        {(totalMinor === null || unavailable) && (
          <p className="text-muted mt-3 text-sm" role="status">
            {t(totalMinor === null ? 'notices.total' : 'notices.stock')}
          </p>
        )}
        <div className="mt-4">
          <CheckoutButton
            label={t('quote')}
            pendingLabel={t('quoting')}
            blocked={totalMinor === null || unavailable}
          />
        </div>
      </CheckoutForm>
    </section>
  );
}

async function QuoteConfirmation({
  locale,
  quote,
}: {
  locale: Locale;
  quote: OrderQuote;
}) {
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  const cartPath = '/' + locale + '/cart';
  const time = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(quote.expiresAt));
  return (
    <section className="mt-6 max-w-2xl" aria-labelledby="confirm-quote">
      <div className="border-line bg-surface rounded-xl border p-4 sm:p-6">
        <h2 id="confirm-quote" className="text-xl font-bold">
          {t('confirmQuote')}
        </h2>
        <p className="text-muted mt-1 text-sm">{t('expiresAt', { time })}</p>
        <ul className="divide-line border-line mt-4 divide-y border-y">
          {quote.lines.map((line) => (
            <li
              key={line.bookId}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="font-medium wrap-anywhere">{line.title}</span>
              <span className="text-muted text-sm">
                {t('orderLine', {
                  quantity: line.quantity,
                  price: formatBookPrice(locale, {
                    ...line,
                    currency: quote.currency,
                  }),
                })}
              </span>
            </li>
          ))}
        </ul>
        <div className="my-4 flex items-baseline justify-between gap-3 font-semibold">
          <span>{t('total')}</span>
          <span className="text-2xl tabular-nums">
            {formatBookPrice(locale, {
              currency: quote.currency,
              priceMinor: quote.totalMinor,
            })}
          </span>
        </div>
        <CheckoutForm
          cartPath={cartPath}
          operation={{
            type: 'submit',
            quoteId: quote.quoteId,
            ordersPath: '/' + locale + '/orders',
          }}
        >
          <CheckoutButton
            label={t(integratedEnabled() ? 'placeLiveOrder' : 'placeOrder')}
            pendingLabel={t('placing')}
            blocked={false}
          />
        </CheckoutForm>
      </div>
      <Link
        href={cartPath}
        prefetch={false}
        className="text-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> {t('backToCart')}
      </Link>
    </section>
  );
}
