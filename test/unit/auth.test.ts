import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finishJavaLogin,
  javaLoginHref,
  logoutJavaSession,
  readJavaSession,
  startJavaLogin,
} from '@/server/auth.server';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

const origin = 'http://localhost:3000';

function configureRelease() {
  vi.stubEnv('BOOKSTORE_BUILD_PROFILE', 'release');
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('JAVA_CATALOG_BASE_URL', 'http://catalog:8081');
  vi.stubEnv('JAVA_ORDER_BASE_URL', 'http://order:8082');
  vi.stubEnv('AUTH_DATABASE_URL', 'postgresql://localhost/bookstore');
  vi.stubEnv('OIDC_ISSUER', 'http://localhost:8180/realms/bookstore');
  vi.stubEnv('OIDC_CLIENT_SECRET', 'local-secret');
}

afterEach(() => vi.unstubAllEnvs());

describe('Keycloak login links', () => {
  it.each([
    '/en/cart?limit=3#confirmation',
    '/zh-CN/books?q=boundary%20design',
  ])('preserves a localized return path %s', (path) => {
    const href = new URL(javaLoginHref(path), origin);
    expect(href.pathname).toBe('/api/auth/signin/keycloak');
    expect(href.searchParams.get('returnTo')).toBe(path);
  });

  it.each([
    'https://external.test/en/books',
    '//external.test/en/books',
    '/\\external.test/en/books',
    '/en/%2e%2e/api/auth/signin/keycloak',
  ])('replaces a return path outside the storefront %s', (path) => {
    const href = new URL(javaLoginHref(path), origin);
    expect(href.searchParams.get('returnTo')).toBe('/zh-CN/books');
  });
});

it('keeps the Keycloak entry point disabled in demo', async () => {
  vi.stubEnv('BOOKSTORE_BUILD_PROFILE', 'demo');
  const result = await startJavaLogin(
    new NextRequest(origin + '/api/auth/signin/keycloak'),
  );
  expect(result.status).toBe(404);
  expect(result.headers.has('set-cookie')).toBe(false);
});

it('renders an unconfigured release shell without a session', async () => {
  configureRelease();
  vi.stubEnv('OIDC_CLIENT_SECRET', undefined);
  await expect(readJavaSession()).resolves.toBeNull();
});

it('rejects a callback without a browser-bound login attempt', async () => {
  configureRelease();
  const result = await finishJavaLogin(
    new NextRequest(
      origin + '/api/auth/oauth2/callback/keycloak?code=code&state=state',
    ),
  );
  expect(result.status).toBe(400);
  expect(result.headers.has('set-cookie')).toBe(false);
});

it.each([undefined, 'http://external.test'])(
  'rejects POST logout from origin %s',
  async (requestOrigin) => {
    configureRelease();
    const result = await logoutJavaSession(
      new NextRequest(origin + '/api/auth/logout', {
        method: 'POST',
        headers: requestOrigin ? { Origin: requestOrigin } : {},
      }),
    );
    expect(result.status).toBe(403);
    expect(result.headers.has('set-cookie')).toBe(false);
  },
);
