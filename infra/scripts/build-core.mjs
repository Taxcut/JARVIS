import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  plugins: [
    {
      name: 'workspace-packages',
      setup(builder) {
        builder.onResolve({ filter: /^@jarvis\// }, (args) => ({
          path: fileURLToPath(
            new URL(
              `../../packages/${args.path.slice(8).split('/')[0]}/src/${args.path.includes('/signing') ? 'signing' : 'index'}.ts`,
              import.meta.url,
            ),
          ),
        }));
      },
    },
  ],
});
