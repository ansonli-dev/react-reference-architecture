import { expect, test } from '@playwright/test';
import {
  firstBookId,
  missingBookId,
  readJavaCalls,
  setJavaScenario,
} from '../support/catalog-scenario';
import { emptyCatalogPorts } from '../support/java-catalog-stub.mjs';

const books = '/api/v1/catalog/books';

test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name === 'dev');
  if (info.project.name === 'release')
    await setJavaScenario(request, { resetCalls: true });
});

test.afterEach(async ({ request }, info) => {
  if (info.project.name === 'release') await setJavaScenario(request);
});

test('serves typed lists and details from the configured data source', async ({
  request,
}, info) => {
  const first = await request.get(books);
  expect(first.status()).toBe(200);
  expect(first.headers()['cache-control']).toBe('no-store');
  const title =
    info.project.name === 'demo'
      ? 'React 应用架构'
      : 'Java fixture: React 应用架构';
  const expected = {
    id: firstBookId,
    title,
    priceMinor: 4900,
    currency: 'CNY',
    stock: 5,
  };
  const page = await first.json();
  expect(page).toMatchObject({ page: 1, hasNext: true });
  expect(page.books).toHaveLength(12);
  expect(page.books[0]).toMatchObject(expected);
  expect(page.books[0]).not.toHaveProperty('priceCents');

  const last = await request.get(books + '?page=2', {
    headers: { 'Accept-Language': 'en' },
  });
  expect(last.status()).toBe(200);
  expect(await last.json()).toMatchObject({
    page: 2,
    hasNext: false,
    books: [expect.any(Object), expect.any(Object)],
  });

  for (const category of ['Architecture', 'Programming']) {
    const filtered = await request.get(books + '?category=' + category);
    const { books: titles } = await filtered.json();
    expect(titles).toHaveLength(7);
    expect(
      titles.every((book: { category: string }) => book.category === category),
    ).toBe(true);
  }

  const detail = await request.get(books + '/' + firstBookId);
  expect(detail.status()).toBe(200);
  expect(await detail.json()).toMatchObject(expected);
  expect((await request.get('/api/ready')).status()).toBe(200);
});

test('validates inputs and distinguishes an unknown UUID', async ({
  request,
}, info) => {
  const invalid = await request.get(books + '/not-a-uuid');
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toEqual({
    error: { code: 'INVALID_INPUT', requestId: expect.any(String) },
  });
  expect((await request.get(books + '?page=1&page=2')).status()).toBe(400);
  if (info.project.name === 'release')
    expect(await readJavaCalls(request)).toEqual([]);

  const unknown = await request.get(books + '/' + missingBookId);
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toEqual({
    error: { code: 'BOOK_NOT_FOUND', requestId: expect.any(String) },
  });
});

test('only the teaching profile accepts a keyword', async ({
  request,
}, info) => {
  const response = await request.get(books + '?q=React');
  if (info.project.name === 'release') {
    expect(response.status()).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNSUPPORTED_FILTER' },
    });
    expect(await readJavaCalls(request)).toEqual([]);
  } else {
    expect(response.status()).toBe(200);
    expect((await response.json()).books).toHaveLength(2);
  }
});

test('caches identical public reads per locale and ignores browser identity', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  const path = books + '?category=Programming&page=3';
  const a = await request.get(path, {
    headers: { 'Accept-Language': 'zh-CN', Cookie: 'SESSION=a' },
  });
  const b = await request.get(path, {
    headers: {
      'Accept-Language': 'zh-CN',
      Cookie: 'SESSION=b',
      Authorization: 'Bearer browser-data',
    },
  });
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);
  expect(await a.json()).toEqual(await b.json());
  expect(await readJavaCalls(request)).toEqual([
    {
      path: '/api/v1/books?category=Programming&page=2&size=12',
      cookie: null,
      authorization: 'Bearer fixture-service',
    },
  ]);
  const en = await request.get(path, { headers: { 'Accept-Language': 'en' } });
  expect(en.status()).toBe(200);
  expect(await readJavaCalls(request)).toHaveLength(2);
});

test('distinguishes gateway failures and deadlines and can recover the same query', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  const query = books + '?category=Architecture&page=8';
  await setJavaScenario(request, { delayMs: 2600 });
  const timedOut = await request.get(query);
  expect(timedOut.status()).toBe(504);
  expect(await timedOut.json()).toMatchObject({
    error: { code: 'UPSTREAM_TIMEOUT' },
  });
  await setJavaScenario(request, { mode: 'broken' });
  const malformed = await request.get(query);
  expect(malformed.status()).toBe(502);
  expect(await malformed.json()).toEqual({
    error: { code: 'UPSTREAM_FAILURE', requestId: expect.any(String) },
  });
  await setJavaScenario(request, { mode: 'unsafe' });
  expect(
    (
      await request.get(books + '?category=Architecture&page=1', {
        headers: { 'Accept-Language': 'en' },
      })
    ).status(),
  ).toBe(502);
  await setJavaScenario(request);
  expect((await request.get(query)).status()).toBe(200);
});

test('builds start without dependencies and expose only a safe readiness reason', async ({
  request,
}, info) => {
  const port =
    info.project.name === 'demo'
      ? emptyCatalogPorts.demo
      : emptyCatalogPorts.release;
  const url = 'http://127.0.0.1:' + port;
  expect((await request.get(url + '/api/health')).status()).toBe(200);
  expect((await request.get(url + '/zh-CN')).status()).toBe(200);
  const response = await request.get(url + '/api/ready');
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    status: 'unavailable',
    reason:
      info.project.name === 'demo'
        ? 'CATALOG_UNAVAILABLE'
        : 'CATALOG_NOT_CONFIGURED',
  });
  const catalog = await request.get(url + books);
  expect(catalog.status()).toBe(503);
});
