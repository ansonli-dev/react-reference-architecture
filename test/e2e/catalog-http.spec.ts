import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { components } from '@/shared/api/generated/bff';
import {
  firstBookId,
  missingBookId,
  readJavaCalls,
  setJavaScenario,
} from '../support/catalog-scenario';
import { emptyCatalogPorts } from '../support/java-catalog-stub.mjs';

const books = '/api/v1/catalog/books';

function serverLog(baseURL: string) {
  const dir = process.env.BOOKSTORE_E2E_LOG_DIR;
  if (!dir) throw new Error('Playwright server log directory was not set');
  const file = join(dir, new URL(baseURL).port + '.log');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function catalogEvents(log: string) {
  return log.split('\n').flatMap((line) => {
    if (!line.startsWith('{')) return [];
    try {
      const event = JSON.parse(line);
      return event.event === 'catalog.read_failed' ? [event] : [];
    } catch {
      return [];
    }
  });
}

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
  expect(first.headers()['content-type']).toMatch(/^application\/json(?:;|$)/i);
  expect(first.headers()['cache-control']).toBe('no-store');
  const title =
    info.project.name === 'demo'
      ? 'React 应用架构'
      : 'Java fixture: React 应用架构';
  const expected = {
    id: firstBookId,
    title,
    author: '林岚',
    category: 'Architecture',
    priceMinor: 4900,
    currency: 'CNY',
    stock: 5,
  } satisfies components['schemas']['Book'];
  const page = await first.json();
  expect(page).toEqual({ page: 1, hasNext: true, books: expect.any(Array) });
  expect(page.books).toHaveLength(12);
  expect(page.books[0]).toEqual(expected);

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
  expect(detail.headers()['content-type']).toMatch(
    /^application\/json(?:;|$)/i,
  );
  expect(detail.headers()['cache-control']).toBe('no-store');
  expect(await detail.json()).toEqual(expected);
  const categories = await request.get('/api/v1/catalog/categories');
  await expect(categories).toBeOK();
  expect(await categories.json()).toEqual({
    categories:
      info.project.name === 'demo'
        ? ['Architecture', 'Programming']
        : ['Architecture', 'Programming', 'Full shelf', 'Exact shelf'],
  });
  expect((await request.get('/api/ready')).status()).toBe(200);
});

test('validates inputs and distinguishes an unknown UUID', async ({
  request,
}, info) => {
  const requestId = expect.stringMatching(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  );
  const invalid = await request.get(books + '/not-a-uuid');
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toEqual({
    error: { code: 'INVALID_INPUT', requestId },
  });
  expect((await request.get(books + '?page=1&page=2')).status()).toBe(400);
  if (info.project.name === 'release')
    expect(await readJavaCalls(request)).toEqual([]);

  const unknown = await request.get(books + '/' + missingBookId);
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()['content-type']).toMatch(
    /^application\/json(?:;|$)/i,
  );
  expect(await unknown.json()).toEqual({
    error: { code: 'BOOK_NOT_FOUND', requestId },
  });
});

test('finds books by keyword and category', async ({ request }, info) => {
  const response = await request.get(books + '?q=React&category=Architecture');
  expect(response.status()).toBe(200);
  const title =
    info.project.name === 'demo'
      ? 'React 应用架构'
      : 'Java fixture: React 应用架构';
  expect(await response.json()).toMatchObject({
    page: 1,
    hasNext: false,
    books: [{ id: firstBookId, title, category: 'Architecture' }],
  });
  if (info.project.name === 'release') {
    expect(await readJavaCalls(request)).toEqual([
      {
        path: '/api/v1/books?page=1&size=12&category=Architecture&q=React',
        cookie: null,
        authorization: null,
      },
    ]);
  }
});

test('reads current list and detail stock without forwarding browser identity', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  const listPath = books + '?category=Architecture';
  const detailPath = books + '/' + firstBookId;
  const options = {
    headers: {
      'Accept-Language': 'en',
      Cookie: 'SESSION=browser-session',
      Authorization: 'Bearer browser-data',
    },
  };

  for (const stock of [5, 2]) {
    await setJavaScenario(request, { firstBookStock: stock });
    const list = await request.get(listPath, options);
    const detail = await request.get(detailPath, options);
    await expect(list).toBeOK();
    await expect(detail).toBeOK();
    expect((await list.json()).books[0]).toMatchObject({
      id: firstBookId,
      stock,
    });
    expect(await detail.json()).toMatchObject({ id: firstBookId, stock });
  }

  const calls = [
    {
      path: '/api/v1/books?page=1&size=12&category=Architecture',
      cookie: null,
      authorization: null,
    },
    {
      path: '/api/v1/books/' + firstBookId,
      cookie: null,
      authorization: null,
    },
  ];
  expect(await readJavaCalls(request)).toEqual([...calls, ...calls]);
});

