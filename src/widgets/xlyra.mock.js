// xlyra 预览 mock：注册到全局 ScriptablePreviewMocks，由 preview/runtime.js 消费。
// 不参与 dist 构建（build.mjs 入口为显式列表）。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  registry['xlyra'] = {
    keychain: {
      'xlyra.baseURL': 'http://preview.local',
      'xlyra.adminToken': 'preview-token',
    },
    respond(url, request, now) {
      if (url.includes('/dashboard/epaper-summary')) {
        return {
          date: now.toISOString().slice(0, 10),
          kpis: {
            today_cost: 12.84,
            total_cost: 5140.59,
            today_tokens: 224400000,
            today_requests: 2237,
            rpm_used: 1,
            tpm_used: 605000,
          },
          model_top3_today: [
            { model_key: 'gpt-5.6-sol', cost: 430.79 },
            { model_key: 'gpt-5.6-terra', cost: 11.33 },
            { model_key: 'gpt-5.6-luna', cost: 0.6883 },
          ],
          codex_quota: { account_count: 0 },
        };
      }
      if (url.includes('/health/sites')) {
        return {
          items: [
            ['api-prod', 42, 'healthy'],
            ['gateway', 68, 'healthy'],
            ['edge-tokyo', 91, 'healthy'],
            ['codex', 0, 'offline'],
            ['claude', 0, 'offline'],
            ['gemini', 0, 'offline'],
            ['vertex', 0, 'offline'],
          ].map(([name, latency, status], index) => ({
            site: { id: index + 1, name, enabled: true },
            health: { status, recent_avg_latency_ms: latency },
          })),
        };
      }
      if (url.includes('/api-keys')) {
        return { items: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, status: 'active' })) };
      }
      if (url.includes('/requests?')) return { meta: { total: 74 } };
      if (url.includes('/dashboard/usage')) {
        return {
          charts: {
            daily_site_cost: Array.from({ length: 7 }, (_, index) => ({
              date: now.toISOString().slice(0, 10),
              site_id: index + 1,
              cost: [3.12, 2.7, 2.14, 1.92, 1.68, 1.28, 0.96][index],
            })),
          },
        };
      }
      return undefined;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
