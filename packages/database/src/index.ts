import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import {
  eventSchema,
  type AuditEvent,
  type SetupStatus,
} from '@jarvis/protocol';
import * as schema from './schema.js';
export * from './schema.js';
export function createDatabase(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    options: '-c timezone=UTC',
  });
  pool.on('error', () => {
    /* Individual requests report dependency failure without logging credentials. */
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    async migrate() {
      await migrate(db, {
        migrationsFolder: fileURLToPath(
          new URL('../../../infra/migrations', import.meta.url),
        ),
      });
    },
    async ready() {
      await db.execute(sql`select 1`);
      const rows = await db.select().from(schema.schemaMetadata);
      if (rows.length !== 1 || rows[0]?.version !== 4)
        throw new Error('Schema not current');
    },
    async setup(): Promise<SetupStatus> {
      const row = await db
        .select()
        .from(schema.setupState)
        .where(eq(schema.setupState.id, 1));
      const owner = (await pool.query('SELECT id FROM users LIMIT 1')).rows[0];
      const recovery = owner
        ? (
            await pool.query(
              'SELECT id FROM recovery_codes WHERE owner_id=$1 AND consumed_at IS NULL LIMIT 1',
              [owner.id],
            )
          ).rowCount
        : 0;
      const enrolled = owner
        ? (
            await pool.query(
              "SELECT id FROM devices WHERE owner_id=$1 AND trust_state='trusted' AND revoked_at IS NULL LIMIT 1",
              [owner.id],
            )
          ).rowCount
        : 0;
      return {
        configured: false,
        core: row[0]?.coreVerified ? 'verified' : 'not_configured',
        owner: owner ? 'ready' : 'required',
        deviceEnrollment: enrolled ? 'ready' : 'required',
        voice: 'not_implemented',
        phoneLink: 'not_implemented',
        security: !owner
          ? 'setup_required'
          : recovery
            ? 'ready'
            : 'recovery_required',
        systemTest: 'not_implemented',
      };
    },
    async appendEvent(input: AuditEvent) {
      const event = eventSchema.parse(input);
      await db
        .insert(schema.auditEvents)
        .values({ ...event, timestamp: new Date(event.timestamp) });
    },
    async verifyCore(input: AuditEvent) {
      const event = eventSchema.parse(input);
      if (event.type !== 'core.setup.verified' || event.outcome !== 'succeeded')
        throw new Error('Invalid setup event');
      await db.transaction(async (tx) => {
        await tx
          .insert(schema.setupState)
          .values({ id: 1, coreVerified: true })
          .onConflictDoUpdate({
            target: schema.setupState.id,
            set: { coreVerified: true, updatedAt: new Date() },
          });
        await tx
          .insert(schema.auditEvents)
          .values({ ...event, timestamp: new Date(event.timestamp) });
      });
    },
    async close() {
      await pool.end();
    },
  };
}
export type Database = ReturnType<typeof createDatabase>;
