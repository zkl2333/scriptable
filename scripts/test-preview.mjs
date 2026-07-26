import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../preview/core.js');
await import('../preview/symbols.js');
await import('../preview/ir.js');
await import('../preview/runtime.js');
await import('../preview/widgets.js');

const core = globalThis.ScriptablePreviewCore;
const runtime = globalThis.ScriptablePreviewRuntime;
const widgets = globalThis.ScriptablePreviewWidgets;
const previewStyles = await readFile(new URL('../preview/styles.css', import.meta.url), 'utf8');
const previewHTML = await readFile(new URL('../preview/index.html', import.meta.url), 'utf8');

assert.ok(core);
assert.ok(runtime);
assert.ok(globalThis.ScriptablePreviewSymbols);
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
assert.deepEqual(
  widgets.map(({ id }) => id),
  [
    'hitokoto',
    'render-api-lab',
    'draw-context-lab',
    'accessory-lab',
    'ikuai',
    'milk-tea-reminder',
    'time-progress',
    'today-dashboard',
    'work-helper',
    'xlyra',
  ]
);
assert.equal(new Set(widgets.map(({ id }) => id)).size, 10);

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
    assert.equal(tree.type, 'list', 'executeSource 必须产出 IR 根节点');
    assert.ok(
      tree.elements.every((element) => typeof element.identifier === 'string'),
      'IR 元素必须携带序列化 identifier'
    );
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
    assert.doesNotMatch(html, /sp-widget--/, 'dist 输出不应挂载组件专用样式类');
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

const workHelperSource = await readFile(new URL('../dist/work-helper.js', import.meta.url), 'utf8');
const workHelperTree = await runtime.executeSource({
  source: workHelperSource,
  scriptId: 'work-helper',
  family: 'medium',
  appearance: 'light',
  now: fixedNow,
});
const workHelperBody = runtime.renderWidgetTree(workHelperTree, { now: fixedNow });
assert.match(workHelperBody, /class="sp-symbol-svg"/);
assert.match(workHelperBody, /viewBox="0 0 256 256"/);
assert.doesNotMatch(workHelperBody, /sp-symbol-fallback/);

const renderApiSource = await readFile(new URL('../dist/render-api-lab.js', import.meta.url), 'utf8');
const renderApiTree = await runtime.executeSource({
  source: renderApiSource,
  scriptId: 'render-api-lab',
  family: 'medium',
  appearance: 'light',
  now: fixedNow,
});
const renderApiBody = runtime.renderWidgetTree(renderApiTree, { now: fixedNow });
assert.match(renderApiBody, /text-shadow:0px 1px 2px/);
assert.match(renderApiBody, new RegExp('data-url="scriptable:///run/render-api-lab"'));
assert.match(renderApiBody, /sp-widget-background/);
assert.match(renderApiBody, /border:1px solid/);
assert.match(renderApiBody, /data-minimum-scale-factor="0.65"/);
assert.match(renderApiBody, /52:00/);
assert.match(renderApiBody, />2小时0分钟</);
assert.match(renderApiBody, />\+30分钟</);
assert.doesNotMatch(renderApiBody, /sp-symbol-fallback/);

const accessorySource = await readFile(new URL('../dist/accessory-lab.js', import.meta.url), 'utf8');
const accessoryTree = await runtime.executeSource({
  source: accessorySource,
  scriptId: 'accessory-lab',
  family: 'accessoryRectangular',
  appearance: 'light',
  now: fixedNow,
});
const accessoryBody = runtime.renderWidgetTree(accessoryTree, { now: fixedNow });
assert.match(accessoryBody, /sp-accessory-background/);

const drawContextSource = await readFile(new URL('../dist/draw-context-lab.js', import.meta.url), 'utf8');
const drawContextTree = await runtime.executeSource({
  source: drawContextSource,
  scriptId: 'draw-context-lab',
  family: 'medium',
  appearance: 'light',
  now: fixedNow,
});
const drawContextBody = runtime.renderWidgetTree(drawContextTree, { now: fixedNow });
assert.match(drawContextBody, /stroke-width="2"/);
assert.match(drawContextBody, /text-anchor="end"/);
assert.match(drawContextBody, /<path d="M /);
assert.match(drawContextBody, /sp-image--fill/);
assert.doesNotMatch(drawContextBody, /sp-symbol-fallback/);

const dateStyleFixture = `
const widget = new ListWidget();
const belowHour = widget.addDate(new Date(Date.now() + 52 * 60 * 1000));
belowHour.applyTimerStyle();
const aboveHour = widget.addDate(new Date(Date.now() + 2 * 60 * 60 * 1000));
aboveHour.applyTimerStyle();
const past = widget.addDate(new Date(Date.now() - 30 * 60 * 1000));
past.applyOffsetStyle();
const future = widget.addDate(new Date(Date.now() + 30 * 60 * 1000));
future.applyOffsetStyle();
Script.setWidget(widget);
Script.complete();
`;
const dateStyleTree = await runtime.executeSource({
  source: dateStyleFixture,
  scriptId: 'date-style-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const dateStyleBody = runtime.renderWidgetTree(dateStyleTree, { now: fixedNow });
assert.match(dateStyleBody, />52:00</);
assert.match(dateStyleBody, />2:00:00</);
assert.match(dateStyleBody, />\+30分钟</);
assert.match(dateStyleBody, />-30分钟</);

const layoutFixture = `
const widget = new ListWidget();
const column = widget.addStack();
column.layoutVertically();
const rounded = column.addText('一段很长的原生圆体文本');
rounded.font = Font.semiboldRoundedSystemFont(20);
rounded.lineLimit = 1;
rounded.minimumScaleFactor = 0.6;
column.addSpacer();
const monospaced = column.addText('MONO');
monospaced.font = Font.regularMonospacedSystemFont(10);
Script.setWidget(widget);
Script.complete();
`;
const layoutTree = await runtime.executeSource({
  source: layoutFixture,
  scriptId: 'layout-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const layoutBody = runtime.renderWidgetTree(layoutTree, { now: fixedNow });
assert.match(layoutBody, /ui-rounded/);
assert.match(layoutBody, /ui-monospace/);
assert.match(layoutBody, /data-font-size="20" data-minimum-scale-factor="0.6"/);
assert.match(
  layoutBody,
  /class="sp-node sp-stack sp-vertical" style="[^"]*flex:1 1 0/,
  '含纵向弹性 Spacer 的纵向子 Stack 应占据父级剩余空间'
);

assert.equal(core.calculatePreviewScale('medium', 338, 158), 1);
assert.equal(core.calculatePreviewScale('extraLarge', 360, 169), 0.5);
assert.match(
  previewStyles,
  /\.sp-horizontal > \.sp-text \{ align-self: center; white-space: pre; \}/,
  '横向 Text 节点必须保留脚本中的首尾空格'
);
assert.match(
  previewStyles,
  /\.sp-vertical > \.sp-text \{ flex-shrink: 0; \}/,
  '纵向 Stack 不应把 Text 压缩到原生行高以下'
);
assert.match(previewHTML, /id="build-widget-count">-- WIDGETS/);
assert.match(previewHTML, /id="widget-count">--</);
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
