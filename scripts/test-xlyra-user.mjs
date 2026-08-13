import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const sourcePath = resolve(rootDir, 'src/widgets/xlyra-user.js');
const distPath = resolve(rootDir, 'dist/xlyra-user.js');

await access(sourcePath);
const source = await readFile(sourcePath, 'utf8');
assert.match(source, /原始管理员版本：zkl2333/);
assert.match(source, /用户版二次开发：anlostyle/);
assert.match(source, /scriptId: __SCRIPT_ID__/);
assert.match(source, /updateURL: __UPDATE_URL__/);

await access(distPath);
const dist = await readFile(distPath, 'utf8');
assert.match(dist, /@script-id xlyra-user/);
assert.match(dist, /@version 1\.1\.1/);
assert.match(dist, /用户版二次开发：anlostyle/);
assert.match(dist, /raw\.githubusercontent\.com\/zkl2333\/scriptable\/main\/dist\/xlyra-user\.js/);

console.log('xlyra-user source and distribution metadata passed');
