import { expect, test } from '@playwright/test';

test('uses explicit locales and leaves health and assets outside locale routing', async ({
  request,
  page,
}) => {
  const root = await request.get('/', {
    maxRedirects: 0,
    headers: { 'Accept-Language': 'en', Cookie: 'NEXT_LOCALE=en' },
  });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toMatch(/\/zh-CN\/books$/);

  await page.goto('/en');
  await expect(page).toHaveURL('/en/books');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Book catalog');
  await expect(
    page.getByRole('link', { name: 'Home', exact: true }),
  ).toHaveCount(0);
  await page.goto('/en/books?category=Architecture&variant=B');
  await expect(page).toHaveURL('/en/books?category=Architecture');
  const missing = await request.get('/fr/books', { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
  expect((await request.get('/fr', { maxRedirects: 0 })).status()).toBe(404);
  const health = await request.get('/api/health', { maxRedirects: 0 });
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });

  const asset = await page
    .locator('script[src*="/_next/"]')
    .first()
    .getAttribute('src');
  expect(asset).toBeTruthy();
  expect((await request.get(asset!, { maxRedirects: 0 })).status()).toBe(200);
  expect((await request.get('/globe.svg', { maxRedirects: 0 })).status()).toBe(
    200,
  );
});

test('the language and theme controls work from the keyboard', async ({
  page,
}, info) => {
  await page.goto('/zh-CN/books?category=Architecture');
  const language = page.getByRole('link', { name: 'English' });
  const theme = page.getByRole('button', { name: '切换深色主题' });
  await expect(language).toHaveAttribute(
    'href',
    '/en/books?category=Architecture',
  );

  await page
    .getByRole('banner')
    .getByRole('link', {
      name: info.project.name === 'release' ? '登录' : '订单',
    })
    .focus();
  await page.keyboard.press('Tab');
  await expect(language).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(theme).toBeFocused();
  await page.keyboard.press('Space');
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/en/books?category=Architecture');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('button', { name: 'Toggle dark theme' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('supported locales return localized HTTP 404 pages for unknown paths', async ({
  page,
}) => {
  const cases = [
    ['zh-CN', '/does-not-exist', '找不到这个页面', '返回目录'],
    ['en', '/does-not-exist', 'Page not found', 'Back to books'],
    ['en', '/does-not-exist/nested', 'Page not found', 'Back to books'],
  ];
  for (const [locale, path, heading, home] of cases) {
    const response = await page.goto('/' + locale + path);
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: home })).toHaveAttribute(
      'href',
      '/' + locale + '/books',
    );
  }
});
