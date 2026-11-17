import { expect, test } from '@playwright/test';
import type { components } from '../../src/server/adapters/java/generated/catalog-v1';

type JavaBook = components['schemas']['BookResponse'];

const javaURL = (path: string) =>
  new URL(path, process.env.JAVA_CATALOG_BASE_URL).href;
const javaBooks = '/api/v1/books';
const bffBooks = '/api/v1/catalog/books';
const seedBookId = '00000000-0000-4000-8000-000000000101';
const missingBookId = '00000000-0000-4000-8000-000000009999';

test('reads the Java v1 catalog from the production storefront and BFF', async ({
  page,
  request,
}) => {
  const openapi = await request.get(javaURL('/v3/api-docs'));
  await expect(openapi).toBeOK();
  expect((await openapi.json()).paths).toMatchObject({
    '/api/v1/books': { get: expect.any(Object) },
    '/api/v1/books/{id}': { get: expect.any(Object) },
  });
  await expect(await request.get('/api/ready')).toBeOK();

  const lastPage = await request.get(javaURL(javaBooks + '?page=1&size=12'));
  await expect(lastPage).toBeOK();
  const lastBooks: JavaBook[] = await lastPage.json();
  expect(lastBooks).toHaveLength(1);
  const translatedPage = await request.get(bffBooks + '?page=2');
  await expect(translatedPage).toBeOK();
  expect(await translatedPage.json()).toMatchObject({
    page: 2,
    hasNext: false,
    books: [{ id: lastBooks[0].id, title: lastBooks[0].title }],
  });

  const filtered = await request.get(
    javaURL(javaBooks + '?category=Architecture&page=0&size=12'),
  );
  await expect(filtered).toBeOK();
  const architectureBooks: JavaBook[] = await filtered.json();
  expect(architectureBooks).toHaveLength(6);

  const detail = await request.get(javaURL(javaBooks + '/' + seedBookId));
  await expect(detail).toBeOK();
  const book: JavaBook = await detail.json();
  expect(book).toMatchObject({
    title: 'Bounded Contexts',
    author: 'Lin Zhao',
    category: 'Architecture',
  });
  const bffDetail = await request.get(bffBooks + '/' + book.id);
  await expect(bffDetail).toBeOK();
  expect(await bffDetail.json()).toMatchObject({
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    priceMinor: book.priceCents,
    currency: book.currency,
    stock: book.stock,
  });

  const html = await request.get('/en/books?category=Architecture');
  await expect(html).toBeOK();
  expect(await html.text()).toContain('>' + book.title + '</a>');

  await page.goto('/en/books');
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL('/en/books?page=2');
  await expect(
    page.getByRole('link', { name: lastBooks[0].title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Next page' })).toHaveCount(0);

  await page.getByLabel('Category').selectOption('Architecture');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL('/en/books?category=Architecture');
  await expect(page.getByRole('article')).toHaveCount(architectureBooks.length);
  for (const { title } of architectureBooks) {
    await expect(
      page.getByRole('link', { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('link', { name: book.title, exact: true }).click();
  await expect(page).toHaveURL('/en/books/' + book.id);
  const heading = page.getByRole('heading', { name: book.title, exact: true });
  await expect(heading).toBeVisible();
  const article = page.getByRole('article').filter({ has: heading });
  const price = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: book.currency,
  }).format(book.priceCents / 100);
  await expect(article.getByText(book.author, { exact: true })).toBeVisible();
  await expect(article.getByText(price, { exact: true })).toBeVisible();
  await expect(
    article.getByText(book.stock + ' copies in stock'),
  ).toBeVisible();
});

test('renders the missing-book page after a real Java 404', async ({
  page,
  request,
}) => {
  const javaDetail = await request.get(
    javaURL(javaBooks + '/' + missingBookId),
  );
  expect(javaDetail.status()).toBe(404);
  const bffDetail = await request.get(bffBooks + '/' + missingBookId);
  expect(bffDetail.status()).toBe(404);
  expect(await bffDetail.json()).toMatchObject({
    error: { code: 'BOOK_NOT_FOUND' },
  });

  await page.goto('/en/books/' + missingBookId);
  await expect(
    page.getByRole('heading', { name: 'Book not found' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to books' }),
  ).toHaveAttribute('href', '/en/books');
});
