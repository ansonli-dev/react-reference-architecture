import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { createJavaCatalogV1 } from '@/server/adapters/java/catalog-v1.server';
import { mockServer } from '../mocks/server';

const origin = 'http://catalog.example.test';
const books = origin + '/api/v1/books';
const id = '00000000-0000-4000-8000-000000000101';
const wireBook = {
  id,
  title: 'From Java',
  author: 'Anson',
  category: 'Architecture & design',
  priceCents: 4900,
  currency: 'CNY',
  stock: 5,
};
const catalog = createJavaCatalogV1({
  baseUrl: origin,
  categories: [wireBook.category],
  token: 'service-token',
});

beforeAll(() => mockServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

it('converts page 2 to upstream page 1 and maps priceCents without exposing a service credential', async () => {
  mockServer.use(
    http.get(books, ({ request }) => {
      const { searchParams } = new URL(request.url);
      expect(Object.fromEntries(searchParams)).toEqual({
        category: wireBook.category,
        page: '1',
        size: '12',
      });
      expect(request.headers.get('authorization')).toBe('Bearer service-token');
      expect(request.headers.get('cookie')).toBeNull();
      return HttpResponse.json([wireBook]);
    }),
  );
  await expect(catalog.categories()).resolves.toEqual([wireBook.category]);
  await expect(
    catalog.list({ category: wireBook.category, page: 2 }),
  ).resolves.toEqual({
    books: [
      {
        id,
        title: wireBook.title,
        author: wireBook.author,
        category: wireBook.category,
        priceMinor: 4900,
        currency: 'CNY',
        stock: 5,
      },
    ],
    page: 2,
    hasNext: false,
  });
});

it('maps a missing upstream book to null', async () => {
  mockServer.use(
    http.get(
      books + '/:id',
      () => new HttpResponse('hidden body', { status: 404 }),
    ),
  );
  await expect(catalog.get(id)).resolves.toBeNull();
});

it('rejects v1 keyword queries before any upstream call', async () => {
  await expect(catalog.list({ page: 1, q: 'React' })).rejects.toMatchObject({
    code: 'UNSUPPORTED_FILTER',
  });
});

it.each([
  { ...wireBook, priceCents: 9007199254740992 },
  { ...wireBook, currency: 'EUR' },
  { ...wireBook, stock: -1 },
  { ...wireBook, id: '00000000-0000-4000-8000-000000000102' },
])('rejects contract drift %j', async (content) => {
  mockServer.use(http.get(books + '/:id', () => HttpResponse.json(content)));
  await expect(catalog.get(id)).rejects.toMatchObject({
    code: 'UPSTREAM_FAILURE',
  });
});

it('rejects invalid JSON and safely maps upstream errors', async () => {
  mockServer.use(
    http.get(books, () =>
      HttpResponse.text('{broken', {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    code: 'UPSTREAM_FAILURE',
  });
  mockServer.use(
    http.get(books, () => HttpResponse.text('jdbc:private', { status: 500 })),
  );
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    message: 'UPSTREAM_FAILURE',
  });
});

it('rejects redirects without hitting the target', async () => {
  let calls = 0;
  mockServer.use(
    http.get(
      books,
      () =>
        new HttpResponse(null, {
          status: 302,
          headers: { Location: origin + '/elsewhere' },
        }),
    ),
    http.get(origin + '/elsewhere', () => {
      calls++;
      return HttpResponse.json([]);
    }),
  );
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    code: 'UPSTREAM_FAILURE',
  });
  expect(calls).toBe(0);
});

it('bounds the upstream request to two seconds', async () => {
  const started = performance.now();
  mockServer.use(
    http.get(books, async () => {
      await delay(2800);
      return HttpResponse.json([]);
    }),
  );
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    code: 'UPSTREAM_TIMEOUT',
  });
  expect(performance.now() - started).toBeGreaterThanOrEqual(1800);
  expect(performance.now() - started).toBeLessThan(2700);
});
