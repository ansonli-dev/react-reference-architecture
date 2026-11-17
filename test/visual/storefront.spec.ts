import { expect, test } from '@playwright/test';
import { firstBookId } from '../support/catalog-scenario';

test('desktop bookstore catalog from the store entrance', async ({ page }) => {
  await page.goto('/zh-CN');
  await expect(page).toHaveURL('/zh-CN/books');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: '书籍目录' })).toBeVisible();
  await expect(main.getByRole('article')).toHaveCount(12);
  await expect(page).toHaveScreenshot('catalog-all-desktop.png');
});

for (const layout of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 360, height: 800 },
]) {
  test(`${layout.name} filtered catalog`, async ({ page }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto('/zh-CN/books?category=Architecture');
    await expect(page.getByRole('article')).toHaveCount(7);
    await expect(page.getByLabel('分类')).toHaveValue('Architecture');
    await expect(page).toHaveScreenshot(`catalog-${layout.name}.png`);
  });
}

test('desktop book detail in dark mode', async ({ page }) => {
  await page.goto('/en/books/' + firstBookId);
  await expect(
    page.getByRole('heading', { name: 'React 应用架构' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Toggle dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('detail-dark.png');
});

test('desktop cart and order history', async ({ page }) => {
  await page.goto('/zh-CN/books/' + firstBookId);
  await page.getByRole('button', { name: '加入购物车' }).click();
  await expect(page).toHaveURL('/zh-CN/cart');
  await expect(page.getByRole('heading', { name: '订单摘要' })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('cart-desktop.png');

  await page.getByRole('button', { name: '核对报价' }).click();
  await expect(page.getByRole('heading', { name: '确认报价' })).toBeVisible();
  await page.getByRole('button', { name: '演示下单' }).click();
  await expect(page.getByRole('status')).toHaveText('下单成功。');
  const orderId = page.getByRole('heading', { name: /^订单 [a-f0-9-]+$/ });
  await expect(orderId).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('orders-desktop.png', {
    mask: [orderId, page.locator('time')],
    maskColor: '#ececf8',
  });
});
