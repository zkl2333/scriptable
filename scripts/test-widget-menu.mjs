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

const { runWidgetMenu } = await import('../src/lib/widget-menu.js');

const updater = {
  checkForUpdate: async () => null,
  applyUpdateIfAny: async () => false,
};

sheetSelections.push(0, 1);
assert.deepEqual(
  await runWidgetMenu({ title: '测试', version: '1.0.0', updater }),
  { action: 'preview', families: ['medium'] }
);

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
