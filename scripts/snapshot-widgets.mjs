// 开发工具：将指定组件各尺寸的完整 IR 与布局引擎几何树（含 _frame / _lines / _fontScale）
// 导出为 JSON 快照，供 scripts/render-widget.py 直接消费同一套布局结果渲染为 PNG。
import { readFile, writeFile, mkdir } from 'node:fs/promises';

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

const runtime = globalThis.ScriptablePreviewRuntime;
const core = globalThis.ScriptablePreviewCore;

const targets = process.argv.slice(2);
const widgetIds = targets.length > 0
  ? targets
  : globalThis.ScriptablePreviewWidgets.map(({ id }) => id);
const fixedNow = new Date(process.env.SNAPSHOT_NOW || '2026-07-27T15:30:00+08:00');
const appearance = process.env.SNAPSHOT_APPEARANCE === 'dark' ? 'dark' : 'light';

await mkdir(new URL('../snapshots', import.meta.url), { recursive: true });

for (const widgetId of widgetIds) {
  const source = await readFile(new URL(`../dist/${widgetId}.js`, import.meta.url), 'utf8');
  for (const family of core.families) {
    const rawTree = await runtime.executeSource({
      source,
      scriptId: widgetId,
      family: family.id,
      appearance,
      now: fixedNow,
    });
    const tree = runtime.annotateLayoutTree(rawTree, {
      now: fixedNow,
      size: { width: family.width, height: family.height },
      family: family.id,
    });
    const file = new URL(`../snapshots/${widgetId}-${family.id}.json`, import.meta.url);
    await writeFile(file, JSON.stringify({
      widgetId,
      family: family.id,
      appearance,
      width: family.width,
      height: family.height,
      tree,
    }, null, 2));
    console.log(`${widgetId}-${family.id}`);
  }
}
