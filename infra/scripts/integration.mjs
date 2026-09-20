import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
const name = `jarvis-test-${randomUUID()}`;
const password = randomBytes(32).toString('hex');
let created = false;
try {
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--name',
      name,
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      '--env',
      'POSTGRES_DB=jarvis_test',
      '--publish',
      '127.0.0.1::5432',
      '--health-cmd',
      'pg_isready -U postgres -d jarvis_test',
      '--health-interval',
      '1s',
      '--health-retries',
      '30',
      'postgres:17.9-alpine',
    ],
    { stdio: 'pipe' },
  );
  created = true;
  for (let i = 0; i < 40; i++) {
    const status = execFileSync(
      'docker',
      ['inspect', '--format', '{{.State.Health.Status}}', name],
      { encoding: 'utf8' },
    ).trim();
    if (status === 'healthy') break;
    if (i === 39) throw new Error('Test database health timed out');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const address = execFileSync('docker', ['port', name, '5432/tcp'], {
    encoding: 'utf8',
  }).trim();
  const result = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        JARVIS_TEST_DATABASE_URL: `postgresql://postgres:${password}@${address}/jarvis_test`,
      },
      shell: process.platform === 'win32',
    },
  );
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    'Isolated integration verification failed. Check Docker availability.',
  );
  process.exitCode = 1;
} finally {
  if (created)
    execFileSync('docker', ['rm', '--force', '--volumes', name], {
      stdio: 'ignore',
    });
}
