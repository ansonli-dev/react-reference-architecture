import 'server-only';
import { z } from 'zod';
import {
  cartQuantityValue,
  currencySchema,
  maxCartTitles,
  orderStatusSchema,
  shopperIdSchema,
  submissionSchema,
  type OrderQuote,
  type StoreOrder,
} from '@/features/checkout/model';
import { ApiFailure } from '@/shared/api/error';
import type { components } from './generated/order-v2';
import { readJava, readJavaJson } from './http.server';

type JavaSchemas = components['schemas'];

const money = z.int().nonnegative();
const instant = z.iso.datetime({ offset: true });
const wireLine = z.object({
  bookId: z.uuid(),
  title: z.string().min(1),
  quantity: cartQuantityValue,
  unitPriceMinor: money,
}) satisfies z.ZodType<JavaSchemas['Line']>;
const line = wireLine.transform(({ unitPriceMinor, ...item }) => ({
  ...item,
  priceMinor: unitPriceMinor,
}));
const quote = z.object({
  quoteId: shopperIdSchema,
  expiresAt: instant,
  currency: z.literal('CNY'),
  totalMinor: money,
  lines: z.array(line).min(1).max(maxCartTitles),
});
const orderSummary = z.object({
  orderId: shopperIdSchema,
  status: orderStatusSchema,
  currency: currencySchema,
  totalMinor: money,
  createdAt: instant.nullable(),
});
const history = orderSummary.extend({ lines: z.array(line) });
const detail = history.extend({ version: money });
const list = z.object({
  orders: z.array(history),
  page: z.int().positive(),
  hasNext: z.boolean(),
});
const submission = z.discriminatedUnion('state', [
  submissionSchema.options[0].extend({
    order: orderSummary.extend({ createdAt: instant.nullable().optional() }),
  }),
  submissionSchema.options[1],
  submissionSchema.options[2],
  submissionSchema.options[3],
]);
const cancellation = z.object({
  orderId: shopperIdSchema,
  reason: z.string().min(1).max(200),
  cancelledAt: instant,
});

export type JavaSubmission = z.infer<typeof submission>;

function toOrder({
  orderId,
  ...order
}: z.infer<typeof history> & { version?: number }): StoreOrder {
  return { id: orderId, ...order };
}

const javaErrors = {
  INVALID_REQUEST: 'INVALID_INPUT',
  UNAUTHORIZED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
  NOT_FOUND: 'RESOURCE_NOT_FOUND',
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  QUOTE_CONSUMED: 'QUOTE_CONSUMED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  UNSUPPORTED_CURRENCY: 'UNSUPPORTED_CURRENCY',
  AMOUNT_OUT_OF_RANGE: 'AMOUNT_OUT_OF_RANGE',
  INTAKE_CLOSED: 'INTAKE_CLOSED',
  CATALOG_UNAVAILABLE: 'CATALOG_UNAVAILABLE',
  CATALOG_DATA_INVALID: 'UPSTREAM_FAILURE',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  ORDER_STATE_CONFLICT: 'ORDER_STATE_CONFLICT',
} as const satisfies Record<JavaSchemas['Error']['code'], ApiFailure['code']>;

async function orderError(response: Response): Promise<never> {
  const { status } = response;
  if (status === 401) {
    void response.body?.cancel().catch(() => undefined);
    throw new ApiFailure('UNAUTHENTICATED');
  }
  const result = z
    .object({ code: z.string() })
    .safeParse(await readJavaJson(response));
  if (result.success && Object.hasOwn(javaErrors, result.data.code))
    throw new ApiFailure(
      javaErrors[result.data.code as keyof typeof javaErrors],
    );
  throw new ApiFailure('UPSTREAM_FAILURE');
}

export function createJavaOrderV2(baseUrl: string, accessToken: string) {
  const api = baseUrl + '/api/v2/me';
  const auth = { Authorization: 'Bearer ' + accessToken };
  function read<T>(
    path: string,
    schema: z.ZodType<T>,
    statuses = [200],
    init?: RequestInit,
  ) {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', auth.Authorization);
    return readJava(api + path, schema, {
      statuses,
      init: { ...init, headers },
      onError: orderError,
    });
  }

  function write(
    method: 'POST' | 'PUT',
    body: object,
    key?: string,
  ): RequestInit {
    return {
      method,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(key && { 'Idempotency-Key': key }),
      },
    };
  }

  return {
    async createQuote(
      lines: JavaSchemas['QuoteRequest']['lines'],
    ): Promise<OrderQuote> {
      const { data } = await read(
        '/order-quotes',
        quote,
        [201],
        write('POST', { lines }),
      );
      return data;
    },
    async quote(id: string): Promise<OrderQuote> {
      const { data } = await read('/order-quotes/' + id, quote);
      if (data.quoteId !== id) throw new ApiFailure('UPSTREAM_FAILURE');
      return data;
    },
    async submit(quoteId: string, key: string) {
      const { data } = await read(
        '/order-submissions',
        submission,
        [200, 202],
        write('POST', { quoteId }, key),
      );
      return data;
    },
    async submission(id: string) {
      const { data } = await read('/order-submissions/' + id, submission);
      if (data.submissionId !== id) throw new ApiFailure('UPSTREAM_FAILURE');
      return data;
    },
    async orders(page: number) {
      const { data } = await read('/orders?include=lines&page=' + page, list);
      if (data.page !== page) throw new ApiFailure('UPSTREAM_FAILURE');
      return { ...data, orders: data.orders.map(toOrder) };
    },
    async order(id: string): Promise<StoreOrder> {
      const { data } = await read('/orders/' + id, detail);
      if (data.orderId !== id) throw new ApiFailure('UPSTREAM_FAILURE');
      return toOrder(data);
    },
    async cancellation(id: string) {
      const { data } = await read(
        '/orders/' + id + '/cancellation',
        cancellation,
      );
      if (data.orderId !== id) throw new ApiFailure('UPSTREAM_FAILURE');
      return data;
    },
    async cancel(
      id: string,
      input: components['requestBodies']['CancellationRequest']['content']['application/json'],
    ) {
      const result = await read(
        '/orders/' + id + '/cancellation',
        cancellation,
        [200, 201],
        write('PUT', input),
      );
      if (result.data.orderId !== id) throw new ApiFailure('UPSTREAM_FAILURE');
      return result;
    },
  };
}
