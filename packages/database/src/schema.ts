import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  check,
  bigint,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AuditEvent } from '@jarvis/protocol';
const utc = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  syncSequence: bigint('sync_sequence', { mode: 'bigint' })
    .notNull()
    .default(0n),
  singleton: integer('singleton').notNull().default(1),
  preferredAddress: text('preferred_address').notNull().default('Sir'),
  updatedAt: utc('updated_at').notNull().defaultNow(),
  revision: integer('revision').notNull().default(1),
  securityRevision: integer('security_revision').notNull().default(1),
  securityState: text('security_state', { enum: ['NORMAL', 'LOCKDOWN'] })
    .notNull()
    .default('NORMAL'),
  createdAt: utc('created_at').notNull().defaultNow(),
});
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    displayName: text('display_name').notNull(),
    platform: text('platform', { enum: ['macos', 'windows'] }).notNull(),
    architecture: text('architecture', { enum: ['arm64', 'x64'] }).notNull(),
    runtimeVersion: text('runtime_version').notNull(),
    publicKey: text('public_key').notNull(),
    fingerprint: text('fingerprint'),
    enrolledAt: utc('enrolled_at'),
    revision: integer('revision').notNull().default(1),
    enrollmentStatus: text('enrollment_status', {
      enum: ['pending', 'enrolled', 'rejected'],
    })
      .notNull()
      .default('pending'),
    trustState: text('trust_state', {
      enum: ['untrusted', 'trusted', 'revoked'],
    })
      .notNull()
      .default('untrusted'),
    lastSeen: utc('last_seen'),
    revokedAt: utc('revoked_at'),
    metadata: jsonb('metadata')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
  },
  (t) => [
    uniqueIndex('devices_public_key_unique').on(t.publicKey),
    uniqueIndex('devices_fingerprint_unique').on(t.fingerprint),
    check('devices_platform', sql`${t.platform} in ('macos','windows')`),
    check('devices_architecture', sql`${t.architecture} in ('arm64','x64')`),
    check(
      'devices_enrollment',
      sql`${t.enrollmentStatus} in ('pending','enrolled','rejected')`,
    ),
    check(
      'devices_trust',
      sql`${t.trustState} in ('untrusted','trusted','revoked')`,
    ),
    check(
      'devices_revocation',
      sql`(${t.trustState} = 'revoked') = (${t.revokedAt} is not null)`,
    ),
    check(
      'devices_trusted_enrollment',
      sql`${t.trustState} <> 'trusted' or ${t.enrollmentStatus} = 'enrolled'`,
    ),
  ],
);
export const capabilities = pgTable(
  'capabilities',
  {
    id: text('id').primaryKey(),
    risk: text('risk', {
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    }).notNull(),
  },
  (t) => [
    check(
      'capabilities_risk',
      sql`${t.risk} in ('LOW','MEDIUM','HIGH','CRITICAL')`,
    ),
  ],
);
export const deviceCapabilities = pgTable(
  'device_capabilities',
  {
    id: uuid('id').primaryKey(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    capability: text('capability')
      .notNull()
      .references(() => capabilities.id),
  },
  (t) => [uniqueIndex('device_capability_unique').on(t.deviceId, t.capability)],
);
export const policyRules = pgTable(
  'policy_rules',
  {
    id: uuid('id').primaryKey(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    capability: text('capability')
      .notNull()
      .references(() => capabilities.id),
    decision: text('decision', { enum: ['ALLOW', 'ASK', 'DENY'] }).notNull(),
    createdAt: utc('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('policy_decision', sql`${t.decision} in ('ALLOW','ASK','DENY')`),
  ],
);
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    version: integer('version').notNull(),
    type: text('type').notNull(),
    timestamp: utc('timestamp').notNull(),
    recordedAt: utc('recorded_at').notNull().defaultNow(),
    actor: text('actor').notNull(),
    deviceId: uuid('device_id').references(() => devices.id),
    correlationId: uuid('correlation_id').notNull(),
    requestId: uuid('request_id').notNull(),
    capability: text('capability'),
    outcome: text('outcome', {
      enum: ['requested', 'allowed', 'denied', 'succeeded', 'failed'],
    }).notNull(),
    approvalId: uuid('approval_id'),
    metadata: jsonb('metadata').$type<AuditEvent['metadata']>().notNull(),
    risk: text('risk'),
  },
  (t) => [
    check('audit_version', sql`${t.version} = 1`),
    check(
      'audit_outcome',
      sql`${t.outcome} in ('requested','allowed','denied','succeeded','failed')`,
    ),
  ],
);
export const setupState = pgTable(
  'setup_state',
  {
    id: integer('id').primaryKey(),
    coreVerified: boolean('core_verified').notNull().default(false),
    updatedAt: utc('updated_at').notNull().defaultNow(),
  },
  (t) => [check('setup_singleton', sql`${t.id} = 1`)],
);
export const schemaMetadata = pgTable('schema_metadata', {
  version: integer('version').primaryKey(),
  appliedAt: utc('applied_at').notNull().defaultNow(),
});

// Phase 2 persistence. SQL migrations also enforce status/check/TTL indexes.
import type { DeviceCandidate } from '@jarvis/protocol';
export const passkeys = pgTable('passkeys', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  credentialId: text('credential_id').notNull(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'bigint' }).notNull(),
  transports: jsonb('transports').notNull(),
  name: text('name').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  createdAt: utc('created_at').notNull(),
  lastUsed: utc('last_used'),
  revokedAt: utc('revoked_at'),
  revision: integer('revision').notNull(),
});
export const sessions = pgTable('sessions', {
  kind: text('kind').notNull().default('owner'),
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  deviceId: uuid('device_id')
    .references(() => devices.id)
    .notNull(),
  accessHash: text('access_hash').notNull(),
  refreshHash: text('refresh_hash').notNull(),
  securityRevision: integer('security_revision').notNull(),
  createdAt: utc('created_at').notNull(),
  lastUsed: utc('last_used').notNull(),
  accessExpiresAt: utc('access_expires_at').notNull(),
  idleExpiresAt: utc('idle_expires_at').notNull(),
  expiresAt: utc('expires_at').notNull(),
  revokedAt: utc('revoked_at'),
  revision: integer('revision').notNull(),
});
export const authCeremonies = pgTable('auth_ceremonies', {
  id: uuid('id').primaryKey(),
  mode: text('mode').notNull(),
  device: jsonb('device').$type<DeviceCandidate>().notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
  sessionId: uuid('session_id').references(() => sessions.id),
  browserHash: text('browser_hash').notNull(),
  redeemHash: text('redeem_hash').notNull(),
  proofChallenge: text('proof_challenge').notNull(),
  challenge: text('challenge'),
  purpose: text('purpose'),
  target: text('target'),
  enrollmentId: uuid('enrollment_id'),
  activatedAt: utc('activated_at'),
  challengeUsedAt: utc('challenge_used_at'),
  completedAt: utc('completed_at'),
  redeemedAt: utc('redeemed_at'),
  expiresAt: utc('expires_at').notNull(),
  createdAt: utc('created_at').notNull(),
});
export const replayNonces = pgTable('replay_nonces', {
  sessionId: uuid('session_id')
    .references(() => sessions.id)
    .notNull(),
  nonceHash: text('nonce_hash').notNull(),
  expiresAt: utc('expires_at').notNull(),
});
export const stepUpGrants = pgTable('step_up_grants', {
  id: uuid('id').primaryKey(),
  secretHash: text('secret_hash').notNull(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  deviceId: uuid('device_id')
    .references(() => devices.id)
    .notNull(),
  sessionId: uuid('session_id')
    .references(() => sessions.id)
    .notNull(),
  purpose: text('purpose').notNull(),
  target: text('target').notNull(),
  expiresAt: utc('expires_at').notNull(),
  consumedAt: utc('consumed_at'),
});
export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  secretHash: text('secret_hash').notNull(),
  createdAt: utc('created_at').notNull(),
  consumedAt: utc('consumed_at'),
});
export const deviceEnrollments = pgTable('device_enrollments', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  sourceDeviceId: uuid('source_device_id')
    .references(() => devices.id)
    .notNull(),
  secretHash: text('secret_hash').notNull(),
  device: jsonb('device').$type<DeviceCandidate>(),
  fingerprint: text('fingerprint'),
  status: text('status').notNull(),
  revision: integer('revision').notNull(),
  createdAt: utc('created_at').notNull(),
  expiresAt: utc('expires_at').notNull(),
  decidedAt: utc('decided_at'),
  decidingSessionId: uuid('deciding_session_id').references(() => sessions.id),
});
export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  sourceDeviceId: uuid('source_device_id')
    .references(() => devices.id)
    .notNull(),
  capability: text('capability').notNull(),
  risk: text('risk').notNull(),
  summary: text('summary').notNull(),
  status: text('status').notNull(),
  revision: integer('revision').notNull(),
  idempotencyKey: uuid('idempotency_key').notNull(),
  decisionKey: uuid('decision_key'),
  createdAt: utc('created_at').notNull(),
  expiresAt: utc('expires_at').notNull(),
  decidedAt: utc('decided_at'),
  decidingSessionId: uuid('deciding_session_id').references(() => sessions.id),
  executionAuthorized: boolean('execution_authorized').notNull(),
});
export const syncEvents = pgTable('sync_events', {
  sequence: bigint('sequence', { mode: 'bigint' }).notNull(),
  id: uuid('id').notNull(),
  version: integer('version').notNull(),
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(),
  resourceId: uuid('resource_id').notNull(),
  revision: integer('revision').notNull(),
  timestamp: utc('timestamp').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  payload: jsonb('payload').notNull(),
});
export const syncTickets = pgTable('sync_tickets', {
  secretHash: text('secret_hash').notNull(),
  sessionId: uuid('session_id')
    .references(() => sessions.id)
    .notNull(),
  expiresAt: utc('expires_at').notNull(),
});
export const securityRateLimits = pgTable('security_rate_limits', {
  key: text('key').notNull(),
  count: integer('count').notNull(),
  expiresAt: utc('expires_at').notNull(),
});

export const runtimePresence = pgTable('runtime_presence', {
  deviceId: uuid('device_id')
    .primaryKey()
    .references(() => devices.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id),
  instanceId: uuid('instance_id').notNull(),
  report: jsonb('report').notNull(),
  state: text('state').notNull(),
  revision: integer('revision').notNull().default(1),
  lastSeen: utc('last_seen').notNull(),
  expiresAt: utc('expires_at').notNull(),
});
