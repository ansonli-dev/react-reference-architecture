import 'server-only';
import type { z } from 'zod';
import { ApiFailure } from '@/shared/api/error';

const maxBodyBytes = 256 * 1024;

export async function readJavaJson(response: Response): Promise<unknown> {
  const { body } = response;
  const mediaType = response.headers.get('content-type')?.split(';')[0].trim();
  if (!body || mediaType?.toLowerCase() !== 'application/json') {
    void body?.cancel().catch(() => undefined);
    throw new ApiFailure('UPSTREAM_FAILURE');
  }
  const bytes = new Uint8Array(maxBodyBytes);
  const reader = body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > maxBodyBytes)
        throw new ApiFailure('UPSTREAM_FAILURE');
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)),
  );
}

export async function readJava<T>(
  url: string,
  schema: z.ZodType<T>,
  {
    init,
    statuses = [200],
    onError,
  }: {
    init?: RequestInit;
    statuses?: number[];
    onError?: (response: Response) => Promise<never>;
  } = {},
) {
  const signal = AbortSignal.timeout(2_000);
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  try {
    const response = await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    if (!statuses.includes(response.status)) {
      if (onError) return await onError(response);
      void response.body?.cancel().catch(() => undefined);
      throw new ApiFailure(
        response.status === 404 ? 'BOOK_NOT_FOUND' : 'UPSTREAM_FAILURE',
      );
    }
    const data = schema.parse(await readJavaJson(response));
    signal.throwIfAborted();
    return { data, status: response.status };
  } catch (error) {
    if (signal.aborted) throw new ApiFailure('UPSTREAM_TIMEOUT');
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('UPSTREAM_FAILURE');
  }
}
