import assert from 'node:assert/strict';
import { Color, DrawContext, Font, ListWidget, Path, Rect, Size, createRuntime, runPreview } from '../src/runtime/index.js';
import { resolveColor } from '../src/renderer/index.js';

const runtime = createRuntime({ family: 'medium', scheme: 'dark' });
const widget = new runtime.api.ListWidget();
widget.setPadding(1, 2, 3, 4);
widget.spacing = 5;
const row = widget.addStack();
row.addText('left');
row.addSpacer();
row.addText('right');
const fixed = widget.addSpacer(9);

assert.equal(widget.layout, 'vertical');
assert.equal(widget.alignment, 'stretch');
assert.deepEqual(widget.padding, [1, 2, 3, 4]);
assert.equal(widget.children.length, 2);
assert.equal(row.layout, 'horizontal');
assert.equal(row.children[1].length, null);
assert.equal(fixed.length, 9);

const dynamic = Color.dynamic(new Color('#112233', 0.5), new Color('#aabbcc'));
assert.equal(resolveColor(dynamic, 'light'), 'rgb(17 34 51 / 0.5)');
assert.equal(resolveColor(dynamic, 'dark'), 'rgb(170 187 204 / 1)');

const context = new DrawContext();
context.size = new Size(48, 8);
context.setFillColor(new Color('#208ca5'));
const path = new Path();
path.addRoundedRect(new Rect(0, 0, 48, 8), 4, 4);
context.addPath(path);
context.fillPath();
context.setFont(Font.boldSystemFont(10));
context.drawText('42%', { x: 2, y: 1 });
const image = context.getImage();
assert.equal(image.kind, 'canvas');
assert.equal(image.commands.length, 2);
assert.equal(image.size.width, 48);

const result = await runPreview(({ ListWidget, Font: RuntimeFont }) => {
  const preview = new ListWidget();
  const text = preview.addText('preview');
  text.font = RuntimeFont.semiboldSystemFont(12);
  return preview;
}, { family: 'small', now: new Date('2026-07-23T00:00:00Z') });
assert.ok(result.widget instanceof ListWidget);
assert.deepEqual(result.diagnostics, []);

const invalid = await runPreview(() => ({ bad: true }), {});
assert.equal(invalid.widget, null);
assert.equal(invalid.diagnostics[0].level, 'error');

console.log('Web preview runtime tests passed.');
