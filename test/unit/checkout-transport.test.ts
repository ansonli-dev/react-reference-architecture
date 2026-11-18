import { expect, it } from 'vitest';
import { CheckoutFailure } from '@/features/checkout/api';

it('retains a valid diagnostic ID while mapping BFF errors to checkout notices', () => {
  const requestId = crypto.randomUUID();
  for (const [code, notice] of [
    ['UNAUTHENTICATED', 'signIn'],
    ['CART_ITEM_PRECONDITION_FAILED', 'changed'],
    ['QUOTE_EXPIRED', 'expired'],
    ['UNRECOGNIZED', 'unavailable'],
  ]) {
    expect(
      CheckoutFailure.fromPayload({ error: { code, requestId } }),
    ).toMatchObject({ notice, requestId });
  }
  expect(
    CheckoutFailure.fromPayload({
      error: { code: 'CART_CHANGED', requestId: 'invalid' },
    }),
  ).toMatchObject({ notice: 'changed', requestId: undefined });
});
