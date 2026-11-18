'use client';

import type { ReactNode } from 'react';
import {
  cartQuantityValue,
  checkoutErrorCodes,
  checkoutNoticeSchema,
  shopperIdSchema,
  submissionSchema,
  type CheckoutNotice,
  type Currency,
} from '../model';

type Operation =
  | { type: 'add'; bookId: string }
  | { type: 'update' | 'remove'; bookId: string; etag: string }
  | { type: 'quote'; currency: Currency; revision: string }
  | { type: 'submit'; quoteId: string; ordersPath: string };

class CheckoutFailure extends Error {
  constructor(readonly notice: CheckoutNotice) {
    super(notice);
  }
}

async function request(
  path: string,
  init?: RequestInit,
  allowedStatus?: number,
) {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok && response.status !== allowedStatus) {
    const payload = await response.json().catch(() => null);
    const entry = Object.entries(checkoutErrorCodes).find(
      ([, code]) => code === payload?.error?.code,
    );
    const notice =
      entry?.[0] === 'precondition'
        ? 'changed'
        : checkoutNoticeSchema.safeParse(entry?.[0]).data;
    throw new CheckoutFailure(notice ?? 'unavailable');
  }
  return response;
}

async function putQuantity(
  path: string,
  quantity: number,
  condition: HeadersInit,
  allowedStatus?: number,
) {
  const headers = new Headers(condition);
  headers.set('Content-Type', 'application/json');
  return request(
    path,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ quantity }),
    },
    allowedStatus,
  );
}

async function addToCart(bookId: string) {
  const path = '/api/v1/cart/items/' + bookId;
  for (let attempt = 0; attempt < 3; attempt++) {
    const item = await request(path, undefined, 404);
    const missing = item.status === 404;
    const current = missing
      ? 0
      : cartQuantityValue.parse((await item.json()).quantity);
    const etag = item.headers.get('ETag');
    if (!missing && !etag) throw new CheckoutFailure('unavailable');
    const headers: HeadersInit = etag
      ? { 'If-Match': etag }
      : { 'If-None-Match': '*' };
    if ((await putQuantity(path, current + 1, headers, 412)).status !== 412)
      return;
  }
  throw new CheckoutFailure('changed');
}

function post(path: string, body: object, key?: string) {
  return request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key && { 'Idempotency-Key': key }),
    },
    body: JSON.stringify(body),
  });
}

async function submitOrder(quoteId: string) {
  // One submission is allowed per quote. The quote ID makes retries stable across refreshes.
  const response = await post(
    '/api/v1/order-submissions',
    { quoteId },
    quoteId,
  );
  let submission = submissionSchema.parse(await response.json());
  const id = submission.submissionId;
  const statusPath = '/api/v1/order-submissions/' + id;
  const location = response.headers.get('Location');
  if (location && location !== statusPath)
    throw new CheckoutFailure('unavailable');
  for (
    let attempt = 0;
    attempt < 6 && submission.state === 'PROCESSING';
    attempt++
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    submission = submissionSchema.parse(
      await (await request(statusPath)).json(),
    );
    if (submission.submissionId !== id)
      throw new CheckoutFailure('unavailable');
  }
  if (submission.state === 'PLACED') return submission.order.orderId;
  if (submission.state === 'PROCESSING')
    throw new CheckoutFailure('processing');
  if (submission.state === 'RECONCILE_REQUIRED')
    throw new CheckoutFailure('reconcile');
  const rejected = {
    PRICE_CHANGED: 'changed',
    INSUFFICIENT_STOCK: 'stock',
    BOOK_NOT_FOUND: 'missing',
    PLACEMENT_ABORTED: 'changed',
  } as const;
  throw new CheckoutFailure(rejected[submission.reason]);
}

async function checkoutPath(
  operation: Operation,
  data: FormData,
  cartPath: string,
) {
  switch (operation.type) {
    case 'add': {
      const add = () => addToCart(operation.bookId);
      // Hold the lock through the response so other tabs receive the first shopper cookie.
      if (navigator.locks) await navigator.locks.request('bookstore-cart', add);
      else await add();
      return cartPath;
    }
    case 'update':
      await putQuantity(
        '/api/v1/cart/items/' + operation.bookId,
        Number(data.get('quantity')),
        { 'If-Match': operation.etag },
      );
      return cartPath;
    case 'remove':
      await request('/api/v1/cart/items/' + operation.bookId, {
        method: 'DELETE',
        headers: { 'If-Match': operation.etag },
      });
      return cartPath;
    case 'quote': {
      const response = await post('/api/v1/order-quotes', {
        currency: operation.currency,
        cartRevision: operation.revision,
      });
      const { quoteId } = await response.json();
      const id = shopperIdSchema.parse(quoteId);
      if (response.headers.get('Location') !== '/api/v1/order-quotes/' + id)
        throw new CheckoutFailure('unavailable');
      return cartPath + '?quote=' + id;
    }
    case 'submit': {
      const orderId = await submitOrder(operation.quoteId);
      return operation.ordersPath + '?placed=' + orderId;
    }
  }
}

export function CheckoutForm({
  operation,
  cartPath,
  children,
  className,
}: {
  operation: Operation;
  cartPath: string;
  children: ReactNode;
  className?: string;
}) {
  async function perform(data: FormData) {
    try {
      window.location.assign(await checkoutPath(operation, data, cartPath));
    } catch (error) {
      const notice =
        error instanceof CheckoutFailure ? error.notice : 'unavailable';
      const params = new URLSearchParams({ notice });
      if (
        operation.type === 'submit' &&
        (notice === 'signIn' ||
          notice === 'unavailable' ||
          notice === 'processing' ||
          notice === 'reconcile')
      ) {
        params.set('quote', operation.quoteId);
      }
      window.location.assign(cartPath + '?' + params);
    }
  }
  return (
    <form action={perform} className={className}>
      {children}
    </form>
  );
}
