import { expect, test } from '@playwright/test';

test('skips the header and submits catalog filters using the keyboard', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'dev');
  const filteredPage = '/en/books?category=Architecture&page=2';
  await page.goto(filteredPage);

  const main = page.getByRole('main');
  const category = main.getByRole('combobox', { name: 'Category' });
  await expect(category).toHaveValue('Architecture');

  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(filteredPage + '#main');

  if (info.project.name === 'demo') {
    await page.keyboard.press('Tab');
    await expect(
      main.getByRole('searchbox', { name: 'Search books' }),
    ).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(category).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(
    main.getByRole('button', { name: 'Apply filters' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/en/books?category=Architecture');
  await expect(main.getByRole('article')).toHaveCount(7);
});
