import 'server-only';
import { ApiFailure, type ApiError } from '@/shared/api/error';

export function apiErrorResponse(error: unknown) {
  const failure =
    error instanceof ApiFailure ? error : new ApiFailure('INTERNAL_ERROR');
  const body: ApiError = {
    error: { code: failure.code, requestId: crypto.randomUUID() },
  };
  return Response.json(body, {
    status: failure.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
