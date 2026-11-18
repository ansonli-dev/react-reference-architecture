import 'server-only';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatPrice } from '@/shared/lib/format-price';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { maxBookQuantity, type CartGroup } from '../model';
import { CheckoutForm } from './checkout-form';
import { CheckoutButton } from './order-button';

export async function CurrencyCart({
  locale,
  group,
  renderCover,
}: {
  locale: string;
  group: CartGroup;
  renderCover: (bookId: string, title: string) => ReactNode;
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
              {renderCover(line.bookId, line.title)}
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
                      price: formatPrice(locale, { ...line, currency }),
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
              {formatPrice(locale, { priceMinor: totalMinor, currency })}
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
