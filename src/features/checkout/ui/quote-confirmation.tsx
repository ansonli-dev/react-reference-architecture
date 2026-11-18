import 'server-only';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatPrice } from '@/shared/lib/format-price';
import type { OrderQuote } from '../model';
import { CheckoutForm } from './checkout-form';
import { CheckoutButton } from './order-button';

export async function QuoteConfirmation({
  locale,
  quote,
  submitLabel,
}: {
  locale: string;
  quote: OrderQuote;
  submitLabel: string;
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
                  price: formatPrice(locale, {
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
            {formatPrice(locale, {
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
            label={submitLabel}
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
