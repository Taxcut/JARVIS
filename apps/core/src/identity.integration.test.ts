import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import pg from 'pg';
import WebSocket from 'ws';
import { createDatabase } from '@jarvis/database';
import { parseEnvironment } from '@jarvis/config';
import { canonicalRequest, canonicalProof } from '@jarvis/security/signing';
import { type DeviceCandidate, type SignedHeaders } from '@jarvis/protocol';
import { IdentityStore, secret, type Context } from './identity-store.js';
import { IdentityService } from './identity.js';
import { mutate } from './mutations.js';
import { createApp } from './app.js';
import { authenticator } from '../test/authenticator.js';
const original = process.env.JARVIS_TEST_DATABASE_URL!;
const testUrl = new URL(original);
testUrl.pathname = '/identity_test';
const admin = new pg.Pool({ connectionString: original });
const db = createDatabase(testUrl.href);
const config = parseEnvironment({
  DATABASE_URL: testUrl.href,
  JARVIS_API_TOKEN: 'a'.repeat(64),
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
});
const store = new IdentityStore(db.pool),
  identity = new IdentityService(store, config);
let app: Awaited<ReturnType<typeof createApp>>, address: string;
function device(name = 'Isolated test device') {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ format: 'jwk' }).x!;
  const candidate: DeviceCandidate = {
    id: randomUUID(),
    publicKey,
    displayName: name,
    platform: 'macos',
    architecture: 'arm64',
  };
  return {
    candidate,
    sign: (value: string) =>
      sign(null, Buffer.from(value), keys.privateKey).toString('base64url'),
  };
}
const first = device();
let auth = authenticator();
let session: {
    sessionId: string;
    deviceId: string;
    access: string;
    refresh: string;
  },
  ctx: Context;
