import 'server-only';
import { ApiFailure } from '@/shared/api/error';

export function assertMutationOrigin(
  requestHeaders: Pick<Headers, 'get'>,
  appOrigin: string,
): void {
  if (requestHeaders.get('Origin') !== appOrigin)
    throw new ApiFailure('FORBIDDEN');
}
