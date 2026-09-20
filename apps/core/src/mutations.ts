import { randomUUID } from 'node:crypto';
import { mutationSchema } from '@jarvis/protocol';
import { digest } from '@jarvis/security/signing';
import {
  IdentityStore,
  after,
  deny,
  secret,
  type Context,
  type Enrollment,
} from './identity-store.js';
export async function mutate(
  store: IdentityStore,
  ctx: Context,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const input = mutationSchema.parse(raw);
  await store.rate(`mutation:${ctx.deviceId}`, 40);
  if (input.action === 'enrollment.create')
    await store.rate(`enrollment:create:${ctx.deviceId}`, 5, 300);
  return store.tx(async (q) => {
    const { owner } = await store.current(q, ctx);
    if (
      owner.security_state === 'LOCKDOWN' &&
      !(input.action === 'lockdown.change' && input.state === 'NORMAL')
    )
      deny('LOCKDOWN', 403);
    const conflict = () => deny('REVISION_CONFLICT', 409);
    let resourceId = owner.id,
      revision = owner.revision,
      event: string = input.action;
    let extra: Record<string, unknown> = {};
    switch (input.action) {
      case 'owner.update': {
        const r = await q.query(
          `UPDATE users SET display_name=$2,preferred_address=$3,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING revision`,
          [
            owner.id,
            input.displayName || null,
            input.preferredAddress,
            input.revision,
          ],
        );
        if (!r.rowCount) return conflict();
        revision = r.rows[0]!.revision as number;
        break;
      }
      case 'device.rename':
      case 'passkey.rename': {
        const table = input.action === 'device.rename' ? 'devices' : 'passkeys';
        const column =
          input.action === 'device.rename' ? 'display_name' : 'name';
        const r = await q.query(
          `UPDATE ${table} SET ${column}=$3,revision=revision+1 WHERE id=$1 AND owner_id=$2 AND revision=$4 AND revoked_at IS NULL RETURNING revision`,
          [input.id, owner.id, input.name, input.revision],
        );
        if (!r.rowCount) return conflict();
        resourceId = input.id;
        revision = r.rows[0]!.revision as number;
        break;
      }
      case 'device.revoke':
      case 'passkey.revoke':
      case 'session.revoke': {
        await store.consumeGrant(q, ctx, input.grant, input.action, input.id);
        if (input.action === 'passkey.revoke') {
          const count = (
            await q.query<{ count: string }>(
              'SELECT count(*) FROM passkeys WHERE owner_id=$1 AND revoked_at IS NULL',
              [owner.id],
            )
          ).rows[0]!.count;
          if (Number(count) <= 1) deny('FINAL_PASSKEY_REQUIRED', 409);
        }
        const table =
          input.action === 'device.revoke'
            ? 'devices'
            : input.action === 'passkey.revoke'
              ? 'passkeys'
              : 'sessions';
        const r = await q.query(
          `UPDATE ${table} SET revoked_at=now(),revision=revision+1${table === 'devices' ? ",trust_state='revoked'" : ''} WHERE id=$1 AND owner_id=$2 AND revision=$3 AND revoked_at IS NULL RETURNING revision`,
          [input.id, owner.id, input.revision],
        );
        if (!r.rowCount) return conflict();
        resourceId = input.id;
        revision = r.rows[0]!.revision as number;
        if (table === 'devices') {
          await q.query(
            'UPDATE sessions SET revoked_at=now(),revision=revision+1 WHERE device_id=$1 AND revoked_at IS NULL',
            [input.id],
          );
          await q.query(
            'UPDATE step_up_grants SET consumed_at=now() WHERE device_id=$1 AND consumed_at IS NULL',
            [input.id],
          );
          await q.query(
            `UPDATE device_enrollments SET status='CANCELLED',revision=revision+1 WHERE source_device_id=$1 AND status IN ('PENDING','REQUESTED','APPROVED')`,
            [input.id],
          );
          await q.query("DELETE FROM auth_ceremonies WHERE device->>'id'=$1", [
            input.id,
          ]);
        } else if (table === 'sessions') {
          await q.query(
            'UPDATE step_up_grants SET consumed_at=now() WHERE session_id=$1 AND consumed_at IS NULL',
            [input.id],
          );
          await q.query('DELETE FROM auth_ceremonies WHERE session_id=$1', [
            input.id,
          ]);
        } else {
          // Passkey removal invalidates all other sessions, ceremonies and grants.
          await q.query(
            'UPDATE sessions SET revoked_at=now(),revision=revision+1 WHERE owner_id=$1 AND id<>$2 AND revoked_at IS NULL',
            [owner.id, ctx.sessionId],
          );
          await q.query(
            'UPDATE step_up_grants SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL',
            [owner.id],
          );
          await q.query('DELETE FROM auth_ceremonies WHERE owner_id=$1', [
            owner.id,
          ]);
        }
        break;
      }
      case 'lockdown.change': {
        await store.consumeGrant(
          q,
          ctx,
          input.grant,
          input.action,
          input.state,
        );
        const r = await q.query(
          'UPDATE users SET security_state=$2,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$3 RETURNING revision',
          [owner.id, input.state, input.revision],
        );
        if (!r.rowCount) return conflict();
        revision = r.rows[0]!.revision as number;
        event =
          input.state === 'LOCKDOWN' ? 'lockdown.entered' : 'lockdown.exited';
        await q.query(
          'UPDATE step_up_grants SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL',
          [owner.id],
        );
        if (input.state === 'LOCKDOWN') {
          await q.query(
            `UPDATE device_enrollments SET status='CANCELLED',revision=revision+1 WHERE owner_id=$1 AND status IN ('PENDING','REQUESTED','APPROVED')`,
            [owner.id],
          );
          await q.query(
            `UPDATE approval_requests SET status='CANCELLED',revision=revision+1,decided_at=now(),deciding_session_id=$2 WHERE owner_id=$1 AND status='PENDING'`,
            [owner.id, ctx.sessionId],
          );
          await q.query(
            "DELETE FROM auth_ceremonies WHERE owner_id=$1 AND mode NOT IN ('login','recovery')",
            [owner.id],
          );
        }
        break;
      }
      case 'recovery.regenerate': {
        await store.consumeGrant(q, ctx, input.grant, input.action, owner.id);
        await q.query('DELETE FROM recovery_codes WHERE owner_id=$1', [
          owner.id,
        ]);
        const codes = Array.from({ length: 8 }, secret);
        for (const code of codes)
          await q.query(
            'INSERT INTO recovery_codes(id,owner_id,secret_hash) VALUES($1,$2,$3)',
            [randomUUID(), owner.id, digest(code)],
          );
        extra = { codes };
        event = 'recovery.regenerated';
        break;
      }
      case 'enrollment.create': {
        const id = randomUUID(),
          token = secret();
        await q.query(
          'INSERT INTO device_enrollments(id,owner_id,source_device_id,secret_hash,expires_at) VALUES($1,$2,$3,$4,$5)',
          [id, owner.id, ctx.deviceId, digest(token), after(300)],
        );
        resourceId = id;
        revision = 1;
        extra = { id, secret: token, expiresIn: 300 };
        event = 'enrollment.created';
        break;
      }
      case 'enrollment.decide': {
        const e = (
          await q.query<Enrollment>(
            'SELECT * FROM device_enrollments WHERE id=$1 AND owner_id=$2',
            [input.id, owner.id],
          )
        ).rows[0];
        if (
          !e ||
          e.status !== 'REQUESTED' ||
          e.expires_at <= new Date() ||
          e.revision !== input.revision ||
          !e.device
        )
          return conflict();
        if (input.approve) {
          await store.consumeGrant(q, ctx, input.grant, 'device.approve', e.id);
          await store.enroll(q, owner.id, e.device);
          await store.emit(q, 'device.enrolled', ctx, e.device.id);
        }
        await q.query(
          'UPDATE device_enrollments SET status=$2,revision=revision+1,decided_at=now(),deciding_session_id=$3 WHERE id=$1',
          [e.id, input.approve ? 'APPROVED' : 'DENIED', ctx.sessionId],
        );
        resourceId = e.id;
        revision = e.revision + 1;
        event = input.approve ? 'enrollment.approved' : 'enrollment.denied';
        break;
      }
      case 'approval.create': {
        const previous = (
          await q.query<{
            id: string;
            capability: string;
            risk: string;
            summary: string;
            source_device_id: string;
          }>('SELECT * FROM approval_requests WHERE idempotency_key=$1', [
            input.idempotencyKey,
          ])
        ).rows[0];
        if (previous) {
          if (
            previous.capability !== input.capability ||
            previous.risk !== input.risk ||
            previous.summary !== input.summary ||
            previous.source_device_id !== ctx.deviceId
          )
            return conflict();
          return { version: 1, id: previous.id, executionAuthorized: false };
        }
        resourceId = randomUUID();
        revision = 1;
        await q.query(
          `INSERT INTO approval_requests(id,owner_id,source_device_id,capability,risk,summary,idempotency_key,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            resourceId,
            owner.id,
            ctx.deviceId,
            input.capability,
            input.risk,
            input.summary,
            input.idempotencyKey,
            after(input.expiresInSeconds),
          ],
        );
        event = 'approval.requested';
        extra = { id: resourceId };
        break;
      }
      case 'approval.decide': {
        const row = (
          await q.query<{
            status: string;
            decision_key: string | null;
            expires_at: Date;
            revision: number;
            deciding_session_id: string | null;
          }>('SELECT * FROM approval_requests WHERE id=$1 AND owner_id=$2', [
            input.id,
            owner.id,
          ])
        ).rows[0];
        if (!row) return conflict();
        if (
          row.decision_key === input.idempotencyKey &&
          row.status === input.decision &&
          row.deciding_session_id === ctx.sessionId
        )
          return { version: 1, executionAuthorized: false };
        if (
          row.status !== 'PENDING' ||
          row.expires_at <= new Date() ||
          row.revision !== input.revision
        )
          return conflict();
        await q.query(
          'UPDATE approval_requests SET status=$2,revision=revision+1,decision_key=$3,decided_at=now(),deciding_session_id=$4 WHERE id=$1',
          [input.id, input.decision, input.idempotencyKey, ctx.sessionId],
        );
        resourceId = input.id;
        revision = row.revision + 1;
        event = 'approval.decided';
        break;
      }
    }
    await store.emit(
      q,
      event,
      ctx,
      resourceId,
      revision,
      ['recovery.regenerated', 'lockdown.entered', 'lockdown.exited'].includes(
        event,
      )
        ? 'CRITICAL'
        : 'HIGH',
    );
    return { version: 1, revision, executionAuthorized: false, ...extra };
  });
}
