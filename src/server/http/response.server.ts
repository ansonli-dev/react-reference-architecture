import 'server-only';
import { ApiFailure, type ApiError } from '@/shared/api/error';

export function apiErrorResponse(
  error: unknown,
  observe?: (failure: ApiFailure, requestId: string) => void,
) {
  const failure =
    error instanceof ApiFailure ? error : new ApiFailure('INTERNAL_ERROR');
  const requestId = crypto.randomUUID();
  const body: ApiError = { error: { code: failure.code, requestId } };
  observe?.(failure, requestId);
  return apiJson(body, failure.status);
}

export function apiJson(data: unknown, status = 200, metadata?: HeadersInit) {
  const headers = new Headers(metadata);
  headers.set('Cache-Control', 'no-store');
  return Response.json(data, {
    status,
    headers,
  });
}
