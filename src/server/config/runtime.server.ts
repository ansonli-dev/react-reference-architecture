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

const categories = z
  .string()
  .transform((input, context): unknown => {
    try {
      return JSON.parse(input);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected a JSON array' });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z
          .string()
          .min(1)
          .max(80)
          .refine((value) => value === value.trim()),
      )
      .max(100)
      .refine((values) => new Set(values).size === values.length),
  )
  .default([]);

const v1Env = z.object({
  APP_ORIGIN: appOrigin,
  JAVA_CONTRACT: z.literal('v1-catalog').default('v1-catalog'),
  JAVA_CATALOG_BASE_URL: origin.optional(),
  JAVA_CATALOG_TOKEN: z
    .string()
    .regex(/^[!-~]+$/)
    .optional(),
  CATALOG_CATEGORIES_JSON: categories,
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

const v2Env = z
  .object({
    APP_ORIGIN: appOrigin,
    CATALOG_CATEGORIES_JSON: categories,
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
export type IntegratedConfig = {
  profile: 'release';
  javaContract: 'v2-integrated';
  appOrigin: string;
  javaCatalogBaseUrl: string;
  javaOrderBaseUrl: string;
  catalogCategories: string[];
  authDatabaseUrl: string;
  oidcIssuer: string;
  oidcInternalBaseUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
};

export type RuntimeConfig =
  | { profile: 'demo'; appOrigin: string; dataDir?: string }
  | IntegratedConfig
  | {
      profile: 'release';
      appOrigin: string;
      javaContract: 'v1-catalog';
      javaCatalogBaseUrl?: string;
      javaCatalogToken?: string;
      catalogCategories: string[];
    };

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

  if (env.JAVA_CONTRACT === 'v2-integrated') {
    const parsed = v2Env.safeParse(env);
    if (!parsed.success) throw new Error('Invalid runtime configuration');
    return {
      profile,
      appOrigin: parsed.data.APP_ORIGIN,
      javaContract: 'v2-integrated',
      javaCatalogBaseUrl: parsed.data.JAVA_CATALOG_BASE_URL,
      javaOrderBaseUrl: parsed.data.JAVA_ORDER_BASE_URL,
      catalogCategories: parsed.data.CATALOG_CATEGORIES_JSON,
      authDatabaseUrl: parsed.data.AUTH_DATABASE_URL,
      oidcIssuer: parsed.data.OIDC_ISSUER,
      oidcInternalBaseUrl:
        parsed.data.OIDC_INTERNAL_BASE_URL ?? parsed.data.OIDC_ISSUER,
      oidcClientId: parsed.data.OIDC_CLIENT_ID,
      oidcClientSecret: parsed.data.OIDC_CLIENT_SECRET,
    };
  }

  const parsed = v1Env.safeParse(env);
  if (!parsed.success) throw new Error('Invalid runtime configuration');
  return {
    profile,
    appOrigin: parsed.data.APP_ORIGIN,
    javaContract: parsed.data.JAVA_CONTRACT,
    javaCatalogBaseUrl: parsed.data.JAVA_CATALOG_BASE_URL,
    javaCatalogToken: parsed.data.JAVA_CATALOG_TOKEN,
    catalogCategories: parsed.data.CATALOG_CATEGORIES_JSON,
  };
}

// Read runtime switches only after calling connection() in a request.
export function integratedEnabled(): boolean {
  return (
    process.env.BOOKSTORE_BUILD_PROFILE !== 'demo' &&
    process.env.JAVA_CONTRACT === 'v2-integrated'
  );
}

export function checkoutEnabled(): boolean {
  return process.env.BOOKSTORE_BUILD_PROFILE === 'demo' || integratedEnabled();
}

export function runtimeConfig(): RuntimeConfig {
  // Next replaces this direct access with the build's literal profile.
  const profile =
    process.env.BOOKSTORE_BUILD_PROFILE === 'demo' ? 'demo' : 'release';
  return parseRuntimeEnv(process.env, profile);
}
