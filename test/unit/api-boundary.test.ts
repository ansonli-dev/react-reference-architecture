import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readJson } from '@/server/http/json.server';
import { assertMutationOrigin } from '@/server/http/origin.server';
import { apiErrorResponse } from '@/server/http/response.server';
import { reportCatalogFailure } from '@/server/observability/catalog.server';
import { ApiFailure } from '@/shared/api/error';

const origin = 'https://books.example.test';
const schema = z.object({ title: z.string().min(1) });

function jsonRequest(body: BodyInit | null, contentType = 'application/json') {
  const init = {
    method: 'POST',
    body,
    headers: { 'Content-Type': contentType },
    duplex: 'half',
  };
  return new Request(origin, init);
}

describe('JSON boundary', () => {
  it('accepts application/json with a charset', async () => {
    await expect(
      readJson(
        jsonRequest('{"title":"React"}', 'application/json; charset=utf-8'),
        schema,
      ),
    ).resolves.toEqual({ title: 'React' });
  });

  it.each([null, '', '  ', 'not-json', '{"title":1}'])(
    'rejects invalid JSON input %j',
    async (body) => {
      await expect(readJson(jsonRequest(body), schema)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    },
  );

  it('rejects other media types', async () => {
    await expect(
      readJson(jsonRequest('{"title":"React"}', 'application/jsonp'), schema),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('caps bodies without Content-Length and cancels the oversized stream', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(9_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = jsonRequest(stream);
    expect(request.headers.has('content-length')).toBe(false);
    await expect(readJson(request, schema)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(cancelled).toBe(true);
  });

  it('allows a bodyless DELETE without requiring a JSON media type', async () => {
    await expect(
      readJson(new Request(origin, { method: 'DELETE' }), z.undefined()),
    ).resolves.toBeUndefined();
  });
});

describe('catalog failure records', () => {
  it.each([
    ['UPSTREAM_FAILURE', 502],
    ['UPSTREAM_TIMEOUT', 504],
  ] as const)('correlates and sanitizes %s', async (code, status) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failure = new ApiFailure(code);
      failure.message = 'jdbc:private; Bearer internal; https://private.test';
      const startedAt = performance.now();
      const response = apiErrorResponse(failure, (classified, requestId) =>
        reportCatalogFailure(
          'api.catalog.detail',
          classified,
          startedAt,
          requestId,
        ),
      );
      const { error } = await response.json();
      expect(response.status).toBe(status);
      expect(error).toEqual({ code, requestId: expect.any(String) });
      expect(log).toHaveBeenCalledTimes(1);
      const [line] = log.mock.calls[0];
      expect(JSON.parse(line)).toEqual({
        event: 'catalog.read_failed',
        entry: 'api.catalog.detail',
        requestId: error.requestId,
        code,
        status,
        durationMs: expect.any(Number),
      });
      expect(JSON.parse(line).durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      log.mockRestore();
    }
  });

  it('does not record 400 or 404 as availability failures', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const [code, status] of [
        ['INVALID_INPUT', 400],
        ['BOOK_NOT_FOUND', 404],
      ] as const) {
        const response = apiErrorResponse(
          new ApiFailure(code),
          (failure, requestId) =>
            reportCatalogFailure(
              'api.catalog.detail',
              failure,
              performance.now(),
              requestId,
            ),
        );
        expect(response.status).toBe(status);
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe('origin and errors', () => {
  it.each([undefined, 'null', 'https://other.example.test', origin + '/books'])(
    'rejects %s as a mutation origin',
    (value) => {
      const headers = new Headers(value ? { Origin: value } : {});
      expect(() => assertMutationOrigin(headers, origin)).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
    },
  );

  it('accepts the configured origin', () => {
    expect(() =>
      assertMutationOrigin(new Headers({ Origin: origin }), origin),
    ).not.toThrow();
  });

  it('uses a whitelisted code and does not expose error details', async () => {
    const observe = vi.fn();
    const response = apiErrorResponse(
      new Error('private-host.internal'),
      observe,
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', requestId: expect.any(String) },
    });
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR', status: 500 }),
      body.error.requestId,
    );
  });
});
