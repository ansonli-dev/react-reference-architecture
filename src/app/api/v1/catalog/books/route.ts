import { connection } from 'next/server';
import { parseCatalogQuery } from '@/features/catalog/model';
import { localeFromHeader } from '@/i18n/routing';
import { readCatalog } from '@/server/catalog.server';
import { apiErrorResponse, apiJson } from '@/server/http/response.server';
import { reportCatalogFailure } from '@/server/observability/catalog.server';
import type { components } from '@/shared/api/generated/bff';

export async function GET(request: Request) {
  await connection();
  const startedAt = performance.now();
  try {
    const query = parseCatalogQuery(new URL(request.url).searchParams);
    const locale = localeFromHeader(request.headers.get('Accept-Language'));
    const result: components['schemas']['BookPage'] = await readCatalog(
      locale,
      query,
    );
    return apiJson(result);
  } catch (error) {
    return apiErrorResponse(error, (failure, requestId) =>
      reportCatalogFailure('api.catalog.list', failure, startedAt, requestId),
    );
  }
}
