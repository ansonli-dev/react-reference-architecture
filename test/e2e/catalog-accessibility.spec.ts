import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`the catalog passes axe checks in the ${theme} theme`, async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'dev');
    await page.goto('/zh-CN/books');
    await expect(
      page.getByRole('main').getByRole('article').first(),
    ).toBeVisible();

    if (theme === 'dark') {
      await page.getByRole('button', { name: '切换深色主题' }).click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    // The theme attribute changes before its color transitions finish.
    await page.evaluate(async () => {
      const transitions = document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition);
      await Promise.allSettled(
        transitions.map((animation) => animation.finished),
      );
    });

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(violations).toEqual([]);
  });
}
