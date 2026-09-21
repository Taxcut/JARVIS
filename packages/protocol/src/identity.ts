import { z } from 'zod';
import { capabilitySchema, riskSchema } from '@jarvis/schemas';
export const versioned = { version: z.literal(1) };
export const opaqueSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
export const publicKeySchema = opaqueSchema;
export const nameSchema = z.string().trim().min(1).max(80);
export const candidateSchema = z.strictObject({
  id: z.uuid(),
  publicKey: publicKeySchema,
  displayName: nameSchema,
  platform: z.enum(['macos', 'windows']),
  architecture: z.enum(['arm64', 'x64']),
});
export type DeviceCandidate = z.infer<typeof candidateSchema>;
export const purposeSchema = z.enum([
  'passkey.add',
  'passkey.revoke',
  'device.approve',
  'device.revoke',
  'session.revoke',
  'recovery.regenerate',
  'lockdown.change',
]);
export const ceremonyPrepareSchema = z.strictObject({
  ...versioned,
  mode: z.enum(['bootstrap', 'login', 'stepup', 'add', 'recovery']),
  device: candidateSchema,
  purpose: purposeSchema.optional(),
  target: z.string().min(1).max(100).optional(),
  grant: opaqueSchema.optional(),
  recoveryCode: opaqueSchema.optional(),
});
export const ceremonyProofSchema = z.strictObject({
  ...versioned,
  id: z.uuid(),
  secret: opaqueSchema,
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});
export const ceremonySecretSchema = z.strictObject({
  ...versioned,
  id: z.uuid(),
  secret: opaqueSchema,
});
export const credentialResponseSchema = z.strictObject({
  ...versioned,
  id: z.uuid(),
  secret: opaqueSchema,
  response: z.record(z.string(), z.unknown()),
});
export const signedHeadersSchema = z.strictObject({
  version: z.literal('1'),
  deviceId: z.uuid(),
  sessionId: z.uuid(),
  timestamp: z.string().regex(/^\d{13}$/),
  nonce: opaqueSchema,
  correlationId: z.uuid(),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});
