import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  createDatabase,
  auditEvents,
  setupState,
  devices,
  users,
} from './index.js';
const url = process.env.JARVIS_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'Use pnpm test:integration to create an isolated PostgreSQL container.',
  );
const db = createDatabase(url);
const event = () => ({
  version: 1 as const,
  id: randomUUID(),
  type: 'core.setup.verified' as const,
  timestamp: '2026-09-19T12:00:00-04:00',
  actor: 'integration-fixture',
  deviceId: null,
  correlationId: randomUUID(),
  requestId: randomUUID(),
  capability: null,
  outcome: 'succeeded' as const,
  approvalId: null,
  metadata: {},
});
beforeAll(async () => {
  await expect(db.ready()).rejects.toThrow();
  await db.migrate();
  await db.migrate();
});
afterAll(() => db.close());
it('migrates idempotently, verifies connectivity and starts without product records', async () => {
  await db.ready();
  expect(await db.setup()).toMatchObject({
    configured: false,
    core: 'not_configured',
  });
  for (const table of [auditEvents, devices, users, setupState])
    expect(await db.db.select().from(table)).toHaveLength(0);
});
it('stores audited setup atomically, enforces append-only behavior and UTC', async () => {
  const input = event();
  await db.verifyCore(input);
  expect(await db.setup()).toMatchObject({
    configured: false,
    core: 'verified',
  });
  const rows = await db.db.select().from(auditEvents);
  expect(rows[0]?.timestamp.toISOString()).toBe('2026-09-19T16:00:00.000Z');
  expect(rows[0]?.correlationId).toBe(input.correlationId);
  expect((await db.db.execute(sql`show timezone`)).rows[0]).toMatchObject({
    TimeZone: 'UTC',
  });
  await expect(
    db.db.execute(sql`update audit_events set actor='changed'`),
  ).rejects.toThrow();
  await expect(db.db.execute(sql`delete from audit_events`)).rejects.toThrow();
  await expect(db.db.execute(sql`truncate audit_events`)).rejects.toThrow();
  await db.db.update(setupState).set({ coreVerified: false });
  const before = (await db.db.select().from(setupState))[0]?.updatedAt;
  await expect(db.verifyCore(input)).rejects.toThrow();
  expect((await db.db.select().from(setupState))[0]?.updatedAt).toEqual(before);
  expect((await db.setup()).core).toBe('not_configured');
});
it('persists events and rejects unknown metadata without inserting it', async () => {
  await db.appendEvent({ ...event(), type: 'security.lockdown' });
  const before = await db.db.select().from(auditEvents);
  await expect(
    db.appendEvent({
      ...event(),
      metadata: { password: 'forbidden' } as never,
    }),
  ).rejects.toThrow();
  expect(await db.db.select().from(auditEvents)).toHaveLength(before.length);
});
it('enforces relational, setup and device trust constraints', async () => {
  await expect(
    db.db.execute(sql`insert into setup_state(id) values(2)`),
  ).rejects.toThrow();
  const owner = randomUUID();
  await db.db.insert(users).values({ id: owner, displayName: 'test fixture' });
  await expect(
    db.db.insert(devices).values({
      id: randomUUID(),
      ownerId: owner,
      displayName: 'test fixture',
      platform: 'macos',
      architecture: 'arm64',
      runtimeVersion: '0.1.0',
      publicKey: 'fixture-only',
      trustState: 'trusted',
      enrollmentStatus: 'pending',
    }),
  ).rejects.toThrow();
});
