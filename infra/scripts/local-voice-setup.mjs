// Explicit, fixed local model setup. Never accepts an executable, URL or model from the UI.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  writeFile,
  lstat,
  rename,
} from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const version = '0.35.1';
const suppliedArchive =
  process.argv[2] === '--archive' ? process.argv[3] : null;
if (process.argv.length > 2 && (!suppliedArchive || process.argv.length !== 4))
  throw new Error(
    'Use --archive with one previously downloaded pinned archive',
  );
const model = 'qwen3:4b-instruct-2507-q4_K_M';
const digest =
  '0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0';
const releases = {
  darwin: [
    'ollama-darwin.tgz',
    '3137dbf28948ee844e0fb3e584d9b5de6879d73d9f0cb7eff3ad64930601d307',
  ],
  win32: [
    'ollama-windows-amd64.zip',
    'dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93',
  ],
};
const release = releases[process.platform];
if (!release || (process.platform === 'win32' && process.arch !== 'x64'))
  throw new Error('Supported local voice targets: macOS and Windows x64');
const data =
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library/Application Support')
    : process.env.LOCALAPPDATA;
if (!data) throw new Error('Local user storage is unavailable');
const root = path.join(data, 'com.taxcut.jarvis');
await mkdir(root, { recursive: true, mode: 0o700 });
for (
  let directory = root;
  directory !== path.dirname(directory);
  directory = path.dirname(directory)
) {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error('Local runtime storage must not use symbolic links');
}
const destination = path.join(root, 'ollama-runtime', version);
const executable = path.join(
  destination,
  process.platform === 'win32' ? 'ollama.exe' : 'ollama',
);
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return false;
  }
}
if (!(await exists(executable))) {
  if (await exists(destination))
    throw new Error(
      'Incomplete runtime directory exists; preserve it and reinstall to a fresh directory',
    );
  const staging = path.join(root, `.ollama-setup-${process.pid}-${Date.now()}`);
  await mkdir(staging, { mode: 0o700 });
  const archive = suppliedArchive
    ? path.resolve(suppliedArchive)
    : path.join(staging, release[0]);
  if (!suppliedArchive) {
    const output = await open(archive, 'wx', 0o600);
    try {
      const response = await globalThis.fetch(
        `https://github.com/ollama/ollama/releases/download/v${version}/${release[0]}`,
        { signal: globalThis.AbortSignal.timeout(900000) },
      );
      if (!response.ok || !response.body)
        throw new Error('Local runtime download failed');
      let count = 0;
      for await (const bytes of response.body) {
        count += bytes.length;
        if (count > 2 * 1024 ** 3)
          throw new Error('Runtime archive exceeded its limit');
        await output.write(bytes);
      }
      await output.sync();
    } finally {
      await output.close();
    }
  }
  if ((await hashFile(archive)) !== release[1])
    throw new Error('Runtime archive failed its pinned integrity check');
  const unpacked = path.join(staging, 'runtime');
  await mkdir(unpacked, { mode: 0o700 });
  // Extraction is permitted only after matching the exact trusted release archive.
  if (process.platform === 'darwin')
    execFileSync('tar', ['-xzf', archive, '-C', unpacked], { stdio: 'pipe' });
  else
    execFileSync(
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
      ['-xf', archive, '-C', unpacked],
      { stdio: 'pipe' },
    );
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await rename(unpacked, destination);
  console.log(
    'Pinned local runtime installed; download retained for verification',
  );
}
if ((await lstat(executable)).isSymbolicLink())
  throw new Error('Runtime executable must be a regular file');
const base = 'http://127.0.0.1:11434';
async function query(route, options = {}) {
  const response = await globalThis.fetch(`${base}${route}`, {
    ...options,
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(options.timeout ?? 5000),
  });
  if (!response.ok)
    throw new Error(`Local runtime request failed (${response.status})`);
  const chunks = [];
  let length = 0;
  for await (const bytes of response.body) {
    length += bytes.length;
    if (length > 256 * 1024)
      throw new Error('Local runtime response exceeded its limit');
    chunks.push(bytes);
  }
  return JSON.parse(globalThis.Buffer.concat(chunks).toString('utf8'));
}
try {
  await query('/api/version');
} catch {
  const log = await open(path.join(root, 'ollama-runtime.log'), 'a', 0o600);
  const child = spawn(executable, ['serve'], {
    detached: true,
    windowsHide: true,
    env: {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11434',
      OLLAMA_NO_CLOUD: '1',
      OLLAMA_NUM_PARALLEL: '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      OLLAMA_CONTEXT_LENGTH: '2048',
      OLLAMA_MODELS: path.join(root, 'ollama-models'),
    },
    stdio: ['ignore', log.fd, log.fd],
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  await log.close();
  for (let i = 0; i < 20; i++) {
    try {
      await query('/api/version');
      break;
    } catch {
      if (i === 19) throw new Error('Local runtime did not start');
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
if ((await query('/api/version')).version !== version)
  throw new Error(
    'A different local runtime is using port 11434. Review it before changing the installed service.',
  );
const catalog = await query('/api/tags');
if (!catalog.models?.some((m) => m.name === model && m.digest === digest)) {
  const response = await globalThis.fetch(
    `https://registry.ollama.ai/v2/library/qwen3/manifests/4b-instruct-2507-q4_K_M`,
    { signal: globalThis.AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error('Qwen manifest download failed');
  const manifest = globalThis.Buffer.from(await response.arrayBuffer());
  if (
    manifest.length > 65536 ||
    createHash('sha256').update(manifest).digest('hex') !== digest
  )
    throw new Error(
      'Upstream Qwen tag changed; review the model pin before installing',
    );
  console.log('Installing the pinned local Qwen model (approximately 2.5 GB)');
  await query('/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false }),
    timeout: 900000,
  });
}
if (
  !(await query('/api/tags')).models?.some(
    (m) => m.name === model && m.digest === digest,
  )
)
  throw new Error('Installed Qwen model failed its manifest pin');
// Verify local cached content, including template/config, before accepting setup.
const manifestFile = path.join(
  root,
  'ollama-models/manifests/registry.ollama.ai/library/qwen3/4b-instruct-2507-q4_K_M',
);
const raw = await readFile(manifestFile);
if (createHash('sha256').update(raw).digest('hex') !== digest)
  throw new Error('Local Qwen manifest integrity failed');
const manifest = JSON.parse(raw);
for (const layer of [manifest.config, ...manifest.layers]) {
  if (!/^sha256:[a-f0-9]{64}$/.test(layer.digest))
    throw new Error('Model layer digest is invalid');
  const file = path.join(
    root,
    'ollama-models/blobs',
    layer.digest.replace(':', '-'),
  );
  if ((await hashFile(file)) !== layer.digest.slice(7))
    throw new Error('Local Qwen content integrity failed');
}
await writeFile(
  path.join(destination, 'jarvis-verified.json'),
  JSON.stringify({
    version,
    archiveSha256: release[1],
    model,
    modelDigest: digest,
  }),
  { mode: 0o600 },
);
console.log(
  'Local Qwen runtime and all model layers verified; no API key is needed',
);
