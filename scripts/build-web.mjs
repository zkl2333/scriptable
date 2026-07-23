import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(rootDir, 'web');
const outputDir = resolve(webDir, '.preview-assets');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [resolve(webDir, 'src/app/main.js')],
  outdir: outputDir,
  entryNames: 'app',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'silent',
});

console.log('Built Web widget previewer into web/.preview-assets/.');
