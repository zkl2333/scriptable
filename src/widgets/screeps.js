import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';
import {
  ACCESSORY_FAMILIES,
  ALL_PREVIEW_FAMILIES,
  addCircularProgress,
  addLinearProgress,
  addRefreshAction,
  applyTransparentBackground,
  isLargeFamily,
} from '../lib/widget-v18.js';

// Screeps 跨 Shard 帝国战略面板：聚焦核弹、安全模式、余额、能量与 CPU，并内置请求合并、TTL 缓存与 429 限流退避。
const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
if (!config.runsInWidget) await updater.autoUpdate();

const ID = 'screeps';
const KC_TOKEN = `${ID}.token`;
const KC_SHARD = `${ID}.shard`;
const KC_ROOMS = `${ID}.rooms`;
const BASE_URL = 'https://screeps.com/api';

const SNAPSHOT_TTL_MS = 3 * 60 * 1000; // 多组件共享 3 分钟快照，避免小/中/锁屏同时刷新重复打 API
const ALERT_TTL_MS = 60 * 1000; // 来袭或安全模式激活时缩短至 1 分钟
const DIRECTORY_TTL_MS = 30 * 60 * 1000; // 房间列表 30 分钟缓存
const ROOM_TTL_MS = 4 * 60 * 1000; // 房间对象 4 分钟缓存
const ROOM_BATCH_SIZE = 3; // 分批并发上限，避免瞬时高并发触发限流
const ROOM_BATCH_DELAY_MS = 80;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 3 * 60 * 1000;

const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bgTop: dyn('#F7F8FC', '#101020'),
  bgBottom: dyn('#ECEFF7', '#16182C'),
  pill: dyn('#E7E9F4', '#201040'),
  pillText: dyn('#593B93', '#C4A8F5'),
  line: dyn('#DCE1EE', '#282B48'),
  text: dyn('#141724', '#F1F3FA'),
  sub: dyn('#4A5268', '#AEB6CC'),
  muted: dyn('#7E879D', '#767F98'),
  purple: dyn('#65469E', '#8060b0'),
  cyan: dyn('#0E8A85', '#4ecdc4'),
  yellow: dyn('#B87300', '#ffe66d'),
  red: dyn('#C9364B', '#FF6E7F'),
  green: dyn('#158054', '#58D69B'),
  alertBg: dyn('#FDECEF', '#3B1622'),
  safeBg: dyn('#E6F7EE', '#133528'),
  accessory: dyn('#111111', '#FFFFFF'),
  accessoryTrack: Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.24)),
};

const getConfig = () => ({
  token: Keychain.get(KC_TOKEN),
  shard: (Keychain.get(KC_SHARD) || '').trim(),
  rooms: (Keychain.get(KC_ROOMS) || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
});

const cacheSignature = (cfg) =>
  `${String(cfg.token || '').slice(-8)}|${cfg.shard}|${cfg.rooms.join(',')}`;

const getCacheFile = () => {
  if (typeof FileManager === 'undefined') return null;
  try {
    const fm = FileManager.local();
    const dir = fm.joinPath(fm.libraryDirectory(), 'screeps-cache');
    if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
    return { fm, path: fm.joinPath(dir, 'state-v2.json') };
  } catch {
    return null;
  }
};

const readCache = (sig) => {
  const handle = getCacheFile();
  if (!handle) return {};
  try {
    if (!handle.fm.fileExists(handle.path)) return {};
    const parsed = JSON.parse(handle.fm.readString(handle.path));
    if (!parsed || parsed.sig !== sig) return {};
    return parsed;
  } catch {
    return {};
  }
};

const writeCache = (sig, patch) => {
  const handle = getCacheFile();
  if (!handle) return;
  try {
    const prev = readCache(sig);
    const next = { ...prev, ...patch, sig };
    handle.fm.writeString(handle.path, JSON.stringify(next));
  } catch {
    // 忽略缓存写入异常，不影响主渲染
  }
};

const sleep = (ms) => new Promise((resolve) => {
  if (typeof Timer !== 'undefined' && typeof Timer.schedule === 'function') {
    Timer.schedule(ms, false, resolve);
  } else {
    setTimeout(resolve, ms);
  }
});

const mapInBatches = async (items, size, delayMs, worker) => {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    const chunk = items.slice(i, i + size);
    const part = await Promise.all(chunk.map(worker));
    results.push(...part);
  }
  return results;
};

const headerValue = (headers, name) => {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
};

