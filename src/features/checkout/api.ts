import { z } from 'zod';
import { apiClient } from '@/shared/api/client';
import {
  checkoutErrorCodes,
  checkoutNoticeSchema,
  shopperIdSchema,
  submissionSchema,
  type CheckoutNotice,
  type Currency,
} from './model';

const createdQuote = z.object({ quoteId: shopperIdSchema });
const errorPayload = z.object({
  error: z.object({ code: z.string(), requestId: z.unknown().optional() }),
});

export class CheckoutFailure extends Error {
  constructor(
    readonly notice: CheckoutNotice,
    readonly requestId?: string,
  ) {
    super(notice);
  }

  static fromPayload(payload: unknown) {
    const error = errorPayload.safeParse(payload).data?.error;
    const key = Object.entries(checkoutErrorCodes).find(
      ([, code]) => code === error?.code,
    )?.[0];
    const notice =
      key === 'precondition'
        ? 'changed'
        : checkoutNoticeSchema.safeParse(key).data;
    return new CheckoutFailure(
      notice ?? 'unavailable',
      z.uuid().safeParse(error?.requestId).data,
    );
  }
}

export function checkoutRequestOptions() {
  return { cache: 'no-store' as const, signal: AbortSignal.timeout(8000) };
}

async function readResult<T>(
  request: Promise<{ data?: unknown; error?: unknown; response: Response }>,
  schema: z.ZodType<T>,
) {
  const { data, error, response } = await request.catch(() => {
    throw new CheckoutFailure('unavailable');
  });
  if (!response.ok) throw CheckoutFailure.fromPayload(error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new CheckoutFailure('unavailable');
  return { data: parsed.data, location: response.headers.get('Location') };
}

export async function createQuote(currency: Currency, cartRevision: string) {
  const { data, location } = await readResult(
    apiClient.POST('/api/v1/order-quotes', {
      ...checkoutRequestOptions(),
      body: { currency, cartRevision },
    }),
    createdQuote,
  );
  if (location !== '/api/v1/order-quotes/' + data.quoteId)
    throw new CheckoutFailure('unavailable');
  return data.quoteId;
}

export async function submitQuote(quoteId: string) {
  // One submission per quote keeps the key stable across refreshes and manual retries.
  const { data, location } = await readResult(
    apiClient.POST('/api/v1/order-submissions', {
      ...checkoutRequestOptions(),
      params: { header: { 'Idempotency-Key': quoteId } },
      body: { quoteId },
    }),
    submissionSchema,
  );
  if (
    location !== null &&
    location !== '/api/v1/order-submissions/' + data.submissionId
  )
    throw new CheckoutFailure('unavailable');
  return data;
}

export async function getSubmission(submissionId: string) {
  const { data } = await readResult(
    apiClient.GET('/api/v1/order-submissions/{submissionId}', {
      ...checkoutRequestOptions(),
      params: { path: { submissionId } },
    }),
    submissionSchema,
  );
  if (data.submissionId !== submissionId)
    throw new CheckoutFailure('unavailable');
  return data;
}
