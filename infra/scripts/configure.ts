import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const file = new URL('../../.env', import.meta.url);
if (existsSync(file)) {
  console.error(
    '.env already exists; refusing to replace local configuration.',
  );
  process.exit(1);
}
const password = randomBytes(32).toString('hex');
writeFileSync(
  file,
  `NODE_ENV=development\nJARVIS_HOST=127.0.0.1\nJARVIS_PORT=4310\nDATABASE_URL=postgresql://jarvis:${password}@127.0.0.1:54329/jarvis\nPOSTGRES_PASSWORD=${password}\nJARVIS_API_TOKEN=${randomBytes(32).toString('hex')}\nLOG_LEVEL=info\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Created private local .env. Read JARVIS_API_TOKEN locally to connect the desktop.',
);