async function ceremony(
  mode: string,
  d = first,
  context: Context | undefined = undefined,
  extra: Record<string, unknown> = {},
) {
  const prepared = await identity.prepare(
    { version: 1, mode, device: d.candidate, ...extra },
    `Bearer ${config.JARVIS_API_TOKEN}`,
    context,
  );
  const proof = d.sign(
    canonicalProof(
      prepared.id,
      prepared.challenge,
      d.candidate.id,
      d.candidate.publicKey,
    ),
  );
  await identity.activate(prepared.id, prepared.redeemSecret, proof);
  return {
    ...prepared,
    proof,
    options: () => identity.options(prepared.id, prepared.browserSecret),
    redeem: () => identity.redeem(prepared.id, prepared.redeemSecret, proof),
  };
}
async function grant(purpose: string, target: string, context = ctx) {
  const c = await ceremony('stepup', first, context, { purpose, target });
  const options = await c.options();
  await identity.verify(
    c.id,
    c.browserSecret,
    auth.authenticate(options.options.challenge),
  );
  const result = await c.redeem();
  if (!('grant' in result)) throw Error('No grant');
  return result.grant;
}
function request(
  method: 'GET' | 'POST' = 'GET',
  path = '/api/v1/identity/snapshot',
  body = '',
  d = first,
  s = session,
  override: Partial<SignedHeaders> = {},
) {
  const fields = {
    version: '1' as const,
    deviceId: d.candidate.id,
    sessionId: s.sessionId,
    timestamp: String(Date.now()),
    nonce: secret(),
    correlationId: randomUUID(),
    ...override,
  };
  const signature = d.sign(canonicalRequest({ ...fields, method, path, body }));
  const signed = { ...fields, signature };
  const headers = {
    authorization: `Bearer ${s.access}`,
    'x-jarvis-version': '1',
    'x-device-id': fields.deviceId,
    'x-session-id': fields.sessionId,
    'x-timestamp': fields.timestamp,
    'x-nonce': fields.nonce,
    'x-correlation-id': fields.correlationId,
    'x-signature': signature,
    ...(body ? { 'content-type': 'application/json' } : {}),
  };
  return {
    signed,
    headers,
    method,
    url: path,
    ...(body ? { payload: body } : {}),
  };
}
beforeAll(async () => {
  await admin.query('CREATE DATABASE identity_test');
  await db.migrate();
  await db.migrate();
  await db.ready();
  app = await createApp(config, db);
  address = await app.listen({ host: '127.0.0.1', port: 0 });
});
afterAll(async () => {
  await app?.close();
  await db.close();
  await admin.query('DROP DATABASE identity_test');
  await admin.end();
});
it('registers a real verified credential, key proof, sole owner and session with no bootstrap bypass', async () => {
  expect(await store.hasOwner()).toBe(false);
  const c = await ceremony('bootstrap');
  const options = await c.options();
  await identity.verify(
    c.id,
    c.browserSecret,
    auth.register(options.options.challenge),
  );
  const result = await c.redeem();
  if (!('access' in result)) throw Error('No session');
  session = result;
  ctx = {
    ownerId: c.id,
    deviceId: first.candidate.id,
    sessionId: session.sessionId,
    correlationId: randomUUID(),
    requestId: randomUUID(),
  };
  expect(
    await identity.bootstrapAllowed(`Bearer ${config.JARVIS_API_TOKEN}`),
  ).toBe(false);
  await expect(c.redeem()).rejects.toThrow();
  await expect(ceremony('bootstrap')).rejects.toThrow();
  await expect(
    db.pool.query('INSERT INTO users(id) VALUES($1)', [randomUUID()]),
  ).rejects.toThrow();
  expect(
    (
      await app.inject({
        url: '/api/v1/setup/status',
        headers: { authorization: `Bearer ${config.JARVIS_API_TOKEN}` },
      })
    ).statusCode,
  ).toBe(401);
  const r = await app.inject(request());
  expect(r.statusCode).toBe(200);
  expect(r.json().owner.preferredAddress).toBe('Sir');
  expect(JSON.stringify(r.json())).not.toContain(session.refresh);
  expect((await db.setup()).configured).toBe(false);
});
it('requires proof, trusted device identity and exact public key before login', async () => {
  const fresh = device();
  await expect(ceremony('login', fresh)).rejects.toThrow();
  await expect(
    identity.prepare(
      {
        version: 1,
        mode: 'login',
        device: { ...first.candidate, publicKey: fresh.candidate.publicKey },
      },
      undefined,
    ),
  ).rejects.toThrow();
  const c = await identity.prepare(
    { version: 1, mode: 'login', device: first.candidate },
    undefined,
  );
  await expect(
    identity.activate(
      c.id,
      c.redeemSecret,
      fresh.sign(
        canonicalProof(
          c.id,
          c.challenge,
          first.candidate.id,
          first.candidate.publicKey,
        ),
      ),
    ),
  ).rejects.toThrow();
});
it('rejects wrong origin, RP, missing user verification, unknown credential, reused and expired challenges', async () => {
  for (const variant of ['origin', 'rp', 'uv', 'unknown']) {
    const c = await ceremony('login');
    const o = await c.options();
    const response = auth.authenticate(
      o.options.challenge,
      variant === 'origin' ? 'https://evil.example' : undefined,
      variant === 'rp' ? 'evil.example' : undefined,
      variant !== 'uv',
    );
    if (variant === 'unknown') response.id = secret();
    await expect(
      identity.verify(c.id, c.browserSecret, response),
    ).rejects.toThrow();
    await expect(
      identity.verify(
        c.id,
        c.browserSecret,
        auth.authenticate(o.options.challenge),
      ),
    ).rejects.toThrow();
  }
  const c = await ceremony('login');
  await db.pool.query(
    "UPDATE auth_ceremonies SET expires_at=now()-interval '1 second' WHERE id=$1",
    [c.id],
  );
  await expect(c.options()).rejects.toThrow();
});
it('rejects replay, simultaneous duplicate nonce, invalid signature, body substitution, clock skew and session mismatch', async () => {
  const req = request();
  const raced = await Promise.all([app.inject(req), app.inject(req)]);
  expect(raced.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  expect((await app.inject(req)).json().error.code).toBe('REPLAY_REJECTED');
  const invalid = request();
  invalid.headers['x-signature'] = device().sign('invalid');
  expect((await app.inject(invalid)).statusCode).toBe(401);
  for (const offset of [-120000, 120000])
    expect(
      (
        await app.inject(
          request('GET', '/api/v1/identity/snapshot', '', first, session, {
            timestamp: String(Date.now() + offset),
          }),
        )
      ).statusCode,
    ).toBe(401);
  expect(
    (
      await app.inject(
        request('GET', '/api/v1/identity/snapshot', '', device()),
      )
    ).statusCode,
  ).toBe(401);
  const tamper = request(
    'POST',
    '/api/v1/identity/mutate',
    JSON.stringify({ version: 1, action: 'enrollment.create' }),
  );
  tamper.payload = '{}';
  expect((await app.inject(tamper)).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        ...request(),
        headers: { ...request().headers, 'x-jarvis-version': '2' },
      })
    ).statusCode,
  ).toBe(401);
});
it('rotates refresh once, rejects old material and persists replay protection across Core restart', async () => {
  const refreshRequest = () =>
    request('POST', '/api/v1/session/refresh', '{}', first, {
      ...session,
      access: session.refresh,
    });
  const old = session.refresh;
  const result = await app.inject(refreshRequest());
  expect(result.statusCode).toBe(200);
  session = result.json();
  expect(
    (
      await app.inject(
        request('POST', '/api/v1/session/refresh', '{}', first, {
          ...session,
          access: old,
        }),
      )
    ).statusCode,
  ).toBe(401);
  const req = request();
  expect((await app.inject(req)).statusCode).toBe(200);
  await app.close();
  app = await createApp(config, db);
  address = await app.listen({ host: '127.0.0.1', port: 0 });
  expect((await app.inject(req)).statusCode).toBe(401);
  expect((await app.inject(request())).statusCode).toBe(200);
});
it('scopes step-up to purpose, target, session and expiry; prevents final passkey removal', async () => {
  const token = await grant('recovery.regenerate', ctx.ownerId);
  await expect(
    mutate(store, ctx, {
      version: 1,
      action: 'device.revoke',
      id: ctx.deviceId,
      revision: 1,
      grant: token,
    }),
  ).rejects.toThrow();
  await expect(
    store.tx((q) =>
      store.consumeGrant(
        q,
        { ...ctx, sessionId: randomUUID() },
        token,
        'recovery.regenerate',
        ctx.ownerId,
      ),
    ),
  ).rejects.toThrow();
  const codes = await mutate(store, ctx, {
    version: 1,
    action: 'recovery.regenerate',
    grant: token,
  });
  expect(codes.codes).toHaveLength(8);
  await expect(
    mutate(store, ctx, {
      version: 1,
      action: 'recovery.regenerate',
      grant: token,
    }),
  ).rejects.toThrow();
  const expired = await grant('recovery.regenerate', ctx.ownerId);
  await db.pool.query(
    "UPDATE step_up_grants SET expires_at=now()-interval '1 second' WHERE consumed_at IS NULL",
  );
  await expect(
    mutate(store, ctx, {
      version: 1,
      action: 'recovery.regenerate',
      grant: expired,
    }),
  ).rejects.toThrow();
  const key = (await db.pool.query('SELECT id FROM passkeys LIMIT 1')).rows[0]!;
  await expect(
    mutate(store, ctx, {
      version: 1,
      action: 'passkey.revoke',
      id: key.id,
      revision: 1,
      grant: await grant('passkey.revoke', key.id),
    }),
  ).rejects.toThrow('FINAL_PASSKEY_REQUIRED');
});
it('enrolls a second device only with possession and exact owner step-up; rejects reuse, expiry and denial', async () => {
  for (const approval of [false, true]) {
    const created = await mutate(store, ctx, {
      version: 1,
      action: 'enrollment.create',
    });
    const d = device();
    const pair = await identity.pair(created.secret as string, d.candidate);
    const proof = d.sign(
      canonicalProof(
        pair.id,
        pair.challenge,
        d.candidate.id,
        d.candidate.publicKey,
      ),
    );
    await expect(
      identity.pair(created.secret as string, device().candidate),
    ).rejects.toThrow();
    await identity.activate(pair.id, pair.redeemSecret, proof);
    if (approval)
      await expect(
        mutate(store, ctx, {
          version: 1,
          action: 'enrollment.decide',
          id: created.id,
          revision: 2,
          approve: true,
        }),
      ).rejects.toThrow();
    await mutate(store, ctx, {
      version: 1,
      action: 'enrollment.decide',
      id: created.id,
      revision: 2,
      approve: approval,
      ...(approval
        ? { grant: await grant('device.approve', created.id as string) }
        : {}),
    });
    if (!approval)
      await expect(
        identity.redeem(pair.id, pair.redeemSecret, proof),
      ).rejects.toThrow();
    else {
      const s = await identity.redeem(pair.id, pair.redeemSecret, proof);
      if (!('access' in s)) throw Error('No paired session');
      expect(
        (
          await app.inject(
            request('GET', '/api/v1/identity/snapshot', '', d, s),
          )
        ).statusCode,
      ).toBe(200);
      const connected = await stream('0', d, s);
      await connected.next();
      const disconnected = new Promise<void>((resolve) =>
        connected.socket.once('close', () => resolve()),
      );
      await mutate(store, ctx, {
        version: 1,
        action: 'device.revoke',
        id: d.candidate.id,
        revision: 1,
        grant: await grant('device.revoke', d.candidate.id),
      });
      expect(
        (
          await app.inject(
            request('GET', '/api/v1/identity/snapshot', '', d, s),
          )
        ).statusCode,
      ).toBe(401);
      await disconnected;
      await expect(ceremony('login', d)).rejects.toThrow();
      await expect(
        identity.redeem(pair.id, pair.redeemSecret, proof),
      ).rejects.toThrow();
    }
  }
  const expired = await mutate(store, ctx, {
    version: 1,
    action: 'enrollment.create',
  });
  await db.pool.query(
    "UPDATE device_enrollments SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expired.id],
  );
  await expect(
    identity.pair(expired.secret as string, device().candidate),
  ).rejects.toThrow();
});
it('enforces revisions, lockdown and durable approvals without execution authority', async () => {
  const owner = (await store.tx((q) => store.snapshot(q, ctx))).owner;
  await mutate(store, ctx, {
    version: 1,
    action: 'owner.update',
    revision: owner.revision,
    displayName: '',
    preferredAddress: 'Sir',
  });
  await expect(
    mutate(store, ctx, {
      version: 1,
      action: 'owner.update',
      revision: owner.revision,
      displayName: 'stale',
      preferredAddress: 'Sir',
    }),
  ).rejects.toThrow('REVISION_CONFLICT');
  const approved = await mutate(store, ctx, {
    version: 1,
    action: 'approval.create',
    capability: 'device.status.read',
    risk: 'LOW',
    summary: 'Fixture: read status (no executor)',
    idempotencyKey: randomUUID(),
    expiresInSeconds: 30,
  });
  const decision = {
    version: 1,
    action: 'approval.decide',
    id: approved.id,
    revision: 1,
    decision: 'APPROVED',
    idempotencyKey: randomUUID(),
  };
  expect((await mutate(store, ctx, decision)).executionAuthorized).toBe(false);
  expect((await mutate(store, ctx, decision)).executionAuthorized).toBe(false);
  const expired = await mutate(store, ctx, {
    version: 1,
    action: 'approval.create',
    capability: 'device.status.read',
    risk: 'LOW',
    summary: 'Fixture expiry',
    idempotencyKey: randomUUID(),
    expiresInSeconds: 30,
  });
  await db.pool.query(
    "UPDATE approval_requests SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expired.id],
  );
  await expect(
    mutate(store, ctx, {
      ...decision,
      id: expired.id,
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toThrow();
  let revision = (await store.tx((q) => store.snapshot(q, ctx))).owner.revision;
  await mutate(store, ctx, {
    version: 1,
    action: 'lockdown.change',
    state: 'LOCKDOWN',
    revision,
    grant: await grant('lockdown.change', 'LOCKDOWN'),
  });
  await expect(
    mutate(store, ctx, { version: 1, action: 'enrollment.create' }),
  ).rejects.toThrow('LOCKDOWN');
  expect((await app.inject(request())).statusCode).toBe(200);
  revision = (await store.tx((q) => store.snapshot(q, ctx))).owner.revision;
  await mutate(store, ctx, {
    version: 1,
    action: 'lockdown.change',
    state: 'NORMAL',
    revision,
    grant: await grant('lockdown.change', 'NORMAL'),
  });
});
afterEach(async () => {
  await db.pool.query('DELETE FROM security_rate_limits');
});
it('manages passkeys, rejects revoked credentials, and invalidates other sessions', async () => {
  const added = authenticator();
  const add = await ceremony('add', first, ctx, {
    grant: await grant('passkey.add', ctx.ownerId),
  });
  const options = await add.options();
  await identity.verify(
    add.id,
    add.browserSecret,
    added.register(options.options.challenge),
  );
  await add.redeem();
  const key = (
    await db.pool.query(
      'SELECT id,revision FROM passkeys WHERE credential_id=$1',
      [added.id],
    )
  ).rows[0]!;
  await mutate(store, ctx, {
    version: 1,
    action: 'passkey.rename',
    id: key.id,
    revision: key.revision,
    name: 'Second test authenticator',
  });
  const login = await ceremony('login');
  const challenge = await login.options();
  await identity.verify(
    login.id,
    login.browserSecret,
    added.authenticate(challenge.options.challenge),
  );
  const other = await login.redeem();
  if (!('access' in other)) throw Error('No session');
  const current = (
    await db.pool.query('SELECT revision FROM passkeys WHERE id=$1', [key.id])
  ).rows[0]!;
  await mutate(store, ctx, {
    version: 1,
    action: 'passkey.revoke',
    id: key.id,
    revision: current.revision,
    grant: await grant('passkey.revoke', key.id),
  });
  expect(
    (
      await app.inject(
        request('GET', '/api/v1/identity/snapshot', '', first, other),
      )
    ).statusCode,
  ).toBe(401);
  const revoked = await ceremony('login');
  const o = await revoked.options();
  await expect(
    identity.verify(
      revoked.id,
      revoked.browserSecret,
      added.authenticate(o.options.challenge),
    ),
  ).rejects.toThrow();
});
it('rejects expired sessions and untrusted devices, and consumes recovery codes only with device proof', async () => {
  const login = await ceremony('login');
  const o = await login.options();
  await identity.verify(
    login.id,
    login.browserSecret,
    auth.authenticate(o.options.challenge),
  );
  const other = await login.redeem();
  if (!('access' in other)) throw Error('No session');
  await db.pool.query(
    "UPDATE sessions SET access_expires_at=now()-interval '1 second' WHERE id=$1",
    [other.sessionId],
  );
  expect(
    (
      await app.inject(
        request('GET', '/api/v1/identity/snapshot', '', first, other),
      )
    ).statusCode,
  ).toBe(401);
  await db.pool.query(
    "UPDATE sessions SET idle_expires_at=now()-interval '1 second' WHERE id=$1",
    [other.sessionId],
  );
  expect(
    (
      await app.inject(
        request('POST', '/api/v1/session/refresh', '{}', first, {
          ...other,
          access: other.refresh,
        }),
      )
    ).statusCode,
  ).toBe(401);
  await db.pool.query(
    "UPDATE devices SET trust_state='untrusted',enrollment_status='pending' WHERE id=$1",
    [ctx.deviceId],
  );
  expect((await app.inject(request())).statusCode).toBe(401);
  await db.pool.query(
    "UPDATE devices SET trust_state='trusted',enrollment_status='enrolled' WHERE id=$1",
    [ctx.deviceId],
  );
  const generated = await mutate(store, ctx, {
    version: 1,
    action: 'recovery.regenerate',
    grant: await grant('recovery.regenerate', ctx.ownerId),
  });
  const code = (generated.codes as string[])[0]!;
  await expect(
    identity.prepare(
      {
        version: 1,
        mode: 'recovery',
        device: device().candidate,
        recoveryCode: code,
      },
      undefined,
    ),
  ).rejects.toThrow();
  const old = session;
  const recovery = await ceremony('recovery', first, undefined, {
    recoveryCode: code,
  });
  await expect(
    ceremony('recovery', first, undefined, { recoveryCode: code }),
  ).rejects.toThrow();
  const replacement = authenticator();
  const options = await recovery.options();
  await identity.verify(
    recovery.id,
    recovery.browserSecret,
    replacement.register(options.options.challenge),
  );
  const result = await recovery.redeem();
  if (!('access' in result)) throw Error('No recovery session');
  session = result;
  ctx = { ...ctx, sessionId: result.sessionId };
  auth = replacement;
  expect(
    (
      await app.inject(
        request('GET', '/api/v1/identity/snapshot', '', first, old),
      )
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await db.pool.query(
        "SELECT risk FROM audit_events WHERE type='recovery.used' ORDER BY recorded_at DESC LIMIT 1",
      )
    ).rows[0]!.risk,
  ).toBe('CRITICAL');
  const remaining = (generated.codes as string[])[1]!;
  await mutate(store, ctx, {
    version: 1,
    action: 'recovery.regenerate',
    grant: await grant('recovery.regenerate', ctx.ownerId),
  });
  await expect(
    ceremony('recovery', first, undefined, { recoveryCode: remaining }),
  ).rejects.toThrow();
  await store.cleanup();
  expect(
    (
      await db.pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [
        other.sessionId,
      ])
    ).rows[0]!.revoked_at,
  ).not.toBeNull();
});
it('limits durable authentication attempts and rejects incompatible auth versions', async () => {
  await expect(
    identity.prepare(
      { version: 2, mode: 'login', device: first.candidate },
      undefined,
    ),
  ).rejects.toThrow();
  for (let i = 0; i < 3; i++) await store.rate('isolated-abuse-bucket', 3, 60);
  await expect(
    new IdentityStore(db.pool).rate('isolated-abuse-bucket', 3, 60),
  ).rejects.toThrow('RATE_LIMITED');
});
interface Message {
  type: string;
  fromSequence: string;
  events: { sequence: string; type: string; revision: number }[];
  snapshot: {
    sequence: string;
    devices: { id: string; revision: number; displayName: string }[];
  };
}
async function stream(
  lastSequence = '0',
  signingDevice = first,
  signingSession = session,
) {
  const r = await app.inject(
    request('POST', '/api/v1/sync/ticket', '{}', signingDevice, signingSession),
  );
  expect(r.statusCode).toBe(200);
  const socket = new WebSocket(
    address.replace('http:', 'ws:') + '/api/v1/realtime',
  );
  const queue: Message[] = [],
    waiting: ((m: Message) => void)[] = [];
  socket.on('message', (value) => {
    const m = JSON.parse(value.toString()) as Message;
    if (m.type === 'heartbeat') return;
    const resolve = waiting.shift();
    if (resolve) resolve(m);
    else queue.push(m);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(
    JSON.stringify({ version: 1, ticket: r.json().ticket, lastSequence }),
  );
  return {
    socket,
    next: () =>
      queue.length
        ? Promise.resolve(queue.shift()!)
        : new Promise<Message>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(Error('No realtime update')),
              3000,
            );
            waiting.push((m) => {
              clearTimeout(timeout);
              resolve(m);
            });
          }),
  };
}
it('closes stale streams on PostgreSQL LISTEN loss and reconnects with one bounded listener', async () => {
  const connection = await stream();
  const initial = await connection.next();
  const listening = async () =>
    (
      await db.pool.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND query='LISTEN jarvis_sync' AND pid<>pg_backend_pid()",
      )
    ).rows;
  const original = await listening();
  expect(original).toHaveLength(1);
  const closed = new Promise<number>((resolve) =>
    connection.socket.once('close', resolve),
  );
  await db.pool.query('SELECT pg_terminate_backend($1)', [original[0]!.pid]);
  expect(await closed).toBe(1012);
  await vi.waitFor(
    async () => {
      const rows = await listening();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.pid).not.toBe(original[0]!.pid);
    },
    { timeout: 5000, interval: 100 },
  );
  const resumed = await stream(initial.snapshot.sequence);
  expect((await resumed.next()).snapshot.sequence).toBe(
    initial.snapshot.sequence,
  );
  resumed.socket.close();
});
it('synchronizes two clients and replays for a third; retention gap forces authoritative resync and revocation closes sockets', async () => {
  const a = await stream(),
    b = await stream();
  const initial = await a.next();
  await b.next();
  const d = initial.snapshot.devices.find((d) => d.id === ctx.deviceId)!;
  await mutate(store, ctx, {
    version: 1,
    action: 'device.rename',
    id: d.id,
    revision: d.revision,
    name: 'Renamed test fixture',
  });
  const [ma, mb] = await Promise.all([a.next(), b.next()]);
  expect(ma.snapshot.sequence).toBe(mb.snapshot.sequence);
  expect(mb.snapshot.devices.find((x) => x.id === d.id)?.revision).toBe(
    d.revision + 1,
  );
  const c = await stream(initial.snapshot.sequence);
  const replay = await c.next();
  expect(replay.type).toBe('update');
  expect(replay.events.some((e) => e.type === 'device.rename')).toBe(true);
  c.socket.close();
  await db.pool.query('DELETE FROM sync_events WHERE sequence<=$1', [
    ma.snapshot.sequence,
  ]);
  await mutate(store, ctx, {
    version: 1,
    action: 'device.rename',
    id: d.id,
    revision: d.revision + 1,
    name: 'Second rename fixture',
  });
  await a.next();
  await b.next();
  const gap = await stream('1');
  expect((await gap.next()).type).toBe('snapshot');
  gap.socket.close();
  const beforeRevoke = await app.inject(
    request('POST', '/api/v1/sync/ticket', '{}'),
  );
  const closed = Promise.all(
    [a, b].map(
      (p) =>
        new Promise<void>((resolve) => p.socket.once('close', () => resolve())),
    ),
  );
  const s = (
    await db.pool.query('SELECT revision FROM sessions WHERE id=$1', [
      ctx.sessionId,
    ])
  ).rows[0]!;
  await mutate(store, ctx, {
    version: 1,
    action: 'session.revoke',
    id: ctx.sessionId,
    revision: s.revision,
    grant: await grant('session.revoke', ctx.sessionId),
  });
  await closed;
  expect((await app.inject(request())).statusCode).toBe(401);
  const rejected = new WebSocket(
    address.replace('http:', 'ws:') + '/api/v1/realtime',
  );
  const rejectedCode = new Promise<number>((resolve) =>
    rejected.once('close', resolve),
  );
  rejected.once('open', () =>
    rejected.send(
      JSON.stringify({
        version: 1,
        ticket: beforeRevoke.json().ticket,
        lastSequence: '0',
      }),
    ),
  );
  expect(await rejectedCode).toBe(4001);
});
