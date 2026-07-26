// ikuai 预览 mock：注册到全局 ScriptablePreviewMocks，由 preview/runtime.js 消费。
// 不参与 dist 构建（build.mjs 入口为显式列表）。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  registry['ikuai'] = {
    keychain: {
      ikuai_username: 'preview',
      ikuai_password: 'preview',
      ikuai_host: '127.0.0.1',
      ikuai_port: '80',
    },
    respond(url, request) {
      if (url.includes('ikuai64.ico')) return { __kind: 'remote', url: '../image/ikuai64.ico' };
      if (url.endsWith('/Action/login')) {
        request.response = { cookies: [{ name: 'sess_key', value: 'preview-session' }] };
        return { Result: 10000 };
      }
      if (url.endsWith('/Action/call')) {
        const body = JSON.parse(request.body || '{}');
        if (body.func_name === 'homepage') {
          return {
            code: 0,
            results: {
              sysstat: {
                cpu: ['17%', '19%', '18%', '18%'],
                memory: { used: '42%' },
                cputemp: ['51°C'],
                online_user: { count: 28 },
                stream: {
                  upload: 9017754,
                  download: 44879053,
                  total_up: 51754355916,
                  total_down: 255980050842,
                  connect_num: 386,
                  uptime: 1572480,
                },
              },
            },
          };
        }
        return {
          code: 0,
          results: {
            snapshoot_wan: [{
              default_route: 1,
              internet: 4,
              ip_addr: '192.0.2.18',
              interface: 'wan1',
              updatetime: 1572480,
            }],
          },
        };
      }
      return undefined;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