const computeRetryAfterMs = (response, body) => {
  const headers = response?.headers;
  const retryAfter = Number(headerValue(headers, 'retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(15 * 60 * 1000, Math.max(60 * 1000, retryAfter * 1000));
  }
  const resetSec = Number(headerValue(headers, 'x-ratelimit-reset'));
  if (Number.isFinite(resetSec) && resetSec > 0) {
    const diff = resetSec * 1000 - Date.now();
    if (diff > 5000) return Math.min(15 * 60 * 1000, Math.max(60 * 1000, diff + 3000));
  }
  const bodyWait = Number(body?.retryAfter);
  if (Number.isFinite(bodyWait) && bodyWait > 0) {
    return Math.min(15 * 60 * 1000, Math.max(60 * 1000, bodyWait));
  }
  return DEFAULT_COOLDOWN_MS;
};

const rateState = { remaining: null, resetAt: 0 };

const api = async (path, params = {}) => {
  const url = `${BASE_URL}/${path}`;
  const request = new Request(url);
  request.headers = { 'X-Token': params.token, 'X-Username': params.token };
  request.timeoutInterval = 8;
  const body = await request.loadJSON();
  const status = Number(request.response?.statusCode || body?.statusCode || 200);
  const headers = request.response?.headers;
  const remRaw = headerValue(headers, 'x-ratelimit-remaining');
  if (remRaw !== undefined && Number.isFinite(Number(remRaw))) {
    rateState.remaining = Number(remRaw);
  }
  const resetRaw = headerValue(headers, 'x-ratelimit-reset');
  if (resetRaw !== undefined && Number.isFinite(Number(resetRaw))) {
    rateState.resetAt = Number(resetRaw) * 1000;
  }

  const errMsg = String(body?.error || '').toLowerCase();
  if (status === 429 || errMsg.includes('rate')) {
    const err = new Error('Screeps API 触发限流');
    err.isRateLimit = true;
    err.retryAfterMs = computeRetryAfterMs(request.response, body);
    throw err;
  }
  if (status >= 500) {
    throw new Error(`Screeps HTTP ${status}`);
  }
  return body;
};

const memory = async (key, shard, cfg) =>
  api(`user/memory?path=${encodeURIComponent(key)}&shard=${encodeURIComponent(shard)}`, cfg);

const formatMoney = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v)}`;
};

const formatCompact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
};

const shortShard = (name) => {
  const m = String(name || '').match(/^shard(\w+)$/i);
  return m ? `S${m[1].toUpperCase()}` : String(name || '').toUpperCase();
};

const latestAverage = (data, fallback = null) =>
  data?.['10']?.currentValues?.length
    ? data['10'].currentValues.at(-1)
    : data?.['1']?.currentValues?.at(-1) ?? fallback;

const extractSeries = (data) => {
  const fine = data?.['1']?.currentValues;
  const medium = data?.['10']?.currentValues;
  const prev = data?.['10']?.previousValues;
  const combined = [
    ...(Array.isArray(prev) ? prev.slice(-6) : []),
    ...(Array.isArray(medium) ? medium : []),
    ...(Array.isArray(fine) ? fine.slice(-8) : []),
  ].filter((v) => Number.isFinite(Number(v)));
  return combined.slice(-16).map(Number);
};

const sumSeries = (seriesList, fallbackVal) => {
  const valid = seriesList.filter((s) => Array.isArray(s) && s.length >= 2);
  if (!valid.length) return [fallbackVal * 0.92, fallbackVal];
  const len = Math.max(...valid.map((s) => s.length));
  const out = [];
  for (let i = 0; i < len; i += 1) {
    let total = 0;
    for (const s of valid) {
      const idx = Math.max(0, s.length - len + i);
      total += Number(s[idx]) || 0;
    }
    out.push(total);
  }
  return out;
};

const progress = (value, total) => Math.max(0, Math.min(1, (Number(value) || 0) / (Number(total) || 1)));

const addText = (p, text, font, color = C.text, options = {}) => {
  const n = p.addText(String(text));
  n.font = font;
  n.textColor = color;
  if (options.lineLimit) n.lineLimit = options.lineLimit;
  if (options.scale) n.minimumScaleFactor = options.scale;
  if (options.align === 'center') n.centerAlignText();
  if (options.align === 'right') n.rightAlignText();
  return n;
};

const addHDivider = (parent) => {
  const line = parent.addStack();
  line.backgroundColor = C.line;
  line.size = new Size(0, 1);
  return line;
};

const addVDivider = (parent, height = 56) => {
  const line = parent.addStack();
  line.backgroundColor = C.line;
  line.size = new Size(1, height);
  return line;
};

const bar = (p, value, color = C.cyan, width = 100, thickness = 4, trackColor = C.line) =>
  addLinearProgress(p, value * 100, {
    width,
    thickness,
    progressColor: color,
    trackColor,
    fallback: () => {
      const s = p.addStack();
      s.size = new Size(width, thickness);
      s.cornerRadius = thickness / 2;
      s.backgroundColor = trackColor;
      const fill = s.addStack();
      fill.size = new Size(Math.max(2, width * Math.max(0, Math.min(1, value))), thickness);
      fill.cornerRadius = thickness / 2;
      fill.backgroundColor = color;
      return s;
    },
  });

const makeEmblem = (hexOverride = null) => {
  const size = 14;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  const isDark = typeof Device !== 'undefined' && Device.isUsingDarkAppearance ? Device.isUsingDarkAppearance() : true;
  const color = hexOverride || (isDark ? '#4ecdc4' : '#0E8A85');
  const r = 5.4;
  const cx = size / 2;
  const cy = size / 2;
  const hex = new Path();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (i === 0) hex.move(pt);
    else hex.addLine(pt);
  }
  hex.closeSubpath();
  ctx.addPath(hex);
  ctx.setStrokeColor(new Color(color));
  ctx.setLineWidth(1.5);
  ctx.strokePath();
  ctx.setFillColor(new Color(color));
  ctx.fillEllipse(new Rect(cx - 1.8, cy - 1.8, 3.6, 3.6));
  return ctx.getImage();
};

const makeSparkline = (series, limit, width, height) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;

  const isDark = typeof Device !== 'undefined' && Device.isUsingDarkAppearance ? Device.isUsingDarkAppearance() : true;
  const strokeHex = isDark ? '#4ecdc4' : '#0E8A85';
  const limitHex = isDark ? '#8060b0' : '#7E879D';

  const pts = series.length >= 2 ? series : [0, limit * 0.4];
  const maxVal = Math.max(limit * 1.12, ...pts, 1);
  const minVal = Math.max(0, Math.min(...pts) * 0.6);
  const span = Math.max(1, maxVal - minVal);
  const padX = 2;
  const padY = 3;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  if (limit > minVal && limit <= maxVal) {
    const limitY = padY + innerH * (1 - (limit - minVal) / span);
    ctx.setFillColor(new Color(limitHex, 0.42));
    for (let x = padX; x < width - padX; x += 6) {
      ctx.fillRect(new Rect(x, limitY, 3, 1));
    }
  }

  const coords = pts.map((v, idx) => ({
    x: padX + (innerW * idx) / Math.max(1, pts.length - 1),
    y: padY + innerH * (1 - Math.max(0, Math.min(1, (v - minVal) / span))),
  }));

  const area = new Path();
  area.move(new Point(coords[0].x, height - padY));
  coords.forEach((pt) => area.addLine(new Point(pt.x, pt.y)));
  area.addLine(new Point(coords[coords.length - 1].x, height - padY));
  area.closeSubpath();
  ctx.addPath(area);
  ctx.setFillColor(new Color(strokeHex, isDark ? 0.16 : 0.11));
  ctx.fillPath();

  const line = new Path();
  line.move(new Point(coords[0].x, coords[0].y));
  for (let i = 1; i < coords.length; i += 1) {
    line.addLine(new Point(coords[i].x, coords[i].y));
  }
  ctx.addPath(line);
  ctx.setStrokeColor(new Color(strokeHex));
  ctx.setLineWidth(1.6);
  ctx.strokePath();

  const last = coords[coords.length - 1];
  ctx.setFillColor(new Color(strokeHex));
  ctx.fillEllipse(new Rect(last.x - 2.2, last.y - 2.2, 4.4, 4.4));
  return ctx.getImage();
};

const configure = async () => {
  const alert = new Alert();
  alert.title = '配置 Screeps 帝国面板';
  alert.message = '填入 Auth Token 即自动识别全部分片、核弹、安全模式、能量与余额。';
  alert.addTextField('Auth Token', Keychain.get(KC_TOKEN) || '');
  alert.addTextField('Shards（留空自动发现，如 shard2,shard3,shardX）', Keychain.get(KC_SHARD) || '');
  alert.addTextField('房间（留空自动获取，可用 shard2:E43N29 格式）', Keychain.get(KC_ROOMS) || '');
  alert.addAction('保存');
  alert.addCancelAction('取消');
  if ((await alert.present()) < 0) return false;
  const token = alert.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(KC_TOKEN, token);
  Keychain.set(KC_SHARD, alert.textFieldValue(1).trim());
  Keychain.set(KC_ROOMS, alert.textFieldValue(2).trim());
  return true;
};

const parseManualRooms = (entries, fallbackShard) => {
  const byShard = {};
  for (const raw of entries) {
    if (raw.includes(':')) {
      const [s, r] = raw.split(':').map((x) => x.trim());
      if (s && r) (byShard[s] || (byShard[s] = [])).push(r);
    } else if (raw) {
      (byShard[fallbackShard] || (byShard[fallbackShard] = [])).push(raw);
    }
  }
  return byShard;
};

const parseNuker = (nuker, gameTime) => {
  if (!nuker) return null;
  const energy = Number(nuker.store?.energy ?? nuker.energy ?? 0);
  const ghodium = Number(nuker.store?.G ?? nuker.G ?? 0);
  const cdTicks = nuker.cooldownTime && gameTime ? Math.max(0, nuker.cooldownTime - gameTime) : 0;
  const ready = energy >= 300000 && ghodium >= 5000 && cdTicks === 0;
  const fillPct = Math.round(Math.min(1, Math.min(energy / 300000, ghodium / 5000)) * 100);
  return { energy, ghodium, cdTicks, ready, fillPct };
};

const parseRoomObjects = (room, shard, objectsRes, gameTime, gStats, shardIncomingNukes) => {
  const objects = Array.isArray(objectsRes?.objects) ? objectsRes.objects : [];
  const ctrl = objects.find((o) => o.type === 'controller') || null;
  const storage = objects.find((o) => o.type === 'storage') || null;
  const terminal = objects.find((o) => o.type === 'terminal') || null;
  const nukerObj = objects.find((o) => o.type === 'nuker') || null;
  const spawnsAndExt = objects.filter((o) => o.type === 'spawn' || o.type === 'extension');

  const prefix = `room.${room}.`;
  const storageEnergy = Number(storage?.store?.energy ?? storage?.energy ?? gStats?.[`${prefix}storageEnergy`] ?? 0);
  const terminalEnergy = Number(terminal?.store?.energy ?? terminal?.energy ?? gStats?.[`${prefix}terminalEnergy`] ?? 0);
  const energyAvail = spawnsAndExt.length
    ? spawnsAndExt.reduce((sum, o) => sum + Number(o.store?.energy ?? o.energy ?? 0), 0)
    : Number(gStats?.[`${prefix}energyAvailable`] ?? 0);
  const energyCap = spawnsAndExt.length
    ? spawnsAndExt.reduce((sum, o) => sum + Number(o.storeCapacityResource?.energy ?? o.energyCapacity ?? 0), 0)
    : Number(gStats?.[`${prefix}energyCapacityAvailable`] ?? 0);

  const safeModeRemaining = ctrl?.safeMode && gameTime ? Math.max(0, ctrl.safeMode - gameTime) : ctrl?.safeMode ? 1 : 0;
  const safeModeAvailable = Number(ctrl?.safeModeAvailable ?? 0);
  const safeModeCooldown = ctrl?.safeModeCooldown && gameTime ? Math.max(0, ctrl.safeModeCooldown - gameTime) : 0;
  const nuker = parseNuker(nukerObj, gameTime);
  const incomingNukes = shardIncomingNukes.filter((n) => n.room === room);

  return {
    shard,
    room,
    rcl: Number(ctrl?.level ?? gStats?.[`${prefix}controllerLevel`] ?? 0),
    storageEnergy,
    terminalEnergy,
    totalEnergy: storageEnergy + terminalEnergy,
    energyAvailable: energyAvail,
    energyCapacity: energyCap,
    safeModeRemaining,
    safeModeAvailable,
    safeModeCooldown,
    nuker,
    incomingNukes,
  };
};

const fetchShardHistory = async (shardName, cfg) => {
  const full = await memory('history', shardName, cfg).catch(() => null);
  const root = full?.data && typeof full.data === 'object' ? full.data : full;
  if (root && typeof root === 'object' && ('cpu_total' in root || 'bucket' in root || 'creeps' in root)) {
    return root;
  }
  return null;
};

const fetchLiveData = async (cfg, cache, sig) => {
  const now = Date.now();
  const me = await api('auth/me', cfg);

  // 房间目录 30 分钟本地缓存，减少 user/rooms 频繁调用
  const cachedDir = cache.directory;
  const hasFreshDir = cachedDir && now - Number(cachedDir.at || 0) < DIRECTORY_TTL_MS;
  const [userRoomsRes, nukesRes] = await Promise.all([
    hasFreshDir
      ? Promise.resolve({ ok: 1, shards: cachedDir.shards })
      : me?._id
        ? api(`user/rooms?id=${encodeURIComponent(me._id)}`, cfg).catch(() => null)
        : Promise.resolve(null),
    api('experimental/nukes', cfg).catch((err) => {
      if (err?.isRateLimit) throw err;
      return null;
    }),
  ]);

  const cpuMap = me?.cpuShard || {};
  const apiRoomsByShard = userRoomsRes?.shards || cachedDir?.shards || {};
  if (!hasFreshDir && userRoomsRes?.shards) {
    writeCache(sig, { directory: { at: now, shards: userRoomsRes.shards } });
  }

  const manualShards = cfg.shard && cfg.shard.toLowerCase() !== 'auto'
    ? cfg.shard.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const discovered = new Set(manualShards);
  if (!discovered.size) {
    Object.entries(cpuMap).forEach(([s, v]) => {
      if (Number(v) > 0) discovered.add(s);
    });
    Object.entries(apiRoomsByShard).forEach(([s, list]) => {
      if (Array.isArray(list) && list.length > 0) discovered.add(s);
    });
  }
  if (!discovered.size) discovered.add('shard2');

  const activeShards = [...discovered].sort((a, b) => (Number(cpuMap[b]) || 0) - (Number(cpuMap[a]) || 0));
  const manualRoomsMap = parseManualRooms(cfg.rooms, activeShards[0]);

  // 每个分片打包拉取 history + stats（从 6 次请求降至 2 次），仅缺失 gStats.time 时再补 game/time
  const shardDetails = await mapInBatches(activeShards, ROOM_BATCH_SIZE, ROOM_BATCH_DELAY_MS, async (shardName) => {
    const [hist, statsRes] = await Promise.all([
      fetchShardHistory(shardName, cfg),
      memory('stats', shardName, cfg).catch((err) => {
        if (err?.isRateLimit) throw err;
        return null;
      }),
    ]);

    const rawStats = statsRes?.data && typeof statsRes.data === 'object' ? statsRes.data : statsRes;
    const gStats = rawStats && typeof rawStats === 'object' && ('cpu.used' in rawStats || 'gcl.level' in rawStats)
      ? rawStats
      : null;

    let gameTime = Number(gStats?.time) || 0;
    if (!gameTime && (rateState.remaining === null || rateState.remaining > 6)) {
      const timeRes = await api(`game/time?shard=${encodeURIComponent(shardName)}`, cfg).catch(() => null);
      gameTime = Number(timeRes?.time) || 0;
    }

    const cpuVal = gStats?.['cpu.used'] ?? latestAverage(hist?.cpu_total, 0);
    const limitVal = gStats?.['cpu.limit'] ?? latestAverage(hist?.cpu_limit, null) ?? cpuMap[shardName] ?? me?.cpu ?? 20;
    const bucketVal = gStats?.['cpu.bucket'] ?? latestAverage(hist?.bucket, 0);
    const creepsVal = gStats?.creeps ?? latestAverage(hist?.creeps, 0);
    const roomNames = manualRoomsMap[shardName] || apiRoomsByShard[shardName] || [];

    return {
      shard: shardName,
      gameTime,
      cpu: Number(cpuVal) || 0,
      cpuLimit: Number(limitVal) || 0,
      ratio: limitVal > 0 ? (Number(cpuVal) || 0) / limitVal : 0,
      bucket: Number(bucketVal) || 0,
      creeps: Number(creepsVal) || 0,
      cpuSeries: extractSeries(hist?.cpu_total),
      roomNames,
      gStats,
      hasGrafanaStats: Boolean(gStats),
    };
  });

  // 房间对象支持 4 分钟缓存 + 分批拉取；若剩余配额紧张则自动复用缓存房间
  const rawNukesByShard = nukesRes?.nukes && !Array.isArray(nukesRes.nukes) ? nukesRes.nukes : {};
  const roomTargets = [];
  const maxShardRooms = Math.max(0, ...shardDetails.map((s) => s.roomNames.length));
  for (let idx = 0; idx < maxShardRooms; idx += 1) {
    for (const sd of shardDetails) {
      if (sd.roomNames[idx]) roomTargets.push({ sd, room: sd.roomNames[idx] });
    }
  }

  const cachedRoomsMap = cache.rooms?.items || {};
  const roomsFresh = cache.rooms && now - Number(cache.rooms.at || 0) < ROOM_TTL_MS;
  const quotaTight = rateState.remaining !== null && rateState.remaining <= 6;

  const rooms = await mapInBatches(roomTargets.slice(0, 12), ROOM_BATCH_SIZE, ROOM_BATCH_DELAY_MS, async ({ sd, room }) => {
    const key = `${sd.shard}:${room}`;
    const cachedObj = cachedRoomsMap[key];
    let objectsRes = null;
    if (cachedObj && (roomsFresh || quotaTight)) {
      objectsRes = cachedObj;
    } else {
      objectsRes = await api(
        `game/room-objects?room=${encodeURIComponent(room)}&shard=${encodeURIComponent(sd.shard)}`,
        cfg
      ).catch((err) => {
        if (err?.isRateLimit) throw err;
        return cachedObj || null;
      });
      if (objectsRes?.objects) cachedRoomsMap[key] = objectsRes;
    }
    const shardNukes = Array.isArray(rawNukesByShard[sd.shard]) ? rawNukesByShard[sd.shard] : [];
    return parseRoomObjects(room, sd.shard, objectsRes, sd.gameTime, sd.gStats, shardNukes);
  });

  if (!roomsFresh && Object.keys(cachedRoomsMap).length) {
    writeCache(sig, { rooms: { at: now, items: cachedRoomsMap } });
  }

  rooms.sort((a, b) => {
    const urgA = (a.incomingNukes.length ? 1000 : 0) + (a.safeModeRemaining ? 500 : 0) + (a.nuker?.ready ? 100 : 0);
    const urgB = (b.incomingNukes.length ? 1000 : 0) + (b.safeModeRemaining ? 500 : 0) + (b.nuker?.ready ? 100 : 0);
    if (urgA !== urgB) return urgB - urgA;
    return b.totalEnergy - a.totalEnergy;
  });

  const nukers = rooms.filter((r) => r.nuker);
  const nukesReady = nukers.filter((r) => r.nuker.ready).length;
  const incomingNukes = rooms.flatMap((r) => r.incomingNukes);
  const activeSafeModes = rooms.filter((r) => r.safeModeRemaining > 0);
  const totalSafeModeCharges = rooms.reduce((sum, r) => sum + r.safeModeAvailable, 0);
  const totalEnergy = rooms.reduce((sum, r) => sum + r.totalEnergy, 0);
  const totalStorageEnergy = rooms.reduce((sum, r) => sum + r.storageEnergy, 0);
  const totalTerminalEnergy = rooms.reduce((sum, r) => sum + r.terminalEnergy, 0);

  const primaryStats = shardDetails.find((s) => s.gStats)?.gStats || null;
  const totalCpu = shardDetails.reduce((sum, s) => sum + s.cpu, 0);
  const sumShardLimits = shardDetails.reduce((sum, s) => sum + s.cpuLimit, 0);
  const totalLimit = Number(me?.cpu) || sumShardLimits || 100;
  const totalCreeps = shardDetails.reduce((sum, s) => sum + s.creeps, 0);
  const minBucket = shardDetails.length ? Math.min(...shardDetails.map((s) => s.bucket)) : 0;
  const gclLevel = primaryStats?.['gcl.level'] ?? me?.gcl?.level ?? 0;
  const gclRatio = primaryStats && Number.isFinite(primaryStats['gcl.progressPercent'])
    ? Math.max(0, Math.min(1, primaryStats['gcl.progressPercent'] / 100))
    : progress(me?.gcl?.progress, me?.gcl?.progressTotal);

  const data = {
    fetchedAt: now,
    shards: shardDetails,
    rooms,
    totalRooms: roomTargets.length || rooms.length,
    cpu: totalCpu,
    cpuLimit: totalLimit,
    ratio: totalLimit > 0 ? totalCpu / totalLimit : 0,
    cpuSeries: sumSeries(shardDetails.map((s) => s.cpuSeries), totalCpu),
    bucket: minBucket,
    creeps: totalCreeps,
    credits: primaryStats?.credits ?? me?.money ?? 0,
    gclLevel,
    gclRatio,
    nukerCount: nukers.length,
    nukesReady,
    incomingNukeCount: incomingNukes.length,
    activeSafeModes,
    totalSafeModeCharges,
    totalEnergy,
    totalStorageEnergy,
    totalTerminalEnergy,
    cacheNote: quotaTight ? '节流缓存' : '',
    cooldownUntil: 0,
  };
  writeCache(sig, { snapshot: data, cooldownUntil: 0 });
  return data;
};

const loadData = async (cfg) => {
  const now = Date.now();
  const sig = cacheSignature(cfg);
  const cache = readCache(sig);
  const snap = cache.snapshot || null;
  const forceRefresh = typeof args !== 'undefined' && args?.widgetAction?.id === 'refresh';
  const cooldownUntil = Number(cache.cooldownUntil || 0);

  // 触发 429 冷却期间：绝对不发出网络请求，直接用本地快照平滑降级展示
  if (cooldownUntil > now) {
    if (snap) {
      return { ...snap, cooldownUntil, cacheNote: '限流退避' };
    }
    throw new Error('API 限流退避中，请稍后刷新');
  }

  // 多组件同时刷新（小/中/锁屏）：有效期内直接复用共享快照
  if (!forceRefresh && snap) {
    const ttl = snap.incomingNukeCount > 0 || snap.activeSafeModes?.length > 0 ? ALERT_TTL_MS : SNAPSHOT_TTL_MS;
    if (now - Number(snap.fetchedAt || 0) < ttl) {
      return snap;
    }
  }

  try {
    return await fetchLiveData(cfg, cache, sig);
  } catch (error) {
    if (error?.isRateLimit) {
      const nextCooldown = now + (error.retryAfterMs || DEFAULT_COOLDOWN_MS);
      writeCache(sig, { cooldownUntil: nextCooldown });
      if (snap) {
        return { ...snap, cooldownUntil: nextCooldown, cacheNote: '限流退避' };
      }
    } else if (snap) {
      return { ...snap, cacheNote: '离线缓存' };
    }
    throw error;
  }
};

const statusColor = (ratio, bucket = 10000) =>
  ratio > 0.9 || bucket < 1000 ? C.red : ratio > 0.75 || bucket < 5000 ? C.yellow : C.cyan;

const safeModeText = (room) => {
  if (room.safeModeRemaining > 0) return `激活 ${formatCompact(room.safeModeRemaining)}t`;
  if (room.safeModeCooldown > 0) return `冷却 ${formatCompact(room.safeModeCooldown)}t`;
  return `可用 ×${room.safeModeAvailable}`;
};

const nukerText = (room) => {
  if (room.incomingNukes.length > 0) return `来袭 ×${room.incomingNukes.length}`;
  if (!room.nuker) return '—';
  if (room.nuker.ready) return '就绪';
  if (room.nuker.cdTicks > 0) return `CD ${formatCompact(room.nuker.cdTicks)}`;
  return `${room.nuker.fillPct}%`;
};

const addHeader = (widget, data, compact = false) => {
  const header = widget.addStack();
  header.centerAlignContent();

  const icon = header.addImage(makeEmblem(data.incomingNukeCount > 0 ? '#FF6E7F' : null));
  icon.imageSize = new Size(compact ? 12 : 14, compact ? 12 : 14);
  header.addSpacer(5);
  addText(header, 'Screeps', Font.semiboldSystemFont(compact ? 12 : 13), C.text, { lineLimit: 1 });

  if (!compact) {
    header.addSpacer(6);
    const subtitle = data.cacheNote
      ? `${data.shards.length} Shards · ${data.cacheNote}`
      : `${data.shards.length} Shards · ${data.totalRooms} 房`;
    addText(
      header,
      subtitle,
      Font.systemFont(10),
      data.cacheNote === '限流退避' ? C.yellow : C.muted,
      { lineLimit: 1 }
    );
  }

  header.addSpacer();

  if (!compact && data.incomingNukeCount > 0) {
    const alertPill = header.addStack();
    alertPill.backgroundColor = C.alertBg;
    alertPill.cornerRadius = 6;
    alertPill.setPadding(2, 6, 2, 6);
    addText(alertPill, `来袭 ${data.incomingNukeCount}`, Font.boldSystemFont(9), C.red, { lineLimit: 1 });
    header.addSpacer(6);
  } else if (!compact && data.activeSafeModes.length > 0) {
    const safePill = header.addStack();
    safePill.backgroundColor = C.safeBg;
    safePill.cornerRadius = 6;
    safePill.setPadding(2, 6, 2, 6);
    addText(safePill, `安全模式 ${data.activeSafeModes.length}`, Font.boldSystemFont(9), C.green, { lineLimit: 1 });
    header.addSpacer(6);
  }

  addRefreshAction(header, {
    title: '刷新 Screeps 面板',
    id: 'refresh',
    text: compact ? `${data.shards.length}S` : `${Math.round(data.ratio * 100)}%`,
    font: Font.semiboldMonospacedSystemFont(compact ? 9 : 10),
    textColor: statusColor(data.ratio, data.bucket),
    iconColor: C.muted,
    iconSize: 10,
    backgroundColor: C.pill,
    cornerRadius: 7,
    padding: [3, 7, 3, 7],
  });
};

const addInfoCell = (parent, label, value, color = C.text, sub = '') => {
  const cell = parent.addStack();
  cell.layoutVertically();
  addText(cell, label, Font.systemFont(9), C.muted, { lineLimit: 1 });
  cell.addSpacer(2);
  addText(cell, value, Font.semiboldRoundedSystemFont(13), color, { lineLimit: 1, scale: 0.72 });
  if (sub) {
    cell.addSpacer(1);
    addText(cell, sub, Font.regularMonospacedSystemFont(8), C.muted, { lineLimit: 1 });
  }
  return cell;
};

const addShardBarRow = (parent, s, barW = 72) => {
  const row = parent.addStack();
  row.centerAlignContent();
  addText(row, shortShard(s.shard), Font.boldMonospacedSystemFont(10), C.sub, { lineLimit: 1 });
  row.addSpacer(6);
  bar(row, s.ratio, statusColor(s.ratio, s.bucket), barW, 4);
  row.addSpacer();
  addText(
    row,
    `${s.cpu.toFixed(1)}/${Math.round(s.cpuLimit)} · B${formatCompact(s.bucket)}`,
    Font.regularMonospacedSystemFont(9),
    C.text,
    { lineLimit: 1 }
  );
};

const addRoomMatrixRow = (parent, room, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();

  const badge = row.addStack();
  badge.backgroundColor = C.pill;
  badge.cornerRadius = 4;
  badge.setPadding(1, 4, 1, 4);
  addText(badge, shortShard(room.shard), Font.semiboldMonospacedSystemFont(8), C.pillText, { lineLimit: 1 });

  row.addSpacer(5);
  addText(row, room.room, Font.semiboldMonospacedSystemFont(10), C.text, { lineLimit: 1 });
  row.addSpacer(4);
  addText(row, `R${room.rcl || '-'}`, Font.regularMonospacedSystemFont(8), C.muted, { lineLimit: 1 });

  row.addSpacer();

  const smColor = room.safeModeRemaining > 0 ? C.green : room.safeModeCooldown > 0 ? C.yellow : C.sub;
  addText(row, safeModeText(room), Font.mediumSystemFont(9), smColor, { lineLimit: 1 });

  row.addSpacer(compact ? 6 : 8);

  const nkColor = room.incomingNukes.length > 0 ? C.red : room.nuker?.ready ? C.yellow : C.muted;
  addText(row, room.nuker || room.incomingNukes.length ? `核${nukerText(room)}` : '无核', Font.mediumSystemFont(9), nkColor, {
    lineLimit: 1,
  });

  row.addSpacer(compact ? 6 : 8);

  addText(row, `⚡${formatCompact(room.totalEnergy)}`, Font.semiboldMonospacedSystemFont(9), C.cyan, {
    lineLimit: 1,
  });
};

const renderSmall = (widget, data) => {
  addHeader(widget, data, true);
  widget.addSpacer(6);

  const cpuRow = widget.addStack();
  cpuRow.centerAlignContent();
  addText(cpuRow, data.cpu.toFixed(1), Font.boldRoundedSystemFont(20), C.cyan, { lineLimit: 1, scale: 0.7 });
  cpuRow.addSpacer(3);
  addText(cpuRow, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(11), C.muted, { lineLimit: 1 });
  cpuRow.addSpacer();
  addText(
    cpuRow,
    data.cacheNote === '限流退避' ? '限流保护' : `B ${formatCompact(data.bucket)}`,
    Font.regularMonospacedSystemFont(9),
    data.cacheNote === '限流退避' ? C.yellow : C.muted,
    { lineLimit: 1 }
  );

  widget.addSpacer(3);
  bar(widget, data.ratio, statusColor(data.ratio, data.bucket), 130, 4);

  widget.addSpacer(7);
  addHDivider(widget);
  widget.addSpacer(7);

  const row1 = widget.addStack();
  addInfoCell(
    row1,
    '核弹就绪',
    data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount} 枚`,
    data.incomingNukeCount > 0 ? C.red : data.nukesReady > 0 ? C.yellow : C.text
  );
  row1.addSpacer();
  addInfoCell(
    row1,
    '安全模式',
    data.activeSafeModes.length > 0 ? `开启 ${data.activeSafeModes.length} 房` : `×${data.totalSafeModeCharges} 次`,
    data.activeSafeModes.length > 0 ? C.green : C.text
  );

  widget.addSpacer(6);

  const row2 = widget.addStack();
  addInfoCell(row2, '账户余额', formatMoney(data.credits), C.yellow);
  row2.addSpacer();
  addInfoCell(row2, '总能量', formatCompact(data.totalEnergy), C.cyan);
};

