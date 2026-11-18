import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { createJavaCatalog } from '@/server/adapters/java/catalog-v1.server';
import { mockServer } from '../mocks/server';

const origin = 'http://catalog.example.test';
const books = origin + '/api/v1/books';
const id = '00000000-0000-4000-8000-000000000101';
const wireBook = {
  id,
  title: 'From Java',
  author: 'Anson',
  category: 'Architecture & design',
  priceMinor: 4900,
  currency: 'CNY',
  stock: 5,
  coverUrl: 'https://catalog.example.test/cover.jpg',
  description: 'A catalog description.',
};
const catalog = createJavaCatalog(origin);

beforeAll(() => mockServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

it('sends a one-based catalog query without private credentials', async () => {
  mockServer.use(
    http.get(books, ({ request }) => {
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
        page: '3',
        size: '12',
        category: wireBook.category,
        q: 'React & Java',
      });
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBeNull();
      return HttpResponse.json({ books: [wireBook], page: 3, hasNext: true });
    }),
  );
  await expect(
    catalog.list({ page: 3, category: wireBook.category, q: 'React & Java' }),
  ).resolves.toEqual({ books: [wireBook], page: 3, hasNext: true });
});

it('reads category options and book details from Java', async () => {
  mockServer.use(
    http.get(origin + '/api/v1/categories', () =>
      HttpResponse.json({ categories: [wireBook.category] }),
    ),
    http.get(books + '/' + id, () => HttpResponse.json(wireBook)),
  );
  await expect(catalog.categories()).resolves.toEqual([wireBook.category]);
  await expect(catalog.get(id)).resolves.toEqual(wireBook);
});

it('limits pagination to the last supported page', async () => {
  mockServer.use(
    http.get(books, () =>
      HttpResponse.json({ books: [wireBook], page: 100, hasNext: true }),
    ),
  );
  await expect(catalog.list({ page: 100 })).resolves.toEqual({
    books: [wireBook],
    page: 100,
    hasNext: false,
  });
});

it.each([
  { books: [wireBook, wireBook], page: 1, hasNext: false },
  { books: [wireBook], page: 2, hasNext: false },
])('rejects duplicate IDs and mismatched pages %j', async (payload) => {
  mockServer.use(http.get(books, () => HttpResponse.json(payload)));
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    code: 'UPSTREAM_FAILURE',
  });
});

it.each([
  {
    status: 200,
    mediaType: 'application/json',
    path: books,
    code: 'UPSTREAM_FAILURE',
  },
  {
    status: 200,
    mediaType: 'text/plain',
    path: books,
    code: 'UPSTREAM_FAILURE',
  },
  {
    status: 404,
    mediaType: 'application/json',
    path: books + '/' + id,
    code: null,
  },
])(
  'bounds or skips the response body ($status $mediaType)',
  async ({ status, mediaType, path, code }) => {
    let chunks = 0;
    let cancelled = false;
    const paddingChunks = 8;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    mockServer.use(
      http.get(
        path,
        () =>
          new HttpResponse(
            new ReadableStream(
              {
                pull(controller) {
                  if (++chunks <= paddingChunks) controller.enqueue(chunk);
                  else {
                    controller.enqueue(
                      new TextEncoder().encode(JSON.stringify(wireBook)),
                    );
                    controller.close();
                  }
                },
                cancel() {
                  cancelled = true;
                },
              },
              { highWaterMark: 0 },
            ),
            { status, headers: { 'Content-Type': mediaType } },
          ),
      ),
    );
    if (code)
      await expect(catalog.list({ page: 1 })).rejects.toMatchObject({ code });
    else await expect(catalog.get(id)).resolves.toBeNull();
    expect(cancelled).toBe(true);
    // MSW clones the stream; allow prefetch but require cancellation before the final payload.
    expect(chunks).toBeLessThanOrEqual(paddingChunks);
  },
);

it.each([
  { ...wireBook, priceMinor: Number.MAX_SAFE_INTEGER + 1 },
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
