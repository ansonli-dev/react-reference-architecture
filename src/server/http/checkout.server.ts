import 'server-only';
import { connection } from 'next/server';
import {
  checkoutErrorCodes,
  shopperIdSchema,
  type CheckoutErrorNotice,
} from '@/features/checkout/model';
import { checkoutEnabled } from '../config/runtime.server';
import { ApiFailure } from '@/shared/api/error';
import { apiErrorResponse } from './response.server';

export async function checkoutResponse(run: () => Promise<Response>) {
  await connection();
  try {
    if (!checkoutEnabled()) throw new ApiFailure('RESOURCE_NOT_FOUND');
    return await run();
  } catch (error) {
    return apiErrorResponse(error);
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
