import { z } from 'zod';

export const maxCartTitles = 20;
export const maxBookQuantity = 99;
export const cartQuantityValue = z.int().min(1).max(maxBookQuantity);

export const currencySchema = z.enum(['CNY', 'USD']);
export const shopperIdSchema = z.uuidv4();
export const cartRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const cartItemInput = z.strictObject({ quantity: cartQuantityValue });
export const quoteInput = z.strictObject({
  currency: currencySchema,
  cartRevision: cartRevisionSchema,
});
export const orderSubmissionInput = z.strictObject({
  quoteId: shopperIdSchema,
});

export const checkoutNoticeSchema = z.enum([
  'invalid',
  'missing',
  'stock',
  'limit',
  'changed',
  'empty',
  'total',
  'unavailable',
  'quoteMissing',
  'expired',
  'consumed',
  'conflict',
  'processing',
  'reconcile',
]);

export type Currency = z.infer<typeof currencySchema>;
export type CheckoutNotice = z.infer<typeof checkoutNoticeSchema>;
export const checkoutErrorCodes = {
  invalid: 'INVALID_INPUT',
  missing: 'BOOK_NOT_FOUND',
  stock: 'INSUFFICIENT_STOCK',
  limit: 'CART_LIMIT',
  changed: 'CART_CHANGED',
  empty: 'CART_EMPTY',
  total: 'AMOUNT_OUT_OF_RANGE',
  unavailable: 'CATALOG_UNAVAILABLE',
  quoteMissing: 'RESOURCE_NOT_FOUND',
  expired: 'QUOTE_EXPIRED',
  consumed: 'QUOTE_CONSUMED',
  conflict: 'IDEMPOTENCY_CONFLICT',
  precondition: 'CART_ITEM_PRECONDITION_FAILED',
} as const;
export type CheckoutErrorNotice = keyof typeof checkoutErrorCodes;
export type OrderLine = {
  bookId: string;
  title: string;
  priceMinor: number;
  quantity: number;
};
export type CartGroup = {
  currency: Currency;
  revision: string;
  totalMinor: number | null;
  lines: (OrderLine & { stock: number; etag: string })[];
};
export type DemoOrder = {
  id: string;
  currency: Currency;
  totalMinor: number;
  createdAt: string;
  lines: OrderLine[];
};
export type OrderQuote = {
  quoteId: string;
  expiresAt: string;
  currency: Currency;
  totalMinor: number;
  lines: OrderLine[];
};

export const submissionSchema = z.discriminatedUnion('state', [
  z.object({
    submissionId: shopperIdSchema,
    state: z.literal('PLACED'),
    order: z.object({ orderId: shopperIdSchema }),
  }),
  z.object({
    submissionId: shopperIdSchema,
    state: z.literal('PROCESSING'),
  }),
  z.object({
    submissionId: shopperIdSchema,
    state: z.literal('RECONCILE_REQUIRED'),
  }),
  z.object({
    submissionId: shopperIdSchema,
    state: z.literal('REJECTED'),
    reason: z.enum([
      'PRICE_CHANGED',
      'INSUFFICIENT_STOCK',
      'BOOK_NOT_FOUND',
      'PLACEMENT_ABORTED',
    ]),
  }),
]);
