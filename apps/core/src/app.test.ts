import { afterEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { parseEnvironment } from '@jarvis/config';
import { createApp } from './app.js';
const config = parseEnvironment({
  DATABASE_URL: 'postgresql://localhost/test',
  JARVIS_API_TOKEN: 'a'.repeat(64),
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
});
const headers = { authorization: `Bearer ${config.JARVIS_API_TOKEN}` };
const setup = {
  configured: false,
  core: 'not_configured',
  owner: 'not_implemented',
  deviceEnrollment: 'not_implemented',
  voice: 'device_setup_required',
  phoneLink: 'not_implemented',
  security: 'setup_required',
  systemTest: 'not_implemented',
} as const;
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function make() {
  const db = {
    ready: vi.fn(async () => {}),
    setup: vi.fn(async () => setup),
    verifyCore: vi.fn(async () => {}),
  };
  const app = await createApp(config, db);
  apps.push(app);
  return { app, db };
}
it('liveness does not pretend dependency readiness', async () => {
  const { app, db } = await make();
  db.ready.mockRejectedValue(new Error('password=must-not-leak'));
  expect((await app.inject('/api/v1/health')).json()).toEqual({
    status: 'ok',
    version: 1,
  });
  const response = await app.inject({ url: '/api/v1/readiness', headers });
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain('must-not-leak');
  expect(response.json().error.code).toBe('DEPENDENCY_UNAVAILABLE');
});
it('requires bootstrap authorization and rejects arbitrary web origins', async () => {
  const { app } = await make();
  expect((await app.inject('/api/v1/setup/status')).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        url: '/api/v1/setup/status',
        headers: { ...headers, origin: 'https://evil.example' },
      })
    ).statusCode,
  ).toBe(403);
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/setup/status',
    headers: {
      origin: 'http://127.0.0.1:1420',
      'access-control-request-method': 'GET',
    },
  });
  expect(preflight.statusCode).toBe(204);
  expect(preflight.headers['access-control-allow-origin']).toBe(
    'http://127.0.0.1:1420',
  );
});
it('returns authentic initial setup, version and successful readiness', async () => {
  const { app } = await make();
  expect(
    (await app.inject({ url: '/api/v1/setup/status', headers })).json(),
  ).toEqual(setup);
  expect(
    (await app.inject({ url: '/api/v1/readiness', headers })).statusCode,
  ).toBe(200);
  expect(
    (await app.inject({ url: '/api/v1/system/version', headers })).json(),
  ).toMatchObject({ protocolVersion: 1, phase: 4 });
});
it('generates request IDs, propagates valid correlation, and gives structured errors', async () => {
  const { app } = await make();
  const correlation = randomUUID();
  const response = await app.inject({
    url: '/api/v1/missing',
    headers: {
      ...headers,
      'x-request-id': 'untrusted',
      'x-correlation-id': correlation,
    },
  });
  expect(response.statusCode).toBe(404);
  expect(response.json().error).toMatchObject({
    correlationId: correlation,
    requestId: response.headers['x-request-id'],
    code: 'NOT_FOUND',
  });
  expect(response.headers['x-request-id']).not.toBe('untrusted');
});
it('persists only real core verification and rejects invented setup fields', async () => {
  const { app, db } = await make();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/setup/core/verify',
    headers,
    payload: {},
  });
  expect(response.statusCode).toBe(200);
  expect(db.verifyCore).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'core.setup.verified',
      outcome: 'succeeded',
      requestId: response.headers['x-request-id'],
    }),
  );
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/v1/setup/core/verify',
    headers,
    payload: { configured: true },
  });
  expect(invalid.statusCode).toBe(400);
  expect(db.verifyCore).toHaveBeenCalledTimes(1);
});
