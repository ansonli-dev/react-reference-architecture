import 'server-only';
import type { ApiFailure } from '@/shared/api/error';

type CatalogEntry =
  | 'api.catalog.list'
  | 'api.catalog.detail'
  | 'page.catalog.list'
  | 'page.catalog.detail';

export function reportCatalogFailure(
  entry: CatalogEntry,
  failure: ApiFailure,
  startedAt: number,
  requestId: string = crypto.randomUUID(),
): void {
  if (failure.status < 500) return;
  console.error(
    JSON.stringify({
      event: 'catalog.read_failed',
      entry,
      requestId,
      code: failure.code,
      status: failure.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    }),
  );
}
