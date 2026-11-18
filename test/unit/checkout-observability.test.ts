import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as readQuote } from '@/app/api/v1/order-quotes/[quoteId]/route';
import { POST as createQuote } from '@/app/api/v1/order-quotes/route';
import { GET as readSubmission } from '@/app/api/v1/order-submissions/[submissionId]/route';
import { POST as createSubmission } from '@/app/api/v1/order-submissions/route';
import { ApiFailure } from '@/shared/api/error';

vi.mock('next/server', () => ({ connection: async () => {} }));

const shop = vi.hoisted(() => ({
  createQuote: vi.fn(),
  quote: vi.fn(),
  submitQuote: vi.fn(),
  submission: vi.fn(),
}));
vi.mock('@/server/shop.server', () => ({
  readShop: async () => shop,
  mutateShop: async () => shop,
}));

const origin = 'https://books.example.test';
const quoteId = '14a5df76-519e-4cc2-a71b-d030794b2339';
const submissionId = '8cecd6f2-c476-4ac6-8f86-3e2c37eb5bd4';

afterEach(() => vi.restoreAllMocks());

describe('checkout failure records', () => {
  it.each([
    {
      operation: 'api.checkout.quote.create',
      dependency: shop.createQuote,
      code: 'UPSTREAM_FAILURE',
      status: 502,
      run: () =>
        createQuote(
          new Request(`${origin}/api/v1/order-quotes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currency: 'CNY',
              cartRevision: '0'.repeat(64),
            }),
          }),
        ),
    },
    {
      operation: 'api.checkout.quote.read',
      dependency: shop.quote,
      code: 'CATALOG_UNAVAILABLE',
      status: 503,
      run: () =>
        readQuote(new Request(`${origin}/api/v1/order-quotes/${quoteId}`), {
          params: Promise.resolve({ quoteId }),
        }),
    },
    {
      operation: 'api.checkout.submission.create',
      dependency: shop.submitQuote,
      code: 'INTAKE_CLOSED',
      status: 503,
      run: () =>
        createSubmission(
          new Request(`${origin}/api/v1/order-submissions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': quoteId,
            },
            body: JSON.stringify({ quoteId }),
          }),
        ),
    },
    {
      operation: 'api.checkout.submission.read',
      dependency: shop.submission,
      code: 'UPSTREAM_TIMEOUT',
      status: 504,
      run: () =>
        readSubmission(
          new Request(`${origin}/api/v1/order-submissions/${submissionId}`),
          { params: Promise.resolve({ submissionId }) },
        ),
    },
  ] as const)(
    'correlates and sanitizes $operation failures',
    async ({ operation, dependency, code, status, run }) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failure = new ApiFailure(code);
      failure.message = 'Bearer private-token at https://private.test';
      dependency.mockRejectedValueOnce(failure);

      const response = await run();
      const { error } = await response.json();

      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(error).toEqual({ code, requestId: expect.any(String) });
      expect(log).toHaveBeenCalledTimes(1);
      const record = JSON.parse(log.mock.calls[0][0]);
      expect(record).toEqual({
        event: 'checkout.request_failed',
        operation,
        requestId: error.requestId,
        code,
        status,
        durationMs: expect.any(Number),
      });
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
    },
  );

  it('keeps an unknown submission a quiet 404', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    shop.submission.mockResolvedValueOnce(null);

    const response = await readSubmission(
      new Request(`${origin}/api/v1/order-submissions/${submissionId}`),
      { params: Promise.resolve({ submissionId }) },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'RESOURCE_NOT_FOUND', requestId: expect.any(String) },
    });
    expect(log).not.toHaveBeenCalled();
  });
});
