import 'server-only';
import { z } from 'zod';
import { demoDataDir } from '@/server/adapters/demo/data-path';

const origin = z
  .string()
  .regex(/^https?:\/\/[^\s\\/?#@]+\/?$/i)
  .pipe(z.url({ protocol: /^https?$/ }))
  .transform((value) => new URL(value).origin);

const appOrigin = origin.default('http://127.0.0.1:3000');

const demoEnv = z.object({
  APP_ORIGIN: appOrigin.refine((value) =>
    ['127.0.0.1', '[::1]', 'localhost'].includes(new URL(value).hostname),
  ),
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

const releaseEnv = z.object({
  APP_ORIGIN: appOrigin,
  JAVA_CONTRACT: z.enum(['v1-catalog', 'v2-integrated']).default('v1-catalog'),
  JAVA_CATALOG_BASE_URL: origin.optional(),
  JAVA_CATALOG_TOKEN: z
    .string()
    .regex(/^[!-~]+$/)
    .optional(),
  CATALOG_CATEGORIES_JSON: categories,
});

const v2Env = z.object({
  JAVA_CATALOG_BASE_URL: origin,
  OIDC_ISSUER: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }),
  AUTH_DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
});

export type Profile = 'demo' | 'release';
export type RuntimeConfig =
  | { profile: 'demo'; appOrigin: string; dataDir?: string }
  | {
      profile: 'release';
      appOrigin: string;
      javaContract: 'v1-catalog' | 'v2-integrated';
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

  const parsed = releaseEnv.safeParse(env);
  if (
    !parsed.success ||
    (parsed.data.JAVA_CONTRACT === 'v2-integrated' &&
      !v2Env.safeParse(env).success)
  ) {
    throw new Error('Invalid runtime configuration');
  }
  return {
    profile,
    appOrigin: parsed.data.APP_ORIGIN,
    javaContract: parsed.data.JAVA_CONTRACT,
    javaCatalogBaseUrl: parsed.data.JAVA_CATALOG_BASE_URL,
    javaCatalogToken: parsed.data.JAVA_CATALOG_TOKEN,
    catalogCategories: parsed.data.CATALOG_CATEGORIES_JSON,
  };
}

export function runtimeConfig(): RuntimeConfig {
  // Next replaces this direct access with the build's literal profile.
  const profile =
    process.env.BOOKSTORE_BUILD_PROFILE === 'demo' ? 'demo' : 'release';
  return parseRuntimeEnv(process.env, profile);
}
