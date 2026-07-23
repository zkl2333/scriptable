import assert from 'node:assert/strict';

const sheetSelections = [];
const alerts = [];

globalThis.Color = class {
  constructor(value) {
    this.value = value;
  }
};
globalThis.Font = {
  boldSystemFont: (size) => `bold-${size}`,
  systemFont: (size) => `system-${size}`,
};
globalThis.Script = { name: () => 'Test Widget' };
globalThis.Device = { isPad: () => false };
globalThis.Alert = class {
  constructor() {
    this.actions = [];
    alerts.push(this);
  }

  addAction(value) {
    this.actions.push(value);
  }

  addCancelAction(value) {
    this.cancel = value;
  }

  async presentAlert() {
    return 0;
  }

  async presentSheet() {
    return sheetSelections.shift();
  }
};

const { presentWidget, presentWidgetPreviews, runWidgetMenu } = await import(
  '../src/lib/widget-menu.js'
);

const updater = {
  checkForUpdate: async () => null,
  applyUpdateIfAny: async () => false,
};

sheetSelections.push(0, 1);
assert.deepEqual(
  await runWidgetMenu({ title: '测试', version: '1.0.0', updater }),
  { action: 'preview', families: ['medium'] }
);

sheetSelections.push(0, 5);
assert.deepEqual(
  await runWidgetMenu({
    title: '测试',
    version: '1.0.0',
    updater,
    previewFamilies: [
      'small',
      'medium',
      'large',
      'extraLarge',
      'accessoryInline',
      'accessoryCircular',
      'accessoryRectangular',
    ],
  }),
  { action: 'preview', families: ['accessoryRectangular'] }
);
assert.equal(alerts.at(-1).actions.includes('超大尺寸 Extra Large（iPad）'), false);

Device.isPad = () => true;
sheetSelections.push(0, 7);
assert.deepEqual(
  await runWidgetMenu({
    title: '测试',
    version: '1.0.0',
    updater,
    previewFamilies: [
      'small',
      'medium',
      'large',
      'extraLarge',
      'accessoryInline',
      'accessoryCircular',
      'accessoryRectangular',
    ],
  }),
  { action: 'preview', families: ['small', 'medium', 'large', 'extraLarge'] }
);
assert.equal(alerts.at(-1).actions.at(-3), '全部主屏 Home Screen');

sheetSelections.push(0, 8);
assert.deepEqual(
  await runWidgetMenu({
    title: '测试',
    version: '1.0.0',
    updater,
    previewFamilies: [
      'small',
      'medium',
      'large',
      'extraLarge',
      'accessoryInline',
      'accessoryCircular',
      'accessoryRectangular',
    ],
  }),
  {
    action: 'preview',
    families: ['accessoryInline', 'accessoryCircular', 'accessoryRectangular'],
  }
);
Device.isPad = () => false;

const previewCalls = [];
const previewWidget = {
  presentSmall: async () => previewCalls.push('small'),
  presentMedium: async () => previewCalls.push('medium'),
  presentLarge: async () => previewCalls.push('large'),
  presentExtraLarge: async () => previewCalls.push('extraLarge'),
  presentAccessoryInline: async () => previewCalls.push('accessoryInline'),
  presentAccessoryCircular: async () => previewCalls.push('accessoryCircular'),
  presentAccessoryRectangular: async () => previewCalls.push('accessoryRectangular'),
};
for (const family of [
  'small',
  'medium',
  'large',
  'extraLarge',
  'accessoryInline',
  'accessoryCircular',
  'accessoryRectangular',
]) {
  await presentWidget(previewWidget, family);
}
assert.deepEqual(previewCalls, [
  'small',
  'medium',
  'large',
  'extraLarge',
  'accessoryInline',
  'accessoryCircular',
  'accessoryRectangular',
]);
await assert.rejects(() => presentWidget(previewWidget, 'unsupported'), /不支持的组件尺寸/);

const attemptedFamilies = [];
const previewResult = await presentWidgetPreviews(
  async (family) => {
    attemptedFamilies.push(family);
    if (family === 'medium') throw new Error('render failed');
    return previewWidget;
  },
  ['small', 'medium', 'medium', 'large']
);
assert.deepEqual(attemptedFamilies, ['small', 'medium', 'large']);
assert.deepEqual(previewResult.presented, ['small', 'large']);
assert.deepEqual(
  previewResult.failures.map(({ family }) => family),
  ['medium']
);
assert.equal(alerts.at(-1).title, '部分预览失败');

sheetSelections.push(1);
assert.deepEqual(
  await runWidgetMenu({
    title: '测试',
    version: '1.0.0',
    updater,
    actions: [{ id: 'settings', title: '设置' }],
  }),
  { action: 'settings' }
);

sheetSelections.push(-1);
assert.equal(await runWidgetMenu({ title: '测试', version: '1.0.0', updater }), null);

const updateCalls = [];
sheetSelections.push(1);
assert.equal(
  await runWidgetMenu({
    title: '测试',
    version: '1.0.0',
    updater: {
      checkForUpdate: async (options) => {
        updateCalls.push(['check', options]);
        return { version: '1.1.0' };
      },
      applyUpdateIfAny: async (options) => {
        updateCalls.push(['apply', options]);
        return true;
      },
    },
  }),
  null
);
assert.deepEqual(updateCalls, [
  ['check', { force: true }],
  ['apply', { force: true }],
]);
assert.equal(alerts.at(-1).title, '更新完成');

console.log('Widget menu test passed.');
