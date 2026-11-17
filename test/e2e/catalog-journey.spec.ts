import { expect, test } from '@playwright/test';
import {
  firstBookId,
  missingBookId,
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
