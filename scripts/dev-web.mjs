import { context } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(rootDir, 'web');
const outputDir = resolve(webDir, '.preview-assets');
const requestedPort = Number(process.env.PORT || 4173);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const buildContext = await context({
  entryPoints: [resolve(webDir, 'src/app/main.js')],
  outdir: outputDir,
  entryNames: 'app',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
});

await buildContext.watch();

let server;
let lastError;
for (let port = requestedPort; port < requestedPort + 10; port += 1) {
  try {
    server = await buildContext.serve({ servedir: webDir, port });
    break;
  } catch (error) {
    lastError = error;
    if (!/EADDRINUSE/.test(String(error))) throw error;
  }
}

if (!server) throw lastError;

console.log(`Web widget previewer: http://localhost:${server.port}`);

const stop = async () => {
  await buildContext.dispose();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise(() => {});
