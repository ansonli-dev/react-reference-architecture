import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Response,
} from '@playwright/test';
import type { output } from 'zod';
import type { submissionSchema } from '../../src/features/checkout/model';
import type { components } from '../../src/shared/api/generated/bff';

const quotes = '/api/v1/order-quotes';
const submissions = '/api/v1/order-submissions';
const orders = '/api/v1/orders';
const keycloak = 'http://localhost:8180/realms/bookstore';
const settled = { timeout: 20_000 };
const currency = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'CNY',
});
const placedDate = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

type Book = components['schemas']['Book'];
type Order = components['schemas']['Order'];
type Quote = components['schemas']['OrderQuote'];
type Submission = output<typeof submissionSchema>;
type Reader = 'reader-a' | 'reader-b';

const boundedContexts = {
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Bounded Contexts',
  priceMinor: 4900,
};
const transactions = {
  id: '00000000-0000-4000-8000-000000000103',
  title: 'A Guide to Transactions',
  priceMinor: 6200,
};
const lastCopy = {
  id: '00000000-0000-4000-8000-00000000010d',
  title: 'The Last Copy',
  priceMinor: 5500,
};
type SeedBook = Pick<Book, 'id' | 'title' | 'priceMinor'>;

test.setTimeout(90_000);

async function read<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(path);
  await expect(response).toBeOK();
  return response.json();
}

async function signIn(page: Page, reader: Reader) {
  await page.goto('/en/books');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL((url) => {
    return (
      url.origin + url.pathname ===
        keycloak + '/protocol/openid-connect/auth' &&
      url.searchParams.get('client_id') === 'bookstore-bff' &&
      url.searchParams.get('redirect_uri') ===
        'http://localhost:3000/api/auth/oauth2/callback/keycloak' &&
      url.searchParams.get('code_challenge_method') === 'S256' &&
      Boolean(url.searchParams.get('code_challenge')) &&
      Boolean(url.searchParams.get('state'))
    );
  });
  await page.locator('#username').fill(reader);
  await page.locator('#password').fill(reader + '-local');
  await page.locator('#kc-login').click();
  await expect(page).toHaveURL(
    new URL('/en/books', 'http://localhost:3000').href,
  );
  await expect(page.getByText('My account', { exact: true })).toBeVisible();
}

async function readStock(page: Page, book: SeedBook) {
  const detail = await read<Book>(
    page.request,
    '/api/v1/catalog/books/' + book.id,
  );
  return detail.stock;
}

function quantityInput(page: Page) {
  return page.getByRole('spinbutton', { name: 'Quantity', exact: true });
}

async function addBook(page: Page, book: SeedBook) {
  await page.getByRole('searchbox', { name: 'Search books' }).fill(book.title);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/en/books' && url.searchParams.get('q') === book.title,
  );
  await page.getByRole('link', { name: book.title, exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/en/books/' + book.id,
  );
  await expect(
    page.getByRole('heading', { name: book.title, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page).toHaveURL('/en/cart');
  await expect(quantityInput(page)).toHaveValue('1');
}

function orderLine(book: SeedBook, quantity: number) {
  return {
    bookId: book.id,
    title: book.title,
    quantity,
    priceMinor: book.priceMinor,
  };
}

function money(minor: number) {
  return currency.format(minor / 100);
}

async function createQuote(page: Page, book: SeedBook, quantity: number) {
  if (quantity !== 1) {
    await quantityInput(page).fill(String(quantity));
    await page.getByRole('button', { name: 'Update quantity' }).click();
    await expect(
      page.getByText(money(book.priceMinor * quantity), { exact: true }),
    ).toBeVisible();
  }

  await page.getByRole('button', { name: 'Review quote' }).click();
  await expect(page).toHaveURL(/\/en\/cart\?quote=[a-f0-9-]+$/);
  const confirmation = page.url();
  const quoteId = new URL(confirmation).searchParams.get('quote')!;
  const path = quotes + '/' + quoteId;
  const quote = await read<Quote>(page.request, path);
  expect(quote).toMatchObject({
    quoteId,
    currency: 'CNY',
    totalMinor: book.priceMinor * quantity,
    lines: [orderLine(book, quantity)],
  });

  await page.reload();
  await expect(page).toHaveURL(confirmation);
  await expect(
    page.getByRole('heading', { name: 'Confirm quote' }),
  ).toBeVisible();
  await expect(page.getByText(book.title, { exact: true })).toBeVisible();
  expect(await read<Quote>(page.request, path)).toEqual(quote);
  return quoteId;
}

function placeButton(page: Page) {
  return page.getByRole('button', { name: 'Place order', exact: true });
}

async function place(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === submissions,
    ),
    placeButton(page).click(),
  ]);
  return response;
}

