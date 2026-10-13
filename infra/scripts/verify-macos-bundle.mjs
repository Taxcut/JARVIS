import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin') {
  throw new Error('macOS bundle verification requires macOS');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = path.resolve(
  process.argv[2] ?? path.join(root, 'target/release/bundle/macos/JARVIS.app'),
);
const plist = (input) =>
  JSON.parse(
    execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], {
      input,
      encoding: 'utf8',
    }),
  );

execFileSync('codesign', ['--verify', '--strict', '--deep', bundle], {
  stdio: 'inherit',
});
for (const name of ['jarvis-desktop', 'jarvis-runtime']) {
  const executable = path.join(bundle, 'Contents/MacOS', name);
  const signedEntitlements = execFileSync(
    'codesign',
    ['-d', '--entitlements', '-', '--xml', executable],
    {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  if (!signedEntitlements.trim()) {
    throw new Error(`${name} has no signed entitlements`);
  }
  const entitlements = plist(signedEntitlements);
  if (entitlements['com.apple.security.device.audio-input'] !== true) {
    throw new Error(`${name} lacks the signed microphone entitlement`);
  }
  const signature = spawnSync('codesign', ['-dv', executable], {
    encoding: 'utf8',
  });
  // codesign writes its human-readable signature metadata to stderr.
  if (signature.status !== 0 || !/flags=.*\bruntime\b/.test(signature.stderr)) {
    throw new Error(`${name} must retain hardened runtime signing`);
  }
  console.log(`${name}: signed audio-input entitlement verified`);
}
const info = JSON.parse(
  execFileSync(
    'plutil',
    ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents/Info.plist')],
    { encoding: 'utf8' },
  ),
);
if (!info.NSMicrophoneUsageDescription?.trim()) {
  throw new Error('The app lacks a microphone usage description');
}
console.log('Bundle signature and microphone usage description verified');
