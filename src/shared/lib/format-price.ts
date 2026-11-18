export function formatPrice(
  locale: string,
  { priceMinor, currency }: { priceMinor: number; currency: string },
) {
  const digits = String(priceMinor).padStart(3, '0');
  // Intl accepts an exact decimal string, so the last cent survives at Number.MAX_SAFE_INTEGER.
  const amount = (digits.slice(0, -2) + '.' + digits.slice(-2)) as `${number}`;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
