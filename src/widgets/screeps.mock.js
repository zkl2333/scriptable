// Screeps 预览 mock：对齐线上 Memory.history 与 Grafana Memory.stats 指标结构，不含真实凭证。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});
  const rooms = {
    E43N29: { energyHarvested: 19430, energyConstruction: 2742, energyCreeps: 11500, energyControl: 25584 },
    E42N24: { energyHarvested: 15820, energyConstruction: 3810, energyCreeps: 9200, energyControl: 21240 },
    E41N23: { energyHarvested: 12640, energyConstruction: 1840, energyCreeps: 7600, energyControl: 16880 },
    E44N28: { energyHarvested: 14120, energyConstruction: 1120, energyCreeps: 8400, energyControl: 18210 },
    E47N31: { energyHarvested: 11850, energyConstruction: 940, energyCreeps: 6900, energyControl: 14920 },
    E47N27: { energyHarvested: 10940, energyConstruction: 1480, energyCreeps: 6400, energyControl: 13650 },
  };
  const history = (current, prev = []) => ({
    '1': { currentValues: Array.isArray(current) ? current : [current], previousValues: prev },
    '10': { currentValues: [Array.isArray(current) ? current.at(-1) : current], previousValues: prev },
  });
  registry.screeps = {
    keychain: {
      'screeps.token': 'preview-token',
      'screeps.shard': 'shard2',
      'screeps.rooms': 'E43N29,E42N24,E41N23,E44N28,E47N31,E47N27',
    },
    respond(url) {
      if (url.includes('/auth/me')) {
        return {
          ok: 1,
          username: 'zkl2333',
          cpu: 130,
          money: 4893550423,
          gcl: { level: 11, progress: 41684000, progressTotal: 64560692 },
        };
      }
      if (url.includes('/user/memory')) {
        if (url.includes('path=stats')) {
          return {
            ok: 1,
            data: {
              'cpu.used': 56.8,
              'cpu.limit': 70,
              'cpu.bucket': 9561,
              creeps: 111,
              credits: 4893550423,
              'gcl.level': 11,
              'gcl.progressPercent': 64.57,
              'room.E43N29.controllerLevel': 8,
              'room.E43N29.controllerProgressPercent': 100,
              'room.E43N29.storageEnergy': 482000,
              'room.E43N29.terminalEnergy': 62000,
              'room.E43N29.energyAvailable': 12900,
              'room.E43N29.energyCapacityAvailable': 12900,
              'room.E42N24.controllerLevel': 8,
              'room.E42N24.controllerProgressPercent': 100,
              'room.E42N24.storageEnergy': 365000,
              'room.E42N24.terminalEnergy': 54000,
              'room.E42N24.energyAvailable': 12300,
              'room.E42N24.energyCapacityAvailable': 12900,
              'room.E41N23.controllerLevel': 7,
              'room.E41N23.controllerProgressPercent': 78.4,
              'room.E41N23.storageEnergy': 218000,
              'room.E41N23.terminalEnergy': 31000,
              'room.E41N23.energyAvailable': 5600,
              'room.E41N23.energyCapacityAvailable': 5600,
              'room.E44N28.controllerLevel': 7,
              'room.E44N28.controllerProgressPercent': 52.1,
              'room.E44N28.storageEnergy': 194000,
              'room.E44N28.terminalEnergy': 28000,
              'room.E44N28.energyAvailable': 5150,
              'room.E44N28.energyCapacityAvailable': 5600,
              'room.E47N31.controllerLevel': 6,
              'room.E47N31.controllerProgressPercent': 64.2,
              'room.E47N31.storageEnergy': 148000,
              'room.E47N31.terminalEnergy': 19000,
              'room.E47N31.energyAvailable': 2300,
              'room.E47N31.energyCapacityAvailable': 2300,
              'room.E47N27.controllerLevel': 6,
              'room.E47N27.controllerProgressPercent': 31.8,
              'room.E47N27.storageEnergy': 132000,
              'room.E47N27.terminalEnergy': 15000,
              'room.E47N27.energyAvailable': 2150,
              'room.E47N27.energyCapacityAvailable': 2300,
            },
          };
        }
        if (url.includes('cpu_total')) {
          return history(
            [52.4, 58.1, 49.6, 61.2, 54.3, 66.8, 51.1, 56.5, 54.3, 63.8, 57.6, 56.8],
            [47.2, 51.0, 48.8, 53.6]
          );
        }
        if (url.includes('cpu_limit')) return history(70);
        if (url.includes('cpu_ratio')) return history(0.81);
        if (url.includes('bucket_delta')) return history(12);
        if (url.includes('bucket')) return history(9561);
        if (url.includes('creeps')) return history(111);
      }
      if (url.includes('/game/room-overview')) {
        const room = Object.keys(rooms).find((name) => url.includes(encodeURIComponent(name)) || url.includes(name));
        return { ok: 1, owner: 'zkl2333', totals: rooms[room] || {} };
      }
      return { ok: 1 };
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
