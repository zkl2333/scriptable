import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../preview/core.js');
await import('../preview/symbols.js');
await import('../preview/ir.js');
await import('../preview/measure.js');
await import('../preview/layout.js');
await import('../preview/runtime.js');
await import('../src/widgets/hitokoto.mock.js');
await import('../src/widgets/ikuai.mock.js');
await import('../src/widgets/xlyra.mock.js');
await import('../src/widgets/xlyra-user.mock.js');
await import('../src/widgets/work-helper.mock.js');
await import('../preview/widgets.js');

const core = globalThis.ScriptablePreviewCore;
const runtime = globalThis.ScriptablePreviewRuntime;
const measureModule = globalThis.ScriptablePreviewMeasure;

const measurer = measureModule.createMeasurer();
assert.ok(measurer.isApproximate, 'Node 环境应使用近似测量兜底');
const asciiWidth = measurer.measure('MONO', { family: 'monospace', size: 10, weight: 400 });
const cjkWidth = measurer.measure('原生圆体', { family: 'rounded', size: 20, weight: 600 });
assert.ok(asciiWidth > 0 && cjkWidth > asciiWidth, '测量宽度应为正且随字号/全角增长');
assert.equal(
  measurer.measure('MONO', { family: 'monospace', size: 10, weight: 400 }),
  asciiWidth,
  '测量结果应缓存且可复现'
);
assert.match(measureModule.fontCSSFamily({ family: 'monospace' }), /ui-monospace/);
assert.match(measureModule.fontCSSFamily({ family: 'rounded' }), /ui-rounded/);
assert.match(measureModule.fontCSSFamily({ name: 'Menlo' }), /'Menlo'/);
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
    'xlyra-user',
    'cyber-clock',
    'pixel-pet',
  ]
);
assert.equal(new Set(widgets.map(({ id }) => id)).size, 13);

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
assert.match(dateStyleBody, /data-date-style="timer"/, '日期节点应携带自动刷新数据属性');
assert.match(dateStyleBody, /data-date-style="offset"/);
assert.match(dateStyleBody, /data-date-iso="/);

const fakeTimerSpan = {
  getAttribute: (name) => ({
    'data-date-style': 'timer',
    'data-date-iso': new Date(Date.now() + 52 * 60 * 1000).toISOString(),
  })[name] ?? null,
  textContent: '',
};
const stopTicker = runtime.mountDateTicker(
  { querySelectorAll: () => [fakeTimerSpan] },
  { intervalMs: 60 * 60 * 1000 }
);
assert.match(fakeTimerSpan.textContent, /^5[12]:\d\d$/, 'ticker 挂载后应立即校准日期文本');
stopTicker();
const noopStop = runtime.mountDateTicker(null);
assert.equal(typeof noopStop, 'function', '无 DOM 环境应返回 no-op 停止函数');

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

const semanticsFixture = `
const widget = new ListWidget();
const row = widget.addStack();
row.addText('L');
row.addSpacer(10);
row.addText('R');
const column = widget.addStack();
column.layoutVertically();
column.centerAlignContent();
column.addSpacer();
const unlimited = column.addText('不限制行数');
unlimited.lineLimit = -2;
const context = new DrawContext();
context.size = new Size(20, 20);
const image = widget.addImage(context.getImage());
image.imageSize = new Size(24, 24);
Script.setWidget(widget);
Script.complete();
`;
const semanticsTree = await runtime.executeSource({
  source: semanticsFixture,
  scriptId: 'semantics-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const semanticsBody = runtime.renderWidgetTree(semanticsTree, { now: fixedNow });
assert.match(
  semanticsBody,
  /class="sp-node sp-stack sp-horizontal" style="[^"]*align-items:flex-start/,
  '水平 Stack 默认顶部对齐（官方 topAlignContent 为默认）'
);
assert.match(
  semanticsBody,
  /class="sp-node sp-stack sp-vertical" style="[^"]*justify-content:center/,
  '纵向 Stack 的 centerAlignContent 应映射主轴 justify-content'
);
assert.match(
  semanticsBody,
  /class="sp-node sp-spacer" style="width:10px;min-width:10px"/,
  'addSpacer(n) 应为固定间隔（官方：仅 null 长度为弹性）'
);
assert.match(
  semanticsBody,
  /class="sp-node sp-spacer" style="flex:1 0 8px"/,
  'addSpacer() 应为弹性 Spacer，最小长度为系统默认间距（≈8pt）'
);
assert.doesNotMatch(semanticsBody, /sp-text--clamped/, 'lineLimit ≤ 0 应禁用行数限制');
assert.match(
  semanticsBody,
  /class="sp-node sp-image" style="[^"]*flex-shrink:0/,
  '固定尺寸图片不应被主轴压缩'
);

