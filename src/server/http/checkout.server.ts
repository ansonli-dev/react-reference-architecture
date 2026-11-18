import 'server-only';
import { connection } from 'next/server';
import {
  checkoutErrorCodes,
  shopperIdSchema,
  type CheckoutErrorNotice,
} from '@/features/checkout/model';
import { ApiFailure } from '@/shared/api/error';
import { apiErrorResponse } from './response.server';

type CheckoutOperation =
  | 'api.checkout.quote.create'
  | 'api.checkout.quote.read'
  | 'api.checkout.submission.create'
  | 'api.checkout.submission.read';

export async function checkoutResponse(
  run: () => Promise<Response>,
  operation?: CheckoutOperation,
) {
  await connection();
  const startedAt = performance.now();
  try {
    return await run();
  } catch (error) {
    return apiErrorResponse(error, (failure, requestId) => {
      if (!operation || failure.status < 500) return;
      console.error(
        JSON.stringify({
          event: 'checkout.request_failed',
          operation,
          requestId,
          code: failure.code,
          status: failure.status,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        }),
      );
    });
  }
}

export function checkoutResult<T>(
  result: T | { error: CheckoutErrorNotice },
): T {
  if (result && typeof result === 'object' && 'error' in result)
    throw new ApiFailure(
      checkoutErrorCodes[result.error as CheckoutErrorNotice],
    );
  return result;
}

export function parseResourceId(value: unknown) {
  const id = shopperIdSchema.safeParse(value);
  if (!id.success) throw new ApiFailure('INVALID_INPUT');
  return id.data.toLowerCase();
}

export function requireResource<T>(resource: T | null | undefined): T {
  if (resource == null) throw new ApiFailure('RESOURCE_NOT_FOUND');
  return resource;
}
