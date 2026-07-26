// 开发工具：将指定组件各尺寸的完整 IR 树导出为 JSON 快照，
// 供 scripts/render-widget.py 渲染为 PNG 进行离线视觉检查。
import { readFile, writeFile, mkdir } from 'node:fs/promises';

await import('../preview/core.js');
await import('../preview/symbols.js');
await import('../preview/ir.js');
await import('../preview/measure.js');
await import('../preview/layout.js');
await import('../preview/runtime.js');
await import('../preview/widgets.js');

const runtime = globalThis.ScriptablePreviewRuntime;
const core = globalThis.ScriptablePreviewCore;

const targets = process.argv.slice(2);
const widgetIds = targets.length > 0
  ? targets
  : globalThis.ScriptablePreviewWidgets.map(({ id }) => id);
const fixedNow = new Date(process.env.SNAPSHOT_NOW || '2026-07-27T15:30:00+08:00');

await mkdir(new URL('../snapshots', import.meta.url), { recursive: true });

for (const widgetId of widgetIds) {
  const source = await readFile(new URL(`../dist/${widgetId}.js`, import.meta.url), 'utf8');
  for (const family of core.families) {
    const tree = await runtime.executeSource({
      source,
      scriptId: widgetId,
      family: family.id,
      appearance: 'light',
      now: fixedNow,
    });
    const file = new URL(`../snapshots/${widgetId}-${family.id}.json`, import.meta.url);
    await writeFile(file, JSON.stringify({
      widgetId,
      family: family.id,
      width: family.width,
      height: family.height,
      tree,
    }, null, 2));
    console.log(`${widgetId}-${family.id}`);
  }
}
