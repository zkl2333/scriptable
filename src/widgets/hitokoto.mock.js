// hitokoto 预览 mock：注册到全局 ScriptablePreviewMocks，由 preview/runtime.js 消费。
// 不参与 dist 构建（build.mjs 入口为显式列表）。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  registry['hitokoto'] = {
    respond(url) {
      if (url.includes('hitokoto.cn')) return '慢一点，也是在向前走。';
      return undefined;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
