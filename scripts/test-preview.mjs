import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../preview/core.js');
await import('../preview/runtime.js');
await import('../preview/widgets.js');

const core = globalThis.ScriptablePreviewCore;
const runtime = globalThis.ScriptablePreviewRuntime;
const widgets = globalThis.ScriptablePreviewWidgets;

assert.ok(core);
assert.ok(runtime);
assert.equal(core.families.length, 7);
assert.deepEqual(
  core.families.map(({ id }) => id),
  [
    'small',
    'medium',
    'large',
    'extraLarge',
    'accessoryInline',
    'accessoryCircular',
    'accessoryRectangular',
  ]
);
assert.equal(new Set(widgets.map(({ id }) => id)).size, 6);

const engine = core.createPreviewEngine({ widgets });
assert.deepEqual(engine.getState(), {
  mode: 'overview',
  widgetId: 'hitokoto',
  family: 'medium',
  appearance: 'light',
  revision: 0,
});

const stateChanges = [];
const unsubscribe = engine.subscribe((state) => stateChanges.push(state));
engine.update({
  mode: 'focus',
  widgetId: 'xlyra',
  family: 'extraLarge',
  appearance: 'dark',
});
unsubscribe();
engine.update({ family: 'small' });
assert.equal(stateChanges.length, 1);
assert.equal(stateChanges[0].revision, 1);
assert.equal(engine.getState().revision, 2);

const fixedNow = new Date('2026-07-23T15:30:00+08:00');
for (const widget of widgets) {
  const source = await readFile(new URL(`../dist/${widget.id}.js`, import.meta.url), 'utf8');
  for (const family of core.families) {
    const tree = await runtime.executeSource({
      source,
      scriptId: widget.id,
      family: family.id,
      appearance: 'light',
      now: fixedNow,
    });
    const body = runtime.renderWidgetTree(tree, { now: fixedNow });
    assert.match(body, /class="sp-node sp-runtime-root/);
    assert.doesNotMatch(body, /undefined|NaN/);

    const html = await core.createPreviewEngine({
      widgets: [{
        ...widget,
        render: () => body,
      }],
    }).render(widget.id, {
      family: family.id,
      appearance: 'light',
      now: fixedNow,
    });
    assert.match(html, new RegExp(`data-widget-id="${widget.id}"`));
    assert.match(html, new RegExp(`data-family="${family.id}"`));
    assert.doesNotMatch(html, /undefined|NaN/);
  }
}

const xlyraWidget = widgets.find(({ id }) => id === 'xlyra');
const xlyraSource = await readFile(new URL('../dist/xlyra.js', import.meta.url), 'utf8');
const xlyraTree = await runtime.executeSource({
  source: xlyraSource,
  scriptId: xlyraWidget.id,
  family: 'medium',
  appearance: 'light',
  now: fixedNow,
});
const xlyraBody = runtime.renderWidgetTree(xlyraTree, { now: fixedNow });
assert.match(
  xlyraBody,
  /class="sp-node sp-stack sp-vertical" style="[^"]*flex:1 1 0/,
  '含弹性 Spacer 的横向子 Stack 应占据父级剩余空间'
);
assert.match(xlyraBody, /\$430\.79/);
assert.match(xlyraBody, />3\/7</);

assert.equal(core.calculatePreviewScale('medium', 338, 158), 1);
assert.equal(core.calculatePreviewScale('extraLarge', 360, 169), 0.5);
assert.deepEqual(
  core.families
    .filter(({ group }) => group === 'accessory')
    .map(({ id, width, height }) => ({ id, width, height })),
  [
    { id: 'accessoryInline', width: 160, height: 26 },
    { id: 'accessoryCircular', width: 76, height: 76 },
    { id: 'accessoryRectangular', width: 172, height: 76 },
  ]
);
assert.throws(() => core.getFamily('unknown'), /未知预览尺寸/);
assert.throws(() => engine.update({ widgetId: 'unknown' }), /未知组件/);
assert.throws(
  () => core.createPreviewEngine({ widgets: [widgets[0], widgets[0]] }),
  /组件 ID 重复/
);

console.log('Preview core test passed.');
