import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
} from '@simplewebauthn/server';
import type { Environment } from '@jarvis/config';
import {
  ceremonyPrepareSchema,
  type DeviceCandidate,
  type SignedHeaders,
} from '@jarvis/protocol';
import {
  canonicalProof,
  canonicalRequest,
  digest,
  verifySignature,
} from '@jarvis/security/signing';
import {
  IdentityStore,
  SecurityError,
  deny,
  secret,
  after,
  type Context,
  type Ceremony,
  type Device,
  type Passkey,
} from './identity-store.js';
export class IdentityService {
  constructor(
    public store: IdentityStore,
    public config: Environment,
  ) {}
  async bootstrapAllowed(authorization: string | undefined): Promise<boolean> {
    const provided = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${this.config.JARVIS_API_TOKEN}`);
    return (
      provided.length === expected.length &&
      timingSafeEqual(provided, expected) &&
      !(await this.store.hasOwner())
    );
  }
  async authenticate(
    headers: SignedHeaders,
    method: string,
    path: string,
    body: string,
    bearer: string | undefined,
    refresh = false,
  ): Promise<Context> {
    await this.store.rate('signed:global', 600);
    await this.store.rate(`signed:${headers.deviceId}`, refresh ? 20 : 180);
    const outcome = await this.store.tx(async (q) => {
      const owner = await this.store.owner(q);
      const ctx: Context = {
        ownerId: owner?.id ?? '',
        deviceId: headers.deviceId,
        sessionId: headers.sessionId,
        correlationId: headers.correlationId,
        requestId: randomUUID(),
      };
      try {
        // A revoked device may learn only its own revocation after proving its key
        // and bound session credential. Unverified callers receive the generic denial.
        const revoked = (
          await q.query<{
            public_key: string;
            access_hash: string;
            refresh_hash: string;
          }>(
            `SELECT d.public_key,s.access_hash,s.refresh_hash FROM devices d JOIN sessions s ON s.device_id=d.id
           WHERE d.id=$1 AND s.id=$2 AND d.owner_id=$3 AND (d.revoked_at IS NOT NULL OR d.trust_state='revoked')`,
            [ctx.deviceId, ctx.sessionId, ctx.ownerId],
          )
        ).rows[0];
        if (
          revoked &&
          Math.abs(Date.now() - Number(headers.timestamp)) <= 60000 &&
          digest((bearer ?? '').replace(/^Bearer /, '')) ===
            (refresh ? revoked.refresh_hash : revoked.access_hash) &&
          verifySignature(
            revoked.public_key,
            canonicalRequest({ ...headers, method, path, body }),
            headers.signature,
          )
        )
          deny('DEVICE_REVOKED');
        const { session, device } = await this.store.current(q, ctx, !refresh);
        const hash = digest((bearer ?? '').replace(/^Bearer /, ''));
        if (hash !== (refresh ? session.refresh_hash : session.access_hash))
          deny();
        if (Math.abs(Date.now() - Number(headers.timestamp)) > 60000)
          deny('STALE_REQUEST');
        if (
          !verifySignature(
            device.public_key,
            canonicalRequest({ ...headers, method, path, body }),
            headers.signature,
          )
        )
          deny('INVALID_SIGNATURE');
        if (
          session.kind === 'runtime' &&
          !new Set([
            'GET /api/v1/identity/snapshot',
            'GET /api/v1/runtime/compatibility',
            'POST /api/v1/session/refresh',
            'POST /api/v1/sync/ticket',
            'POST /api/v1/runtime/register',
            'POST /api/v1/runtime/heartbeat',
            'POST /api/v1/runtime/stop',
          ]).has(`${method} ${path}`)
        )
          deny('RUNTIME_SCOPE_REQUIRED', 403);
        const inserted = await q.query(
          `INSERT INTO replay_nonces(session_id,nonce_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING session_id`,
          [session.id, digest(headers.nonce), after(125)],
        );
        if (inserted.rowCount !== 1) deny('REPLAY_REJECTED');
        await q.query(
          'UPDATE sessions SET last_used=now(),idle_expires_at=LEAST(expires_at,$2) WHERE id=$1',
          [session.id, after(604800)],
        );
        await q.query('UPDATE devices SET last_seen=now() WHERE id=$1', [
          device.id,
        ]);
        return ctx;
      } catch (error) {
        if (!(error instanceof SecurityError)) throw error;
        // No unverified device FK or caller-controlled payload enters audit.
        await this.store.audit(
          q,
          error.code === 'REPLAY_REJECTED'
            ? 'request.replay_rejected'
            : error.code === 'INVALID_SIGNATURE'
              ? 'request.signature_rejected'
              : 'authentication.failed',
          { correlationId: ctx.correlationId },
          'denied',
        );
        return error;
      }
    });
    if (outcome instanceof SecurityError) throw outcome;
    return outcome;
  }
  async prepare(
    raw: unknown,
    authorization: string | undefined,
    ctx?: Context,
  ) {
    const input = ceremonyPrepareSchema.parse(raw);
    await this.store.rate('auth:prepare', 30);
    if (input.mode === 'recovery')
      await this.store.rate('recovery:attempt', 5, 900);
    const bootstrap =
      input.mode === 'bootstrap' &&
      (await this.bootstrapAllowed(authorization));
    return this.store.tx(async (q) => {
      const owner = await this.store.owner(q);
      if (input.mode === 'bootstrap') {
        if (!bootstrap || owner) deny();
      } else {
        if (!owner) return deny();
        const device = (
          await q.query<Device>('SELECT * FROM devices WHERE id=$1', [
            input.device.id,
          ])
        ).rows[0];
        if (
          !device ||
          device.owner_id !== owner.id ||
          device.public_key !== input.device.publicKey ||
          device.trust_state !== 'trusted' ||
          device.revoked_at
        )
          deny();
        if (input.mode === 'stepup' || input.mode === 'add') {
          if (!ctx || ctx.deviceId !== input.device.id) return deny();
          await this.store.current(q, ctx);
          if (input.mode === 'stepup' && (!input.purpose || !input.target))
            deny('INVALID_REQUEST', 400);
          if (
            owner.security_state === 'LOCKDOWN' &&
            !(
              input.mode === 'stepup' &&
              input.purpose === 'lockdown.change' &&
              input.target === 'NORMAL'
            )
          )
            deny('LOCKDOWN', 403);
          if (input.mode === 'add')
            await this.store.consumeGrant(
              q,
              ctx,
              input.grant,
              'passkey.add',
              owner.id,
            );
        }
        if (input.mode === 'recovery') {
          if (!input.recoveryCode) return deny();
          // Redemption still requires device proof; consume only after proof below.
          const code = await q.query(
            'SELECT id FROM recovery_codes WHERE owner_id=$1 AND secret_hash=$2 AND consumed_at IS NULL',
            [owner.id, digest(input.recoveryCode)],
          );
          if (code.rowCount !== 1) deny();
        }
      }
      const id = randomUUID(),
        browserSecret = secret(),
        redeemSecret = secret(),
        challenge = secret();
      await q.query(
        `INSERT INTO auth_ceremonies(id,mode,device,owner_id,session_id,browser_hash,redeem_hash,proof_challenge,purpose,target,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          input.mode,
          input.device,
          owner?.id ?? null,
          ctx?.sessionId ?? null,
          digest(browserSecret),
          digest(redeemSecret),
          challenge,
          input.purpose ?? null,
          input.mode === 'recovery'
            ? digest(input.recoveryCode!)
            : (input.target ?? null),
          after(180),
        ],
      );
      return { version: 1, id, challenge, browserSecret, redeemSecret };
    });
  }
  async ceremony(
    q: PoolClient,
    id: string,
    token: string,
    kind: 'browser' | 'redeem',
  ): Promise<Ceremony> {
    const c = (
      await q.query<Ceremony>('SELECT * FROM auth_ceremonies WHERE id=$1', [id])
    ).rows[0];
    if (
      !c ||
      c.expires_at <= new Date() ||
      c.redeemed_at ||
      (kind === 'browser' ? c.browser_hash : c.redeem_hash) !== digest(token)
    )
      return deny();
    return c;
  }
  async activate(id: string, token: string, signature: string) {
    await this.store.rate('auth:proof', 60);
    return this.store.tx(async (q) => {
      const c = await this.ceremony(q, id, token, 'redeem');
      if (
        c.activated_at ||
        !verifySignature(
          c.device.publicKey,
          canonicalProof(
            c.id,
            c.proof_challenge,
            c.device.id,
            c.device.publicKey,
          ),
          signature,
        )
      )
        deny();
      if (c.mode === 'recovery') {
        const result = await q.query(
          'UPDATE recovery_codes SET consumed_at=now() WHERE owner_id=$1 AND secret_hash=$2 AND consumed_at IS NULL RETURNING id',
          [c.owner_id, c.target],
        );
        if (result.rowCount !== 1) deny();
        await this.store.audit(
          q,
          'recovery.used',
          { ownerId: c.owner_id!, deviceId: c.device.id },
          'succeeded',
          'CRITICAL',
        );
      }
      await q.query(
        'UPDATE auth_ceremonies SET activated_at=now() WHERE id=$1',
        [id],
      );
      if (c.mode === 'enrollment') {
        const e = await q.query(
          `UPDATE device_enrollments SET status='REQUESTED',revision=revision+1 WHERE id=$1 AND status='PENDING' AND expires_at>now() RETURNING revision`,
          [c.enrollment_id],
        );
        if (e.rowCount !== 1) deny();
        const source = (
          await q.query<{ source_device_id: string }>(
            'SELECT source_device_id FROM device_enrollments WHERE id=$1',
            [c.enrollment_id],
          )
        ).rows[0]!;
        await this.store.emit(
          q,
          'enrollment.requested',
          {
            ownerId: c.owner_id!,
            deviceId: source.source_device_id,
            sessionId: '',
            correlationId: randomUUID(),
            requestId: randomUUID(),
          },
          c.enrollment_id!,
          e.rows[0]!.revision as number,
        );
      }
      return { version: 1, activated: true };
    });
  }
  async browserContext(id: string, token: string) {
    return this.store.tx(async (q) => {
      const c = await this.ceremony(q, id, token, 'browser');
      if (!c.activated_at || c.completed_at || c.mode === 'enrollment')
        return deny();
      const operation =
        c.mode === 'bootstrap'
          ? 'Create the sole JARVIS owner and trust this device'
          : c.mode === 'recovery'
            ? 'Recover ownership, replace prior passkeys and revoke sessions'
            : c.mode === 'add'
              ? 'Register an additional owner passkey'
              : c.mode === 'stepup'
                ? `Authorize ${c.purpose} for ${c.target}`
                : 'Sign in to JARVIS';
      return {
        version: 1,
        operation,
        deviceName: c.device.displayName,
        fingerprint: digest(Buffer.from(c.device.publicKey, 'base64url')),
      };
    });
  }
  async options(id: string, token: string) {
    await this.store.rate('auth:options', 30);
    return this.store.tx(async (q) => {
      const c = await this.ceremony(q, id, token, 'browser');
      if (
        !c.activated_at ||
        c.challenge ||
        c.challenge_used_at ||
        c.mode === 'enrollment'
      )
        return deny();
      const register = ['bootstrap', 'add', 'recovery'].includes(c.mode);
      const keys = (
        await q.query<Passkey>(
          'SELECT * FROM passkeys WHERE owner_id=$1 AND revoked_at IS NULL',
          [c.owner_id],
        )
      ).rows;
      const options = register
        ? await generateRegistrationOptions({
            rpName: 'JARVIS',
            rpID: this.config.JARVIS_RP_ID,
            userName: 'Sir',
            userDisplayName: 'JARVIS owner',
            userID: new TextEncoder().encode(c.owner_id ?? c.id),
            attestationType: 'none',
            authenticatorSelection: {
              residentKey: 'required',
              userVerification: 'required',
            },
            preferredAuthenticatorType: 'localDevice',
            excludeCredentials: keys.map((k) => ({
              id: k.credential_id,
              transports: k.transports as AuthenticatorTransport[],
            })),
          })
        : await generateAuthenticationOptions({
            rpID: this.config.JARVIS_RP_ID,
            userVerification: 'required',
            allowCredentials: keys.map((k) => ({
              id: k.credential_id,
              transports: k.transports as AuthenticatorTransport[],
            })),
          });
      await q.query('UPDATE auth_ceremonies SET challenge=$2 WHERE id=$1', [
        id,
        options.challenge,
      ]);
      return { version: 1, register, options };
    });
  }
  async verify(id: string, token: string, response: Record<string, unknown>) {
    await this.store.rate('auth:assertion', 30);
    const result = await this.store.tx(async (q) => {
      const c = await this.ceremony(q, id, token, 'browser');
      if (
        !c.activated_at ||
        !c.challenge ||
        c.challenge_used_at ||
        c.completed_at ||
        c.mode === 'enrollment'
      )
        return deny();
      await q.query(
        'UPDATE auth_ceremonies SET challenge_used_at=now() WHERE id=$1',
        [id],
      );
      // Savepoint retains challenge consumption on any assertion/constraint failure.
      await q.query('SAVEPOINT assertion');
      try {
        let owner = await this.store.owner(q);
        if (
          c.mode === 'bootstrap' ? !!owner : !owner || c.owner_id !== owner.id
        )
          return deny();
        if (c.mode !== 'bootstrap') {
          const device = (
            await q.query<Device>('SELECT * FROM devices WHERE id=$1', [
              c.device.id,
            ])
          ).rows[0];
          if (
            !device ||
            device.trust_state !== 'trusted' ||
            device.revoked_at ||
            device.public_key !== c.device.publicKey
          )
            deny();
          if (c.session_id)
            await this.store.current(q, {
              ownerId: c.owner_id!,
              deviceId: c.device.id,
              sessionId: c.session_id,
              correlationId: randomUUID(),
              requestId: randomUUID(),
            });
          if (
            owner!.security_state === 'LOCKDOWN' &&
            !['login', 'recovery'].includes(c.mode) &&
            !(
              c.mode === 'stepup' &&
              c.purpose === 'lockdown.change' &&
              c.target === 'NORMAL'
            )
          )
            deny('LOCKDOWN', 403);
        }
        const register = ['bootstrap', 'add', 'recovery'].includes(c.mode);
        let credentialId: string;
        let credentialRevision = 1;
        if (register) {
          const verified = await verifyRegistrationResponse({
            response: response as unknown as RegistrationResponseJSON,
            expectedChallenge: c.challenge,
            expectedOrigin: this.config.JARVIS_AUTH_ORIGIN,
            expectedRPID: this.config.JARVIS_RP_ID,
            requireUserVerification: true,
          });
          if (!verified.verified || !verified.registrationInfo) return deny();
          const info = verified.registrationInfo;
          if (c.mode === 'bootstrap') {
            const ownerId = c.id;
            await q.query('INSERT INTO users(id) VALUES($1)', [ownerId]);
            await this.store.enroll(q, ownerId, c.device);
            await q.query(
              'UPDATE auth_ceremonies SET owner_id=$2 WHERE id=$1',
              [id, ownerId],
            );
            c.owner_id = ownerId;
            owner = await this.store.owner(q);
          }
          credentialId = randomUUID();
          await q.query(
            `INSERT INTO passkeys(id,owner_id,credential_id,public_key,counter,transports,name,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              credentialId,
              c.owner_id,
              info.credential.id,
              Buffer.from(info.credential.publicKey).toString('base64url'),
              info.credential.counter,
              JSON.stringify(info.credential.transports ?? []),
              'Owner passkey',
              info.credentialDeviceType,
              info.credentialBackedUp,
            ],
          );
        } else {
          if (typeof response.id !== 'string') return deny();
          const key = (
            await q.query<Passkey>(
              'SELECT * FROM passkeys WHERE owner_id=$1 AND credential_id=$2 AND revoked_at IS NULL',
              [c.owner_id, response.id],
            )
          ).rows[0];
          if (!key) return deny();
          const verified = await verifyAuthenticationResponse({
            response: response as unknown as AuthenticationResponseJSON,
            expectedChallenge: c.challenge,
            expectedOrigin: this.config.JARVIS_AUTH_ORIGIN,
            expectedRPID: this.config.JARVIS_RP_ID,
            requireUserVerification: true,
            credential: {
              id: key.credential_id,
              publicKey: new Uint8Array(
                Buffer.from(key.public_key, 'base64url'),
              ),
              counter: Number(key.counter),
              transports: key.transports as AuthenticatorTransport[],
            },
          });
          if (!verified.verified) return deny();
          const updated = await q.query<{ revision: number }>(
            'UPDATE passkeys SET counter=$2,last_used=now(),backed_up=$3,revision=revision+1 WHERE id=$1 RETURNING revision',
            [
              key.id,
              verified.authenticationInfo.newCounter,
              verified.authenticationInfo.credentialBackedUp,
            ],
          );
          credentialId = key.id;
          credentialRevision = updated.rows[0]!.revision;
        }
        const ctx = {
          ownerId: c.owner_id!,
          deviceId: c.device.id,
          sessionId: c.session_id ?? '',
          correlationId: randomUUID(),
          requestId: randomUUID(),
        };
        if (c.mode === 'bootstrap') {
          await this.store.emit(q, 'owner.created', ctx, c.owner_id!);
          await this.store.emit(q, 'device.enrolled', ctx, c.device.id);
        }
        if (c.mode === 'recovery') {
          await q.query(
            'UPDATE passkeys SET revoked_at=now(),revision=revision+1 WHERE owner_id=$1 AND id<>$2 AND revoked_at IS NULL',
            [c.owner_id, credentialId],
          );
          await q.query(
            'DELETE FROM auth_ceremonies WHERE owner_id=$1 AND id<>$2',
            [c.owner_id, c.id],
          );
          await q.query(
            "UPDATE device_enrollments SET status='CANCELLED',revision=revision+1 WHERE owner_id=$1 AND status IN ('PENDING','REQUESTED','APPROVED')",
            [c.owner_id],
          );
          // A recovery replaces authority, cancels existing sessions and grants.
          await q.query(
            'UPDATE users SET security_revision=security_revision+1,revision=revision+1,updated_at=now() WHERE id=$1',
            [c.owner_id],
          );
          await q.query(
            'UPDATE sessions SET revoked_at=now(),revision=revision+1 WHERE owner_id=$1 AND revoked_at IS NULL',
            [c.owner_id],
          );
          await q.query(
            'UPDATE step_up_grants SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL',
            [c.owner_id],
          );
          await this.store.emit(
            q,
            'security.recovered',
            ctx,
            c.owner_id!,
            owner!.revision + 1,
            'CRITICAL',
          );
        }
        await this.store.emit(
          q,
          register ? 'passkey.created' : 'authentication.succeeded',
          ctx,
          credentialId,
          credentialRevision,
        );
        await q.query(
          'UPDATE auth_ceremonies SET completed_at=now() WHERE id=$1',
          [id],
        );
        return { version: 1, complete: true };
      } catch {
        await q.query('ROLLBACK TO SAVEPOINT assertion');
        await this.store.audit(q, 'authentication.failed', {}, 'denied');
        return new SecurityError('AUTHENTICATION_FAILED');
      }
    });
    if (result instanceof SecurityError) throw result;
    return result;
  }
  async redeem(id: string, token: string, signature: string) {
    await this.store.rate('auth:redeem', 120);
    return this.store.tx(async (q) => {
      const c = await this.ceremony(q, id, token, 'redeem');
      if (
        !c.activated_at ||
        !verifySignature(
          c.device.publicKey,
          canonicalProof(
            c.id,
            c.proof_challenge,
            c.device.id,
            c.device.publicKey,
          ),
          signature,
        )
      )
        return deny();
      if (c.mode === 'enrollment') {
        const row = (
          await q.query<{ status: string }>(
            'SELECT status FROM device_enrollments WHERE id=$1 AND expires_at>now()',
            [c.enrollment_id],
          )
        ).rows[0];
        if (
          !row ||
          ['DENIED', 'EXPIRED', 'CANCELLED', 'CONSUMED'].includes(row.status)
        )
          return deny();
        if (row.status !== 'APPROVED') return { version: 1, pending: true };
        await q.query(
          "UPDATE device_enrollments SET status='CONSUMED',revision=revision+1 WHERE id=$1",
          [c.enrollment_id],
        );
      } else if (!c.completed_at) return { version: 1, pending: true };
      const device = (
        await q.query<Device>('SELECT * FROM devices WHERE id=$1', [
          c.device.id,
        ])
      ).rows[0];
      if (
        !device ||
        device.public_key !== c.device.publicKey ||
        device.trust_state !== 'trusted' ||
        device.revoked_at
      )
        return deny();
      const ctx = {
        ownerId: c.owner_id!,
        deviceId: c.device.id,
        sessionId: c.session_id ?? '',
        correlationId: randomUUID(),
        requestId: randomUUID(),
      };
      await q.query(
        'UPDATE auth_ceremonies SET redeemed_at=now() WHERE id=$1',
        [id],
      );
      if (c.mode === 'stepup') {
        await this.store.current(q, ctx);
        const grant = secret();
        await q.query(
          `INSERT INTO step_up_grants(id,secret_hash,owner_id,device_id,session_id,purpose,target,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            digest(grant),
            c.owner_id,
            c.device.id,
            c.session_id,
            c.purpose,
            c.target,
            after(120),
          ],
        );
        return { version: 1, grant };
      }
      if (c.mode === 'add') {
        await this.store.current(q, ctx);
        return { version: 1, complete: true };
      }
      if (c.mode === 'enrollment')
        await this.store.emit(
          q,
          'enrollment.consumed',
          ctx,
          c.enrollment_id!,
          (
            await q.query<{ revision: number }>(
              'SELECT revision FROM device_enrollments WHERE id=$1',
              [c.enrollment_id],
            )
          ).rows[0]!.revision,
        );
      return this.store.newSession(q, ctx);
    });
  }
  async refresh(ctx: Context, token: string) {
    return this.store.tx(async (q) => {
      const { session } = await this.store.current(q, ctx, false);
      // Check again inside rotation transaction: racing refreshes cannot both win.
      if (session.refresh_hash !== digest(token)) return deny();
      const access = secret(),
        refresh = secret();
      await q.query(
        'UPDATE sessions SET access_hash=$2,refresh_hash=$3,access_expires_at=$4,last_used=now(),revision=revision+1 WHERE id=$1',
        [ctx.sessionId, digest(access), digest(refresh), after(900)],
      );
      await this.store.emit(
        q,
        'session.refreshed',
        ctx,
        session.id,
        session.revision + 1,
      );
      return {
        version: 1,
        sessionId: ctx.sessionId,
        deviceId: ctx.deviceId,
        access,
        refresh,
        expiresIn: 900,
      };
    });
  }
  async pair(secretValue: string, candidate: DeviceCandidate) {
    await this.store.rate('enrollment:attempt', 10, 300);
    return this.store.tx(async (q) => {
      const owner = await this.store.owner(q);
      if (!owner || owner.security_state !== 'NORMAL') return deny();
      const e = (
        await q.query<{ id: string }>(
          "SELECT id FROM device_enrollments WHERE secret_hash=$1 AND status='PENDING' AND device IS NULL AND expires_at>now()",
          [digest(secretValue)],
        )
      ).rows[0];
      if (
        !e ||
        (
          await q.query('SELECT id FROM devices WHERE id=$1 OR public_key=$2', [
            candidate.id,
            candidate.publicKey,
          ])
        ).rowCount
      )
        return deny();
      await q.query(
        'UPDATE device_enrollments SET device=$2,fingerprint=$3 WHERE id=$1',
        [
          e.id,
          candidate,
          digest(Buffer.from(candidate.publicKey, 'base64url')),
        ],
      );
      const id = randomUUID(),
        redeemSecret = secret(),
        challenge = secret();
      await q.query(
        `INSERT INTO auth_ceremonies(id,mode,device,owner_id,browser_hash,redeem_hash,proof_challenge,enrollment_id,expires_at) VALUES($1,'enrollment',$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          candidate,
          owner.id,
          digest(secret()),
          digest(redeemSecret),
          challenge,
          e.id,
          after(180),
        ],
      );
      return { version: 1, id, redeemSecret, challenge };
    });
  }
}