function accepted(response: Response) {
  expect([200, 202]).toContain(response.status());
  const location = response.headers().location;
  assert(
    location?.startsWith(submissions + '/'),
    'Missing submission Location',
  );
  const id = location.slice(submissions.length + 1);
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  return id;
}

async function receiptId(page: Page) {
  await expect(page).toHaveURL(/\/en\/orders\?placed=[a-f0-9-]+$/, settled);
  await expect(page.getByRole('main').getByRole('status')).toHaveText(
    'Order placed.',
  );
  return new URL(page.url()).searchParams.get('placed')!;
}

async function orderHistory(page: Page) {
  const { orders: history } = await read<{ orders: Order[] }>(
    page.request,
    orders,
  );
  return history;
}

async function mailAction(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  const inbox = 'http://localhost:8025/api/v1';
  const search =
    inbox + '/search?' + new URLSearchParams({ query: 'to:' + email });
  let messageId: string | undefined;
  await expect
    .poll(async () => {
      const { messages } = await read<{
        messages: { ID: string; Subject: string }[];
      }>(request, search);
      messageId = messages.find((message) => message.Subject === subject)?.ID;
      return messageId;
    }, settled)
    .toBeTruthy();
  const { Text } = await read<{ Text: string }>(
    request,
    inbox + '/message/' + messageId,
  );
  const link = Text.match(
    /https?:\/\/\S+\/login-actions\/action-token\?\S+/,
  )?.[0];
  assert(link, 'Missing Keycloak email action link');
  expect(new URL(link).origin).toBe(new URL(keycloak).origin);
  return link;
}

test('signs in with an email and returns to the filtered catalog', async ({
  page,
}) => {
  const destination = '/en/books?q=Bounded+Contexts';
  await page.goto(destination);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveTitle('Between Pages | Account');
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Create account' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Forgot password?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to bookstore' }),
  ).toHaveAttribute('href', 'http://localhost:3000/en/books');

  await page.getByLabel('Email or username').fill('reader-b@example.test');
  const password = page.locator('#password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await password.fill('reader-b-local');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(destination);
  await expect(
    page.getByRole('searchbox', { name: 'Search books' }),
  ).toHaveValue('Bounded Contexts');

  const account = nav.locator('summary').filter({ hasText: 'My account' });
  const ordersLink = nav.getByRole('link', { name: 'Orders', exact: true });
  await account.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(ordersLink).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  await expect(ordersLink).toHaveCount(0);
});

test('registers a reader and restores their cart and orders after a password reset', async ({
  page,
  request,
}) => {
  const username = 'reader-' + randomUUID();
  const email = username + '@example.test';
  const password = randomUUID() + '!a7';
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const cart = nav.getByRole('link', { name: 'Cart', exact: true });
  const orderList = nav.getByRole('link', { name: 'Orders', exact: true });
  const account = nav.locator('summary').filter({ hasText: 'My account' });
  const signInLink = nav.getByRole('link', { name: 'Sign in', exact: true });
  const detail = '/en/books/' + boundedContexts.id;

  await page.goto(detail);
  await expect(signInLink).toBeVisible();
  await expect(cart).toHaveCount(0);
  await expect(orderList).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(
    0,
  );
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Create account' })
    .click();
  await page.locator('#firstName').fill('New');
  await page.locator('#lastName').fill('Reader');
  await page.locator('#email').fill(email);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#password-confirm').fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();

  await page.goto(await mailAction(request, email, 'Verify email'));
  await expect(page).toHaveURL(detail);

  await expect(signInLink).toHaveCount(0);
  await expect(cart).toBeVisible();
  await account.click();
  await expect(orderList).toBeVisible();
  await account.click();
  await expect(await orderHistory(page)).toEqual([]);
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page).toHaveURL('/en/cart');
  await createQuote(page, boundedContexts, 1);
  accepted(await place(page));
  const orderId = await receiptId(page);

  await nav.getByRole('link', { name: 'Book catalog', exact: true }).click();
  await addBook(page, transactions);
  await account.click();
  await nav.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/en/books');
  await expect(signInLink).toBeVisible();
  await expect(cart).toHaveCount(0);
  await expect(orderList).toHaveCount(0);
  await page.goto('/en/cart');
  await expect(
    page.getByText('Sign in to view your saved cart.'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: transactions.title }),
  ).toHaveCount(0);
  await page.goto('/en/orders');
  await expect(
    page.getByText('Sign in to view your order history.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Order ' + orderId }),
  ).toHaveCount(0);
  for (const path of ['/api/v1/cart', orders, orders + '/' + orderId]) {
    expect((await page.request.get(path)).status()).toBe(401);
  }

  // Recover from a browser that does not remember the Keycloak account.
  await page.context().clearCookies();
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Sign in to continue' })
    .click();
  await expect(page.locator('#password')).toBeVisible();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();
  await page.locator('#username').fill(email);
  await page.locator('#kc-form-buttons').click();
  await page.goto(await mailAction(request, email, 'Reset password'));
  const newPassword = randomUUID() + '!a7';
  await page.locator('#password-new').fill(newPassword);
  await page.locator('#password-confirm').fill(newPassword);
  await page.locator('#kc-submit').click();
  await expect(page).toHaveURL('/en/orders');
  await expect(
    page.getByRole('heading', { name: 'Order ' + orderId }),
  ).toBeVisible();
  await cart.click();
  await expect(page).toHaveURL('/en/cart');
  await expect(
    page.getByRole('link', { name: transactions.title }),
  ).toBeVisible();
  await expect(quantityInput(page)).toHaveValue('1');
});

