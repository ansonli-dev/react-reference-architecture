import 'server-only';
import { createHash } from 'node:crypto';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';
import type { CatalogQuery } from '@/features/catalog/model';
import type { CatalogPort } from '@/features/catalog/server';
import type { Locale } from '@/i18n/routing';
import { ApiFailure } from '@/shared/api/error';
import { createJavaCatalogV1 } from './adapters/java/catalog-v1.server';
import { runtimeConfig, type RuntimeConfig } from './config/runtime.server';

type CatalogSource =
  | { profile: 'demo'; dataDir: string }
  | {
      profile: 'release';
      baseUrl: string;
      categories: string[];
      token?: string;
    };

export const supportsCatalogSearch =
  process.env.BOOKSTORE_BUILD_PROFILE === 'demo';

function sourceFor(config: RuntimeConfig): CatalogSource | null {
  if (supportsCatalogSearch && config.profile === 'demo' && config.dataDir) {
    return { profile: 'demo', dataDir: config.dataDir };
  }
  if (
    config.profile === 'release' &&
    config.javaContract === 'v1-catalog' &&
    config.javaCatalogBaseUrl
  ) {
    return {
      profile: 'release',
      baseUrl: config.javaCatalogBaseUrl,
      categories: config.catalogCategories,
      token: config.javaCatalogToken,
    };
  }
  return null;
}

function requireSource() {
  try {
    const source = sourceFor(runtimeConfig());
    if (source) return source;
  } catch {
    // Configuration details stay in the deployment environment.
  }
  throw new ApiFailure('CATALOG_UNAVAILABLE');
}

async function catalogPort(source: CatalogSource): Promise<CatalogPort> {
  if (source.profile === 'release') return createJavaCatalogV1(source);
  if (process.env.BOOKSTORE_BUILD_PROFILE === 'demo') {
    const { createDemoCatalog } =
      await import('./adapters/demo/catalog.server');
    const { createDemoDb } = await import('./adapters/demo/db.server');
    return createDemoCatalog(createDemoDb(source.dataDir));
  }
  throw new ApiFailure('CATALOG_UNAVAILABLE');
}

function cacheScope(source: CatalogSource, locale: Locale) {
  const address = source.profile === 'demo' ? source.dataDir : source.baseUrl;
  return {
    profile: source.profile,
    contract: source.profile === 'demo' ? 'demo-v1' : 'v1-catalog',
    dataset: createHash('sha256').update(address).digest('hex'),
    locale,
  };
}

type Scope = ReturnType<typeof cacheScope>;

const listsTag = 'catalog:lists';
const bookTag = (id: string) => 'catalog:book:' + id;

export function expireCatalogStock(bookIds: string[]) {
  if (!bookIds.length) return;
  revalidateTag(listsTag, { expire: 0 });
  for (const id of bookIds) revalidateTag(bookTag(id), { expire: 0 });
}

const cacheFailurePrefix = 'bookstore:catalog:';
const cacheFailureCodes = [
  'CATALOG_UNAVAILABLE',
  'UPSTREAM_FAILURE',
  'UPSTREAM_TIMEOUT',
] as const;

async function cacheRead<T>(
  read: (port: CatalogPort) => Promise<T>,
): Promise<T> {
  try {
    return await read(await catalogPort(requireSource()));
  } catch (error) {
    if (error instanceof ApiFailure) {
      // React Flight preserves the digest across the cache boundary.
      Object.assign(error, { digest: cacheFailurePrefix + error.code });
    }
    throw error;
  }
}

function restoreCacheError(error: unknown): never {
  if (error instanceof Error && 'digest' in error) {
    const code = cacheFailureCodes.find(
      (code) => error.digest === cacheFailurePrefix + code,
    );
    if (code) throw new ApiFailure(code);
  }
  throw error;
}

async function cachedList(key: { scope: Scope; query: CatalogQuery }) {
  'use cache';
  cacheLife({ stale: 0, revalidate: 60, expire: 300 });
  cacheTag(listsTag);
  return cacheRead((port) => port.list(key.query));
}

async function cachedBook(key: { scope: Scope; bookId: string }) {
  'use cache';
  cacheLife({ stale: 0, revalidate: 60, expire: 300 });
  cacheTag(bookTag(key.bookId));
  return cacheRead((port) => port.get(key.bookId));
}

async function categoriesFor(source: CatalogSource) {
  if (source.profile === 'release') return source.categories;
  return (await catalogPort(source)).categories();
}

export async function readCatalogCategories() {
  return categoriesFor(requireSource());
}

export async function readCatalog(locale: Locale, query: CatalogQuery) {
  if (query.q && !supportsCatalogSearch)
    throw new ApiFailure('UNSUPPORTED_FILTER');
  const source = requireSource();
  if (
    !query.q &&
    query.page <= 10 &&
    (!query.category || (await categoriesFor(source)).includes(query.category))
  ) {
    return cachedList({ scope: cacheScope(source, locale), query }).catch(
      restoreCacheError,
    );
  }
  return (await catalogPort(source)).list(query);
}

export async function readBook(locale: Locale, bookId: string) {
  const source = requireSource();
  return cachedBook({ scope: cacheScope(source, locale), bookId }).catch(
    restoreCacheError,
  );
}

export async function probeCatalog() {
  let config: RuntimeConfig;
  try {
    config = runtimeConfig();
  } catch {
    return 'CONFIG_INVALID';
  }
  const source = sourceFor(config);
  if (!source) return 'CATALOG_NOT_CONFIGURED';

  try {
    await (await catalogPort(source)).list({ page: 1 });
    return null;
  } catch {
    return 'CATALOG_UNAVAILABLE';
  }
}
