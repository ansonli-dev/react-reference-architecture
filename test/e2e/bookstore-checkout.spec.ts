import { expect, test, type Page } from '@playwright/test';

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

for (const method of ['POST', 'GET']) {
  test(`keeps the same quote after a checkout ${method} returns 401`, async ({
    page,
  }, info) => {
    test.skip(!['demo', 'dev'].includes(info.project.name));
    await page.goto('/en/books/00000000-0000-4000-8000-000000000104');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('button', { name: 'Review quote' }).click();
    await expect(page).toHaveURL(/\/en\/cart\?quote=[a-f0-9-]+$/);
    const quoteId = new URL(page.url()).searchParams.get('quote');

    await page.route(
      /\/api\/v1\/order-submissions(?:\/[^/]+)?$/,
      async (route) => {
        if (route.request().method() === method) {
          return route.fulfill({
            status: 401,
            json: {
              error: {
                code: 'UNAUTHENTICATED',
                requestId: crypto.randomUUID(),
              },
            },
          });
        }
        // Let the real Demo POST place the order, then simulate an accepted response.
        const response = await route.fetch();
        if (response.status() !== 201) return route.fulfill({ response });
        const { submissionId } = await response.json();
        return route.fulfill({
          status: 202,
          headers: { Location: response.headers().location },
          json: { submissionId, state: 'PROCESSING' },
        });
      },
    );

    await page.getByRole('button', { name: 'Place demo order' }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/en/cart' &&
        url.searchParams.get('quote') === quoteId &&
        url.searchParams.get('notice') === 'signIn',
    );
    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toContainText('session ended');
    await expect(
      main.getByRole('heading', { name: 'Confirm quote' }),
    ).toBeVisible();

    await page.getByRole('link', { name: '中文' }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/zh-CN/cart' &&
        url.searchParams.get('quote') === quoteId &&
        url.searchParams.get('notice') === 'signIn',
    );
    await expect(main.getByRole('alert')).toContainText('结算会话已结束');
    await expect(main.getByRole('button', { name: '演示下单' })).toBeVisible();
  });
}

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

const recoveryBook = '00000000-0000-4000-8000-000000000108';
const submissions = '/api/v1/order-submissions';

async function reviewRecoveryQuote(page: Page) {
  await page.goto('/en/books/' + recoveryBook);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('button', { name: 'Review quote' }).click();
  await expect(page).toHaveURL(/\/en\/cart\?quote=[a-f0-9-]+$/);
  return new URL(page.url()).searchParams.get('quote')!;
}

for (const scenario of [
  {
    state: 'PROCESSING',
    polls: 6,
    notice: 'processing',
    message:
      'Your order is processing. Submit the same quote to check its status.',
  },
  {
    state: 'RECONCILE_REQUIRED',
    polls: 0,
    notice: 'reconcile',
    message:
      'Your order is under review. Submit the same quote to check its status.',
  },
]) {
  test(
    'retains the quote for manual retry after ' + scenario.state,
    async ({ page }, info) => {
      test.skip(!['demo', 'dev'].includes(info.project.name));
      const quoteId = await reviewRecoveryQuote(page);
      const submissionId = crypto.randomUUID();
      const statusPath = submissions + '/' + submissionId;
      const attempts: { key: string; body: unknown }[] = [];
      const polls: string[] = [];
      await page.route('**' + submissions, (route) => {
        const request = route.request();
        attempts.push({
          key: request.headers()['idempotency-key'],
          body: request.postDataJSON(),
        });
        return route.fulfill({
          status: 202,
          headers: { Location: statusPath },
          json: { submissionId, state: scenario.state },
        });
      });
      await page.route('**' + submissions + '/*', (route) => {
        polls.push(
          route.request().method() +
            ' ' +
            new URL(route.request().url()).pathname,
        );
        return route.fulfill({
          status: 200,
          json: { submissionId, state: scenario.state },
        });
      });
      const place = page.getByRole('button', { name: 'Place demo order' });
      await place.click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === '/en/cart' &&
          url.searchParams.get('quote') === quoteId &&
          url.searchParams.get('notice') === scenario.notice,
        { timeout: 15_000 },
      );
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        scenario.message,
      );
      expect(polls).toEqual(Array(scenario.polls).fill('GET ' + statusPath));
      const attempt = { key: quoteId, body: { quoteId } };
      expect(attempts).toEqual([attempt]);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === submissions,
        ),
        place.click(),
      ]);
      expect(attempts).toEqual([attempt, attempt]);
    },
  );
}

test('replays a lost Demo response and charges stock for exactly one order', async ({
  page,
}, info) => {
  test.skip(!['demo', 'dev'].includes(info.project.name));
  const quoteId = await reviewRecoveryQuote(page);
  const bookPath = '/api/v1/catalog/books/' + recoveryBook;
  async function stock() {
    const response = await page.request.get(bookPath);
    expect(response.status()).toBe(200);
    return (await response.json()).stock as number;
  }
  const initialStock = await stock();
  const lost = Promise.withResolvers<{
    status: number;
    key: string;
    body: unknown;
    submission: {
      state: string;
      submissionId: string;
      order: { orderId: string };
    };
  }>();
  await page.route(
    '**' + submissions,
    async (route) => {
      const request = route.request();
      const response = await route.fetch();
      lost.resolve({
        status: response.status(),
        key: request.headers()['idempotency-key'],
        body: request.postDataJSON(),
        submission: await response.json(),
      });
      await route.abort('failed');
    },
    { times: 1 },
  );
  const place = page.getByRole('button', { name: 'Place demo order' });
  await place.click();
  const first = await lost.promise;
  expect(first).toMatchObject({
    status: 201,
    key: quoteId,
    body: { quoteId },
    submission: {
      state: 'PLACED',
      submissionId: expect.any(String),
      order: { orderId: expect.any(String) },
    },
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'The bookstore is temporarily unavailable. Try again.',
  );
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('quote') === quoteId,
  );
  expect(await stock()).toBe(initialStock - 1);
  await page.reload();
  const [replay] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === submissions,
    ),
    place.click(),
  ]);
  expect(replay.request().headers()['idempotency-key']).toBe(first.key);
  expect(replay.request().postDataJSON()).toEqual(first.body);
  expect(replay.status()).toBe(200);
  const statusPath = submissions + '/' + first.submission.submissionId;
  expect(replay.headers().location).toBe(statusPath);
  const status = await page.request.get(statusPath);
  expect(status.status()).toBe(200);
  expect(await status.json()).toEqual(first.submission);
  const { orderId } = first.submission.order;
  await expect(page).toHaveURL('/en/orders?placed=' + orderId);
  await expect(
    page.getByRole('heading', { name: 'Order ' + orderId }),
  ).toBeVisible();
  const history = await page.request.get('/api/v1/orders');
  expect(history.status()).toBe(200);
  expect((await history.json()).orders).toMatchObject([
    { id: orderId, lines: [{ bookId: recoveryBook, quantity: 1 }] },
  ]);
  expect(await stock()).toBe(initialStock - 1);
});