const renderMedium = (widget, data) => {
  addHeader(widget, data, false);
  widget.addSpacer(8);

  const main = widget.addStack();
  main.centerAlignContent();

  const left = main.addStack();
  left.layoutVertically();
  left.size = new Size(144, 0);

  const cpuHead = left.addStack();
  cpuHead.centerAlignContent();
  addText(cpuHead, 'CPU 水平', Font.systemFont(10), C.muted, { lineLimit: 1 });
  cpuHead.addSpacer();
  addText(cpuHead, `BKT ${formatCompact(data.bucket)}`, Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });

  left.addSpacer(2);
  const numRow = left.addStack();
  numRow.centerAlignContent();
  addText(numRow, data.cpu.toFixed(1), Font.boldRoundedSystemFont(20), C.cyan, { lineLimit: 1, scale: 0.7 });
  numRow.addSpacer(3);
  addText(numRow, `/ ${data.cpuLimit}`, Font.mediumRoundedSystemFont(11), C.muted, { lineLimit: 1 });

  left.addSpacer(4);
  const spark = left.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, 144, 21));
  spark.imageSize = new Size(144, 21);

  main.addSpacer(12);
  addVDivider(main, 60);
  main.addSpacer(12);

  const right = main.addStack();
  right.layoutVertically();
  right.size = new Size(142, 0);

  const rLine1 = right.addStack();
  rLine1.centerAlignContent();
  addText(rLine1, '核弹储备', Font.systemFont(10), C.muted, { lineLimit: 1 });
  rLine1.addSpacer();
  const nukeLabel = data.incomingNukeCount > 0
    ? `⚠️ 来袭 ${data.incomingNukeCount}`
    : `${data.nukesReady} / ${data.nukerCount} 就绪`;
  addText(
    rLine1,
    nukeLabel,
    Font.semiboldRoundedSystemFont(11),
    data.incomingNukeCount > 0 ? C.red : data.nukesReady > 0 ? C.yellow : C.text,
    { lineLimit: 1 }
  );

  right.addSpacer(6);

  const rLine2 = right.addStack();
  rLine2.centerAlignContent();
  addText(rLine2, '安全模式', Font.systemFont(10), C.muted, { lineLimit: 1 });
  rLine2.addSpacer();
  const smText = data.activeSafeModes.length > 0
    ? `${data.activeSafeModes[0].room} 激活`
    : `可用 ×${data.totalSafeModeCharges}`;
  addText(
    rLine2,
    smText,
    Font.semiboldRoundedSystemFont(11),
    data.activeSafeModes.length > 0 ? C.green : C.text,
    { lineLimit: 1 }
  );

  right.addSpacer(6);

  const rLine3 = right.addStack();
  rLine3.centerAlignContent();
  addText(rLine3, '分片', Font.systemFont(10), C.muted, { lineLimit: 1 });
  rLine3.addSpacer();
  const shardText = data.shards
    .slice(0, 3)
    .map((s) => `${shortShard(s.shard)}:${Math.round(s.ratio * 100)}%`)
    .join(' ');
  addText(rLine3, shardText, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1, scale: 0.72 });

  widget.addSpacer(9);
  addHDivider(widget);
  widget.addSpacer(7);

  const strip = widget.addStack();
  addInfoCell(strip, '账户余额', formatMoney(data.credits), C.yellow);
  strip.addSpacer();
  addInfoCell(strip, '帝国能量', formatCompact(data.totalEnergy), C.cyan);
  strip.addSpacer();
  addInfoCell(strip, '核弹就绪', `${data.nukesReady}/${data.nukerCount}`, data.nukesReady > 0 ? C.yellow : C.text);
  strip.addSpacer();
  addInfoCell(strip, `GCL ${data.gclLevel}`, `${Math.round(data.gclRatio * 100)}%`, C.text);
};

