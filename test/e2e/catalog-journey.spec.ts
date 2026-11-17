import { expect, test } from '@playwright/test';
import {
  firstBookId,
  missingBookId,
  readJavaCalls,
  setJavaScenario,
} from '../support/catalog-scenario';

const sourceTitle = (profile: string, title: string) =>
  profile === 'release' ? 'Java fixture: ' + title : title;

test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name === 'dev');
  if (info.project.name === 'release') await setJavaScenario(request);
});

test.afterEach(async ({ request }, info) => {
  if (info.project.name === 'release') await setJavaScenario(request);
});

test('server-rendered markup contains real book links and supports detail navigation', async ({
  page,
  request,
}, info) => {
  const response = await request.get('/zh-CN/books');
  expect(response.status()).toBe(200);
  const html = await response.text();
  const title = sourceTitle(info.project.name, 'React 应用架构');
  expect(html).toContain('>' + title + '</a>');

  await page.goto('/zh-CN/books');
  await expect(page.getByRole('heading', { name: '书籍目录' })).toBeVisible();
  await page.getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL('/zh-CN/books/' + firstBookId);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const detail = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: title }) });
  await expect(detail.getByText('林岚', { exact: true })).toBeVisible();
  await expect(detail.getByText('库存 5 本', { exact: true })).toBeVisible();
  const price = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(49);
  await expect(detail.getByText(price, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL('/en/books/' + firstBookId);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('the filtered catalog shows the same titles as its JSON response', async ({
  page,
  request,
}) => {
  const query = '?category=Architecture';
  const response = await request.get('/api/v1/catalog/books' + query);
  await expect(response).toBeOK();
  const { books }: { books: { title: string }[] } = await response.json();
  expect(books.length).toBeGreaterThan(0);

  await page.goto('/zh-CN/books' + query);
  await expect(
    page.getByRole('article').getByRole('heading', { level: 2 }),
  ).toHaveText(books.map((book) => book.title));
});

test('direct filter URLs, resets, pagination and Back share the URL state', async ({
  page,
}, info) => {
  await page.goto('/en/books?category=Programming&page=2');
  await expect(page.getByLabel('Category')).toHaveValue('Programming');
  await expect(page.getByText('No books match these filters.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Previous page' }),
  ).toHaveAttribute('href', '/en/books?category=Programming');

  await page.getByLabel('Category').selectOption('Architecture');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL('/en/books?category=Architecture');
  await expect(
    page.getByRole('link', {
      name: sourceTitle(info.project.name, 'React 应用架构'),
      exact: true,
    }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/en/books?category=Programming&page=2');
  await expect(page.getByLabel('Category')).toHaveValue('Programming');

  await page.goto('/en/books');
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL('/en/books?page=2');
  await expect(
    page.getByRole('link', {
      name: sourceTitle(info.project.name, 'Modern CSS Layout'),
      exact: true,
    }),
  ).toBeVisible();
});

test('details return to the originating catalog page and preserve it on language switches', async ({
  page,
}, info) => {
  const cases = [
    {
      query: '?page=2',
      title: 'Modern CSS Layout',
      id: '00000000-0000-4000-8000-000000000114',
    },
    {
      query: '?category=Architecture',
      title: 'React 应用架构',
      id: firstBookId,
    },
  ];
  if (info.project.name === 'demo')
    cases.push({
      query: '?category=Architecture&q=React',
      title: 'React 应用架构',
      id: firstBookId,
    });
  for (const { query, title, id } of cases) {
    const detail = '/books/' + id;
    const list = '/books' + query;
    await page.goto('/en' + list);
    await page
      .getByRole('link', {
        name: sourceTitle(info.project.name, title),
        exact: true,
      })
      .click();
    await expect(page).toHaveURL('/en' + detail + query);
    await expect(
      page.getByRole('heading', {
        name: sourceTitle(info.project.name, title),
      }),
    ).toBeVisible();
    const back = page.getByRole('link', { name: 'Back to books' });
    await expect(back).toHaveAttribute('href', '/en' + list);
    if (query.includes('category')) {
      await page.getByRole('link', { name: '简体中文' }).click();
      await expect(page).toHaveURL('/zh-CN' + detail + query);
      const returnToList = page.getByRole('link', { name: '返回目录' });
      await expect(returnToList).toHaveAttribute('href', '/zh-CN' + list);
      await returnToList.click();
      await expect(page).toHaveURL('/zh-CN' + list);
      await expect(page.getByLabel('分类')).toHaveValue('Architecture');
    } else {
      await back.click();
      await expect(page).toHaveURL('/en' + list);
      await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    }
  }
});

test('a detail only uses valid known filters for its local return link', async ({
  page,
}, info) => {
  const cases = [
    ['', ''],
    ['?category=Architecture&page=2&page=3', ''],
    ['?category=Architecture&page=101', ''],
    [
      '?returnTo=https%3A%2F%2Foutside.example%2F&category=Architecture&page=1',
      '?category=Architecture',
    ],
    [
      '?category=Architecture&q=React',
      info.project.name === 'demo'
        ? '?category=Architecture&q=React'
        : '?category=Architecture',
    ],
  ];
  for (const [query, returned] of cases) {
    await page.goto('/en/books/' + firstBookId + query);
    await expect(
      page.getByRole('link', { name: 'Back to books' }),
    ).toHaveAttribute('href', '/en/books' + returned);
  }
});

test('a failing detail retains the catalog and retries the same URL', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  const list = '/en/books?category=Architecture';
  const detail =
    '/en/books/00000000-0000-4000-8000-000000000106?category=Architecture';
  await page.goto(list);
  const book = page.getByRole('link', {
    name: 'Java fixture: 可靠交付实践',
    exact: true,
  });
  await expect(book).toHaveAttribute('href', detail);
  await setJavaScenario(request, { mode: 'failure' });
  await book.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Books are temporarily unavailable',
  );
  await expect(
    page.getByRole('link', { name: 'Back to books' }),
  ).toHaveAttribute('href', list);
  const retry = page.getByRole('link', { name: 'Try again' });
  await expect(retry).toHaveAttribute('href', detail);
  await setJavaScenario(request);
  await retry.click();
  await expect(page).toHaveURL(detail);
  await expect(
    page.getByRole('heading', { name: 'Java fixture: 可靠交付实践' }),
  ).toBeVisible();
});

test('shows a clear recovery for invalid and unsupported filters', async ({
  page,
}, info) => {
  await page.goto('/en/books?page=101');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Check your filters',
  );
  await page.getByRole('link', { name: 'Reset filters' }).click();
  await expect(page).toHaveURL('/en/books');

  if (info.project.name === 'demo') {
    await page.getByLabel('Search books').fill('React');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL('/en/books?q=React');
    await expect(page.getByRole('article')).toHaveCount(2);
  } else {
    await expect(page.getByLabel('Search books')).toHaveCount(0);
    await page.goto('/en/books?q=React');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Keyword search is unavailable',
    );
    await expect(
      page.getByRole('link', { name: 'Reset filters' }),
    ).toHaveAttribute('href', '/en/books');
  }
});

