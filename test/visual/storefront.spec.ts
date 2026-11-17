import { expect, test } from '@playwright/test';
import { firstBookId } from '../support/catalog-scenario';

test('desktop architecture overview', async ({ page }) => {
  await page.goto('/zh-CN');
  await expect(page.getByRole('heading', { name: '目录练习' })).toBeVisible();
  await expect(page).toHaveScreenshot('overview-desktop.png');
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
