import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deviceSchema, personalitySchema } from './index.js';
const device = {
  id: randomUUID(),
  ownerId: randomUUID(),
  displayName: 'test fixture',
  platform: 'macos',
  architecture: 'arm64',
  runtimeVersion: '0.1.0',
  publicKey: 'test-public-key',
  enrollmentStatus: 'pending',
  trustState: 'untrusted',
  lastSeen: null,
  revokedAt: null,
  capabilities: [],
};
it('enforces device trust and revocation consistency', () => {
  expect(deviceSchema.parse(device).trustState).toBe('untrusted');
  expect(() =>
    deviceSchema.parse({ ...device, trustState: 'trusted' }),
  ).toThrow();
  expect(() =>
    deviceSchema.parse({ ...device, trustState: 'revoked' }),
  ).toThrow();
  expect(() =>
    deviceSchema.parse({ ...device, privateKey: 'forbidden' }),
  ).toThrow();
  expect(
    deviceSchema.parse({
      ...device,
      trustState: 'revoked',
      revokedAt: new Date().toISOString(),
    }).trustState,
  ).toBe('revoked');
});
it('sets legally distinct personality configuration', () => {
  expect(personalitySchema.parse({})).toMatchObject({
    address: 'Sir',
    responseLength: 'adaptive',
    wakePhrases: ['Jarvis', 'Hey Jarvis'],
  });
});