test('checks out through Keycloak and reloads the same order from storefront navigation', async ({
  page,
}) => {
  await expect(await page.request.get('/api/ready')).toBeOK();
  await signIn(page, 'reader-a');
  await addBook(page, boundedContexts);
  await createQuote(page, boundedContexts, 2);

  const beforeSubmit = Date.now();
  const submissionId = accepted(await place(page));
  const orderId = await receiptId(page);
  const submissionPath = submissions + '/' + submissionId;
  expect(await read<Submission>(page.request, submissionPath)).toMatchObject({
    state: 'PLACED',
    order: { orderId },
  });
  const orderPath = orders + '/' + orderId;
  const order = await read<Order>(page.request, orderPath);
  expect(order).toMatchObject({
    id: orderId,
    currency: 'CNY',
    totalMinor: 9800,
    lines: [orderLine(boundedContexts, 2)],
  });
  assert(
    order.createdAt,
    'A newly placed order must have a creation timestamp',
  );
  const createdAt = Date.parse(order.createdAt);
  expect(createdAt).toBeGreaterThanOrEqual(beforeSubmit - 1_000);
  expect(createdAt).toBeLessThanOrEqual(Date.now() + 1_000);

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.locator('summary').filter({ hasText: 'My account' }).click();
  await nav.getByRole('link', { name: 'Orders', exact: true }).click();
  await expect(page).toHaveURL('/en/orders');
  await page.reload();
  const receipt = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Order ' + orderId, exact: true }),
  });
  await expect(receipt).toHaveCount(1);
  await expect(
    receipt.getByRole('link', { name: boundedContexts.title, exact: true }),
  ).toBeVisible();
  await expect(
    receipt.getByText('2 × ' + money(4900), { exact: true }),
  ).toBeVisible();
  await expect(receipt.getByText(money(9800), { exact: true })).toBeVisible();
  await expect(receipt.locator('time')).toHaveAttribute(
    'datetime',
    order.createdAt,
  );
  await expect(receipt.locator('time')).toHaveText(
    placedDate.format(createdAt),
  );
  expect(await read<Order>(page.request, orderPath)).toEqual(order);
});

test('retries a lost submission response with the same quote and leaves one order and stock decrement', async ({
  page,
}) => {
  await signIn(page, 'reader-a');
  const stock = await readStock(page, transactions);
  const before = await orderHistory(page);
  await addBook(page, transactions);
  const quoteId = await createQuote(page, transactions, 1);

  const lostResponse = Promise.withResolvers<{
    key: string | undefined;
    quoteId: string;
    status: number;
    submissionId: string;
  }>();
  await page.route(
    '**' + submissions,
    async (route) => {
      // Let the real service accept the submission, then drop its browser response.
      const request = route.request();
      const response = await route.fetch();
      const body = await response.json();
      lostResponse.resolve({
        key: request.headers()['idempotency-key'],
        quoteId: request.postDataJSON().quoteId,
        status: response.status(),
        submissionId: body.submissionId,
      });
      await route.abort('failed');
    },
    { times: 1 },
  );
  await placeButton(page).click();
  const lost = await lostResponse.promise;
  expect(lost).toMatchObject({
    key: quoteId,
    quoteId,
    submissionId: expect.any(String),
  });
  expect([200, 202]).toContain(lost.status);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'The bookstore is temporarily unavailable. Try again.',
  );
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('quote') === quoteId,
  );
  await page.reload();

  const replay = await place(page);
  expect(replay.request().headers()['idempotency-key']).toBe(lost.key);
  expect(replay.request().postDataJSON()).toEqual({ quoteId });
  expect(accepted(replay)).toBe(lost.submissionId);
  const orderId = await receiptId(page);

  const previousIds = new Set(before.map((order) => order.id));
  const created = (await orderHistory(page)).filter(
    (order) => !previousIds.has(order.id),
  );
  expect(created).toMatchObject([
    { id: orderId, lines: [orderLine(transactions, 1)] },
  ]);
  await expect
    .poll(() => readStock(page, transactions), settled)
    .toBe(stock - 1);
  await page.getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();
});

