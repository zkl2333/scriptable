// xlyra-user 预览 mock：注册到全局 ScriptablePreviewMocks，由 preview/runtime.js 消费。
// 不参与 dist 构建（build.mjs 入口为显式列表）。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  registry['xlyra-user'] = {
    keychain: {
      'xlyra-user.baseURL': 'http://preview.local',
      'xlyra-user.apiKey': 'preview-api-key',
    },
    respond(url, request, now) {
      if (url.includes('/v1/portal/settings')) {
        return {
          enabled: true,
          show_summary: true,
          show_requests: true,
          summary_days: 14,
          dimensions: {
            cost: true,
            tokens: true,
            latency: true,
            model: true,
            endpoint: true,
          },
        };
      }
      if (url.includes('/v1/portal/overview')) {
        return {
          quota: {
            unlimited: false,
            limit: 20.0,
            used: 6.42,
            remaining: 13.58,
          },
          key: { is_active: true },
        };
      }
      if (url.includes('/v1/portal/summary')) {
        return {
          trend: Array.from({ length: 14 }, (_, index) => ({
            success: 180 + index * 17,
            cost: (0.9 + index * 0.31).toFixed(4),
            total_tokens: 2_400_000 + index * 310_000,
          })),
        };
      }
      if (url.includes('/v1/portal/requests')) {
        return {
          items: Array.from({ length: 6 }, (_, index) => ({
            success: index !== 2,
            status_code: index === 2 ? 429 : 200,
            created_at: new Date(now.getTime() - index * 7 * 60 * 1000).toISOString(),
            model: {
              canonical_model: ['gpt-5.6-sol', 'gpt-5.6-terra', 'claude-sonnet-4.5'][index % 3],
              upstream_model: `upstream-${index}`,
            },
            endpoint: '/v1/chat/completions',
            cost: { estimated_cost: (0.012 + index * 0.004).toFixed(4) },
            usage: { total_tokens: 8200 + index * 1300 },
            latency_ms: 640 + index * 90,
          })),
        };
      }
      return undefined;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