const dynamicColorFixture = `
const widget = new ListWidget();
const label = widget.addText('动态颜色');
label.textColor = Color.dynamic(new Color('#111111'), new Color('#eeeeee'));
widget.backgroundColor = Color.dynamic(new Color('#fafafa'), new Color('#101010'));
Script.setWidget(widget);
Script.complete();
`;
const dynamicColorTree = await runtime.executeSource({
  source: dynamicColorFixture,
  scriptId: 'dynamic-color-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const dynamicLight = runtime.renderWidgetTree(dynamicColorTree, { now: fixedNow, appearance: 'light' });
const dynamicDark = runtime.renderWidgetTree(dynamicColorTree, { now: fixedNow, appearance: 'dark' });
assert.match(dynamicLight, /color:#111111/, '浅色外观应取 Color.dynamic 的 light 值');
assert.match(dynamicLight, /background:#fafafa/);
assert.match(dynamicDark, /color:#eeeeee/, '深色外观应在渲染期切换为 dark 值');
assert.match(dynamicDark, /background:#101010/);

const allocationFixture = `
const widget = new ListWidget();
widget.setPadding(10, 10, 10, 10);
const row = widget.addStack();
const short = row.addText('AB');
short.font = Font.systemFont(15);
const long = row.addText('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
long.font = Font.systemFont(15);
row.addSpacer();
Script.setWidget(widget);
Script.complete();
`;
const allocationTree = await runtime.executeSource({
  source: allocationFixture,
  scriptId: 'allocation-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
// small = 158×158，padding 10 → 内层 138×138。
// 近似测量 @15px：ASCII 0.55em=8.25/字符；短文本理想 16.5、长文本理想 330。
// 分配：短文本不灵活先拿满 16.5，长文本按需取 113.5（截断），Spacer 兜底 8。
const allocationBody = runtime.renderWidgetTree(allocationTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(allocationBody, />AB</, '布局引擎启用后文本内容应保留');
assert.doesNotMatch(
  allocationBody,
  /width:[0-9.]+px[^"]*">AB</,
  '短文本拿到完整理想宽度后不应输出显式宽度（避免恰好等宽时裁剪字形）'
);
assert.match(
  allocationBody,
  /class="sp-node sp-text" style="[^"]*width:113\.5px[^"]*">X+</,
  '长文本应按需取用剩余提议（而非与短文本比例收缩）'
);
assert.match(
  allocationBody,
  /class="sp-node sp-spacer" style="[^"]*width:8px/,
  'Spacer 应分得预扣的最小长度'
);
assert.match(
  allocationBody,
  /class="sp-node sp-stack sp-horizontal" style="[^"]*width:138px;height:17\.4px/,
  '横向子 Stack 应 stretch 到内宽、高度为单行文本行高'
);
const noSizeBody = runtime.renderWidgetTree(allocationTree, { now: fixedNow });
assert.doesNotMatch(noSizeBody, /width:113\.5px/, '未注入容器尺寸时应保持 flex 近似路径');

const scaleFixture = `
const widget = new ListWidget();
widget.setPadding(10, 10, 10, 10);
const row = widget.addStack();
const label = row.addText('XXXXXXXXXXXXXXXXXXXX');
label.font = Font.systemFont(20);
label.minimumScaleFactor = 0.5;
Script.setWidget(widget);
Script.complete();
`;
const scaleTree = await runtime.executeSource({
  source: scaleFixture,
  scriptId: 'scale-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
// 理想宽度 20×11=220 > 内层 138；按 minimumScaleFactor 二分缩字号：
// 11·s ≤ 138 → s ≈ 12.55（下限 10 未触达），随后不再截断
const scaleBody = runtime.renderWidgetTree(scaleTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(
  scaleBody,
  /font-size:12\.55px/,
  'minimumScaleFactor 应先二分缩小字号再考虑截断'
);
assert.doesNotMatch(
  scaleBody,
  /data-minimum-scale-factor/,
  '布局引擎完成缩放后不应再输出 DOM 级缩放属性'
);

const aspectFixture = `
const widget = new ListWidget();
const context = new DrawContext();
context.size = new Size(200, 100);
const image = widget.addImage(context.getImage());
image.imageSize = new Size(24, 0);
Script.setWidget(widget);
Script.complete();
`;
const aspectTree = await runtime.executeSource({
  source: aspectFixture,
  scriptId: 'aspect-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const aspectBody = runtime.renderWidgetTree(aspectTree, { now: fixedNow });
assert.match(
  aspectBody,
  /class="sp-node sp-image" style="width:24px;height:12px/,
  'imageSize 只设一边时应按固有纵横比（200×100 → 2:1）推导另一边'
);
const aspectLaidBody = runtime.renderWidgetTree(aspectTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(aspectLaidBody, /width:24px;height:12px/, '布局引擎路径应使用同一纵横比推导');

const borderFixture = `
const widget = new ListWidget();
const row = widget.addStack();
const card = row.addStack();
card.layoutVertically();
card.setPadding(5, 7, 5, 7);
card.borderWidth = 1;
const t = card.addText('AB');
t.font = Font.systemFont(15);
Script.setWidget(widget);
Script.complete();
`;
const borderTree = await runtime.executeSource({
  source: borderFixture,
  scriptId: 'border-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
// 近似测量 'AB' @15px = 16.5；border-box 下盒子宽度 = 16.5 + padding 14 + border 2
const borderBody = runtime.renderWidgetTree(borderTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(
  borderBody,
  /class="sp-node sp-stack sp-vertical" style="[^"]*width:32\.5px/,
  '布局引擎应把 border 计入内容空间侵占（16.5 + 14 + 2×1）'
);

// 全部真实组件走布局引擎路径的冒烟测试（浏览器路径与之一致）
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
    const body = runtime.renderWidgetTree(tree, {
      now: fixedNow,
      size: { width: family.width, height: family.height },
    });
    assert.match(body, /class="sp-node sp-runtime-root/);
    assert.doesNotMatch(body, /undefined|NaN/);
  }
}

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
