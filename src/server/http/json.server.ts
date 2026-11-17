import 'server-only';
import type { z } from 'zod';
import { ApiFailure } from '@/shared/api/error';

const maxBytes = 16 * 1024;

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (request.method === 'DELETE' && request.body === null) {
    return validate(undefined, schema);
  }

  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  ) {
    throw new ApiFailure('UNSUPPORTED_MEDIA_TYPE');
  }

  if (Number(request.headers.get('Content-Length')) > maxBytes) {
    void request.body?.cancel().catch(() => {});
    throw new ApiFailure('PAYLOAD_TOO_LARGE');
  }
  if (request.body === null) throw new ApiFailure('INVALID_INPUT');

  const buffer = new Uint8Array(maxBytes);
  const reader = request.body.getReader();
  let written = 0;
  let parsed: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (written + value.byteLength > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ApiFailure('PAYLOAD_TOO_LARGE');
      }
      buffer.set(value, written);
      written += value.byteLength;
    }
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        buffer.subarray(0, written),
      ),
    );
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('INVALID_INPUT');
  } finally {
    reader.releaseLock();
  }

  return validate(parsed, schema);
}

function validate<T>(input: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiFailure('INVALID_INPUT');
  return result.data;
}