test('honors Java pagination on a full last page', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  const query = '?category=Exact+shelf';
  const response = await request.get(books + query);
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({ page: 1, hasNext: false });
  expect(data.books).toHaveLength(12);
  const listCall = {
    path: '/api/v1/books?page=1&size=12&category=Exact+shelf',
    cookie: null,
    authorization: null,
  };
  expect(await readJavaCalls(request)).toEqual([listCall]);

  await page.goto('/en/books' + query);
  await expect(
    page.getByRole('article').getByRole('heading', { level: 2 }),
  ).toHaveText(data.books.map((book: { title: string }) => book.title));
  await expect(page.getByRole('link', { name: 'Next page' })).toHaveCount(0);
  const paths = (await readJavaCalls(request)).map(({ path }) => path).sort();
  expect(paths).toEqual([listCall.path, listCall.path, '/api/v1/categories']);
});

test('distinguishes gateway failures and deadlines and can recover the same query', async ({
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'release');
  const query = books + '?category=Architecture&page=8';
  await setJavaScenario(request, { delayMs: 2600 });
  const timedOut = await request.get(query);
  expect(timedOut.status()).toBe(504);
  const deadline = (await timedOut.json()).error;
  expect(deadline.code).toBe('UPSTREAM_TIMEOUT');
  await expect
    .poll(() =>
      catalogEvents(serverLog(baseURL!)).find(
        ({ requestId }) => requestId === deadline.requestId,
      ),
    )
    .toEqual({
      event: 'catalog.read_failed',
      entry: 'api.catalog.list',
      status: 504,
      code: 'UPSTREAM_TIMEOUT',
      requestId: deadline.requestId,
      durationMs: expect.any(Number),
    });
  await setJavaScenario(request, { mode: 'broken' });
  const malformed = await request.get(query);
  expect(malformed.status()).toBe(502);
  const failure = await malformed.json();
  expect(failure).toEqual({
    error: { code: 'UPSTREAM_FAILURE', requestId: expect.any(String) },
  });
  await expect
    .poll(() =>
      catalogEvents(serverLog(baseURL!)).find(
        ({ requestId }) => requestId === failure.error.requestId,
      ),
    )
    .toEqual({
      event: 'catalog.read_failed',
      entry: 'api.catalog.list',
      status: 502,
      code: 'UPSTREAM_FAILURE',
      requestId: failure.error.requestId,
      durationMs: expect.any(Number),
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

test('records detail API and streamed page failures without exposing upstream details', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'release');
  const id = '00000000-0000-4000-8000-000000000112';
  const since = serverLog(baseURL!).length;
  await setJavaScenario(request, { mode: 'failure' });
  const detail = await request.get(books + '/' + id, {
    headers: {
      Authorization: 'Bearer browser-sensitive',
      Cookie: 'SESSION=private',
    },
  });
  expect(detail.status()).toBe(502);
  const body = await detail.json();
  expect(body).toEqual({
    error: { code: 'UPSTREAM_FAILURE', requestId: expect.any(String) },
  });

  for (const path of ['/en/books?page=97', '/en/books/' + id]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Books are temporarily unavailable',
    );
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  }
  const entries = [
    'api.catalog.detail',
    'page.catalog.list',
    'page.catalog.detail',
  ];
  await expect
    .poll(() =>
      catalogEvents(serverLog(baseURL!).slice(since)).map(({ entry }) => entry),
    )
    .toEqual(entries);
  for (const [index, event] of catalogEvents(
    serverLog(baseURL!).slice(since),
  ).entries()) {
    expect(event).toEqual({
      event: 'catalog.read_failed',
      entry: entries[index],
      requestId:
        index === 0
          ? body.error.requestId
          : expect.stringMatching(/^[0-9a-f-]{36}$/),
      code: 'UPSTREAM_FAILURE',
      status: 502,
      durationMs: expect.any(Number),
    });
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
  }
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
      info.project.name === 'demo' ? 'CATALOG_UNAVAILABLE' : 'CONFIG_INVALID',
  });
  const catalog = await request.get(url + books);
  expect(catalog.status()).toBe(503);
});
