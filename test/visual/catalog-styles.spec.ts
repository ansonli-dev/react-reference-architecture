import { expect, test, type Response } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 360, height: 800 },
]) {
  test(`the catalog loads styles and fits a ${viewport.width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const stylesheets: Response[] = [];
    const failed: string[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'stylesheet') {
        stylesheets.push(response);
      }
    });
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'stylesheet') failed.push(request.url());
    });

    await page.goto('/zh-CN/books');
    for (const stylesheet of stylesheets) {
      expect(stylesheet.status(), stylesheet.url()).toBe(200);
      expect(stylesheet.headers()['content-type'], stylesheet.url()).toMatch(
        /^text\/css(?:;|$)/i,
      );
    }
    expect(failed, 'Stylesheets that the browser could not load').toEqual([]);
    expect(
      stylesheets.length,
      'Stylesheets loaded by the browser',
    ).toBeGreaterThan(0);

    const grid = page.getByRole('article').first().locator('..');
    await expect(grid).toHaveCSS('display', 'grid');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBe(0);

    const nav = page.getByRole('navigation', { name: '主导航' });
    const controls = nav.locator('a, button');
    await expect(controls).not.toHaveCount(0);
    for (const item of await controls.all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
  });
}
