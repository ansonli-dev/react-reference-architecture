import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { profiles } from '../../scripts/build-profiles.mjs';
import { emptyCatalogPorts } from '../support/java-catalog-stub.mjs';

test('prerenders both architecture overviews and serves them without a catalog', async ({
  request,
}, info) => {
  test.skip(info.project.name === 'dev');
  const profile = info.project.name === 'demo' ? 'demo' : 'release';
  const { distDir } = profiles[profile];
  const { routes } = JSON.parse(
    readFileSync(resolve(distDir, 'prerender-manifest.json'), 'utf8'),
  );
  const origin = 'http://127.0.0.1:' + emptyCatalogPorts[profile];

  for (const [locale, heading, description, responsibilities] of [
    [
      'en',
      'Modern React reference architecture',
      'The bookstore catalog shows how the browser',
      'Application responsibilities',
    ],
    [
      'zh-CN',
      '现代 React 应用参考架构',
      '在线书店的只读目录展示了浏览器',
      '各层职责',
    ],
  ]) {
    expect(routes['/' + locale]).toBeDefined();
    const shell = readFileSync(
      resolve(distDir, 'server/app', locale + '.html'),
      'utf8',
    );
    const response = await request.get(origin + '/' + locale);
    expect(response.status()).toBe(200);
    for (const html of [shell, await response.text()]) {
      expect(html).toContain('<html lang="' + locale + '"');
      expect(html).toContain('>' + heading + '</h1>');
      expect(html).toContain(description);
      expect(html).toContain('>' + responsibilities + '</h2>');
      expect(html).toContain('href="/' + locale + '/books"');
      expect(html).not.toMatch(/exercise|练习|walkthrough/i);
    }
  }
});

test('serves the correct profile from a live production server', async ({
  request,
}, info) => {
  test.skip(info.project.name === 'dev');
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);

  const home = await request.get('/en');
  expect(home.status()).toBe(200);
  const html = await home.text();
  if (info.project.name === 'demo') {
    expect(html).toContain('Demo mode');
  } else {
    expect(html).not.toContain('Demo mode');
    const entry = await request.post('/api/v1/session/demo', {
      data: { account: 'reader-a' },
      maxRedirects: 0,
    });
    expect(entry.status()).toBe(404);
    expect(entry.headers()['set-cookie']).toBeUndefined();
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