test('renders localized not-found content and an index guard for missing details', async ({
  page,
}) => {
  await page.goto('/en/books/' + missingBookId);
  await expect(
    page.getByRole('heading', { name: 'Book not found' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to books' }),
  ).toHaveAttribute('href', '/en/books');
  await expect(
    page.locator('meta[name=robots][content=noindex]').first(),
  ).toBeAttached();
});

test('offers a retry after a Java outage without serving demo data', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  await setJavaScenario(request, { mode: 'failure' });
  await page.goto('/en/books?page=99');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Books are temporarily unavailable',
  );
  await expect(page.getByRole('article')).toHaveCount(0);
  await setJavaScenario(request);
  await page.getByRole('link', { name: 'Try again' }).click();
  await expect(page).toHaveURL('/en/books?page=99');
  await expect(page.getByText('No books match these filters.')).toBeVisible();
});

test('page 100 never offers a next link even when all twelve book slots are filled', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  const filters = 'category=Full+shelf&page=100';
  const response = await request.get('/api/v1/catalog/books?' + filters);
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({ page: 100, hasNext: false });
  expect(data.books).toHaveLength(12);

  await page.goto('/en/books?' + filters);
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(page.getByRole('link', { name: 'Next page' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Previous page' }),
  ).toHaveAttribute('href', '/en/books?category=Full+shelf&page=99');
});

test('streams the static shell before the delayed upstream books', async ({
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'release');
  await setJavaScenario(request, { delayMs: 950, resetCalls: true });
  const response = await fetch(
    baseURL + '/en/books?category=Full+shelf&page=100',
    {
      headers: { 'Accept-Encoding': 'identity' },
    },
  );
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  try {
    let html = '';
    while (!html.includes('>Loading books</p>')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    expect(html).toContain('>Book catalog</h1>');
    expect(html).toContain('>Loading books</p>');
    expect(html).not.toContain('Archive book 1189');

    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
    expect(html).toContain('>Archive book 1189</a>');
    expect(await readJavaCalls(request)).toEqual([
      {
        path: '/api/v1/books?category=Full%20shelf&page=99&size=12',
        cookie: null,
        authorization: 'Bearer fixture-service',
      },
    ]);
  } finally {
    await reader.cancel();
  }
});

test('different detail return links and BFF reuse one public book read', async ({
  request,
  page,
}, info) => {
  test.skip(info.project.name !== 'release');
  await setJavaScenario(request, { resetCalls: true });
  const id = '00000000-0000-4000-8000-000000000110';
  const detail = await request.get('/api/v1/catalog/books/' + id, {
    headers: { 'Accept-Language': 'en' },
  });
  expect(detail.status()).toBe(200);
  const { title } = await detail.json();
  for (const query of ['?category=Programming', '?page=2']) {
    const html = await request.get('/en/books/' + id + query);
    expect(html.status()).toBe(200);
    const body = await html.text();
    expect(body).toContain('>' + title + '</h1>');
    expect(body).toContain('href="/en/books' + query + '"');
    // A streamed document may not be painted until the body is complete.
    await page.goto('/en/books/' + id + query);
    await expect(
      page.getByRole('link', { name: 'Back to books' }),
    ).toHaveAttribute('href', '/en/books' + query);
  }
  expect(await readJavaCalls(request)).toEqual([
    {
      path: '/api/v1/books/' + id,
      cookie: null,
      authorization: 'Bearer fixture-service',
    },
  ]);
});
