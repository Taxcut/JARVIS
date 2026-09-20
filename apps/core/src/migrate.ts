import { parseEnvironment } from '@jarvis/config';
import { createDatabase } from '@jarvis/database';
async function main() {
  let db;
  try {
    const config = parseEnvironment(process.env);
    db = createDatabase(config.DATABASE_URL);
    await db.migrate();
    await db.ready();
    console.log('Database migration and schema verification passed.');
  } catch {
    console.error(
      'Migration failed. Check local database configuration and availability.',
    );
    process.exitCode = 1;
  } finally {
    await db?.close();
  }
}
void main();
