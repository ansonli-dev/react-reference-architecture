import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  checkoutNoticeSchema,
  shopperIdSchema,
  type CartGroup,
  type OrderQuote,
} from '@/features/checkout/model';
import { CurrencyCart, QuoteConfirmation } from '@/features/checkout/server';
import { routing, type Locale } from '@/i18n/routing';
import { readShop } from '@/server/shop.server';
import { ApiFailure } from '@/shared/api/error';
import { ActionNotice } from '@/shared/ui/action-notice';
import { Button } from '@/shared/ui/button';
import { CheckoutSignIn } from '../../checkout-sign-in';
import { renderBookThumbnail } from '../book-thumbnail';

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
  const t = await getTranslations({ locale, namespace: 'Checkout' });
  const { notice: rawNotice, quote: rawQuote } = await searchParams;
  const quoteId = shopperIdSchema.safeParse(rawQuote).data;
  let notice = checkoutNoticeSchema.safeParse(rawNotice).data;
  const returnTo =
    '/' + locale + '/cart' + (quoteId ? '?quote=' + quoteId : '');
  if (notice === 'signIn' && process.env.BOOKSTORE_BUILD_PROFILE === 'release')
    return (
      <CheckoutSignIn
        locale={locale}
        returnTo={returnTo}
        intent={quoteId ? 'resume' : 'cart'}
      />
    );

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
      return (
        <CheckoutSignIn locale={locale} returnTo={returnTo} intent="cart" />
      );
    return (
      <ActionNotice
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
        <QuoteConfirmation
          locale={locale}
          quote={quote}
          submitLabel={t(
            process.env.BOOKSTORE_BUILD_PROFILE === 'demo'
              ? 'placeOrder'
              : 'placeLiveOrder',
          )}
        />
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
                renderCover={renderBookThumbnail}
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
