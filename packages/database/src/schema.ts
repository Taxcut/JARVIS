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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AuditEvent } from '@jarvis/protocol';
const utc = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
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
