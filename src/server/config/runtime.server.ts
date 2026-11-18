import 'server-only';
import { z } from 'zod';
import { demoDataDir } from '@/server/adapters/demo/data-path';

const origin = z
  .string()
  .regex(/^https?:\/\/[^\s\\/?#@]+\/?$/i)
  .pipe(z.url({ protocol: /^https?$/ }))
  .transform((value) => new URL(value).origin);

const appOrigin = origin.default('http://127.0.0.1:3000');

function isLoopback(value: string): boolean {
  return ['127.0.0.1', '[::1]', 'localhost'].includes(new URL(value).hostname);
}

const demoEnv = z.object({
  APP_ORIGIN: appOrigin.refine(isLoopback),
  DEMO_DATA_DIR: demoDataDir.optional(),
});

const realmUrl = z
  .string()
  .regex(/^https?:\/\/[^\s\\?#]+$/)
  .pipe(z.url({ protocol: /^https?$/ }))
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  })
  .transform((value) => new URL(value).href.replace(/\/$/, ''));

const releaseEnv = z
  .object({
    APP_ORIGIN: appOrigin,
    JAVA_CATALOG_BASE_URL: origin,
    JAVA_ORDER_BASE_URL: origin,
    AUTH_DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    OIDC_ISSUER: realmUrl,
    OIDC_INTERNAL_BASE_URL: realmUrl.optional(),
    OIDC_CLIENT_ID: z.string().trim().min(1).default('bookstore-bff'),
    OIDC_CLIENT_SECRET: z.string().regex(/^[!-~]+$/),
  })
  .refine((env) => {
    const originIsSecure = env.APP_ORIGIN.startsWith('https:');
    const issuerIsSecure = env.OIDC_ISSUER.startsWith('https:');
    if (
      (!originIsSecure && !isLoopback(env.APP_ORIGIN)) ||
      (!issuerIsSecure && !isLoopback(env.OIDC_ISSUER))
    )
      return false;

    const privateRealm = env.OIDC_INTERNAL_BASE_URL ?? env.OIDC_ISSUER;
    return (
      privateRealm.startsWith('https:') || (!originIsSecure && !issuerIsSecure)
    );
  });

export type Profile = 'demo' | 'release';
export type ReleaseConfig = {
  profile: 'release';
  appOrigin: string;
  javaCatalogBaseUrl: string;
  javaOrderBaseUrl: string;
  authDatabaseUrl: string;
  oidcIssuer: string;
  oidcInternalBaseUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
};

export type RuntimeConfig =
  { profile: 'demo'; appOrigin: string; dataDir?: string } | ReleaseConfig;

export function parseRuntimeEnv(
  env: Readonly<Record<string, string | undefined>>,
  profile: Profile,
): RuntimeConfig {
  if (profile === 'demo') {
    const parsed = demoEnv.safeParse(env);
    if (!parsed.success) throw new Error('Invalid runtime configuration');
    return {
      profile,
      appOrigin: parsed.data.APP_ORIGIN,
      dataDir: parsed.data.DEMO_DATA_DIR,
    };
  }

  const parsed = releaseEnv.safeParse(env);
  if (!parsed.success) throw new Error('Invalid runtime configuration');
  return {
    profile,
    appOrigin: parsed.data.APP_ORIGIN,
    javaCatalogBaseUrl: parsed.data.JAVA_CATALOG_BASE_URL,
    javaOrderBaseUrl: parsed.data.JAVA_ORDER_BASE_URL,
    authDatabaseUrl: parsed.data.AUTH_DATABASE_URL,
    oidcIssuer: parsed.data.OIDC_ISSUER,
    oidcInternalBaseUrl:
      parsed.data.OIDC_INTERNAL_BASE_URL ?? parsed.data.OIDC_ISSUER,
    oidcClientId: parsed.data.OIDC_CLIENT_ID,
    oidcClientSecret: parsed.data.OIDC_CLIENT_SECRET,
  };
}

export function runtimeConfig(): RuntimeConfig {
  // Next replaces this direct access with the build's literal profile.
  const profile =
    process.env.BOOKSTORE_BUILD_PROFILE === 'demo' ? 'demo' : 'release';
  return parseRuntimeEnv(process.env, profile);
}
