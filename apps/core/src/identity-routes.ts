import { registerRuntime } from './runtime.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  signedHeadersSchema,
  ceremonyProofSchema,
  ceremonySecretSchema,
  credentialResponseSchema,
  pairingPrepareSchema,
} from '@jarvis/protocol';
import { digest } from '@jarvis/security/signing';
import { IdentityService } from './identity.js';
import {
  SecurityError,
  after,
  deny,
  secret,
  type Context,
} from './identity-store.js';
import { mutate } from './mutations.js';
import { registerRealtime } from './realtime.js';
import { browserCss, browserHtml, browserScript } from './auth-browser.js';
export async function registerIdentity(
  app: FastifyInstance,
  identity: IdentityService,
) {
  const store = identity.store;
  app.decorateRequest('rawBody', '');
  app.decorateRequest('identity', null);
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        _req.rawBody = body as string;
        done(null, JSON.parse(body as string));
      } catch {
        done(new SecurityError('INVALID_REQUEST', 400));
      }
    },
  );
  const authenticate = async (req: FastifyRequest, refresh = false) => {
    const h = req.headers;
    const parsed = signedHeadersSchema.safeParse({
      version: h['x-jarvis-version'],
      deviceId: h['x-device-id'],
      sessionId: h['x-session-id'],
      timestamp: h['x-timestamp'],
      nonce: h['x-nonce'],
      correlationId: h['x-correlation-id'],
      signature: h['x-signature'],
    });
    if (!parsed.success) return deny();
    const ctx = await identity.authenticate(
      parsed.data,
      req.method,
      req.url,
      req.rawBody,
      h.authorization,
      refresh,
    );
    ctx.requestId = req.id;
    req.identity = ctx;
    return ctx;
  };
  const publicPaths = new Set([
    '/api/v1/health',
    '/api/v1/realtime',
    '/auth',
    '/auth/browser.js',
    '/auth/style.css',
    '/api/v1/auth/prepare',
    '/api/v1/auth/activate',
    '/api/v1/auth/redeem',
    '/api/v1/auth/browser/options',
    '/api/v1/auth/browser/context',
    '/api/v1/auth/browser/verify',
    '/api/v1/enrollment/prepare',
  ]);
  const bootstrapPaths = new Set([
    '/api/v1/readiness',
    '/api/v1/system/version',
    '/api/v1/setup/status',
    '/api/v1/setup/core/verify',
  ]);
  app.addHook('preValidation', async (req) => {
    if (req.url === '/api/v1/auth/prepare') {
      const mode = (req.body as { mode?: unknown } | undefined)?.mode;
      if (mode === 'stepup' || mode === 'add') await authenticate(req);
      return;
    }
    if (publicPaths.has(req.url)) return;
    if (
      bootstrapPaths.has(req.url) &&
      (await identity.bootstrapAllowed(req.headers.authorization))
    )
      return;
    await authenticate(req, req.url === '/api/v1/session/refresh');
  });
  const protectBrowser = (req: FastifyRequest) => {
    if (req.headers.origin !== identity.config.JARVIS_AUTH_ORIGIN)
      deny('ORIGIN_DENIED', 403);
  };
  let script: string | undefined;
  const csp =
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
  app.get('/auth', async (_req, reply) =>
    reply
      .header('content-security-policy', csp)
      .header('referrer-policy', 'no-referrer')
      .type('text/html')
      .send(browserHtml),
  );
  app.get('/auth/style.css', async (_req, reply) =>
    reply.type('text/css').send(browserCss),
  );
  app.get('/auth/browser.js', async (_req, reply) => {
    script ??= await browserScript();
    return reply.type('text/javascript').send(script);
  });
  app.post('/api/v1/auth/prepare', async (req) =>
    identity.prepare(
      req.body,
      req.headers.authorization,
      req.identity ?? undefined,
    ),
  );
  app.post('/api/v1/auth/activate', async (req) => {
    const i = ceremonyProofSchema.parse(req.body);
    return identity.activate(i.id, i.secret, i.signature);
  });
  app.post('/api/v1/auth/redeem', async (req) => {
    const i = ceremonyProofSchema.parse(req.body);
    return identity.redeem(i.id, i.secret, i.signature);
  });
  app.post('/api/v1/auth/browser/context', async (req) => {
    protectBrowser(req);
    const i = ceremonySecretSchema.parse(req.body);
    return identity.browserContext(i.id, i.secret);
  });
  app.post('/api/v1/auth/browser/options', async (req) => {
    protectBrowser(req);
    const i = ceremonySecretSchema.parse(req.body);
    return identity.options(i.id, i.secret);
  });
  app.post('/api/v1/auth/browser/verify', async (req) => {
    protectBrowser(req);
    const i = credentialResponseSchema.parse(req.body);
    return identity.verify(i.id, i.secret, i.response);
  });
  app.post('/api/v1/enrollment/prepare', async (req) => {
    const i = pairingPrepareSchema.parse(req.body);
    return identity.pair(i.secret, i.device);
  });
  app.post('/api/v1/session/refresh', async (req) =>
    identity.refresh(
      req.identity!,
      (req.headers.authorization ?? '').replace(/^Bearer /, ''),
    ),
  );
  app.get('/api/v1/identity/snapshot', async (req) =>
    store.tx((q) => store.snapshot(q, req.identity!)),
  );
  app.post('/api/v1/identity/mutate', async (req) =>
    mutate(store, req.identity!, req.body),
  );
  app.post('/api/v1/sync/ticket', async (req) =>
    store.tx(async (q) => {
      await store.current(q, req.identity!);
      const ticket = secret();
      await q.query(
        'INSERT INTO sync_tickets(secret_hash,session_id,expires_at) VALUES($1,$2,$3)',
        [digest(ticket), req.identity!.sessionId, after(30)],
      );
      return { version: 1, ticket };
    }),
  );
  await registerRuntime(app, identity);
  await registerRealtime(app, store);
  const cleanup = setInterval(() => {
    void store
      .cleanup()
      .catch(() => app.log.warn('Security retention temporarily unavailable'));
  }, 60000);
  cleanup.unref();
  app.addHook('onClose', async () => clearInterval(cleanup));
}
export function securityStatus(
  error: unknown,
): { status: number; code: string } | undefined {
  if (error instanceof ZodError)
    return { status: 400, code: 'INVALID_REQUEST' };
  if (error instanceof SecurityError)
    return { status: error.statusCode, code: error.code };
  return undefined;
}
declare module 'fastify' {
  interface FastifyRequest {
    rawBody: string;
    identity: Context | null;
  }
}
