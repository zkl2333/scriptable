import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUpdater } from '../src/lib/updater.js';

const testDir = mkdtempSync(join(tmpdir(), 'scriptable-updater-'));
const targetPath = join(testDir, 'widget.js');
const oldSource = '// old widget';
const newSource = [
  '// @script-id test-widget',
  '// @version 1.1.0',
  `// ${'updated '.repeat(30)}`,
].join('\n');

const createFileManager = (iCloud) => ({
  createDirectory: (path) => mkdirSync(path, { recursive: true }),
  fileExists: existsSync,
  isFileStoredIniCloud: () => iCloud,
  joinPath: join,
  libraryDirectory: () => testDir,
  readString: (path) => readFileSync(path, 'utf8'),
  writeString: (path, value) => writeFileSync(path, value, 'utf8'),
});

const keychain = new Map();
const assertLegalKey = (key) => {
  if (/^scriptable(?:\.|$)/i.test(key)) {
    throw new Error(`Reserved Keychain prefix: ${key}`);
  }
};
globalThis.FileManager = {
  iCloud: () => createFileManager(true),
  local: () => createFileManager(false),
};
globalThis.Keychain = {
  contains: (key) => {
    assertLegalKey(key);
    return keychain.has(key);
  },
  get: (key) => {
    assertLegalKey(key);
    return keychain.get(key);
  },
  set: (key, value) => {
    assertLegalKey(key);
    keychain.set(key, value);
  },
};
globalThis.Request = class {
  async loadString() {
    return newSource;
  }
};
globalThis.Script = { name: () => 'Test Widget' };
globalThis.module = { filename: targetPath };

try {
  writeFileSync(targetPath, oldSource, 'utf8');
  const updater = createUpdater({
    scriptId: 'test-widget',
    version: '1.0.0',
    updateURL: 'https://example.test/widget.js',
  });

  assert.equal(await updater.applyUpdateIfAny({ interactive: false }), true);
  assert.equal(keychain.has('zkl2333.widgetUpdater.test-widget.checkedAt'), true);
  assert.equal(readFileSync(targetPath, 'utf8'), newSource);
  assert.equal(
    readFileSync(join(testDir, 'widget-update-backups', 'test-widget.js.bak'), 'utf8'),
    oldSource
  );

  const currentUpdater = createUpdater({
    scriptId: 'test-widget',
    version: '1.1.0',
    updateURL: 'https://example.test/widget.js',
  });
  assert.equal(await currentUpdater.checkForUpdate({ force: true }), null);
  console.log('Updater test passed.');
} finally {
  rmSync(testDir, { recursive: true, force: true });
}
