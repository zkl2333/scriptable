// work-helper 预览 mock：注册到全局 ScriptablePreviewMocks，由 preview/runtime.js 消费。
// 不参与 dist 构建（build.mjs 入口为显式列表）。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  const pad = (value) => String(value).padStart(2, '0');
  const formatDate = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  registry['work-helper'] = {
    respond(url, request, now) {
      if (!url.includes('timor.tech')) return undefined;
      if (url.includes('/holiday/info/')) return { type: { name: '工作日', type: 0 } };
      if (url.includes('/workday/next/')) {
        const next = new Date(now);
        next.setDate(next.getDate() + (next.getDay() === 5 ? 3 : 1));
        return { workday: { date: formatDate(next) } };
      }
      if (url.includes('/holiday/next/')) {
        const holiday = new Date(now);
        holiday.setDate(holiday.getDate() + 14);
        return { holiday: { name: '周末', date: formatDate(holiday) } };
      }
      if (url.includes('/holiday/batch')) {
        const types = {};
        for (const value of new URL(url).searchParams.getAll('d')) {
          types[value] = { type: 0, name: '工作日' };
        }
        return { type: types };
      }
      return undefined;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
