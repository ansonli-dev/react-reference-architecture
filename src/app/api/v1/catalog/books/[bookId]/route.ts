import { connection } from 'next/server';
import { parseBookId } from '@/features/catalog/model';
import { localeFromHeader } from '@/i18n/routing';
import { readBook } from '@/server/catalog.server';
import { apiErrorResponse, apiJson } from '@/server/http/response.server';
import { reportCatalogFailure } from '@/server/observability/catalog.server';
import { ApiFailure } from '@/shared/api/error';
import type { components } from '@/shared/api/generated/bff';

export async function GET(
  request: Request,
  { params }: RouteContext<'/api/v1/catalog/books/[bookId]'>,
) {
  await connection();
  const startedAt = performance.now();
  try {
    const bookId = parseBookId((await params).bookId);
    const locale = localeFromHeader(request.headers.get('Accept-Language'));
    const book: components['schemas']['Book'] | null = await readBook(
      locale,
      bookId,
    );
    if (!book) throw new ApiFailure('BOOK_NOT_FOUND');
    return apiJson(book);
  } catch (error) {
    return apiErrorResponse(error, (failure, requestId) =>
      reportCatalogFailure('api.catalog.detail', failure, startedAt, requestId),
    );
  }
}
