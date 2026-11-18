import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createJavaOrder } from '@/server/adapters/java/order-v1.server';
import { mockServer } from '../mocks/server';

const origin = 'http://java.example.test';
const bookId = '00000000-0000-4000-8000-000000000101';
const quoteId = '00000000-0000-4000-8000-000000000102';
const submissionId = '00000000-0000-4000-8000-000000000103';
const orderId = '00000000-0000-4000-8000-000000000104';
const createdAt = '2026-11-18T01:02:03Z';
const checkout = createJavaOrder(origin, 'customer-access-token');

beforeAll(() => mockServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

it('replays the same quote using the customer token and idempotency key', async () => {
  const placed = {
    submissionId,
    state: 'PLACED',
    order: {
      orderId,
      totalMinor: 5500,
      currency: 'CNY',
      status: 'PLACED',
      createdAt,
    },
  };
  mockServer.use(
    http.post(origin + '/api/v1/me/order-submissions', async ({ request }) => {
      expect(request.headers.get('authorization')).toBe(
        'Bearer customer-access-token',
      );
      expect(request.headers.get('cookie')).toBeNull();
      expect(request.headers.get('idempotency-key')).toBe(quoteId);
      expect(await request.json()).toEqual({ quoteId });
      return HttpResponse.json(placed);
    }),
  );
  await expect(checkout.submit(quoteId, quoteId)).resolves.toEqual(placed);
});

it('rejects a placed response without an order ID', async () => {
  mockServer.use(
    http.post(origin + '/api/v1/me/order-submissions', () =>
      HttpResponse.json(
        {
          submissionId,
          state: 'PLACED',
        },
        { status: 202 },
      ),
    ),
  );
  await expect(checkout.submit(quoteId, quoteId)).rejects.toMatchObject({
    code: 'UPSTREAM_FAILURE',
  });
});

it('reads order history from stored line snapshots', async () => {
  mockServer.use(
    http.get(origin + '/api/v1/me/orders', ({ request }) => {
      expect(
        Object.fromEntries(new URL(request.url).searchParams),
      ).toMatchObject({
        page: '2',
        include: 'lines',
      });
      return HttpResponse.json({
        page: 2,
        hasNext: false,
        orders: [
          {
            orderId,
            currency: 'CNY',
            totalMinor: 250,
            status: 'PLACED',
            createdAt,
            lines: [
              {
                bookId,
                title: 'Original title',
                quantity: 2,
                unitPriceMinor: 125,
              },
            ],
          },
        ],
      });
    }),
  );
  await expect(checkout.orders(2)).resolves.toEqual({
    page: 2,
    hasNext: false,
    orders: [
      {
        id: orderId,
        currency: 'CNY',
        totalMinor: 250,
        status: 'PLACED',
        createdAt,
        lines: [
          { bookId, title: 'Original title', quantity: 2, priceMinor: 125 },
        ],
      },
    ],
  });
});

it('keeps another customer’s cancellation indistinguishable from a missing resource', async () => {
  mockServer.use(
    http.get(origin + '/api/v1/me/orders/' + orderId + '/cancellation', () =>
      HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 }),
    ),
  );
  await expect(checkout.cancellation(orderId)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
    status: 404,
  });
});

it('preserves cancellation status and the recorded reason', async () => {
  mockServer.use(
    http.put(
      origin + '/api/v1/me/orders/' + orderId + '/cancellation',
      async ({ request }) => {
        expect(request.headers.get('authorization')).toBe(
          'Bearer customer-access-token',
        );
        expect(await request.json()).toEqual({
          reason: 'Changed my mind',
          expectedVersion: 3,
        });
        return HttpResponse.json(
          {
            orderId,
            reason: 'Changed my mind',
            cancelledAt: createdAt,
          },
          { status: 201 },
        );
      },
    ),
  );
  await expect(
    checkout.cancel(orderId, { reason: 'Changed my mind', expectedVersion: 3 }),
  ).resolves.toEqual({
    data: { orderId, reason: 'Changed my mind', cancelledAt: createdAt },
    status: 201,
  });
});

it('returns a safe intake-closed response for a rejected quote request', async () => {
  mockServer.use(
    http.post(origin + '/api/v1/me/order-quotes', () =>
      HttpResponse.json(
        { code: 'INTAKE_CLOSED', detail: 'private' },
        { status: 503 },
      ),
    ),
  );
  await expect(
    checkout.createQuote([{ bookId, quantity: 1 }]),
  ).rejects.toMatchObject({
    code: 'INTAKE_CLOSED',
    status: 503,
    message: 'INTAKE_CLOSED',
  });
});
