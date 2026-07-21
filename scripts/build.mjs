import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'src/widgets');
const outputDir = resolve(rootDir, 'dist');
const rawBaseURL = 'https://raw.githubusercontent.com/zkl2333/scriptable/main/dist';

const widgets = [
  { name: 'hitokoto', version: '1.0.0', iconColor: 'green', iconGlyph: 'magic' },
  { name: 'ikuai', version: '1.0.0', iconColor: 'blue', iconGlyph: 'network-wired' },
  {
    name: 'milk-tea-reminder',
    version: '1.0.0',
    iconColor: 'orange',
    iconGlyph: 'coffee',
  },
  {
    name: 'time-progress',
    version: '1.0.0',
    iconColor: 'yellow',
    iconGlyph: 'hourglass-half',
  },
  { name: 'work-helper', version: '2.0.0', iconColor: 'teal', iconGlyph: 'magic' },
  { name: 'xlyra', version: '1.6.0', iconColor: 'purple', iconGlyph: 'tachometer-alt' },
];

const createBanner = ({ name, version, iconColor, iconGlyph }) =>
  [
    '// Variables used by Scriptable.',
    '// These must be at the very top of the file. Do not edit.',
    `// icon-color: ${iconColor}; icon-glyph: ${iconGlyph};`,
    `// @script-id ${name}`,
    `// @version ${version}`,
  ].join('\n');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const widget of widgets) {
  const updateURL = `${rawBaseURL}/${widget.name}.js`;
  const result = await build({
    entryPoints: [{ in: resolve(sourceDir, `${widget.name}.js`), out: widget.name }],
    outdir: outputDir,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    minify: false,
    sourcemap: false,
    metafile: true,
    banner: { js: createBanner(widget) },
    define: {
      __SCRIPT_ID__: JSON.stringify(widget.name),
      __SCRIPT_VERSION__: JSON.stringify(widget.version),
      __UPDATE_URL__: JSON.stringify(updateURL),
    },
    logLevel: 'silent',
  });

  const externalImports = Object.values(result.metafile.outputs).flatMap(
    (output) => output.imports
  );
  if (externalImports.length > 0) {
    throw new Error(`${widget.name} 仍包含运行时 import，无法作为单文件发布`);
  }
}

console.log(`Built ${widgets.length} Scriptable widgets into dist/.`);
