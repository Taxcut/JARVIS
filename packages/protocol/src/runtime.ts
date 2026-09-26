import { z } from 'zod';
export const RUNTIME_PROTOCOL_VERSION = 1 as const;
export const runtimeStateSchema = z.enum([
  'UNCONFIGURED',
  'STARTING',
  'CONNECTING',
  'ONLINE',
  'DEGRADED',
  'OFFLINE',
  'SUSPENDING',
  'STOPPING',
  'AUTH_REQUIRED',
  'REVOKED',
  'UPDATE_REQUIRED',
  'ERROR',
]);
export const runtimeCapabilityStateSchema = z.enum([
  'UNAVAILABLE',
  'AVAILABLE',
  'PERMISSION_REQUIRED',
  'DISABLED',
  'DEGRADED',
]);
export const runtimeCapabilitiesSchema = z.strictObject({
  'runtime.lifecycle': runtimeCapabilityStateSchema,
  'runtime.health': runtimeCapabilityStateSchema,
  'runtime.secure_identity': runtimeCapabilityStateSchema,
  'runtime.realtime': runtimeCapabilityStateSchema,
  'runtime.autostart': runtimeCapabilityStateSchema,
  'runtime.sleep_wake': runtimeCapabilityStateSchema,
  'voice.wake_word': z.literal('UNAVAILABLE'),
  'audio.capture': z.literal('UNAVAILABLE'),
  'screen.capture': z.literal('UNAVAILABLE'),
  'computer.keyboard': z.literal('UNAVAILABLE'),
  'computer.mouse': z.literal('UNAVAILABLE'),
  'computer.apps': z.literal('UNAVAILABLE'),
  'computer.shell': z.literal('UNAVAILABLE'),
  'remote.desktop': z.literal('UNAVAILABLE'),
});
export const runtimeReportSchema = z.strictObject({
  version: z.literal(1),
  runtimeProtocolVersion: z.int().positive(),
  instanceId: z.uuid(),
  runtimeVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  build: z.string().regex(/^(development|[0-9a-f]{7,40})$/),
  platform: z.enum(['macos', 'windows']),
  architecture: z.enum(['arm64', 'x64']),
  startedAt: z.iso.datetime(),
  state: runtimeStateSchema,
  startup: z.enum([
    'NOT_CONFIGURED',
    'ENABLED',
    'DISABLED',
    'APPROVAL_REQUIRED',
    'UNAVAILABLE',
    'ERROR',
  ]),
  wakeGeneration: z.int().nonnegative(),
  capabilities: runtimeCapabilitiesSchema,
  executionAvailable: z.literal(false),
});
export const runtimePresenceSchema = runtimeReportSchema.extend({
  deviceId: z.uuid(),
  revision: z.int().positive(),
  lastSeen: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export const runtimeCompatibilitySchema = z.strictObject({
  version: z.literal(1),
  runtimeProtocolVersion: z.literal(1),
  minimumRuntimeProtocolVersion: z.literal(1),
  heartbeatSeconds: z.literal(30),
  leaseSeconds: z.literal(90),
  executionAvailable: z.literal(false),
});
export type RuntimeReport = z.infer<typeof runtimeReportSchema>;
export type RuntimePresence = z.infer<typeof runtimePresenceSchema>;
