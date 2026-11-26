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

// Runtime multi-family & Grafana stats compatibility checks
await import('../preview/core.js');
await import('../preview/symbols.js');
await import('../preview/ir.js');
await import('../preview/measure.js');
await import('../preview/layout.js');
await import('../preview/runtime.js');
await import('../src/widgets/screeps.mock.js');

const core = globalThis.ScriptablePreviewCore;
const runtime = globalThis.ScriptablePreviewRuntime;
const baseMock = globalThis.ScriptablePreviewMocks.screeps;

for (const { id: family } of core.families) {
  for (const appearance of ['light', 'dark']) {
    const tree = await runtime.executeSource({
      source: dist,
      scriptId: 'screeps',
      family,
      appearance,
    });
    const html = runtime.renderWidgetTree(tree);
    assert.doesNotMatch(html, /undefined|NaN|数据暂时不可用/);
    if (family === 'accessoryCircular') {
      assert.match(html, /81%/);
      assert.match(html, /CPU/);
    } else {
      assert.match(html, /SCREEPS/);
    }
    if (family === 'medium' || family === 'large' || family === 'extraLarge') {
      assert.match(html, /E43N29/);
      assert.match(html, /R8/);
      assert.match(html, /56\.8\/70/);
    }
    if (family === 'extraLargePortrait') {
      assert.match(html, /STORAGE &amp; RCL|STORAGE & RCL/);
    }
  }
}

// Fallback check when Grafana Memory.stats is absent
const fallbackMock = {
  ...baseMock,
  respond(url) {
    if (url.includes('path=stats')) return { ok: 1, data: null };
    return baseMock.respond(url);
  },
};
const fallbackTree = await runtime.executeSource({
  source: dist,
  scriptId: 'screeps',
  family: 'medium',
  appearance: 'dark',
  mockData: fallbackMock,
});
const fallbackHtml = runtime.renderWidgetTree(fallbackTree);
assert.doesNotMatch(fallbackHtml, /undefined|NaN|数据暂时不可用/);
assert.match(fallbackHtml, /56\.8\/70/);
assert.match(fallbackHtml, /E43N29/);

console.log('screeps source, distribution, and multi-family runtime tests passed');