const renderLarge = (widget, data, family = 'large') => {
  const isXL = family === 'extraLarge';
  const isPortrait = family === 'extraLargePortrait';

  addHeader(widget, data, false);
  widget.addSpacer(10);

  const strip = widget.addStack();
  addInfoCell(strip, '账户余额', formatMoney(data.credits), C.yellow);
  strip.addSpacer();
  addInfoCell(strip, '帝国能量', formatCompact(data.totalEnergy), C.cyan, `仓 ${formatCompact(data.totalStorageEnergy)}`);
  strip.addSpacer();
  addInfoCell(
    strip,
    '核弹数量',
    `${data.nukesReady} / ${data.nukerCount}`,
    data.incomingNukeCount > 0 ? C.red : C.yellow,
    data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : '0 来袭'
  );
  strip.addSpacer();
  addInfoCell(
    strip,
    '安全模式',
    data.activeSafeModes.length > 0 ? `开启 ${data.activeSafeModes.length} 房` : `×${data.totalSafeModeCharges} 次`,
    data.activeSafeModes.length > 0 ? C.green : C.text,
    `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`
  );
  strip.addSpacer();
  addInfoCell(
    strip,
    'CPU 水平',
    `${data.cpu.toFixed(1)}/${data.cpuLimit}`,
    statusColor(data.ratio, data.bucket),
    `BKT ${formatCompact(data.bucket)}`
  );

  widget.addSpacer(10);
  addHDivider(widget);
  widget.addSpacer(10);

  const body = widget.addStack();
  if (!isXL) body.layoutVertically();

  const leftW = isXL ? 290 : 310;
  const chartH = isXL ? 94 : isPortrait ? 90 : 54;
  const cpuCol = body.addStack();
  cpuCol.layoutVertically();
  cpuCol.size = new Size(leftW, 0);

  const cpuHead = cpuCol.addStack();
  cpuHead.centerAlignContent();
  addText(cpuHead, 'CPU 水平 · 跨分片实时负载', Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  cpuHead.addSpacer();
  addText(cpuHead, `${Math.round(data.ratio * 100)}% LOAD`, Font.semiboldMonospacedSystemFont(10), C.cyan, {
    lineLimit: 1,
  });
  cpuCol.addSpacer(5);
  const spark = cpuCol.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, leftW, chartH));
  spark.imageSize = new Size(leftW, chartH);
  cpuCol.addSpacer(7);

  data.shards.slice(0, 4).forEach((s, idx) => {
    if (idx > 0) cpuCol.addSpacer(5);
    addShardBarRow(cpuCol, s, isXL ? 86 : 108);
  });

  if (isXL) {
    body.addSpacer(14);
    addVDivider(body, 210);
    body.addSpacer(14);
  } else {
    body.addSpacer(10);
    addHDivider(body);
    body.addSpacer(10);
  }

  const rightW = isXL ? 372 : 310;
  const roomsCol = body.addStack();
  roomsCol.layoutVertically();
  roomsCol.size = new Size(rightW, 0);

  const rHead = roomsCol.addStack();
  rHead.centerAlignContent();
  addText(rHead, '房间态势 · 安全模式 · 核弹 · 能量', Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  rHead.addSpacer();
  addText(rHead, `${data.totalRooms} 房`, Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  roomsCol.addSpacer(6);

  const maxRooms = isPortrait ? 10 : isXL ? 8 : 5;
  if (!data.rooms.length) {
    addText(roomsCol, '运行脚本配置 Token 后自动加载房间状态', Font.systemFont(11), C.muted);
  } else {
    data.rooms.slice(0, maxRooms).forEach((room, idx) => {
      if (idx > 0) roomsCol.addSpacer(isPortrait ? 8 : 5);
      addRoomMatrixRow(roomsCol, room, !isXL);
    });
  }

  if (isPortrait) {
    widget.addSpacer(12);
    addHDivider(widget);
    widget.addSpacer(10);

    const fRow = widget.addStack();
    fRow.centerAlignContent();
    addText(
      fRow,
      `Storage ${formatCompact(data.totalStorageEnergy)} · Terminal ${formatCompact(data.totalTerminalEnergy)}`,
      Font.regularMonospacedSystemFont(9),
      C.sub,
      { lineLimit: 1 }
    );
    fRow.addSpacer();
    addText(fRow, `Creeps ${Math.round(data.creeps)}`, Font.semiboldMonospacedSystemFont(9), C.muted, {
      lineLimit: 1,
    });
  }

  widget.addSpacer();
};

const renderAccessory = (widget, family, data) => {
  widget.setPadding(0, 0, 0, 0);
  const pct = Math.round(data.ratio * 100);
  if (family === 'accessoryInline') {
    const alert = data.incomingNukeCount > 0 ? `来袭${data.incomingNukeCount}` : `核${data.nukesReady}`;
    addText(
      widget,
      `SCREEPS CPU ${pct}% · ${alert} · ⚡${formatCompact(data.totalEnergy)}`,
      Font.semiboldMonospacedSystemFont(11),
      C.accessory,
      { lineLimit: 1, scale: 0.7 }
    );
    return;
  }
  if (family === 'accessoryCircular') {
    addCircularProgress(widget, pct, {
      size: 60,
      thickness: 5,
      progressColor: C.accessory,
      trackColor: C.accessoryTrack,
      buildCenter: (ring) => {
        addText(ring, `${pct}%`, Font.boldRoundedSystemFont(13), C.accessory, { align: 'center', lineLimit: 1 });
        addText(ring, 'CPU', Font.semiboldMonospacedSystemFont(7), C.accessory, { align: 'center', lineLimit: 1 });
      },
      fallback: () => {
        addText(widget, `${pct}%`, Font.boldRoundedSystemFont(14), C.accessory, { align: 'center' });
      },
    });
    return;
  }

  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(5, 8, 5, 8);
  const top = widget.addStack();
  top.centerAlignContent();
  addText(top, `SCREEPS · CPU ${pct}%`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1, scale: 0.75 });
  top.addSpacer();
  addText(top, `核${data.nukesReady}/${data.nukerCount}`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1 });
  widget.addSpacer(3);
  addText(
    widget,
    `余额 ${formatMoney(data.credits)} · 能量 ${formatCompact(data.totalEnergy)}`,
    Font.boldRoundedSystemFont(11),
    C.accessory,
    { lineLimit: 1, scale: 0.75 }
  );
  widget.addSpacer(3);
  bar(widget, data.ratio, C.accessory, 152, 4, C.accessoryTrack);
  widget.addSpacer(3);
  const smStatus = data.activeSafeModes.length > 0 ? `安全模式激活 ${data.activeSafeModes.length}` : `安全模式 ×${data.totalSafeModeCharges}`;
  addText(widget, `${smStatus} · BKT ${formatCompact(data.bucket)}`, Font.mediumMonospacedSystemFont(8), C.accessory, {
    lineLimit: 1,
    scale: 0.75,
  });
};

