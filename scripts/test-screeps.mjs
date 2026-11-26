import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const sourcePath = resolve(rootDir, 'src/widgets/screeps.js');
const distPath = resolve(rootDir, 'dist/screeps.js');
const mockPath = resolve(rootDir, 'src/widgets/screeps.mock.js');

// Source exists
await access(sourcePath);
const source = await readFile(sourcePath, 'utf8');

// Build system placeholders wired
assert.match(source, /scriptId: __SCRIPT_ID__/);
assert.match(source, /updateURL: __UPDATE_URL__/);

// Dashboard style: purple theme colors
assert.match(source, /#101020/); // deep purple background
assert.match(source, /#201040/); // card background
assert.match(source, /#8060b0/); // accent purple
assert.match(source, /#4ecdc4/); // cyan accent
assert.match(source, /#ffe66d/); // energy yellow

// Keychain keys for credentials
assert.match(source, /KC_TOKEN/);

// API endpoints used
assert.match(source, /auth\/me/);
assert.match(source, /game\/room-overview/);
assert.match(source, /user\/memory/);

// Mock exists
await access(mockPath);

// Dist exists and has metadata
await access(distPath);
const dist = await readFile(distPath, 'utf8');
assert.match(dist, /@script-id screeps/);
assert.match(dist, /@version 1\.0\.0/);
assert.match(dist, /raw\.githubusercontent\.com\/zkl2333\/scriptable\/main\/dist\/screeps\.js/);

console.log('screeps source and distribution metadata passed');
