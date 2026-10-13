import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  runtimeReportSchema,
  runtimeCompatibilitySchema,
} from '@jarvis/protocol';
import type { IdentityService } from './identity.js';
import { deny, after } from './identity-store.js';
export async function registerRuntime(
  app: FastifyInstance,
  identity: IdentityService,
) {
  const store = identity.store;
  app.get('/api/v1/runtime/compatibility', async () =>
    runtimeCompatibilitySchema.parse({
      version: 1,
      runtimeProtocolVersion: 2,
      minimumRuntimeProtocolVersion: 2,
      heartbeatSeconds: 30,
      leaseSeconds: 90,
      executionAvailable: false,
    }),
  );
  app.post('/api/v1/runtime/session', async (req) => {
    z.strictObject({}).parse(req.body);
    await store.rate(`runtime:provision:${req.identity!.deviceId}`, 5, 300);
    return store.tx(async (q) => {
      const ctx = req.identity!;
      const { session, owner } = await store.current(q, ctx);
      if (session.kind !== 'owner') deny('RUNTIME_SCOPE_REQUIRED', 403);
      if (owner.security_state === 'LOCKDOWN') deny('LOCKDOWN', 403);
      const old = await q.query<{ id: string; revision: number }>(
        "UPDATE sessions SET revoked_at=now(),revision=revision+1 WHERE device_id=$1 AND kind='runtime' AND revoked_at IS NULL RETURNING id,revision",
        [ctx.deviceId],
      );
      for (const row of old.rows)
        await store.emit(q, 'session.revoke', ctx, row.id, row.revision);
      return store.newSession(q, ctx, 'runtime');
    });
  });
  for (const operation of ['register', 'heartbeat', 'stop'] as const) {
    app.post(`/api/v1/runtime/${operation}`, async (req) => {
      const input = runtimeReportSchema.parse(req.body);
      if (input.runtimeProtocolVersion !== 2)
        deny('RUNTIME_UPDATE_REQUIRED', 426);
      if (operation === 'stop' && input.state !== 'STOPPING')
        deny('INVALID_REQUEST', 400);
      await store.rate(`runtime:presence:${req.identity!.deviceId}`, 10);
      return store.tx(async (q) => {
        const ctx = req.identity!;
        const { session, device } = await store.current(q, ctx);
        if (session.kind !== 'runtime') deny('RUNTIME_SCOPE_REQUIRED', 403);
        if (
          input.platform !== device.platform ||
          input.architecture !== device.architecture
        )
          deny('DEVICE_BINDING_MISMATCH', 403);
        const previous = (
          await q.query<{
            instance_id: string;
            session_id: string;
            report: unknown;
            state: string;
            revision: number;
          }>(
            'SELECT instance_id,session_id,report,state,revision FROM runtime_presence WHERE device_id=$1',
            [ctx.deviceId],
          )
        ).rows[0];
        if (
          operation !== 'register' &&
          (!previous ||
            previous.instance_id !== input.instanceId ||
            previous.session_id !== ctx.sessionId)
        )
          deny('RUNTIME_INSTANCE_MISMATCH', 409);
        if (
          previous &&
          operation === 'register' &&
          previous.instance_id === input.instanceId &&
          previous.session_id !== ctx.sessionId
        )
          deny('RUNTIME_INSTANCE_MISMATCH', 409);
        const state = operation === 'stop' ? 'OFFLINE' : input.state;
        const result = (
          await q.query<{
            revision: number;
            last_seen: Date;
            expires_at: Date;
          }>(
            `INSERT INTO runtime_presence(device_id,owner_id,session_id,instance_id,report,state,last_seen,expires_at)
           VALUES($1,$2,$3,$4,$5,$6,now(),$7)
           ON CONFLICT(device_id) DO UPDATE SET session_id=EXCLUDED.session_id,instance_id=EXCLUDED.instance_id,
           report=EXCLUDED.report,state=EXCLUDED.state,revision=runtime_presence.revision+1,last_seen=now(),expires_at=EXCLUDED.expires_at
           RETURNING revision,last_seen,expires_at`,
            [
              ctx.deviceId,
              ctx.ownerId,
              ctx.sessionId,
              input.instanceId,
              JSON.stringify(input),
              state,
              after(operation === 'stop' ? 0 : 90),
            ],
          )
        ).rows[0]!;
        const transition =
          !previous ||
          previous.instance_id !== input.instanceId ||
          previous.state !== state ||
          Object.entries(input.capabilities).some(
            ([key, value]) =>
              (previous.report as { capabilities: Record<string, string> })
                .capabilities?.[key] !== value,
          );
        await store.emit(
          q,
          operation === 'stop'
            ? 'runtime.stopped'
            : transition
              ? 'runtime.registered'
              : 'runtime.updated',
          ctx,
          ctx.deviceId,
          result.revision,
          'LOW',
          transition || operation === 'stop',
        );
        return {
          version: 1,
          runtimeProtocolVersion: 2,
          instanceId: input.instanceId,
          revision: result.revision,
          lastSeen: result.last_seen.toISOString(),
          expiresAt: result.expires_at.toISOString(),
          executionAvailable: false,
        };
      });
    });
  }
}