const createWidget = async (family = config.widgetFamily || 'medium') => {
  const widget = new ListWidget();
  const cfg = getConfig();
  const accessory = ACCESSORY_FAMILIES.includes(family);

  if (accessory) {
    if (!cfg.token) {
      widget.setPadding(4, 6, 4, 6);
      addText(widget, 'SCREEPS · 未配置', Font.semiboldMonospacedSystemFont(10), C.accessory, {
        lineLimit: 1,
        scale: 0.7,
      });
      return widget;
    }
    try {
      const data = await loadData(cfg);
      renderAccessory(widget, family, data);
      widget.refreshAfterDate = new Date(
        Math.max(Date.now() + REFRESH_INTERVAL_MS, (data.cooldownUntil || 0) + 5000)
      );
    } catch {
      widget.setPadding(4, 6, 4, 6);
      addText(widget, 'SCREEPS · 离线', Font.semiboldMonospacedSystemFont(10), C.accessory, { lineLimit: 1 });
    }
    return widget;
  }

  const grad = new LinearGradient();
  grad.colors = [C.bgTop, C.bgBottom];
  grad.locations = [0, 1];
  grad.startPoint = new Point(0, 0);
  grad.endPoint = new Point(1, 1);
  widget.backgroundGradient = grad;
  applyTransparentBackground(widget, __SCRIPT_ID__);
  widget.setPadding(14, 14, 12, 14);

  if (!cfg.token) {
    addText(widget, 'Screeps', Font.boldRoundedSystemFont(18), C.cyan);
    widget.addSpacer(8);
    addText(widget, '点击配置 Auth Token\n查看核弹、安全模式、余额、能量与 CPU', Font.mediumSystemFont(12), C.muted);
    return attachMenuURL(widget);
  }

  let data;
  try {
    data = await loadData(cfg);
  } catch (error) {
    addText(widget, 'Screeps', Font.boldRoundedSystemFont(16), C.cyan);
    widget.addSpacer(8);
    addText(widget, '数据暂时不可用', Font.mediumSystemFont(14), C.red);
    addText(widget, error.message?.slice(0, 40) || '请检查配置', Font.systemFont(10), C.muted);
    widget.refreshAfterDate = new Date(Date.now() + DEFAULT_COOLDOWN_MS);
    return attachMenuURL(widget);
  }

  if (family === 'small') renderSmall(widget, data);
  else if (isLargeFamily(family)) renderLarge(widget, data, family);
  else renderMedium(widget, data);

  const nextMs = Math.max(Date.now() + REFRESH_INTERVAL_MS, (data.cooldownUntil || 0) + 5000);
  widget.refreshAfterDate = new Date(nextMs);
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: 'Screeps 运营面板',
    message: '跨 Shard 核弹、安全模式、账户余额、能量与 CPU 监控。',
    version: __SCRIPT_VERSION__,
    updater,
    scriptId: __SCRIPT_ID__,
    previewFamilies: ALL_PREVIEW_FAMILIES,
    actions: [{ id: 'configure', title: '配置 Token 与分片' }],
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  } else if (menu?.action === 'configure') {
    await configure();
  }
} else {
  Script.setWidget(await createWidget());
}

Script.complete();
