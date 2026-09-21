import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
  /^host: (.+)$/m,
)?.[1];
if (!host) throw new Error('Rust host target unavailable');
const release = process.argv.includes('--release');
execFileSync(
  'cargo',
  [
    'build',
    '-p',
    'jarvis-runtime',
    '--locked',
    ...(release ? ['--release'] : []),
  ],
  { cwd: root, stdio: 'inherit' },
);
const extension = process.platform === 'win32' ? '.exe' : '';
const directory = path.join(root, 'apps/desktop/src-tauri/binaries');
mkdirSync(directory, { recursive: true });
copyFileSync(
  path.join(
    root,
    'target',
    release ? 'release' : 'debug',
    `jarvis-runtime${extension}`,
  ),
  path.join(directory, `jarvis-runtime-${host}${extension}`),
);
