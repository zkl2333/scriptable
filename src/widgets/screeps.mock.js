// Screeps 跨 Shard 帝国战略面板预览 mock：含 3 个活跃分片、核弹发射井、安全模式、Storage/Terminal 能量与历史采样。
(function registerPreviewMock(global) {
  'use strict';
  const registry = global.ScriptablePreviewMocks || (global.ScriptablePreviewMocks = {});

  const shardRooms = {
    shard2: ['E43N29', 'E43N28', 'E44N32', 'E44N28', 'E47N31', 'E47N27'],
    shardX: ['E48N32', 'E45N33'],
    shard3: ['E43N31', 'E41N31'],
  };

  const shardTimes = { shard2: 78389000, shardX: 8597500, shard3: 84498000 };

  const roomObjects = {
    E43N29: [
      { type: 'controller', level: 8, safeMode: null, safeModeAvailable: 7, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 198400 } },
      { type: 'terminal', store: { energy: 24500 } },
      { type: 'nuker', store: { energy: 300000, G: 5000 }, cooldownTime: 78100000 },
    ],
    E43N28: [
      { type: 'controller', level: 8, safeMode: null, safeModeAvailable: 6, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 164200 } },
      { type: 'terminal', store: { energy: 19200 } },
      { type: 'nuker', store: { energy: 300000, G: 5000 }, cooldownTime: 78200000 },
    ],
    E48N32: [
      { type: 'controller', level: 7, safeMode: 8612400, safeModeAvailable: 4, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 142000 } },
      { type: 'terminal', store: { energy: 21000 } },
      { type: 'nuker', store: { energy: 195000, G: 5000 }, cooldownTime: 0 },
    ],
    E44N32: [
      { type: 'controller', level: 7, safeMode: null, safeModeAvailable: 3, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 118500 } },
      { type: 'terminal', store: { energy: 14800 } },
    ],
    E44N28: [
      { type: 'controller', level: 7, safeMode: null, safeModeAvailable: 2, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 96400 } },
      { type: 'terminal', store: { energy: 16200 } },
    ],
    E45N33: [
      { type: 'controller', level: 6, safeMode: null, safeModeAvailable: 3, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 84200 } },
      { type: 'terminal', store: { energy: 12000 } },
    ],
    E47N31: [
      { type: 'controller', level: 6, safeMode: null, safeModeAvailable: 2, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 72100 } },
      { type: 'terminal', store: { energy: 9800 } },
    ],
    E47N27: [
      { type: 'controller', level: 6, safeMode: null, safeModeAvailable: 1, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 64300 } },
      { type: 'terminal', store: { energy: 8500 } },
    ],
    E43N31: [
      { type: 'controller', level: 5, safeMode: null, safeModeAvailable: 2, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 51200 } },
    ],
    E41N31: [
      { type: 'controller', level: 5, safeMode: null, safeModeAvailable: 1, safeModeCooldown: 0 },
      { type: 'storage', store: { energy: 46800 } },
    ],
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
      },
    },
    shardX: {
      cpu: [26.5, 29.3, 24.8, 30.1, 28.5, 21.0, 28.6, 23.4, 29.8, 25.1, 30.7, 31.3],
      limit: 40,
      bucket: 9840,
      creeps: 34,
      stats: { 'cpu.used': 31.3, 'cpu.limit': 40, 'cpu.bucket': 9840, creeps: 34 },
    },
    shard3: {
      cpu: [16.8, 17.5, 19.2, 16.4, 18.1, 17.9, 15.8, 16.9, 18.5, 17.6, 18.2, 18.9],
      limit: 20,
      bucket: 9912,
      creeps: 18,
      stats: { 'cpu.used': 18.9, 'cpu.limit': 20, 'cpu.bucket': 9912, creeps: 18 },
    },
  };

  const history = (current) => ({
    '1': { currentValues: Array.isArray(current) ? current : [current], previousValues: [] },
    '10': { currentValues: [Array.isArray(current) ? current.at(-1) : current], previousValues: [] },
  });

  const paramFromUrl = (url, key) => {
    const match = url.match(new RegExp(`[?&]${key}=([^&]+)`));
    return match ? decodeURIComponent(match[1]) : '';
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
      if (url.includes('/user/rooms')) return { ok: 1, shards: shardRooms };
      if (url.includes('/experimental/nukes')) return { ok: 1, nukes: { shard2: [], shardX: [], shard3: [] } };
      if (url.includes('/game/time')) {
        const s = paramFromUrl(url, 'shard') || 'shard2';
        return { ok: 1, time: shardTimes[s] || 78389000 };
      }
      if (url.includes('/game/room-objects')) {
        const room = paramFromUrl(url, 'room');
        return { ok: 1, objects: roomObjects[room] || [] };
      }
      if (url.includes('/user/memory')) {
        const s = paramFromUrl(url, 'shard') || 'shard2';
        const info = shardTelemetry[s] || shardTelemetry.shard2;
        if (url.includes('path=stats')) return { ok: 1, data: info.stats };
        if (url.includes('path=history')) {
          return {
            ok: 1,
            data: {
              cpu_total: history(info.cpu),
              cpu_limit: history(info.limit),
              bucket: history(info.bucket),
              creeps: history(info.creeps),
            },
          };
        }
        if (url.includes('cpu_total')) return history(info.cpu);
        if (url.includes('cpu_limit')) return history(info.limit);
        if (url.includes('bucket')) return history(info.bucket);
        if (url.includes('creeps')) return history(info.creeps);
      }
      return { ok: 1 };
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
