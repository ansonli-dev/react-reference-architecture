import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '@/app/api/health/route';
import { GET as ready } from '@/app/api/ready/route';
import { parseRuntimeEnv } from '@/server/config/runtime.server';

vi.mock('next/server', () => ({ connection: async () => {} }));

afterEach(() => vi.unstubAllEnvs());

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

  it.each(['JAVA_CATALOG_BASE_URL', 'OIDC_ISSUER', 'AUTH_DATABASE_URL'])(
    'fails closed when v2 is requested without %s',
    (missing) => {
      const env: Record<string, string> = {
        JAVA_CONTRACT: 'v2-integrated',
        JAVA_CATALOG_BASE_URL: 'http://127.0.0.1:8081',
        OIDC_ISSUER: 'https://identity.example.test/realms/books',
        AUTH_DATABASE_URL: 'postgresql://localhost/books',
      };
      delete env[missing];
      expect(() => parseRuntimeEnv(env, 'release')).toThrow(
        'Invalid runtime configuration',
      );
    },
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
