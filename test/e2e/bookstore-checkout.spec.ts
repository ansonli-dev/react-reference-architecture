import { expect, test } from '@playwright/test';

const checkoutBookId = '00000000-0000-4000-8000-000000000103';
const checkoutTitle = '边界与依赖';

test('keeps both items when two tabs make their first additions', async ({
  page,
  context,
  playwright,
  baseURL,
}, info) => {
  test.skip(!['demo', 'dev'].includes(info.project.name));
  const second = await context.newPage();
  const secondBookId = '00000000-0000-4000-8000-000000000104';
  await Promise.all([
    page.goto('/en/books/' + checkoutBookId),
    second.goto('/en/books/' + secondBookId),
  ]);
  const firstItem = '/api/v1/cart/items/' + checkoutBookId;
  const isolated = await playwright.request.newContext({ baseURL });
  const pendingResponse = Promise.withResolvers<void>();
  const releaseResponse = Promise.withResolvers<void>();
  try {
    await page.route('**' + firstItem, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      // Hold the successful mutation's response before its cookie reaches either tab.
      const response = await isolated.put(firstItem, {
        headers: { Origin: new URL(baseURL!).origin, 'If-None-Match': '*' },
        data: route.request().postDataJSON(),
      });
      pendingResponse.resolve();
      await releaseResponse.promise;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await pendingResponse.promise;
    const secondWrite = second
      .waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response.url().endsWith('/api/v1/cart/items/' + secondBookId),
        { timeout: 1000 },
      )
      .catch(() => null);
    await second.getByRole('button', { name: 'Add to cart' }).click();
    // Give the second tab time to finish any uncoordinated write before delivering the cookie.
    await secondWrite;
    releaseResponse.resolve();
    await expect(page).toHaveURL('/en/cart');
    await expect(second).toHaveURL('/en/cart');
    await page.reload();
    await expect(page.getByRole('link', { name: checkoutTitle })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Designing Service Boundaries' }),
    ).toBeVisible();
  } finally {
    releaseResponse.resolve();
    await isolated.dispose();
  }
});

test('reloads the latest cart when a stale tab updates or removes a line', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.skip(!['demo', 'dev'].includes(info.project.name));
  const bookId = '00000000-0000-4000-8000-000000000105';
  const path = '/api/v1/cart/items/' + bookId;
  const headers = { Origin: new URL(baseURL!).origin };
  expect(
    (
      await context.request.put(path, { headers, data: { quantity: 1 } })
    ).status(),
  ).toBe(201);
  const second = await context.newPage();
  await Promise.all([page.goto('/en/cart'), second.goto('/en/cart')]);
  const quantity = page.getByRole('spinbutton', { name: 'Quantity' });
  await expect(quantity).toHaveValue('1');
  await expect(
    second.getByRole('spinbutton', { name: 'Quantity' }),
  ).toHaveValue('1');
  expect(
    (
      await context.request.put(path, { headers, data: { quantity: 2 } })
    ).status(),
  ).toBe(200);

  await quantity.fill('3');
  await page.getByRole('button', { name: 'Update quantity' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Your cart or prices changed',
  );
  await expect(quantity).toHaveValue('2');
  await second.getByRole('button', { name: 'Remove 从请求到页面' }).click();
  await expect(second.getByRole('main').getByRole('alert')).toContainText(
    'Your cart or prices changed',
  );
  await expect(
    second.getByRole('spinbutton', { name: 'Quantity' }),
  ).toHaveValue('2');
});

test('shops from the bilingual storefront, changes quantity, places an order and sees only its own history', async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(!['demo', 'dev'].includes(info.project.name));
  await page.goto('/zh-CN');
  await expect(page).toHaveURL('/zh-CN/books');
  await expect(page.getByRole('heading', { name: '书籍目录' })).toBeVisible();
  await page.getByRole('link', { name: checkoutTitle, exact: true }).click();
  await expect(page).toHaveURL('/zh-CN/books/' + checkoutBookId);
  await expect(
    page.getByRole('heading', { name: checkoutTitle }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '内容简介' })).toBeVisible();
  await page.getByRole('button', { name: '加入购物车' }).click();
  await expect(page).toHaveURL('/zh-CN/cart');
  await expect(page.getByRole('heading', { name: '订单摘要' })).toBeVisible();
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: checkoutTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '数量' })).toHaveValue('1');
  await page.getByRole('spinbutton', { name: '数量' }).fill('2');
  await page.getByRole('button', { name: '更新数量' }).click();
  await expect(
    page.getByText(
      new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
      }).format(84),
      { exact: true },
    ),
  ).toBeVisible();

  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL('/en/cart');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(
    '2',
  );
  await page.getByRole('button', { name: 'Review quote' }).click();
  await expect(page).toHaveURL(/\/en\/cart\?quote=[a-f0-9-]+$/);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Confirm quote' }),
  ).toBeVisible();
  const confirmationUrl = page.url();
  await page.route('**/api/v1/order-submissions', async (route) => {
    const response = await route.fetch();
    if (response.status() !== 201) return route.fulfill({ response });
    const { submissionId } = await response.json();
    await route.fulfill({
      status: 202,
      headers: { Location: response.headers().location },
      json: { submissionId, state: 'PROCESSING' },
    });
  });
  const statusRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.startsWith('/api/v1/order-submissions/'),
  );
  await page.getByRole('button', { name: 'Place demo order' }).click();
  expect((await statusRead).status()).toBe(200);
  await expect(page).toHaveURL(/\/en\/orders\?placed=[a-f0-9-]+$/);
  const receiptUrl = page.url();
  await expect(page.getByRole('status')).toHaveText('Order placed.');
  const receipt = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: /^Order [a-f0-9-]+$/ }),
  });
  await expect(
    receipt.getByRole('link', { name: checkoutTitle }),
  ).toBeVisible();
  await expect(
    receipt.getByText(
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency: 'CNY',
      }).format(84),
      { exact: true },
    ),
  ).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Orders', exact: true })
    .click();
  await expect(page).toHaveURL('/en/orders');
  await page.reload();
  await expect(
    receipt.getByRole('link', { name: checkoutTitle }),
  ).toBeVisible();
  const unitPrice = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'CNY',
  }).format(42);
  await expect(
    receipt.getByText('2 × ' + unitPrice, { exact: true }),
  ).toBeVisible();

  await page.goto(confirmationUrl);
  await page.getByRole('button', { name: 'Place demo order' }).click();
  await expect(page).toHaveURL(receiptUrl);
  await expect(receipt).toHaveCount(1);

  const updated = await page.request.get(
    '/api/v1/catalog/books/' + checkoutBookId,
  );
  expect(await updated.json()).toMatchObject({ stock: 7 });
  await page.getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();

  await page.goto('/en/books/00000000-0000-4000-8000-000000000104');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page
    .getByRole('button', { name: 'Remove Designing Service Boundaries' })
    .click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();

  const guest = await browser.newContext({ baseURL });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto('/en/orders');
    await expect(guestPage.getByText('No orders yet.')).toBeVisible();
    await expect(
      guestPage.getByText(checkoutTitle, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
