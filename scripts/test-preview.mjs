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
await import('../src/widgets/screeps.mock.js');
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
assert.equal(core.families.length, 8);
assert.deepEqual(
  core.families.map(({ id }) => id),
  [
    'small',
    'medium',
    'large',
    'extraLarge',
    'extraLargePortrait',
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
    'interactive-lab',
    'ikuai',
    'milk-tea-reminder',
    'time-progress',
    'today-dashboard',
    'work-helper',
    'xlyra',
    'xlyra-user',
    'screeps',
    'cyber-clock',
    'pixel-pet',
  ]
);
assert.equal(new Set(widgets.map(({ id }) => id)).size, 15);

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
assert.match(drawContextBody, /transform="rotate\(45 /);
assert.match(drawContextBody, /sp-image--fill/);
assert.doesNotMatch(drawContextBody, /sp-symbol-fallback/);

// Scriptable 1.8 新能力测试：addProgress、addButton、addRefreshButton、addToggle、setAction、backgroundStyle、args.widgetAction
const v18Storage = { files: new Map(), keychain: new Map() };
const interactiveSource = await readFile(new URL('../dist/interactive-lab.js', import.meta.url), 'utf8');
const interactiveInitTree = await runtime.executeSource({
  source: interactiveSource,
  scriptId: 'interactive-lab',
  family: 'large',
  appearance: 'light',
  now: fixedNow,
  storage: v18Storage,
});
const interactiveInitBody = runtime.renderWidgetTree(interactiveInitTree, {
  now: fixedNow,
  size: { width: 338, height: 354 },
});
assert.match(interactiveInitBody, /data-progress-style="circular"/, '应渲染原生环形进度指示器');
assert.match(interactiveInitBody, /data-progress-style="linear"/, '应渲染原生条形进度指示器');
assert.match(interactiveInitBody, /data-widget-action-id="add"/, '应渲染原生交互按钮');
assert.match(interactiveInitBody, /data-widget-refresh="true"/, '应渲染原生刷新按钮');
assert.match(interactiveInitBody, /role="switch"[^>]*data-widget-action-id="transparent"/, '应渲染原生开关控件');
assert.match(interactiveInitBody, />750</);
assert.doesNotMatch(interactiveInitBody, /sp-symbol-fallback/);

const interactiveAddedTree = await runtime.executeSource({
  source: interactiveSource,
  scriptId: 'interactive-lab',
  family: 'large',
  appearance: 'light',
  now: fixedNow,
  widgetAction: { id: 'add' },
  storage: v18Storage,
});
const interactiveAddedBody = runtime.renderWidgetTree(interactiveAddedTree, {
  now: fixedNow,
  size: { width: 338, height: 354 },
});
assert.match(interactiveAddedBody, />1000</, '触发 add widgetAction 后饮水量应持久化递增');

const interactiveTransparentTree = await runtime.executeSource({
  source: interactiveSource,
  scriptId: 'interactive-lab',
  family: 'large',
  appearance: 'light',
  now: fixedNow,
  widgetAction: { id: 'transparent', isOn: true },
  storage: v18Storage,
});
assert.equal(interactiveTransparentTree.backgroundStyle, 'transparent', '开关应启用 transparent backgroundStyle');
const interactiveTransparentBody = runtime.renderWidgetTree(interactiveTransparentTree, {
  now: fixedNow,
  size: { width: 338, height: 354 },
});
assert.match(interactiveTransparentBody, /sp-transparent-background/, '透明背景应输出透明样式类');
assert.match(interactiveTransparentBody, /data-background-style="transparent"/);

// 业务组件交互与透明背景参数覆盖测试：pixel-pet 与 milk-tea-reminder
const petStorage = { files: new Map(), keychain: new Map() };
const petSource = await readFile(new URL('../dist/pixel-pet.js', import.meta.url), 'utf8');
const petAfterTap = await runtime.executeSource({
  source: petSource,
  scriptId: 'pixel-pet',
  family: 'medium',
  appearance: 'light',
  now: fixedNow,
  widgetAction: { id: 'pet' },
  widgetParameter: 'transparent',
  storage: petStorage,
});
assert.equal(petAfterTap.backgroundStyle, 'transparent', 'widgetParameter=transparent 应生效');
const petAfterTapBody = runtime.renderWidgetTree(petAfterTap, {
  now: fixedNow,
  size: { width: 338, height: 158 },
});
assert.match(petAfterTapBody, /被撸了 1 次/, '像素宠物应响应 pet 交互动作');
assert.match(petAfterTapBody, /data-widget-action-id="switch"/);

const milkStorage = { files: new Map(), keychain: new Map() };
const milkSource = await readFile(new URL('../dist/milk-tea-reminder.js', import.meta.url), 'utf8');
const milkAfterCup = await runtime.executeSource({
  source: milkSource,
  scriptId: 'milk-tea-reminder',
  family: 'medium',
  appearance: 'light',
  now: fixedNow,
  widgetAction: { id: 'cup-add' },
  storage: milkStorage,
});
const milkAfterCupBody = runtime.renderWidgetTree(milkAfterCup, {
  now: fixedNow,
  size: { width: 338, height: 158 },
});
assert.match(milkAfterCupBody, /今日 1 杯 \+/, '奶茶提醒应响应 cup-add 计数动作');
assert.match(milkAfterCupBody, /data-widget-action-id="cup-reset"/, '记录杯数后应出现清零交互标签');

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
// iOS 27.2 SF Pro 实测度量 @15px：'AB' 理想 19.50px；长文本 40 个 X 截断渲染占 101.36px（9*X+'…'），
// 剩余 17.15px 回流给弹性 Spacer（对齐 SwiftUI iPhone 18 Pro 实测 19.67 / 101.67 / 16.67）。
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
  /class="sp-node sp-text" style="[^"]*width:101\.36px[^"]*">X+</,
  '长文本应按需取用并按截断后实际宽度占用空间'
);
assert.match(
  allocationBody,
  /class="sp-node sp-spacer" style="[^"]*width:17\.15px/,
  '长文本截断后的剩余宽度应与最小长度一起回流给弹性 Spacer'
);
assert.match(
  allocationBody,
  /class="sp-node sp-stack sp-horizontal" style="[^"]*width:138px;height:17\.9px/,
  '横向子 Stack 应 stretch 到内宽、高度为 iOS 27.2 单行文本行高（15×1.1934=17.9px）'
);
const noSizeBody = runtime.renderWidgetTree(allocationTree, { now: fixedNow });
assert.doesNotMatch(noSizeBody, /width:101\.36px/, '未注入容器尺寸时应保持 flex 近似路径');

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
// SF Pro @20px 20 个 X 理想宽度 258.28 > 内层 138；二分缩字号至 10.41px（下限 10 未触达），
// 且横向文本行高同步收敛至 10.41×1.1934 = 12.42px。
const scaleBody = runtime.renderWidgetTree(scaleTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(
  scaleBody,
  /font-size:10\.41px/,
  'minimumScaleFactor 应先二分缩小字号再考虑截断'
);
assert.match(
  scaleBody,
  /height:12\.42px/,
  '横向文本缩放后行高应同步按缩放后字号计算'
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
// iOS 27.2 SF Pro 'AB' @15px = 19.50；border-box 下盒子宽度 = 19.50 + padding 14 + border 2 = 35.5
const borderBody = runtime.renderWidgetTree(borderTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(
  borderBody,
  /class="sp-node sp-stack sp-vertical" style="[^"]*width:35\.5px/,
  '布局引擎应把 border 计入内容空间侵占（19.50 + 14 + 2×1）'
);
assert.match(
  borderBody,
  /class="sp-node sp-runtime-root sp-vertical" style="[^"]*padding:16px 16px 16px 16px/,
  '未调用 setPadding 的主屏 ListWidget 应使用 SwiftUI 默认 16pt 内边距'
);

// 二维布局引擎与渲染内核进阶测试：
// 1. 显式 \n 换行 + 真实断行 + 纵向多行 minimumScaleFactor 联合求解
const multilineFixture = `
const widget = new ListWidget();
widget.setPadding(10, 10, 10, 10);
const explicit = widget.addText('第一行\\n第二行');
explicit.font = Font.systemFont(14);
const scaledMulti = widget.addText('这是一段在两行限制下需要触发缩小字号的长中文描述内容用于验证多行缩放算法');
scaledMulti.font = Font.systemFont(16);
scaledMulti.lineLimit = 2;
scaledMulti.minimumScaleFactor = 0.5;
Script.setWidget(widget);
Script.complete();
`;
const multilineTree = await runtime.executeSource({
  source: multilineFixture,
  scriptId: 'multiline-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const multilineLaid = runtime.annotateLayoutTree(multilineTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.equal(multilineLaid.elements[0]._lines.length, 2, '显式 \\n 应拆分为两行');
assert.ok(
  multilineLaid.elements[0]._frame.height >= 30,
  '两行显式换行文本应占据两行高度'
);
assert.ok(
  multilineLaid.elements[1]._fontScale < 16 && multilineLaid.elements[1]._fontScale >= 8,
  '纵向多行 lineLimit + minimumScaleFactor 应触发二分缩字号'
);

// 2. 横向 Stack 嵌套纵向折行文本的二维交叉轴高度联动回流
const coupledFixture = `
const widget = new ListWidget();
widget.setPadding(10, 10, 10, 10);
const row = widget.addStack();
const left = row.addStack();
left.size = new Size(80, 20);
left.addText('LEFT');
const right = row.addStack();
right.layoutVertically();
const wrap = right.addText('中文自动折行触发高度回流验证');
wrap.font = Font.systemFont(14);
Script.setWidget(widget);
Script.complete();
`;
const coupledTree = await runtime.executeSource({
  source: coupledFixture,
  scriptId: 'coupled-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const coupledLaid = runtime.annotateLayoutTree(coupledTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
const rowFrame = coupledLaid.elements[0]._frame;
const rightLines = coupledLaid.elements[0].elements[1].elements[0]._lines;
assert.ok(rightLines.length >= 3, '受压纵向子 Stack 内的文本应按可用宽度真实折行');
assert.ok(rowFrame.height >= rightLines.length * 14, '父横向 Stack 高度应随子 Stack 折行联动增长');

// 3. accessoryInline 单图单文过滤规则（WidgetKit 官方语义）
const inlineFilterFixture = `
const widget = new ListWidget();
const row = widget.addStack();
row.addImage(SFSymbol.named('circle').image);
row.addImage(SFSymbol.named('calendar').image);
row.addText('保留主文本');
row.addText('会被过滤的次文本');
Script.setWidget(widget);
Script.complete();
`;
const inlineFilterTree = await runtime.executeSource({
  source: inlineFilterFixture,
  scriptId: 'inline-filter-fixture',
  family: 'accessoryInline',
  appearance: 'light',
  now: fixedNow,
});
const inlineFilterBody = runtime.renderWidgetTree(inlineFilterTree, {
  now: fixedNow,
  size: { width: 160, height: 26 },
  family: 'accessoryInline',
});
assert.match(inlineFilterBody, /aria-label="circle"/);
assert.doesNotMatch(inlineFilterBody, /aria-label="calendar"/, 'accessoryInline 应过滤多余图片');
assert.match(inlineFilterBody, /保留主文本/);
assert.doesNotMatch(inlineFilterBody, /会被过滤的次文本/, 'accessoryInline 应过滤多余文本');

// 4. containerRelativeShape 同心圆角 + resizable=false + 位图 tintColor 模板着色 + 有序 Path + 多行 drawTextInRect + Font Dynamic Type
const graphicsFixture = `
const widget = new ListWidget();
widget.setPadding(10, 10, 10, 10);
const ctx = new DrawContext();
ctx.size = new Size(80, 50);
ctx.opaque = false;
const p = new Path();
p.move(new Point(2, 2));
p.addLine(new Point(20, 2));
p.addRect(new Rect(10, 10, 12, 12));
p.addEllipse(new Rect(30, 10, 12, 12));
ctx.addPath(p);
ctx.setFillColor(Color.white());
ctx.fillPath();
ctx.setFont(Font.caption1());
ctx.setTextColor(Color.white());
ctx.drawTextInRect('第一行测试文本自动折行', new Rect(4, 24, 48, 24));
const img = widget.addImage(ctx.getImage());
img.resizable = false;
img.imageSize = new Size(20, 20);
img.containerRelativeShape = true;
img.tintColor = Color.red();
const sym = SFSymbol.named('circle');
sym.applyBoldWeight();
const h = widget.addText('HIG');
h.font = Font.headline();
Script.setWidget(widget);
Script.complete();
`;
const graphicsTree = await runtime.executeSource({
  source: graphicsFixture,
  scriptId: 'graphics-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const drawOps = graphicsTree.elements[0].codableImage.ops;
assert.deepEqual(
  drawOps.slice(0, 3).map((op) => op.type),
  ['path', 'fillRect', 'fillEllipse'],
  'Path 混合命令应严格保持调用顺序'
);
const graphicsBody = runtime.renderWidgetTree(graphicsTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
});
assert.match(graphicsBody, /width:80px;height:50px/, 'resizable=false 应保持图片固有尺寸');
assert.match(graphicsBody, /border-radius:12px/, 'padding=10 时 containerRelativeShape 同心圆角应为 22-10=12px');
assert.match(graphicsBody, /data-tinted="true"/, 'draw 图像设置 tintColor 应生成 Alpha 模板着色滤镜');
assert.match(graphicsBody, /<feComposite in="flood" in2="SourceAlpha" operator="in"\/>/);
assert.ok(
  (graphicsBody.match(/<text /g) || []).length >= 2,
  'DrawContext.drawTextInRect 应对超宽文本生成多行 <text>'
);
assert.match(graphicsBody, /font-size:17px;font-weight:600/, 'Font.headline() 应映射 17px semibold');

// 全部真实组件走布局引擎路径的冒烟测试（含暗黑 + 透明背景参数验证，确保无缺失 SF Symbol）
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
    assert.doesNotMatch(body, /sp-symbol-fallback/, `${widget.id}@${family.id} 存在未映射的 SF Symbol`);

    if (family.group === 'home') {
      const transparentTree = await runtime.executeSource({
        source,
        scriptId: widget.id,
        family: family.id,
        appearance: 'dark',
        now: fixedNow,
        widgetParameter: 'transparent',
      });
      assert.equal(
        transparentTree.backgroundStyle,
        'transparent',
        `${widget.id}@${family.id} 应响应 transparent 参数`
      );
      const transparentBody = runtime.renderWidgetTree(transparentTree, {
        now: fixedNow,
        appearance: 'dark',
        size: { width: family.width, height: family.height },
      });
      assert.match(transparentBody, /sp-transparent-background/);
      assert.doesNotMatch(transparentBody, /undefined|NaN/);
    }
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
assert.match(previewStyles, /line-height: 1\.1934;/, 'CSS 行高比应与 iOS 27.2 CoreText 实测 1.1934 一致');

// M6 实测定标单测：font-metrics.json 同源一致性、默认 padding、accessoryCircular 居中、竖直高度缩放约束
const fontMetricsJSON = JSON.parse(await readFile(new URL('../preview/font-metrics.json', import.meta.url), 'utf8'));
assert.equal(measureModule.LINE_HEIGHT_RATIO, fontMetricsJSON.lineHeightRatio, 'measure.js 行高比应与 font-metrics.json 一致');
assert.deepEqual(measureModule.FONT_METRICS.ascii, fontMetricsJSON.ascii, 'measure.js ASCII 度量表应与 font-metrics.json 同源');
assert.equal(
  Math.round(measurer.measure('RENDER', { family: 'monospace', size: 10, weight: 400 }) * 100) / 100,
  37.09,
  'SF Mono 等宽字符应使用实测 0.6182em'
);
const sumCharWidths = Array.from('2小时0分钟').reduce(
  (sum, ch) => sum + measurer.measure(ch, { family: 'system', size: 15, weight: 400 }),
  0
);
assert.ok(
  measurer.measure('2小时0分钟', { family: 'system', size: 15, weight: 400 }) > sumCharWidths + 5,
  'CJK-拉丁直接邻接应计入 CoreText 自动间距'
);

const defaultPaddingFixture = `
const widget = new ListWidget();
widget.useDefaultPadding();
const stack = widget.addStack();
stack.useDefaultPadding();
stack.addText('PAD');
Script.setWidget(widget);
Script.complete();
`;
const defaultPadTree = await runtime.executeSource({
  source: defaultPaddingFixture,
  scriptId: 'default-padding-fixture',
  family: 'small',
  appearance: 'light',
  now: fixedNow,
});
const defaultPadHome = runtime.annotateLayoutTree(defaultPadTree, {
  now: fixedNow,
  size: { width: 158, height: 158 },
  family: 'small',
});
assert.deepEqual(
  { x: defaultPadHome.elements[0]._frame.x, y: defaultPadHome.elements[0]._frame.y },
  { x: 16, y: 16 },
  '主屏 ListWidget 默认 padding 应为 16pt'
);
assert.deepEqual(
  { x: defaultPadHome.elements[0].elements[0]._frame.x, y: defaultPadHome.elements[0].elements[0]._frame.y },
  { x: 32, y: 32 },
  'WidgetStack.useDefaultPadding() 应叠加 16pt 内边距'
);
const defaultPadAccessory = runtime.annotateLayoutTree(defaultPadTree, {
  now: fixedNow,
  size: { width: 172, height: 76 },
  family: 'accessoryRectangular',
});
assert.deepEqual(
  { x: defaultPadAccessory.elements[0]._frame.x, y: defaultPadAccessory.elements[0]._frame.y },
  { x: 0, y: 0 },
  '锁屏 ListWidget 默认 padding 应为 0'
);

const accessoryCircularLaid = runtime.annotateLayoutTree(
  await runtime.executeSource({
    source: accessorySource,
    scriptId: 'accessory-lab',
    family: 'accessoryCircular',
    appearance: 'light',
    now: fixedNow,
  }),
  { now: fixedNow, size: { width: 76, height: 76 }, family: 'accessoryCircular' }
);
assert.deepEqual(
  accessoryCircularLaid.elements[0]._frame,
  { x: 10, y: 10, width: 56, height: 56 },
  'accessoryCircular 无 Spacer 时应在圆形容器内垂直水平居中'
);

const workHelperSourceForM6 = await readFile(new URL('../dist/work-helper.js', import.meta.url), 'utf8');
const workHelperMediumLaid = runtime.annotateLayoutTree(
  await runtime.executeSource({
    source: workHelperSourceForM6,
    scriptId: 'work-helper',
    family: 'medium',
    appearance: 'light',
    now: new Date('2026-07-27T15:30:00+08:00'),
  }),
  { now: new Date('2026-07-27T15:30:00+08:00'), size: { width: 338, height: 158 }, family: 'medium' }
);
const workHeroDate = workHelperMediumLaid.elements[2].elements[0].elements[2];
assert.equal(workHeroDate._lines.length, 1, 'work-helper 中号主倒计时应在垂直空间受限时按 minimumScaleFactor 单行收敛');
assert.ok(workHeroDate._fontScale < 32 && workHeroDate._fontScale >= 19.2, 'work-helper 中号主倒计时应触发等比缩字号');
assert.ok(workHelperMediumLaid.elements[6]._frame.y + workHelperMediumLaid.elements[6]._frame.height <= 144.5, 'work-helper 中号底部进度文案不应溢出 158pt 容器');
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
