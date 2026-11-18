import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { emptyCatalogPorts } from '../support/java-catalog-stub.mjs';

test('redirects both store entrances to localized lists even without a catalog', async ({
  request,
}, info) => {
  test.skip(info.project.name === 'dev');
  const profile = info.project.name === 'demo' ? 'demo' : 'release';
  const origin = 'http://127.0.0.1:' + emptyCatalogPorts[profile];

  for (const [locale, heading] of [
    ['en', 'Book catalog'],
    ['zh-CN', '书籍目录'],
  ]) {
    const entry = await request.get(origin + '/' + locale, { maxRedirects: 0 });
    expect(entry.status()).toBe(307);
    expect(entry.headers().location).toMatch(
      new RegExp('/' + locale + '/books$'),
    );
    const response = await request.get(origin + '/' + locale);
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe('/' + locale + '/books');
    const html = await response.text();
    expect(html).toContain('<html lang="' + locale + '"');
    expect(html).toContain('>' + heading + '</h1>');
    expect(html).toContain('href="/' + locale + '/books"');
  }
});

test('serves the correct profile from a live production server', async ({
  request,
}, info) => {
  test.skip(info.project.name === 'dev');
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);

  const list = await request.get('/en/books');
  expect(list.status()).toBe(200);
  const html = await list.text();

  if (info.project.name === 'release') {
    expect(html).toContain('href="/api/auth/signin/keycloak?');
    expect(html).not.toContain('href="/api/auth/register/keycloak?');
    expect(html).not.toContain('href="/en/cart"');
    expect(html).not.toContain('href="/en/orders"');
    for (const [path, prompt] of [
      ['/en/cart', 'Sign in to view your saved cart.'],
      ['/en/orders', 'Sign in to view your order history.'],
    ]) {
      const page = await request.get(path);
      expect(page.status()).toBe(200);
      const checkout = await page.text();
      expect(checkout).toContain(prompt);
      expect(checkout).toContain(
        'href="/api/auth/register/keycloak?returnTo=' +
          encodeURIComponent(path) +
          '"',
      );
    }
    for (const path of ['/api/v1/cart', '/api/v1/orders']) {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: 'UNAUTHENTICATED' },
      });
    }
    const entry = await request.post('/api/v1/session/demo', {
      data: { account: 'reader-a' },
      maxRedirects: 0,
    });
    expect(entry.status()).toBe(404);
    expect(entry.headers()['set-cookie']).toBeUndefined();
  } else {
    expect(html).toContain('href="/en/cart"');
    expect(html).toContain('href="/en/orders"');
    expect(html).not.toContain('href="/api/auth/register/keycloak?');
  }
});

test('rejects a release artifact placed in the demo slot', async ({}, info) => {
  test.skip(info.project.name !== 'demo');
  const cwd = mkdtempSync(resolve(tmpdir(), 'bookstore-wrong-build-'));
  try {
    symlinkSync(resolve('.next'), resolve(cwd, '.next-demo'), 'junction');
    const result = spawnSync(
      process.execPath,
      [resolve('test/support/run-built-app.mjs'), 'demo', '3219'],
      { cwd, encoding: 'utf8', timeout: 5000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected a demo build');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
