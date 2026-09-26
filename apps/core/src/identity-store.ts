import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { digest, fingerprint } from '@jarvis/security/signing';
import {
  snapshotSchema,
  eventTypeSchema,
  eventSchema,
  type DeviceCandidate,
  type Snapshot,
} from '@jarvis/protocol';
export const secret = () => randomBytes(32).toString('base64url');
export const after = (seconds: number) => new Date(Date.now() + seconds * 1000);
export class SecurityError extends Error {
  constructor(
    public code = 'AUTHENTICATION_REQUIRED',
    public statusCode = 401,
  ) {
    super(code);
  }
}
export const deny = (code?: string, status = 401): never => {
  throw new SecurityError(code, status);
};
export interface Context {
  ownerId: string;
  deviceId: string;
  sessionId: string;
  correlationId: string;
  requestId: string;
}
export interface Owner extends QueryResultRow {
  id: string;
  security_revision: number;
  security_state: 'NORMAL' | 'LOCKDOWN';
  revision: number;
}
export interface Session extends QueryResultRow {
  kind: 'owner' | 'runtime';
  id: string;
  owner_id: string;
  device_id: string;
  access_hash: string;
  refresh_hash: string;
  security_revision: number;
  access_expires_at: Date;
  idle_expires_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revision: number;
}
export interface Device extends QueryResultRow {
  platform: string;
  architecture: string;
  id: string;
  owner_id: string;
  public_key: string;
  trust_state: string;
  enrollment_status: string;
  revoked_at: Date | null;
  revision: number;
}
export interface Ceremony extends QueryResultRow {
  id: string;
  mode: string;
  device: DeviceCandidate;
  owner_id: string | null;
  session_id: string | null;
  browser_hash: string;
  redeem_hash: string;
  proof_challenge: string;
  challenge: string | null;
  purpose: string | null;
  target: string | null;
  enrollment_id: string | null;
  activated_at: Date | null;
  challenge_used_at: Date | null;
  completed_at: Date | null;
  redeemed_at: Date | null;
  expires_at: Date;
}
export interface Passkey extends QueryResultRow {
  id: string;
  owner_id: string;
  credential_id: string;
  public_key: string;
  counter: string;
  transports: string[];
  revoked_at: Date | null;
}
export interface Enrollment extends QueryResultRow {
  id: string;
  owner_id: string;
  source_device_id: string;
  status: string;
  revision: number;
  device: DeviceCandidate | null;
  expires_at: Date;
}
export class IdentityStore {
  constructor(public pool: Pool) {}
  // One personal owner: a transaction-scoped lock makes security transitions and
  // event sequence allocation commit in the same order, including multiple Cores.
  async tx<T>(fn: (q: PoolClient) => Promise<T>): Promise<T> {
    const q = await this.pool.connect();
    try {
      await q.query('BEGIN');
      await q.query('SELECT pg_advisory_xact_lock(4310, 2)');
      const result = await fn(q);
      await q.query('COMMIT');
      return result;
    } catch (error) {
      await q.query('ROLLBACK');
      throw error;
    } finally {
      q.release();
    }
  }
  async owner(q: PoolClient): Promise<Owner | undefined> {
    return (await q.query<Owner>('SELECT * FROM users')).rows[0];
  }
  async hasOwner(): Promise<boolean> {
    return (
      (await this.pool.query('SELECT id FROM users LIMIT 1')).rowCount === 1
    );
  }
  async current(
    q: PoolClient,
    ctx: Context,
    access = true,
  ): Promise<{ session: Session; device: Device; owner: Owner }> {
    const session = (
      await q.query<Session>('SELECT * FROM sessions WHERE id=$1', [
        ctx.sessionId,
      ])
    ).rows[0];
    const owner = await this.owner(q);
    const device = (
      await q.query<Device>('SELECT * FROM devices WHERE id=$1', [ctx.deviceId])
    ).rows[0];
    const now = new Date();
    if (
      !session ||
      !owner ||
      !device ||
      session.owner_id !== owner.id ||
      ctx.ownerId !== owner.id ||
      session.device_id !== device.id ||
      device.owner_id !== owner.id ||
      device.trust_state !== 'trusted' ||
      device.enrollment_status !== 'enrolled' ||
      device.revoked_at ||
      session.revoked_at ||
      session.security_revision !== owner.security_revision ||
      session.expires_at <= now ||
      session.idle_expires_at <= now ||
      (access && session.access_expires_at <= now)
    )
      return deny();
    return { session, device, owner };
  }
  async rate(key: string, limit = 30, seconds = 60): Promise<void> {
    const row = await this.pool.query<{ count: number }>(
      `INSERT INTO security_rate_limits(key,count,expires_at) VALUES($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN security_rate_limits.expires_at<=now() THEN 1 ELSE security_rate_limits.count+1 END,
      expires_at=CASE WHEN security_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE security_rate_limits.expires_at END RETURNING count`,
      [digest(key), after(seconds)],
    );
    if (row.rows[0]!.count > limit) deny('RATE_LIMITED', 429);
  }
  async audit(
    q: PoolClient,
    type: string,
    ctx: Partial<Context>,
    outcome = 'succeeded',
    risk = 'HIGH',
    target?: { resourceId: string; resourceRevision: number },
  ) {
    eventTypeSchema.parse(type);
    const metadata = eventSchema.shape.metadata.parse(target ?? {});
    await q.query(
      `INSERT INTO audit_events(id,version,type,timestamp,actor,device_id,correlation_id,request_id,capability,outcome,approval_id,metadata,risk)
      VALUES($1,1,$2,now(),$3,$4,$5,$6,NULL,$7,$9,$10,$8)`,
      [
        randomUUID(),
        type,
        ctx.ownerId ?? 'authentication',
        ctx.deviceId ?? null,
        ctx.correlationId ?? randomUUID(),
        ctx.requestId ?? randomUUID(),
        outcome,
        risk,
        type.startsWith('approval.') ? (target?.resourceId ?? null) : null,
        metadata,
      ],
    );
  }
  async emit(
    q: PoolClient,
    type: string,
    ctx: Context,
    resourceId: string,
    revision = 1,
    risk = 'HIGH',
    audited = true,
  ) {
    if (audited)
      await this.audit(q, type, ctx, 'succeeded', risk, {
        resourceId,
        resourceRevision: revision,
      });
    await q.query(
      `INSERT INTO sync_events(id,version,owner_id,type,resource_id,revision,correlation_id,payload) VALUES($1,1,$2,$3,$4,$5,$6,'{"changed":true}')`,
      [
        randomUUID(),
        ctx.ownerId,
        type,
        resourceId,
        revision,
        ctx.correlationId,
      ],
    );
    await q.query(
      'UPDATE users SET sync_sequence=(SELECT max(sequence) FROM sync_events WHERE owner_id=$1) WHERE id=$1',
      [ctx.ownerId],
    );
    await q.query("SELECT pg_notify('jarvis_sync', '')");
  }
  async enroll(q: PoolClient, ownerId: string, device: DeviceCandidate) {
    await q.query(
      `INSERT INTO devices(id,owner_id,display_name,platform,architecture,runtime_version,public_key,enrollment_status,trust_state,fingerprint,enrolled_at,last_seen)
      VALUES($1,$2,$3,$4,$5,'0.2.0',$6,'enrolled','trusted',$7,now(),now())`,
      [
        device.id,
        ownerId,
        device.displayName,
        device.platform,
        device.architecture,
        device.publicKey,
        fingerprint(device.publicKey),
      ],
    );
  }
  async newSession(
    q: PoolClient,
    ctx: Context,
    kind: 'owner' | 'runtime' = 'owner',
  ) {
    const access = secret(),
      refresh = secret();
    const owner = await this.owner(q);
    if (!owner) return deny();
    const id = randomUUID();
    await q.query(
      `INSERT INTO sessions(id,owner_id,device_id,access_hash,refresh_hash,security_revision,access_expires_at,idle_expires_at,expires_at,kind)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        ctx.ownerId,
        ctx.deviceId,
        digest(access),
        digest(refresh),
        owner.security_revision,
        after(900),
        after(604800),
        after(2592000),
        kind,
      ],
    );
    await this.emit(q, 'session.created', ctx, id);
    return {
      version: 1 as const,
      sessionId: id,
      deviceId: ctx.deviceId,
      access,
      refresh,
      expiresIn: 900,
    };
  }
  async consumeGrant(
    q: PoolClient,
    ctx: Context,
    token: string | undefined,
    purpose: string,
    target: string,
  ) {
    if (!token) return deny('STEP_UP_REQUIRED', 403);
    const result = await q.query(
      `UPDATE step_up_grants SET consumed_at=now() WHERE secret_hash=$1 AND owner_id=$2 AND device_id=$3 AND session_id=$4 AND purpose=$5 AND target=$6 AND consumed_at IS NULL AND expires_at>now() RETURNING id`,
      [
        digest(token),
        ctx.ownerId,
        ctx.deviceId,
        ctx.sessionId,
        purpose,
        target,
      ],
    );
    if (result.rowCount !== 1) deny('STEP_UP_REQUIRED', 403);
  }
  async snapshot(q: PoolClient, ctx: Context): Promise<Snapshot> {
    await this.current(q, ctx);
    const owner = (
      await q.query(
        `SELECT id,display_name AS "displayName",preferred_address AS "preferredAddress",revision,security_revision AS "securityRevision",security_state AS "securityState",created_at AS "createdAt" FROM users WHERE id=$1`,
        [ctx.ownerId],
      )
    ).rows[0];
    const devices = (
      await q.query(
        `SELECT id,display_name AS "displayName",platform,COALESCE(fingerprint,'') AS fingerprint,trust_state AS "trustState",revision,last_seen AS "lastSeen",enrolled_at AS "enrolledAt",revoked_at AS "revokedAt" FROM devices WHERE owner_id=$1 ORDER BY enrolled_at,id`,
        [ctx.ownerId],
      )
    ).rows;
    const passkeys = (
      await q.query(
        `SELECT id,name,revision,created_at AS "createdAt",last_used AS "lastUsed",backed_up AS "backedUp",device_type AS "deviceType",revoked_at AS "revokedAt" FROM passkeys WHERE owner_id=$1 ORDER BY created_at,id`,
        [ctx.ownerId],
      )
    ).rows;
    const sessions = (
      await q.query(
        `SELECT id,kind,device_id AS "deviceId",revision,created_at AS "createdAt",last_used AS "lastUsed",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM sessions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [ctx.ownerId],
      )
    ).rows;
    const enrollments = (
      await q.query(
        `SELECT id,revision,status,device,fingerprint,expires_at AS "expiresAt" FROM device_enrollments WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [ctx.ownerId],
      )
    ).rows;
    const approvals = (
      await q.query(
        `SELECT id,revision,capability,risk,summary,source_device_id AS "sourceDeviceId",status,created_at AS "createdAt",expires_at AS "expiresAt",decided_at AS "decidedAt",execution_authorized AS "executionAuthorized" FROM approval_requests WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [ctx.ownerId],
      )
    ).rows;
    const audit = (
      await q.query(
        'SELECT id,type,timestamp,outcome,risk FROM audit_events ORDER BY recorded_at DESC,id LIMIT 50',
      )
    ).rows;
    const remaining = (
      await q.query<{ count: string }>(
        'SELECT count(*) FROM recovery_codes WHERE owner_id=$1 AND consumed_at IS NULL',
        [ctx.ownerId],
      )
    ).rows[0]!.count;
    const seq = (
      await q.query<{ seq: string }>(
        'SELECT sync_sequence::text AS seq FROM users WHERE id=$1',
        [ctx.ownerId],
      )
    ).rows[0]!.seq;
    const runtimePresence = (
      await q.query(
        `SELECT r.report || jsonb_build_object('deviceId',r.device_id,'revision',r.revision,'lastSeen',r.last_seen,'expiresAt',r.expires_at,
       'state',CASE WHEN d.revoked_at IS NOT NULL OR d.trust_state='revoked' THEN 'REVOKED'
         WHEN s.revoked_at IS NOT NULL OR s.expires_at<=now() OR s.idle_expires_at<=now() OR s.security_revision<>u.security_revision THEN 'AUTH_REQUIRED'
         WHEN r.expires_at<=now() THEN 'OFFLINE' ELSE r.state END) AS value
       FROM runtime_presence r JOIN devices d ON d.id=r.device_id JOIN sessions s ON s.id=r.session_id JOIN users u ON u.id=r.owner_id
       WHERE r.owner_id=$1 ORDER BY r.device_id`,
        [ctx.ownerId],
      )
    ).rows.map((row: { value: Record<string, unknown> }) => ({
      ...row.value,
      lastSeen: new Date(row.value.lastSeen as string).toISOString(),
      expiresAt: new Date(row.value.expiresAt as string).toISOString(),
    }));
    // Explicit safe projections above; JSON conversion only normalizes timestamps.
    return snapshotSchema.parse(
      JSON.parse(
        JSON.stringify({
          version: 1,
          sequence: seq,
          owner,
          devices,
          passkeys,
          sessions,
          enrollments,
          approvals,
          audit,
          runtimePresence,
          recoveryCodesRemaining: Number(remaining),
        }),
      ),
    );
  }
  async cleanup() {
    await this.tx(async (q) => {
      const owner = await this.owner(q);
      if (owner) {
        const expired = await q.query<{ device_id: string; revision: number }>(
          "UPDATE runtime_presence SET state='OFFLINE',revision=revision+1 WHERE expires_at<=now() AND state NOT IN ('OFFLINE','AUTH_REQUIRED','REVOKED','ERROR','UPDATE_REQUIRED') RETURNING device_id,revision",
        );
        for (const row of expired.rows)
          await this.emit(
            q,
            'runtime.expired',
            {
              ownerId: owner.id,
              deviceId: row.device_id,
              sessionId: randomUUID(),
              correlationId: randomUUID(),
              requestId: randomUUID(),
            },
            row.device_id,
            row.revision,
            'LOW',
          );
        const ctx = {
          ownerId: owner.id,
          deviceId: undefined,
          correlationId: randomUUID(),
          requestId: randomUUID(),
        };
        for (const [table, type] of [
          ['device_enrollments', 'enrollment.expired'],
          ['approval_requests', 'approval.expired'],
        ] as const) {
          const expired = await q.query<{ id: string; revision: number }>(
            `UPDATE ${table} SET status='EXPIRED',revision=revision+1 WHERE status IN ('PENDING'${table === 'device_enrollments' ? ", 'REQUESTED', 'APPROVED'" : ''}) AND expires_at<=now() RETURNING id,revision`,
          );
          for (const row of expired.rows) {
            await this.audit(
              q,
              type,
              {
                ownerId: ctx.ownerId,
                correlationId: ctx.correlationId,
                requestId: ctx.requestId,
              },
              'succeeded',
              'HIGH',
              { resourceId: row.id, resourceRevision: row.revision },
            );
            await q.query(
              `INSERT INTO sync_events(id,version,owner_id,type,resource_id,revision,correlation_id,payload) VALUES($1,1,$2,$3,$4,$5,$6,'{"changed":true}')`,
              [
                randomUUID(),
                owner.id,
                type,
                row.id,
                row.revision,
                ctx.correlationId,
              ],
            );
          }
        }
      }
      for (const table of [
        'auth_ceremonies',
        'step_up_grants',
        'replay_nonces',
        'sync_tickets',
        'security_rate_limits',
      ])
        await q.query(`DELETE FROM ${table} WHERE expires_at < now()`);
      // Preserve session history and FKs, erase expired credential hashes and revoke.
      const expiredSessions = await q.query<{
        id: string;
        owner_id: string;
        device_id: string;
        revision: number;
      }>(
        `UPDATE sessions SET revoked_at=now(),access_hash='revoked:'||gen_random_uuid()::text,refresh_hash='revoked:'||gen_random_uuid()::text,revision=revision+1 WHERE revoked_at IS NULL AND (expires_at<=now() OR idle_expires_at<=now()) RETURNING id,owner_id,device_id,revision`,
      );
      for (const session of expiredSessions.rows)
        await this.emit(
          q,
          'session.expired',
          {
            ownerId: session.owner_id,
            deviceId: session.device_id,
            sessionId: session.id,
            correlationId: randomUUID(),
            requestId: randomUUID(),
          },
          session.id,
          session.revision,
        );
      await q.query(
        `DELETE FROM sync_events WHERE timestamp<now()-interval '24 hours' OR sequence<(SELECT COALESCE(max(sequence),0)-10000 FROM sync_events)`,
      );
      await q.query(
        'UPDATE users SET sync_sequence=GREATEST(sync_sequence,COALESCE((SELECT max(sequence) FROM sync_events),0))',
      );
      await q.query("SELECT pg_notify('jarvis_sync','')");
    });
  }
}
