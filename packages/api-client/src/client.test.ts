import { afterEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient, ApiError } from './index.js';
afterEach(() => vi.unstubAllGlobals());
it.each([
  'https://example.com',
  'http://localhost:4310',
  'http://127.0.0.1:4310/path',
  'http://user@127.0.0.1:4310',
  'http://127.0.0.1:4310/?token=bad',
])('rejects non-loopback or credential-bearing address %s', (base) =>
  expect(() => createClient('test', base)).toThrow(),
);
it('authenticates requests, refuses redirects and validates success contracts', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', version: 1 }), {
      status: 200,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await createClient('test-only').health()).toEqual({
    status: 'ok',
    version: 1,
  });
  expect(fetcher).toHaveBeenCalledWith(
    'http://127.0.0.1:4310/api/v1/health',
    expect.objectContaining({
      redirect: 'error',
      credentials: 'omit',
      headers: { Authorization: 'Bearer test-only' },
    }),
  );
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', version: 2 })),
  );
  await expect(createClient('test-only').health()).rejects.toThrow();
});
it('preserves safe structured error request IDs', async () => {
  const requestId = randomUUID();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Local access token required.',
            requestId,
            correlationId: randomUUID(),
          },
        }),
        { status: 401 },
      ),
    ),
  );
  await expect(createClient('test-only').setup()).rejects.toMatchObject({
    status: 401,
    requestId,
  });
  expect(new ApiError('safe', 401)).toBeInstanceOf(Error);
});
