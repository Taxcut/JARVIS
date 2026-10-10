import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import { IdentityStore } from './identity-store.js';
import { IdentityService } from './identity.js';
import { registerIdentity, securityStatus } from './identity-routes.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Environment } from '@jarvis/config';
import type { Database } from '@jarvis/database';
import {
  setupVerifySchema,
  healthSchema,
  readinessSchema,
  systemSchema,
  setupStatusSchema,
} from '@jarvis/protocol';
const origins = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
];
export async function createApp(
  config: Environment,
  database: Pick<Database, 'ready' | 'setup' | 'verifyCore'> &
    Partial<Pick<Database, 'pool'>>,
) {
  if (!database.pool && config.NODE_ENV !== 'test')
    throw new Error('Production identity persistence is required');
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    bodyLimit: 65536,
    requestTimeout: 10000,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.authorization',
              'req.body',
              'res.headers["set-cookie"]',
            ],
          },
  });
  const identity = database.pool
    ? new IdentityService(new IdentityStore(database.pool), config)
    : undefined;
  const allowedOrigins = [...origins, config.JARVIS_AUTH_ORIGIN];
  app.decorateRequest('correlationId', '');
  const fail = (
    req: { id: string; correlationId: string },
    code: string,
    message: string,
  ) => ({
    error: {
      code,
      message,
      requestId: req.id,
      correlationId: req.correlationId,
    },
  });
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-correlation-id'];
    req.correlationId =
      typeof incoming === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        incoming,
      )
        ? incoming
        : randomUUID();
    reply
      .header('x-request-id', req.id)
      .header('x-correlation-id', req.correlationId)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff');
  });
  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Correlation-ID',
      'X-Jarvis-Version',
      'X-Device-ID',
      'X-Session-ID',
      'X-Timestamp',
      'X-Nonce',
      'X-Signature',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Correlation-ID'],
    maxAge: 600,
  });
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin))
      return reply
        .code(403)
        .send(fail(req, 'ORIGIN_DENIED', 'Origin is not permitted.'));
    if (identity) return;
    if (req.method === 'GET' && req.url === '/api/v1/health') return;
    const provided = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.JARVIS_API_TOKEN}`);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    )
      return reply
        .code(401)
        .send(fail(req, 'UNAUTHORIZED', 'Local access token required.'));
  });
  app.setErrorHandler((err, req, reply) => {
    const security = securityStatus(err);
    const status =
      security?.status ??
      (err instanceof Error &&
      'statusCode' in err &&
      typeof err.statusCode === 'number' &&
      err.statusCode >= 400 &&
      err.statusCode < 500
        ? err.statusCode
        : 500);
    req.log.warn(
      { requestId: req.id, correlationId: req.correlationId, status },
      'Request failed',
    );
    reply
      .code(status)
      .send(
        fail(
          req,
          security?.code ??
            (status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST'),
          status === 500
            ? 'The request could not be completed.'
            : 'The request is invalid.',
        ),
      );
  });
  if (identity) await registerIdentity(app, identity);
  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send(fail(req, 'NOT_FOUND', 'Route not found.')),
  );
  app.get('/api/v1/health', async () =>
    healthSchema.parse({ status: 'ok', version: 1 }),
  );
  app.get('/api/v1/readiness', async (req, reply) => {
    try {
      await database.ready();
      return readinessSchema.parse({
        status: 'ready',
        database: 'ready',
        schema: 'current',
      });
    } catch {
      return reply
        .code(503)
        .send(
          fail(
            req,
            'DEPENDENCY_UNAVAILABLE',
            'Database or schema is not ready.',
          ),
        );
    }
  });
  app.get('/api/v1/system/version', async () =>
    systemSchema.parse({
      name: 'JARVIS Core',
      version: '0.1.0',
      protocolVersion: 1,
      phase: 4,
    }),
  );
  app.get('/api/v1/setup/status', async () =>
    setupStatusSchema.parse(await database.setup()),
  );
  app.post(
    '/api/v1/setup/core/verify',
    {
      schema: {
        body: { type: 'object', additionalProperties: false, maxProperties: 0 },
      },
    },
    async (req, reply) => {
      if (!setupVerifySchema.safeParse(req.body).success)
        return reply
          .code(400)
          .send(fail(req, 'INVALID_REQUEST', 'The request is invalid.'));
      try {
        await database.ready();
        await database.verifyCore({
          version: 1,
          id: randomUUID(),
          type: 'core.setup.verified',
          timestamp: new Date().toISOString(),
          actor: req.identity?.ownerId ?? 'local-bootstrap-operator',
          deviceId: req.identity?.deviceId ?? null,
          correlationId: req.correlationId,
          requestId: req.id,
          capability: null,
          outcome: 'succeeded',
          approvalId: null,
          metadata: {},
        });
        return setupStatusSchema.parse(await database.setup());
      } catch {
        return reply
          .code(503)
          .send(
            fail(
              req,
              'DEPENDENCY_UNAVAILABLE',
              'Core verification could not be persisted.',
            ),
          );
      }
    },
  );
  return app;
}
declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}
