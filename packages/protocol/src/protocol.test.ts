import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  deviceMessageSchema,
  eventSchema,
  setupStatusSchema,
} from './index.js';
it('accepts v1 and rejects unknown versions and fields', () => {
  const heartbeat = {
    version: 1,
    type: 'device.heartbeat',
    id: randomUUID(),
    correlationId: randomUUID(),
    deviceId: randomUUID(),
    sentAt: new Date().toISOString(),
  };
  expect(deviceMessageSchema.parse(heartbeat)).toEqual(heartbeat);
  expect(() =>
    deviceMessageSchema.parse({ ...heartbeat, version: 2 }),
  ).toThrow();
  expect(() =>
    deviceMessageSchema.parse({ ...heartbeat, command: 'execute' }),
  ).toThrow();
});
it('does not accept fake setup completion', () => {
  expect(() => setupStatusSchema.parse({ configured: true })).toThrow();
});
it('rejects secret-bearing event metadata', () => {
  const event = {
    version: 1,
    id: randomUUID(),
    type: 'core.setup.verified',
    timestamp: new Date().toISOString(),
    actor: 'test',
    deviceId: null,
    correlationId: randomUUID(),
    requestId: randomUUID(),
    capability: null,
    outcome: 'succeeded',
    approvalId: null,
    metadata: { token: 'never-log-this' },
  };
  expect(() => eventSchema.parse(event)).toThrow();
  expect(
    eventSchema.parse({ ...event, metadata: { reasonCode: 'TEST' } }).metadata,
  ).toEqual({ reasonCode: 'TEST' });
});
