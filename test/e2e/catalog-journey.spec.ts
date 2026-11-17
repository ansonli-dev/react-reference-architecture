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
    baseURL + '/en/books?category=Full+shelf&page=95',
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
    expect(html).not.toContain('Archive book 1129');

    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
    expect(html).toContain('>Archive book 1129</a>');
    expect(await readJavaCalls(request)).toEqual([
      {
        path: '/api/v1/books?category=Full%20shelf&page=94&size=12',
        cookie: null,
        authorization: 'Bearer fixture-service',
      },
    ]);
  } finally {
    await reader.cancel();
  }
});

test('detail HTML and BFF reuse the same public reader cache', async ({
  request,
}, info) => {
  test.skip(info.project.name !== 'release');
  await setJavaScenario(request, { resetCalls: true });
  const id = '00000000-0000-4000-8000-000000000110';
  const detail = await request.get('/api/v1/catalog/books/' + id, {
    headers: { 'Accept-Language': 'en' },
  });
  expect(detail.status()).toBe(200);
  const { title } = await detail.json();
  const html = await request.get('/en/books/' + id);
  expect(html.status()).toBe(200);
  expect(await html.text()).toContain('>' + title + '</h1>');
  expect(await readJavaCalls(request)).toEqual([
    {
      path: '/api/v1/books/' + id,
      cookie: null,
      authorization: 'Bearer fixture-service',
    },
  ]);
});
