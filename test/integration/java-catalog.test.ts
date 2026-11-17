import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
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
const fullPage = Array.from({ length: 12 }, (_, index) => ({
  ...wireBook,
  id: '00000000-0000-4000-8000-' + String(index + 101).padStart(12, '0'),
}));

beforeAll(() => mockServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mockServer.resetHandlers();
  vi.restoreAllMocks();
});
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

it.each([false, true])(
  'checks a full page when the next page has books: %s',
  async (hasNext) => {
    const calls: Array<{
      query: Record<string, string>;
      authorization: string | null;
    }> = [];
    mockServer.use(
      http.get(books, ({ request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        calls.push({
          query,
          authorization: request.headers.get('authorization'),
        });
        return HttpResponse.json(
          query.page === '1' ? fullPage : hasNext ? [wireBook] : [],
        );
      }),
    );
    const result = await catalog.list({ page: 2, category: wireBook.category });
    expect(result.books).toHaveLength(12);
    expect(result.books.map((book) => book.id)).toEqual(
      fullPage.map((book) => book.id),
    );
    expect(result).toMatchObject({ page: 2, hasNext });
    expect(calls).toEqual(
      ['1', '2'].map((page) => ({
        query: { category: wireBook.category, page, size: '12' },
        authorization: 'Bearer service-token',
      })),
    );
  },
);

it.each([
  { page: 2, upstreamPage: '1', batch: [wireBook] },
  { page: 100, upstreamPage: '99', batch: fullPage },
])(
  'skips the probe on a known last page ($page)',
  async ({ page, upstreamPage, batch }) => {
    const calls: Array<string | null> = [];
    mockServer.use(
      http.get(books, ({ request }) => {
        calls.push(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json(batch);
      }),
    );
    await expect(catalog.list({ page })).resolves.toMatchObject({
      hasNext: false,
    });
    expect(calls).toEqual([upstreamPage]);
  },
);

it('rejects duplicate IDs on the next page instead of treating it as evidence of more books', async () => {
  mockServer.use(
    http.get(books, ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get('page') === '0'
          ? fullPage
          : [wireBook, wireBook],
      ),
    ),
  );
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    code: 'UPSTREAM_FAILURE',
  });
});

it('uses one deadline and propagates its abort to the next-page request', async () => {
  const deadline = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(deadline.signal);
  let probeAborted = false;
  mockServer.use(
    http.get(books, ({ request }) => {
      if (new URL(request.url).searchParams.get('page') === '0') {
        return HttpResponse.json(fullPage);
      }
      request.signal.addEventListener(
        'abort',
        () => {
          probeAborted = true;
        },
        { once: true },
      );
      deadline.abort();
      return HttpResponse.json([]);
    }),
  );
  await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
    code: 'UPSTREAM_TIMEOUT',
  });
  expect(timeout.mock.calls).toEqual([[2000]]);
  expect(probeAborted).toBe(true);
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
                      new TextEncoder().encode(JSON.stringify([wireBook])),
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
