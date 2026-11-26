// Screeps 预览 mock：仪表盘展示数据，不含真实凭证。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});
  const rooms = {
    E43N29: { energyHarvested: 19430, energyConstruction: 2742, energyCreeps: 11500, energyControl: 25584 },
    E42N24: { energyHarvested: 15820, energyConstruction: 3810, energyCreeps: 9200, energyControl: 21240 },
    E41N23: { energyHarvested: 12640, energyConstruction: 1840, energyCreeps: 7600, energyControl: 16880 },
  };
  const history = (value) => ({ '1': { currentValues: [value], previousValues: [value] }, '10': { currentValues: [value], previousValues: [value] } });
  registry.screeps = {
    keychain: {
      'screeps.token': 'preview-token',
      'screeps.shard': 'shard2',
      'screeps.rooms': 'E43N29,E42N24,E41N23',
    },
    respond(url) {
      if (url.includes('/auth/me')) return { ok: 1, username: 'zkl2333', cpu: 80, money: 164697912, gcl: { level: 7, progress: 71975612, progressTotal: 115000000 } };
      if (url.includes('/user/memory')) {
        if (url.includes('cpu_total')) return history(27.4);
        if (url.includes('cpu_ratio')) return history(0.34);
        if (url.includes('bucket')) return history(7340);
        if (url.includes('creeps')) return history(64);
      }
      if (url.includes('/game/room-overview')) {
        const room = Object.keys(rooms).find((name) => url.includes(encodeURIComponent(name)) || url.includes(name));
        return { ok: 1, owner: 'zkl2333', totals: rooms[room] || {} };
      }
      return { ok: 1 };
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
