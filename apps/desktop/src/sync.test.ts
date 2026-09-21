import { expect, it } from 'vitest';
import { reconcile } from './identity-client.js';
import type { Snapshot } from '@jarvis/protocol';
const owner = '11111111-1111-4111-8111-111111111111';
const snapshot: Snapshot = {
  version: 1,
  sequence: '1',
  owner: {
    id: owner,
    displayName: null,
    preferredAddress: 'Sir',
    revision: 1,
    securityRevision: 1,
    securityState: 'NORMAL',
    createdAt: '2026-09-20T00:00:00.000Z',
  },
  devices: [],
  passkeys: [],
  sessions: [],
  enrollments: [],
  approvals: [],
  audit: [],
  recoveryCodesRemaining: 0,
};
const event = (sequence: string) => ({
  version: 1,
  id: `22222222-2222-4222-8222-${sequence.padStart(12, '0')}`,
  sequence,
  type: 'owner.update',
  ownerId: owner,
  resourceId: owner,
  revision: Number(sequence),
  timestamp: '2026-09-20T00:00:00.000Z',
  correlationId: owner,
  payload: { changed: true },
});
it('resyncs authoritatively, deduplicates batches and detects missing/out-of-order events', () => {
  const first = reconcile(
    { sequence: '0', snapshot: null },
    { version: 1, type: 'snapshot', fromSequence: '0', events: [], snapshot },
  );
  const next = {
    version: 1,
    type: 'update',
    fromSequence: '1',
    events: [event('2')],
    snapshot: { ...snapshot, sequence: '2' },
  };
  const second = reconcile(first, next);
  expect(second.sequence).toBe('2');
  expect(reconcile(second, next)).toBe(second);
  expect(() => reconcile(first, { ...next, fromSequence: '0' })).toThrow(
    'Replay gap',
  );
  expect(() => reconcile(first, { ...next, events: [] })).toThrow(
    'Incomplete stream',
  );
  expect(() =>
    reconcile(first, { ...next, events: [event('2'), event('1')] }),
  ).toThrow('Out-of-order');
  expect(() => reconcile(first, { ...next, version: 2 })).toThrow();
  expect(
    reconcile(second, {
      version: 1,
      type: 'snapshot',
      fromSequence: '999',
      events: [],
      snapshot,
    }).sequence,
  ).toBe('1');
});