test('one signed-in reader gets the last copy and the losing reader keeps their cart', async ({
  page,
  browser,
  baseURL,
}) => {
  const secondContext = await browser.newContext({ baseURL });
  try {
    const second = await secondContext.newPage();
    const readers = [page, second];
    await Promise.all([signIn(page, 'reader-a'), signIn(second, 'reader-b')]);
    expect(await readStock(page, lastCopy)).toBe(1);
    await Promise.all(readers.map((reader) => addBook(reader, lastCopy)));
    const quoteIds = await Promise.all(
      readers.map((reader) => createQuote(reader, lastCopy, 1)),
    );
    expect(quoteIds[0]).not.toBe(quoteIds[1]);

    const responses = await Promise.all(readers.map(place));
    const submissionIds = responses.map(accepted);
    const status = (i: number) =>
      read<Submission>(
        readers[i].request,
        submissions + '/' + submissionIds[i],
      );
    await expect
      .poll(
        async () =>
          (await Promise.all([status(0), status(1)]))
            .map((submission) => submission.state)
            .sort(),
        settled,
      )
      .toEqual(['PLACED', 'REJECTED']);

    const winner = (await status(0)).state === 'PLACED' ? 0 : 1;
    const loser = 1 - winner;
    const orderId = await receiptId(readers[winner]);
    expect(await status(winner)).toMatchObject({
      state: 'PLACED',
      order: { orderId },
    });
    expect(await status(loser)).toMatchObject({
      state: 'REJECTED',
      reason: 'INSUFFICIENT_STOCK',
    });
    await expect(
      readers[loser].getByRole('main').getByRole('alert'),
    ).toHaveText(
      'Stock has changed. Reduce the quantity and try again.',
      settled,
    );
    await readers[loser].reload();
    await expect(quantityInput(readers[loser])).toHaveValue('1');
    await expect(
      readers[loser].getByRole('link', { name: lastCopy.title, exact: true }),
    ).toBeVisible();
    expect(await read(readers[winner].request, '/api/v1/cart')).toEqual({
      groups: [],
    });
    await expect.poll(() => readStock(page, lastCopy), settled).toBe(0);

    for (const i of [0, 1]) {
      for (const path of [
        quotes + '/' + quoteIds[i],
        submissions + '/' + submissionIds[i],
      ]) {
        const foreign = await readers[1 - i].request.get(path);
        expect(foreign.status()).toBe(404);
      }
    }
    const orderPath = orders + '/' + orderId;
    expect((await readers[loser].request.get(orderPath)).status()).toBe(404);
    const ordered = await read<Order>(readers[winner].request, orderPath);
    expect(ordered).toMatchObject({
      id: orderId,
      currency: 'CNY',
      totalMinor: lastCopy.priceMinor,
      lines: [orderLine(lastCopy, 1)],
    });
    expect(await orderHistory(readers[loser])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: orderId })]),
    );

    assert(
      ordered.version !== undefined,
      'Missing version for fixture cleanup',
    );
    const cancellation = await readers[winner].request.put(
      orderPath + '/cancellation',
      {
        headers: { Origin: new URL(readers[winner].url()).origin },
        data: {
          reason: 'Restore the browser verification fixture',
          expectedVersion: ordered.version,
        },
      },
    );
    await expect(cancellation).toBeOK();
    expect(await cancellation.json()).toMatchObject({ orderId });
    await expect.poll(() => readStock(page, lastCopy), settled).toBe(1);

    await readers[loser]
      .getByRole('button', { name: 'Remove ' + lastCopy.title })
      .click();
    await expect(readers[loser].getByText('Your cart is empty.')).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
