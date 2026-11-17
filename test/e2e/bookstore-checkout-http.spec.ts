import { expect, test } from '@playwright/test';

const bookId = '00000000-0000-4000-8000-000000000107';
const cartPath = '/api/v1/cart';
const itemPath = cartPath + '/items/' + bookId;
const quotes = '/api/v1/order-quotes';
const submissions = '/api/v1/order-submissions';

test('cart, quote, submission and receipt are addressable and private', async ({
  request,
  playwright,
  baseURL,
}, info) => {
  test.skip(!['demo', 'dev'].includes(info.project.name));
  const headers = { Origin: new URL(baseURL!).origin };
  const book = '/api/v1/catalog/books/' + bookId;
  const { stock } = await (await request.get(book)).json();
  expect(
    (
      await request.put(itemPath, {
        headers: { Origin: 'https://different.example' },
        data: { quantity: 1 },
      })
    ).status(),
  ).toBe(403);

  const created = await request.put(itemPath, {
    headers,
    data: { quantity: 1 },
  });
  expect(created.status()).toBe(201);
  expect(created.headers().location).toBe(itemPath);
  expect(await (await request.get(itemPath)).json()).toEqual({
    bookId,
    quantity: 1,
  });
  const repeated = await request.put(itemPath, {
    headers,
    data: { quantity: 1 },
  });
  expect(repeated.status()).toBe(200);
  const etag = (await request.get(itemPath)).headers().etag;
  expect(etag).toBeTruthy();
  const concurrentUpdates = await Promise.all(
    [2, 3].map((quantity) =>
      request.put(itemPath, {
        headers: { ...headers, 'If-Match': etag },
        data: { quantity },
      }),
    ),
  );
  expect(concurrentUpdates.map((response) => response.status()).sort()).toEqual(
    [200, 412],
  );
  const current = await request.get(itemPath);
  expect(current.headers().etag).not.toBe(etag);
  const staleDelete = await request.delete(itemPath, {
    headers: { ...headers, 'If-Match': etag },
  });
  expect(staleDelete.status()).toBe(412);
  expect((await request.get(itemPath)).headers().etag).toBe(
    current.headers().etag,
  );
  expect(
    (await request.put(itemPath, { headers, data: { quantity: 1 } })).status(),
  ).toBe(200);

  const cart = await request.get(cartPath);
  expect(cart.headers()['cache-control']).toBe('no-store');
  const { groups } = await cart.json();
  const [{ currency, revision, lines }] = groups;
  expect(lines).toMatchObject([
    { bookId, quantity: 1, etag: (await request.get(itemPath)).headers().etag },
  ]);

  const quoteRequest = { headers, data: { currency, cartRevision: revision } };
  const quote = await request.post(quotes, quoteRequest);
  expect(quote.status()).toBe(201);
  const { quoteId, expiresAt, totalMinor } = await quote.json();
  expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
  expect(quote.headers().location).toBe(quotes + '/' + quoteId);
  expect(await (await request.get(quote.headers().location)).json()).toEqual(
    await quote.json(),
  );
  const otherQuote = await (await request.post(quotes, quoteRequest)).json();

  const key = crypto.randomUUID();
  const submissionRequest = {
    headers: { ...headers, 'Idempotency-Key': key },
    data: { quoteId },
  };
  const submitted = await request.post(submissions, submissionRequest);
  expect(submitted.status()).toBe(201);
  const result = await submitted.json();
  expect(result).toMatchObject({
    state: 'PLACED',
    order: { orderId: expect.any(String) },
  });
  const submissionUrl = submitted.headers().location;
  expect(submissionUrl).toBe(submissions + '/' + result.submissionId);
  expect(await (await request.get(submissionUrl)).json()).toEqual(result);

  const replay = await request.post(submissions, submissionRequest);
  expect(replay.status()).toBe(200);
  expect(replay.headers().location).toBe(submissionUrl);
  expect(await replay.json()).toEqual(result);
  const mismatch = await request.post(submissions, {
    ...submissionRequest,
    data: { quoteId: otherQuote.quoteId },
  });
  expect(mismatch.status()).toBe(409);
  expect(await mismatch.json()).toMatchObject({
    error: { code: 'IDEMPOTENCY_CONFLICT' },
  });
  expect(await (await request.get(book)).json()).toMatchObject({
    stock: stock - 1,
  });

  const orderUrl = '/api/v1/orders/' + result.order.orderId;
  expect(await (await request.get(orderUrl)).json()).toMatchObject({
    id: result.order.orderId,
    currency,
    totalMinor,
    lines: [{ bookId, quantity: 1 }],
  });
  expect((await request.delete(itemPath, { headers })).status()).toBe(204);
  expect((await request.delete(itemPath, { headers })).status()).toBe(204);

  const other = await playwright.request.newContext({ baseURL });
  try {
    for (const path of [
      itemPath,
      quotes + '/' + quoteId,
      submissionUrl,
      orderUrl,
    ]) {
      expect((await other.get(path)).status()).toBe(404);
    }
  } finally {
    await other.dispose();
  }
});
