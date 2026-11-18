import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '@/app/api/health/route';
import { GET as ready } from '@/app/api/ready/route';
import { parseRuntimeEnv } from '@/server/config/runtime.server';

vi.mock('next/server', () => ({ connection: async () => {} }));

afterEach(() => vi.unstubAllEnvs());

const integratedEnv = {
  APP_ORIGIN: 'http://localhost:3000',
  JAVA_CONTRACT: 'v2-integrated',
  JAVA_CATALOG_BASE_URL: 'http://catalog:8080',
  JAVA_ORDER_BASE_URL: 'http://order:8080',
  AUTH_DATABASE_URL: 'postgresql://bookstore:local@postgres/bookstore',
  OIDC_ISSUER: 'http://localhost:8180/realms/bookstore',
  OIDC_CLIENT_SECRET: 'local-secret',
};

describe('runtime configuration', () => {
  it('allows release without Java and keeps liveness independent of readiness', async () => {
    vi.stubEnv('BOOKSTORE_BUILD_PROFILE', 'release');
    vi.stubEnv('JAVA_CATALOG_BASE_URL', undefined);
    vi.stubEnv('JAVA_CONTRACT', undefined);
    vi.stubEnv('CATALOG_CATEGORIES_JSON', undefined);
    vi.stubEnv('JAVA_CATALOG_TOKEN', undefined);
    vi.stubEnv('APP_ORIGIN', undefined);

    expect(
      parseRuntimeEnv({ DEMO_DATA_DIR: 'ignored' }, 'release'),
    ).toMatchObject({
      profile: 'release',
      javaContract: 'v1-catalog',
    });
    expect(health().status).toBe(200);
    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'unavailable',
      reason: 'CATALOG_NOT_CONFIGURED',
    });
  });

  it.each([
    'JAVA_CATALOG_BASE_URL',
    'JAVA_ORDER_BASE_URL',
    'OIDC_ISSUER',
    'OIDC_CLIENT_SECRET',
    'AUTH_DATABASE_URL',
  ])('fails closed when v2 is requested without %s', (missing) => {
    expect(() =>
      parseRuntimeEnv({ ...integratedEnv, [missing]: undefined }, 'release'),
    ).toThrow('Invalid runtime configuration');
  });

  it('supports a split loopback issuer and private realm in the local stack', () => {
    expect(
      parseRuntimeEnv(
        {
          ...integratedEnv,
          OIDC_INTERNAL_BASE_URL: 'http://keycloak:8080/realms/bookstore/',
        },
        'release',
      ),
    ).toMatchObject({
      profile: 'release',
      javaContract: 'v2-integrated',
      appOrigin: 'http://localhost:3000',
      javaCatalogBaseUrl: 'http://catalog:8080',
      javaOrderBaseUrl: 'http://order:8080',
      authDatabaseUrl: 'postgresql://bookstore:local@postgres/bookstore',
      oidcIssuer: 'http://localhost:8180/realms/bookstore',
      oidcInternalBaseUrl: 'http://keycloak:8080/realms/bookstore',
      oidcClientId: 'bookstore-bff',
      oidcClientSecret: 'local-secret',
    });
  });

  it('defaults the private realm to the HTTPS issuer', () => {
    const issuer = 'https://identity.example.test/realms/bookstore';
    expect(
      parseRuntimeEnv(
        {
          ...integratedEnv,
          APP_ORIGIN: 'https://books.example.test',
          OIDC_ISSUER: issuer,
        },
        'release',
      ),
    ).toMatchObject({ oidcIssuer: issuer, oidcInternalBaseUrl: issuer });
  });

  it.each([
    { APP_ORIGIN: 'http://books.example.test' },
    { OIDC_ISSUER: 'http://identity.example.test/realms/bookstore' },
    {
      APP_ORIGIN: 'https://books.example.test',
      OIDC_ISSUER: 'https://identity.example.test/realms/bookstore',
      OIDC_INTERNAL_BASE_URL: 'http://keycloak:8080/realms/bookstore',
    },
  ])('requires HTTPS outside the loopback setup %j', (overrides) =>
    expect(() =>
      parseRuntimeEnv({ ...integratedEnv, ...overrides }, 'release'),
    ).toThrow('Invalid runtime configuration'),
  );

  it.each(['https://books.example.test', 'http://127.0.0.1.evil.test'])(
    'rejects a non-loopback teaching origin %s',
    (APP_ORIGIN) =>
      expect(() => parseRuntimeEnv({ APP_ORIGIN }, 'demo')).toThrow(),
  );

  it.each([
    'https://books.example.test/store',
    'https://books.example.test?',
    'http://u:p@localhost',
    'file:///tmp',
  ])('rejects an invalid origin %s', (APP_ORIGIN) =>
    expect(() => parseRuntimeEnv({ APP_ORIGIN }, 'release')).toThrow(),
  );

  it.each(['relative', '/var/data/../secret', '/', '/tmp/books\0oops'])(
    'rejects an invalid teaching data directory %s',
    (DEMO_DATA_DIR) =>
      expect(() => parseRuntimeEnv({ DEMO_DATA_DIR }, 'demo')).toThrow(),
  );

  it('keeps unrelated configuration out of the teaching profile', () => {
    expect(
      parseRuntimeEnv(
        {
          DEMO_DATA_DIR: '/tmp/books',
          APP_ORIGIN: 'http://[::1]:3000',
          JAVA_CONTRACT: 'invalid',
        },
        'demo',
      ),
    ).toEqual({
      profile: 'demo',
      appOrigin: 'http://[::1]:3000',
      dataDir: '/tmp/books',
    });
  });
});
