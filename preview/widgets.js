(function registerPreviewWidgets(global) {
  'use strict';

  const runtime = global.ScriptablePreviewRuntime;
  if (!runtime) throw new Error('请先加载 preview/runtime.js');

  const widgets = [
    { id: 'hitokoto', name: '一言', category: '灵感', icon: '❞' },
    { id: 'ikuai', name: '爱快路由器', category: '网络', icon: '↕' },
    { id: 'milk-tea-reminder', name: '奶茶提醒', category: '生活', icon: '🧋' },
    { id: 'time-progress', name: '时间进度', category: '效率', icon: '◴' },
    { id: 'today-dashboard', name: '今日面板', category: '效率', icon: '▦' },
    { id: 'work-helper', name: '下班助手', category: '工作', icon: '✓' },
    { id: 'xlyra', name: 'XLYRA 控制台', category: '监控', icon: '▪' },
  ].map((widget) => Object.freeze({
    ...widget,
    sourcePath: `../dist/${widget.id}.js`,
    render: (context) => runtime.renderDistWidget({
      ...widget,
      sourcePath: `../dist/${widget.id}.js`,
    }, context),
  }));

  global.ScriptablePreviewWidgets = Object.freeze(widgets);
})(globalThis);