export type SignedHeaders = z.infer<typeof signedHeadersSchema>;
export const mutationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...versioned,
    action: z.literal('owner.update'),
    revision: z.int().positive(),
    displayName: z.string().trim().max(80),
    preferredAddress: nameSchema,
  }),
  z.strictObject({
    ...versioned,
    action: z.literal('device.rename'),
    id: z.uuid(),
    revision: z.int().positive(),
    name: nameSchema,
  }),
  z.strictObject({
    ...versioned,
    action: z.literal('passkey.rename'),
    id: z.uuid(),
    revision: z.int().positive(),
    name: nameSchema,
  }),
  z.strictObject({
    ...versioned,
    action: z.enum(['device.revoke', 'passkey.revoke', 'session.revoke']),
    id: z.uuid(),
    revision: z.int().positive(),
    grant: opaqueSchema,
  }),
  z.strictObject({
    ...versioned,
    action: z.literal('lockdown.change'),
    state: z.enum(['NORMAL', 'LOCKDOWN']),
    revision: z.int().positive(),
    grant: opaqueSchema,
  }),
  z.strictObject({
    ...versioned,
    action: z.literal('recovery.regenerate'),
    grant: opaqueSchema,
  }),
  z.strictObject({ ...versioned, action: z.literal('enrollment.create') }),
  z.strictObject({
    ...versioned,
    action: z.literal('enrollment.decide'),
    id: z.uuid(),
    revision: z.int().positive(),
    approve: z.boolean(),
    grant: opaqueSchema.optional(),
  }),
  z.strictObject({
    ...versioned,
    action: z.literal('approval.create'),
    capability: capabilitySchema,
    risk: riskSchema,
    summary: z.string().trim().min(1).max(240),
    idempotencyKey: z.uuid(),
    expiresInSeconds: z.int().min(30).max(3600),
  }),
  z.strictObject({
    ...versioned,
    action: z.literal('approval.decide'),
    id: z.uuid(),
    revision: z.int().positive(),
    decision: z.enum(['APPROVED', 'DENIED', 'CANCELLED']),
    idempotencyKey: z.uuid(),
  }),
]);
export type Mutation = z.infer<typeof mutationSchema>;
export const pairingPrepareSchema = z.strictObject({
  ...versioned,
  secret: opaqueSchema,
  device: candidateSchema,
});
export const syncHelloSchema = z.strictObject({
  ...versioned,
  ticket: opaqueSchema,
  lastSequence: z.string().regex(/^(0|[1-9]\d{0,18})$/),
});
export const syncEventSchema = z.strictObject({
  ...versioned,
  id: z.uuid(),
  sequence: z.string().regex(/^[1-9]\d{0,18}$/),
  type: z.string().max(80),
  ownerId: z.uuid(),
  resourceId: z.uuid(),
  revision: z.int().positive(),
  timestamp: z.iso.datetime(),
  correlationId: z.uuid(),
  payload: z.strictObject({ changed: z.literal(true) }),
});
export type SyncEvent = z.infer<typeof syncEventSchema>;
export const syncStateSchema = z.enum([
  'CONNECTING',
  'SYNCING',
  'LIVE',
  'DEGRADED',
  'OFFLINE',
]);
export type SyncState = z.infer<typeof syncStateSchema>;
export const ownerViewSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string().nullable(),
  preferredAddress: z.string(),
  revision: z.int(),
  securityRevision: z.int(),
  securityState: z.enum(['NORMAL', 'LOCKDOWN']),
  createdAt: z.string(),
});
export const deviceViewSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string(),
  platform: z.enum(['macos', 'windows']),
  fingerprint: z.string(),
  trustState: z.enum(['untrusted', 'trusted', 'revoked']),
  revision: z.int(),
  lastSeen: z.string().nullable(),
  enrolledAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export const passkeyViewSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  revision: z.int(),
  createdAt: z.string(),
  lastUsed: z.string().nullable(),
  backedUp: z.boolean(),
  deviceType: z.string(),
  revokedAt: z.string().nullable(),
});
export const sessionViewSchema = z.strictObject({
  id: z.uuid(),
  deviceId: z.uuid(),
  revision: z.int(),
  createdAt: z.string(),
  lastUsed: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
});
export const enrollmentViewSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int(),
  status: z.enum([
    'PENDING',
    'REQUESTED',
    'APPROVED',
    'DENIED',
    'EXPIRED',
    'CONSUMED',
    'CANCELLED',
  ]),
  device: candidateSchema.nullable(),
  fingerprint: z.string().nullable(),
  expiresAt: z.string(),
});
export const approvalViewSchema = z.strictObject({
  id: z.uuid(),
  revision: z.int(),
  capability: capabilitySchema,
  risk: riskSchema,
  summary: z.string(),
  sourceDeviceId: z.uuid(),
  status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED']),
  createdAt: z.string(),
  expiresAt: z.string(),
  decidedAt: z.string().nullable(),
  executionAuthorized: z.literal(false),
});
export const snapshotSchema = z.strictObject({
  ...versioned,
  sequence: z.string().regex(/^(0|[1-9]\d{0,18})$/),
  owner: ownerViewSchema,
  devices: z.array(deviceViewSchema),
  passkeys: z.array(passkeyViewSchema),
  sessions: z.array(sessionViewSchema),
  enrollments: z.array(enrollmentViewSchema),
  approvals: z.array(approvalViewSchema),
  recoveryCodesRemaining: z.int().nonnegative(),
  audit: z.array(
    z.strictObject({
      id: z.uuid(),
      type: z.string(),
      timestamp: z.string(),
      outcome: z.string(),
      risk: z.string().nullable(),
    }),
  ),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
