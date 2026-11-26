// Screeps 跨 Shard 帝国预览 mock：包含 shard2 / shardX / shard3 分片配额、Grafana Memory.stats 与历史采样。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  const shardRooms = {
    shard2: ['E43N29', 'E43N28', 'E44N32', 'E44N28', 'E47N31', 'E47N27'],
    shardX: ['E48N32', 'E45N33'],
    shard3: ['E43N31', 'E41N31'],
  };

  const roomTotals = {
    E43N29: { energyHarvested: 19430, energyConstruction: 2742, energyCreeps: 11500, energyControl: 25584 },
    E43N28: { energyHarvested: 15820, energyConstruction: 1920, energyCreeps: 9100, energyControl: 21240 },
    E44N32: { energyHarvested: 13410, energyConstruction: 1450, energyCreeps: 7800, energyControl: 18420 },
    E44N28: { energyHarvested: 14120, energyConstruction: 1120, energyCreeps: 8400, energyControl: 18210 },
    E47N31: { energyHarvested: 11850, energyConstruction: 940, energyCreeps: 6900, energyControl: 14920 },
    E47N27: { energyHarvested: 10940, energyConstruction: 1480, energyCreeps: 6400, energyControl: 13650 },
    E48N32: { energyHarvested: 16210, energyConstruction: 2110, energyCreeps: 8800, energyControl: 19650 },
    E45N33: { energyHarvested: 12180, energyConstruction: 890, energyCreeps: 6500, energyControl: 15120 },
    E43N31: { energyHarvested: 9840, energyConstruction: 720, energyCreeps: 5200, energyControl: 11890 },
    E41N31: { energyHarvested: 8650, energyConstruction: 610, energyCreeps: 4700, energyControl: 9840 },
  };

  const shardTelemetry = {
    shard2: {
      cpu: [52.4, 58.1, 49.6, 61.2, 54.3, 66.8, 51.1, 56.5, 54.3, 63.8, 57.6, 56.8],
      limit: 70,
      bucket: 9561,
      creeps: 104,
      stats: {
        'cpu.used': 56.8,
        'cpu.limit': 70,
        'cpu.bucket': 9561,
        creeps: 104,
        credits: 4901933368,
        'gcl.level': 11,
        'gcl.progressPercent': 64.57,
        'room.E43N29.controllerLevel': 8,
        'room.E43N29.controllerProgressPercent': 100,
        'room.E43N29.storageEnergy': 482000,
        'room.E43N29.energyAvailable': 12900,
        'room.E43N29.energyCapacityAvailable': 12900,
        'room.E43N28.controllerLevel': 8,
        'room.E43N28.controllerProgressPercent': 100,
        'room.E43N28.storageEnergy': 365000,
        'room.E43N28.energyAvailable': 12300,
        'room.E43N28.energyCapacityAvailable': 12900,
        'room.E44N32.controllerLevel': 7,
        'room.E44N32.controllerProgressPercent': 81.2,
        'room.E44N32.storageEnergy': 241000,
        'room.E44N32.energyAvailable': 5600,
        'room.E44N32.energyCapacityAvailable': 5600,
        'room.E44N28.controllerLevel': 7,
        'room.E44N28.controllerProgressPercent': 52.1,
        'room.E44N28.storageEnergy': 194000,
        'room.E44N28.energyAvailable': 5150,
        'room.E44N28.energyCapacityAvailable': 5600,
        'room.E47N31.controllerLevel': 6,
        'room.E47N31.controllerProgressPercent': 64.2,
        'room.E47N31.storageEnergy': 148000,
        'room.E47N31.energyAvailable': 2300,
        'room.E47N31.energyCapacityAvailable': 2300,
        'room.E47N27.controllerLevel': 6,
        'room.E47N27.controllerProgressPercent': 31.8,
        'room.E47N27.storageEnergy': 132000,
        'room.E47N27.energyAvailable': 2150,
        'room.E47N27.energyCapacityAvailable': 2300,
      },
    },
    shardX: {
      cpu: [26.5, 29.3, 24.8, 30.1, 28.5, 21.0, 28.6, 23.4, 29.8, 25.1, 30.7, 31.3],
      limit: 40,
      bucket: 9840,
      creeps: 34,
      stats: {
        'cpu.used': 31.3,
        'cpu.limit': 40,
        'cpu.bucket': 9840,
        creeps: 34,
        'room.E48N32.controllerLevel': 7,
        'room.E48N32.controllerProgressPercent': 74.5,
        'room.E48N32.storageEnergy': 212000,
        'room.E48N32.energyAvailable': 5400,
        'room.E48N32.energyCapacityAvailable': 5600,
        'room.E45N33.controllerLevel': 6,
        'room.E45N33.controllerProgressPercent': 48.0,
        'room.E45N33.storageEnergy': 124000,
        'room.E45N33.energyAvailable': 2300,
        'room.E45N33.energyCapacityAvailable': 2300,
      },
    },
    shard3: {
      cpu: [16.8, 17.5, 19.2, 16.4, 18.1, 17.9, 15.8, 16.9, 18.5, 17.6, 18.2, 18.9],
      limit: 20,
      bucket: 9912,
      creeps: 18,
      stats: {
        'cpu.used': 18.9,
        'cpu.limit': 20,
        'cpu.bucket': 9912,
        creeps: 18,
        'room.E43N31.controllerLevel': 5,
        'room.E43N31.controllerProgressPercent': 86.2,
        'room.E43N31.storageEnergy': 96000,
        'room.E43N31.energyAvailable': 1800,
        'room.E43N31.energyCapacityAvailable': 1800,
        'room.E41N31.controllerLevel': 5,
        'room.E41N31.controllerProgressPercent': 41.3,
        'room.E41N31.storageEnergy': 68000,
        'room.E41N31.energyAvailable': 1750,
        'room.E41N31.energyCapacityAvailable': 1800,
      },
    },
  };

  const history = (current) => ({
    '1': { currentValues: Array.isArray(current) ? current : [current], previousValues: [] },
    '10': { currentValues: [Array.isArray(current) ? current.at(-1) : current], previousValues: [] },
  });

  const shardFromUrl = (url) => {
    const match = url.match(/[?&]shard=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : 'shard2';
  };

  registry.screeps = {
    keychain: {
      'screeps.token': 'preview-token',
      'screeps.shard': '',
      'screeps.rooms': '',
    },
    respond(url) {
      if (url.includes('/auth/me')) {
        return {
          ok: 1,
          _id: '5dac32ae8cf7c431637c7567',
          username: 'zkl2333',
          cpu: 130,
          cpuShard: { shard0: 0, shard1: 0, shard2: 70, shard3: 20, shardX: 40 },
          money: 4901933368,
          gcl: { level: 11, progress: 41684000, progressTotal: 64560692 },
        };
      }
      if (url.includes('/user/rooms')) {
        return { ok: 1, shards: shardRooms };
      }
      if (url.includes('/game/shards/info')) {
        return {
          ok: 1,
          shards: [
            { name: 'shard2', tick: 4201 },
            { name: 'shard3', tick: 4453 },
            { name: 'shardX', tick: 2795 },
          ],
        };
      }
      if (url.includes('/user/memory')) {
        const s = shardFromUrl(url);
        const info = shardTelemetry[s] || shardTelemetry.shard2;
        if (url.includes('path=stats')) return { ok: 1, data: info.stats };
        if (url.includes('cpu_total')) return history(info.cpu);
        if (url.includes('cpu_limit')) return history(info.limit);
        if (url.includes('bucket_delta')) return history(8);
        if (url.includes('bucket')) return history(info.bucket);
        if (url.includes('creeps')) return history(info.creeps);
      }
      if (url.includes('/game/room-overview')) {
        const room = Object.keys(roomTotals).find((name) => url.includes(encodeURIComponent(name)) || url.includes(name));
        return { ok: 1, owner: 'zkl2333', totals: roomTotals[room] || {} };
      }
      return { ok: 1 };
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
