import 'server-only';
import { ApiFailure } from '@/shared/api/error';

export function assertMutationOrigin(
  requestHeaders: Headers,
  appOrigin: string,
): void {
  if (requestHeaders.get('Origin') !== appOrigin)
    throw new ApiFailure('FORBIDDEN');
}
