import { parseEnvironment } from '@jarvis/config';
import { createDatabase } from '@jarvis/database';
import { createApp } from './app.js';
async function main() {
  let config;
  try {
    config = parseEnvironment(process.env);
  } catch {
    console.error(
      'Invalid configuration. Check required values against .env.example.',
    );
    process.exitCode = 1;
    return;
  }
  const db = createDatabase(config.DATABASE_URL);
  const app = await createApp(config, db);
  app.addHook('onClose', () => db.close());
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close();
    });
  try {
    await app.listen({ host: config.JARVIS_HOST, port: config.JARVIS_PORT });
  } catch {
    console.error('Core could not start. Check the configured loopback port.');
    await app.close();
    process.exitCode = 1;
  }
}
void main();
