import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finishJavaLogin,
  javaLoginHref,
  logoutJavaSession,
  startJavaLogin,
} from '@/server/auth.server';

const origin = 'http://localhost:3000';

function enableIntegratedProfile() {
  vi.stubEnv('BOOKSTORE_BUILD_PROFILE', 'release');
  vi.stubEnv('JAVA_CONTRACT', 'v2-integrated');
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

it('keeps the Keycloak entry point disabled in the v1 release', async () => {
  vi.stubEnv('BOOKSTORE_BUILD_PROFILE', 'release');
  vi.stubEnv('JAVA_CONTRACT', 'v1-catalog');
  const result = await startJavaLogin(
    new NextRequest(origin + '/api/auth/signin/keycloak'),
  );
  expect(result.status).toBe(404);
  expect(result.headers.has('set-cookie')).toBe(false);
});

it('rejects a callback without a browser-bound login attempt', async () => {
  enableIntegratedProfile();
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
    enableIntegratedProfile();
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
