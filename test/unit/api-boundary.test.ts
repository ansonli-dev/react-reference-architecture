import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readJson } from '@/server/http/json.server';
import { assertMutationOrigin } from '@/server/http/origin.server';
import { apiErrorResponse } from '@/server/http/response.server';

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
    const response = apiErrorResponse(new Error('private-host.internal'));
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', requestId: expect.any(String) },
    });
  });
});
