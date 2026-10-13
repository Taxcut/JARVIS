// Pin the native release archive independently of the Cargo crate checksum.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const targets = {
  'darwin-arm64': [
    'osx-arm64-static-lib',
    '9091bf160dc7fdacedbc906b212badf53c2993f4e5277a0e03998e96c31d60da',
  ],
  'darwin-x64': [
    'osx-x64-static-lib',
    'a3f88da3e54c850a12d61431e73f8affcd1f13738b75b768847dd79541835b4b',
  ],
  'win32-x64': [
    'win-x64-static-MT-Release-lib',
    '56ffcf3c454c1f14f7bc9887286cc8143e7e542dc632804e1c447d5f8d534eaf',
  ],
};
const selected = targets[`${process.platform}-${process.arch}`];
if (!selected)
  throw new Error(
    'Native voice currently targets Mac arm64/x64 and Windows x64',
  );
const name = `sherpa-onnx-v1.13.8-${selected[0]}.tar.bz2`;
const dir = path.join(root, 'target/sherpa-onnx-prebuilt');
await mkdir(dir, { recursive: true });
const file = path.join(dir, name);
let bytes;
try {
  bytes = await readFile(file);
} catch {
  const response = await globalThis.fetch(
    `https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/${name}`,
    { signal: globalThis.AbortSignal.timeout(180000) },
  );
  if (!response.ok) throw new Error('Native voice dependency download failed');
  bytes = globalThis.Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== selected[1])
  throw new Error('Native voice dependency integrity check failed');
await writeFile(file, bytes);
execFileSync('tar', ['-xf', file, '-C', dir], { stdio: 'pipe' });
console.log(
  `Verified sherpa-onnx native archive for ${process.platform}/${process.arch}`,
);
