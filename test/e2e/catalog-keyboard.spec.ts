import { expect, test } from '@playwright/test';

test('skips the header and submits catalog filters using the keyboard', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'dev');
  await page.goto('/en/books');

  const main = page.getByRole('main');
  const category = main.getByRole('combobox', { name: 'Category' });
  const books = main.getByRole('article');
  await expect(books).toHaveCount(12);
  await expect(category).toHaveValue('');
  const status = main.getByRole('status');

  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/en/books#main');
  await expect(main).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(
    main.getByRole('searchbox', { name: 'Search books' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(category).toBeFocused();
  // Typing selects by label across native select navigation conventions.
  await page.keyboard.press('P');
  await expect(category).toHaveValue('Programming');

  await page.keyboard.press('Tab');
  const apply = main.getByRole('button', { name: 'Apply filters' });
  await expect(apply).toBeFocused();
  await expect(status).toHaveText('12 books.');
  const originalStatus = await status.elementHandle();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/en/books?category=Programming');
  await expect(books).toHaveCount(7);
  await expect(books.getByText('Programming', { exact: true })).toHaveCount(7);
  await expect(status).toHaveText('7 books. Category: Programming.');
  expect(
    await status.evaluate(
      (node, original) => node === original,
      originalStatus,
    ),
  ).toBe(true);
  await expect(apply).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('link', { name: 'Reset filters' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(books.first().getByRole('link')).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL('/en/books#main');
  await expect(category).toHaveValue('');
  await expect(books).toHaveCount(12);
});

test('a keyword change updates the same status even when the number of matches stays the same', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'dev');
  await page.goto('/en/books?q=React');
  const main = page.getByRole('main');
  const titles = main.getByRole('article').getByRole('heading');
  const status = main.getByRole('status');
  await expect(titles).toHaveText([/React 应用架构$/, /React 组件协作$/]);
  await expect(status).toHaveText('2 books. Search: React.');
  const originalStatus = await status.elementHandle();

  await main.getByRole('searchbox', { name: 'Search books' }).fill('Web');
  await main.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL('/en/books?q=Web');
  await expect(titles).toHaveText([
    /Web 系统设计$/,
    /Web Accessibility in Practice$/,
  ]);
  await expect(status).toHaveText('2 books. Search: Web.');
  expect(
    await status.evaluate(
      (node, original) => node === original,
      originalStatus,
    ),
  ).toBe(true);
});

test('the native catalog form uses GET to submit a category', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'dev');
  await page.goto('/en/books');
  const category = page.getByRole('combobox', { name: 'Category' });
  await category.selectOption('Architecture');
  await category.evaluate((select: HTMLSelectElement) => select.form?.submit());
  await expect(page).toHaveURL('/en/books?q=&category=Architecture');
  await expect(page.getByRole('article')).toHaveCount(7);
});
