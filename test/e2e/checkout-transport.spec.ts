import { expect, test } from '@playwright/test';

const submissionId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const submissions = '/api/v1/order-submissions';

test.beforeEach(async ({ page, baseURL }, info) => {
  test.skip(!['demo', 'dev'].includes(info.project.name));
  const response = await page.request.put(
    '/api/v1/cart/items/00000000-0000-4000-8000-000000000104',
    {
      headers: { Origin: new URL(baseURL!).origin },
      data: { quantity: 1 },
    },
  );
  expect(response.status()).toBe(201);
  await page.goto('/en/cart');
});

for (const location of [null, '/api/v1/order-quotes/' + otherId]) {
  test(
    'rejects quote creation with ' +
      (location ? 'a mismatched Location' : 'no Location'),
    async ({ page }) => {
      await page.route('**/api/v1/order-quotes', (route) =>
        route.fulfill({
          status: 201,
          headers: location ? { Location: location } : {},
          json: { quoteId: submissionId },
        }),
      );
      await page.getByRole('button', { name: 'Review quote' }).click();
      await expect(page).toHaveURL('/en/cart?notice=unavailable');
    },
  );
}

for (const failure of [
  'malformed JSON',
  'wrong Location',
  'wrong status ID',
  'timeout',
]) {
  test(
    'preserves the quote after submission returns ' + failure,
    async ({ page }) => {
      await page.getByRole('button', { name: 'Review quote' }).click();
      await expect(page).toHaveURL(/\/en\/cart\?quote=[a-f0-9-]+$/);
      const quoteId = new URL(page.url()).searchParams.get('quote');
      await page.route('**' + submissions, (route) => {
        if (failure === 'timeout') return; // Leave the request pending until its signal aborts.
        if (failure === 'malformed JSON')
          return route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: '{',
          });
        if (failure === 'wrong Location')
          return route.fulfill({
            status: 201,
            headers: { Location: submissions + '/' + otherId },
            json: {
              submissionId,
              state: 'PLACED',
              order: { orderId: otherId },
            },
          });
        return route.fulfill({
          status: 202,
          json: { submissionId, state: 'PROCESSING' },
        });
      });
      if (failure === 'wrong status ID') {
        await page.route('**' + submissions + '/' + submissionId, (route) =>
          route.fulfill({
            json: {
              submissionId: otherId,
              state: 'PLACED',
              order: { orderId: otherId },
            },
          }),
        );
      }
      const observedRequest = page.waitForRequest(
        failure === 'wrong status ID'
          ? '**' + submissions + '/' + submissionId
          : '**' + submissions,
      );
      const started = Date.now();
      await page.getByRole('button', { name: 'Place demo order' }).click();
      await observedRequest;
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === '/en/cart' &&
          url.searchParams.get('quote') === quoteId &&
          url.searchParams.get('notice') === 'unavailable',
        { timeout: 14_000 },
      );
      if (failure === 'timeout')
        expect(Date.now() - started).toBeGreaterThanOrEqual(7900);
      await expect(
        page.getByRole('button', { name: 'Place demo order' }),
      ).toBeVisible();
    },
  );
}
