import { z } from 'zod';
import { capabilitySchema } from '@jarvis/schemas';
export const PROTOCOL_VERSION = 1 as const;
export const idsSchema = z.object({
  requestId: z.uuid(),
  correlationId: z.uuid(),
});
export const healthSchema = z.strictObject({
  status: z.literal('ok'),
  version: z.literal(1),
});
export const readinessSchema = z.strictObject({
  status: z.literal('ready'),
  database: z.literal('ready'),
  schema: z.literal('current'),
});
export const systemSchema = z.strictObject({
  name: z.literal('JARVIS Core'),
  version: z.string(),
  protocolVersion: z.literal(1),
  phase: z.literal(1),
});
export const setupStatusSchema = z.strictObject({
  configured: z.literal(false),
  core: z.enum(['not_configured', 'verified']),
  owner: z.literal('not_implemented'),
  deviceEnrollment: z.literal('not_implemented'),
  voice: z.literal('not_implemented'),
  phoneLink: z.literal('not_implemented'),
  security: z.literal('setup_required'),
  systemTest: z.literal('not_implemented'),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.uuid(),
    correlationId: z.uuid(),
  }),
});
export const eventTypeSchema = z.enum([
  'core.setup.verified',
  'device.connected',
  'device.disconnected',
  'mission.created',
  'mission.blocked',
  'approval.required',
  'approval.granted',
  'approval.denied',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'phone.call.requested',
  'remote.session.started',
  'security.lockdown',
]);
// Explicit metadata allowlist: arbitrary prompts, tokens and payloads are not loggable.
export const eventSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  type: eventTypeSchema,
  timestamp: z.iso.datetime({ offset: true }),
  actor: z.string().min(1).max(100),
  deviceId: z.uuid().nullable(),
  correlationId: z.uuid(),
  requestId: z.uuid(),
  capability: capabilitySchema.nullable(),
  outcome: z.enum(['requested', 'allowed', 'denied', 'succeeded', 'failed']),
  approvalId: z.uuid().nullable(),
  metadata: z.strictObject({
    reasonCode: z
      .string()
      .regex(/^[A-Z0-9_]{1,64}$/)
      .optional(),
  }),
});
export type AuditEvent = z.infer<typeof eventSchema>;
export const deviceMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    version: z.literal(1),
    type: z.literal('device.heartbeat'),
    id: z.uuid(),
    correlationId: z.uuid(),
    deviceId: z.uuid(),
    sentAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    version: z.literal(1),
    type: z.literal('core.ack'),
    id: z.uuid(),
    correlationId: z.uuid(),
    receivedAt: z.iso.datetime({ offset: true }),
  }),
]);

export const setupVerifySchema = z.strictObject({});
