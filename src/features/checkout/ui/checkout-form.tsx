'use client';

import type { ReactNode } from 'react';
import {
  CheckoutFailure,
  checkoutRequestOptions,
  createQuote,
  getSubmission,
  submitQuote,
} from '../api';
import { cartQuantityValue, type Currency } from '../model';

type Operation =
  | { type: 'add'; bookId: string }
  | { type: 'update' | 'remove'; bookId: string; etag: string }
  | { type: 'quote'; currency: Currency; revision: string }
  | { type: 'submit'; quoteId: string; ordersPath: string };

async function request(
  path: string,
  init?: RequestInit,
  allowedStatus?: number,
) {
  const response = await fetch(path, {
    ...init,
    ...checkoutRequestOptions(),
  });
  if (!response.ok && response.status !== allowedStatus) {
    const payload = await response.json().catch(() => null);
    throw CheckoutFailure.fromPayload(payload);
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

async function submitOrder(quoteId: string) {
  let submission = await submitQuote(quoteId);
  const id = submission.submissionId;
  for (
    let attempt = 0;
    attempt < 6 && submission.state === 'PROCESSING';
    attempt++
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    submission = await getSubmission(id);
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
      const id = await createQuote(operation.currency, operation.revision);
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
