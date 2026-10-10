// Compare tool-captured, settled test-fixture images. This does not automate the browser.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import jpeg from 'jpeg-js';
const capture = process.argv[2];
const product = process.argv.includes('--product');
if (!capture)
  throw new Error(
    'Provide the directory containing fresh fixture-STATE.jpg captures, or product-STATE.jpg with --product.',
  );
let failed = false;
for (const state of product
  ? [
      'diagnostics',
      'settings',
      'model-loading',
      'compact-settings',
      'confirmation',
    ]
  : ['idle', 'listening', 'thinking', 'speaking', 'alert', 'offline']) {
  const file = `${product ? 'product' : 'fixture'}-${state}.jpg`;
  const decode = async (path) =>
    jpeg.decode(await readFile(path), {
      useTArray: true,
      maxResolutionInMP: 4,
      maxMemoryUsageInMB: 64,
    });
  const expected = await decode(
    resolve('apps/desktop/tests/visual/baselines', file),
  );
  const actual = await decode(resolve(capture, file));
  if (actual.width !== expected.width || actual.height !== expected.height) {
    console.error(`${state}: viewport mismatch`);
    failed = true;
    continue;
  }
  let changed = 0,
    total = 0;
  for (let i = 0; i < actual.data.length; i += 4) {
    let difference = 0;
    for (let c = 0; c < 3; c++)
      difference += Math.abs(actual.data[i + c] - expected.data[i + c]);
    if (difference > 36) changed++;
    total += difference;
  }
  const fraction = changed / (actual.width * actual.height);
  const mean = total / (actual.width * actual.height * 3);
  const pass = fraction <= 0.005 && mean <= 1;
  console.log(
    `${state}: ${pass ? 'PASS' : 'FAIL'} changed=${(fraction * 100).toFixed(3)}% mean=${mean.toFixed(3)}`,
  );
  failed ||= !pass;
}
if (failed) process.exitCode = 1;
