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

// Screeps 跨 Shard 帝国战略面板：Bento 仪表盘视觉 + 核弹/安全模式/余额/能量/CPU 五大核心 + 限流缓存保护。
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

const SNAPSHOT_TTL_MS = 3 * 60 * 1000;
const ALERT_TTL_MS = 60 * 1000;
const DIRECTORY_TTL_MS = 30 * 60 * 1000;
const ROOM_TTL_MS = 4 * 60 * 1000;
const ROOM_BATCH_SIZE = 3;
const ROOM_BATCH_DELAY_MS = 80;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 3 * 60 * 1000;

const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bgTop: dyn('#F2F4F9', '#0B0D18'),
  bgBottom: dyn('#E6EBF4', '#101020'),
  tile: dyn('#FFFFFF', '#16192B'),
  tileDeep: dyn('#EEF1F8', '#201040'),
  tileBorder: Color.dynamic(new Color('#0F172A', 0.06), new Color('#FFFFFF', 0.07)),
  divider: Color.dynamic(new Color('#0F172A', 0.08), new Color('#FFFFFF', 0.08)),
  track: Color.dynamic(new Color('#CBD5E1', 0.55), new Color('#FFFFFF', 0.1)),
  text: dyn('#0F172A', '#F4F6FB'),
  sub: dyn('#475569', '#A8B3C9'),
  muted: dyn('#64748B', '#6F7B94'),
  purple: dyn('#6D4DB5', '#8060b0'),
  pillBg: Color.dynamic(new Color('#6D4DB5', 0.12), new Color('#8060b0', 0.24)),
  pillText: dyn('#5A38A3', '#C8B0F8'),
  cyan: dyn('#0D9488', '#4ecdc4'),
  cyanBg: Color.dynamic(new Color('#0D9488', 0.12), new Color('#4ecdc4', 0.16)),
  yellow: dyn('#B4690E', '#ffe66d'),
  yellowBg: Color.dynamic(new Color('#D97706', 0.13), new Color('#ffe66d', 0.16)),
  green: dyn('#0F8A5F', '#34D399'),
  greenBg: Color.dynamic(new Color('#0F8A5F', 0.13), new Color('#34D399', 0.16)),
  red: dyn('#DC2626', '#FB7185'),
  redBg: Color.dynamic(new Color('#DC2626', 0.13), new Color('#FB7185', 0.18)),
  accessory: dyn('#111111', '#FFFFFF'),
  accessoryTrack: Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.24)),
};

const isDarkMode = () => {
  if (typeof config !== 'undefined' && config.runsInWidget) return null;
  try {
    if (typeof Device !== 'undefined' && typeof Device.isUsingDarkAppearance === 'function') {
      return Boolean(Device.isUsingDarkAppearance());
    }
  } catch {
    // 桌面小组件环境不支持 Device.isUsingDarkAppearance()，改用双色自适应配色
  }
  return null;
};

const readKeychain = (key) => {
  try {
    return Keychain.contains(key) ? String(Keychain.get(key) ?? '') : '';
  } catch {
    return '';
  }
};

const writeKeychain = (key, value) => {
  if (value) Keychain.set(key, value);
  else if (Keychain.contains(key)) Keychain.remove(key);
};

const getConfig = () => ({
  token: readKeychain(KC_TOKEN).trim(),
  shard: readKeychain(KC_SHARD).trim(),
  rooms: readKeychain(KC_ROOMS)
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
    // 忽略本地缓存写入异常
  }
};

const sleep = (ms) => new Promise((resolve) => {
  if (typeof Timer !== 'undefined' && typeof Timer.schedule === 'function') {
    Timer.schedule(ms, false, resolve);
  } else if (typeof setTimeout === 'function') {
    setTimeout(resolve, ms);
  } else {
    resolve();
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
  line.backgroundColor = C.divider;
  line.size = new Size(0, 1);
  return line;
};

const bento = (parent, width, height = 0, padding = [10, 11, 10, 11], radius = 12) => {
  const s = parent.addStack();
  s.layoutVertically();
  s.backgroundColor = C.tile;
  s.cornerRadius = radius;
  s.borderWidth = 1;
  s.borderColor = C.tileBorder;
  s.setPadding(padding[0], padding[1], padding[2], padding[3]);
  if (width || height) s.size = new Size(width || 0, height || 0);
  return s;
};

const pill = (parent, text, fg, bg, fontSize = 8, pad = [2, 5, 2, 5]) => {
  const p = parent.addStack();
  p.centerAlignContent();
  p.backgroundColor = bg;
  p.cornerRadius = 5;
  p.setPadding(pad[0], pad[1], pad[2], pad[3]);
  addText(p, text, Font.semiboldMonospacedSystemFont(fontSize), fg, { lineLimit: 1 });
  return p;
};

const statusColor = (ratio, bucket = 10000) =>
  ratio > 0.9 || bucket < 1000 ? C.red : ratio > 0.75 || bucket < 5000 ? C.yellow : C.cyan;

const statusHex = (ratio, bucket = 10000) => {
  const dark = isDarkMode();
  if (ratio > 0.9 || bucket < 1000) return dark === false ? '#DC2626' : '#F45B69';
  if (ratio > 0.75 || bucket < 5000) return dark === false ? '#D97706' : dark === true ? '#ffe66d' : '#E5A11A';
  return dark === false ? '#0D9488' : dark === true ? '#4ecdc4' : '#18B3A8';
};

// 定制单色矢量图标（配合 WidgetImage.tintColor = Color.dynamic 在亮暗桌面自动变色，不依赖 Device.isUsingDarkAppearance）
const drawIcon = (kind, size = 11) => {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const col = new Color('#FFFFFF');
  const c = size / 2;

  if (kind === 'hex') {
    const r = size * 0.42;
    const hexPath = new Path();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a));
      if (i === 0) hexPath.move(pt);
      else hexPath.addLine(pt);
    }
    hexPath.closeSubpath();
    ctx.addPath(hexPath);
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.4);
    ctx.strokePath();
    ctx.setFillColor(col);
    ctx.fillEllipse(new Rect(c - 1.7, c - 1.7, 3.4, 3.4));
  } else if (kind === 'nuke') {
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.2);
    ctx.strokeEllipse(new Rect(1.4, 1.4, size - 2.8, size - 2.8));
    ctx.setFillColor(col);
    ctx.fillEllipse(new Rect(c - 1.5, c - 1.5, 3, 3));
    for (let i = 0; i < 3; i += 1) {
      const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
      const x = c + Math.cos(a) * (size * 0.27);
      const y = c + Math.sin(a) * (size * 0.27);
      ctx.fillEllipse(new Rect(x - 0.9, y - 0.9, 1.8, 1.8));
    }
  } else if (kind === 'shield') {
    const p = new Path();
    p.move(new Point(c, 1.1));
    p.addLine(new Point(size - 1.6, 2.7));
    p.addLine(new Point(size - 2.0, size * 0.58));
    p.addLine(new Point(c, size - 1.0));
    p.addLine(new Point(2.0, size * 0.58));
    p.addLine(new Point(1.6, 2.7));
    p.closeSubpath();
    ctx.addPath(p);
    ctx.setFillColor(new Color('#FFFFFF', 0.25));
    ctx.fillPath();
    ctx.addPath(p);
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.2);
    ctx.strokePath();
  } else if (kind === 'bolt') {
    const p = new Path();
    p.move(new Point(c + 0.8, 1.0));
    p.addLine(new Point(2.2, c + 0.7));
    p.addLine(new Point(c + 0.2, c + 0.7));
    p.addLine(new Point(c - 1.0, size - 1.0));
    p.addLine(new Point(size - 2.2, c - 0.7));
    p.addLine(new Point(c - 0.2, c - 0.7));
    p.closeSubpath();
    ctx.addPath(p);
    ctx.setFillColor(col);
    ctx.fillPath();
  } else if (kind === 'coin') {
    const p = new Path();
    p.move(new Point(c, 1.2));
    p.addLine(new Point(size - 1.5, c));
    p.addLine(new Point(c, size - 1.2));
    p.addLine(new Point(1.5, c));
    p.closeSubpath();
    ctx.addPath(p);
    ctx.setFillColor(new Color('#FFFFFF', 0.28));
    ctx.fillPath();
    ctx.addPath(p);
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.2);
    ctx.strokePath();
  }
  return ctx.getImage();
};

const addIcon = (parent, kind, tintColor, size = 11) => {
  const img = parent.addImage(drawIcon(kind, size));
  img.imageSize = new Size(size, size);
  img.tintColor = tintColor;
  return img;
};

// 260° 驾驶舱环形 CPU 仪表盘底图（中心百分比使用原生动态文字，确保亮暗桌面自动切换）
const drawCpuArcRing = (ratio, bucket, size = 60, thickness = 5.5) => {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2 - 1.5;
  const startDeg = 140;
  const sweepDeg = 260;
  const clamped = Math.max(0.02, Math.min(1, Number(ratio) || 0));

  const drawArc = (degSpan, color, width) => {
    const steps = Math.max(12, Math.round(degSpan / 4));
    const p = new Path();
    for (let i = 0; i <= steps; i += 1) {
      const rad = ((startDeg + (degSpan * i) / steps) * Math.PI) / 180;
      const x = cx + r * Math.cos(rad);
      const y = cy + r * Math.sin(rad);
      if (i === 0) p.move(new Point(x, y));
      else p.addLine(new Point(x, y));
    }
    ctx.addPath(p);
    ctx.setStrokeColor(color);
    ctx.setLineWidth(width);
    ctx.strokePath();
  };

  drawArc(sweepDeg, new Color('#7F8AA3', 0.24), thickness);
  const accentHex = statusHex(ratio, bucket);
  drawArc(sweepDeg * clamped, new Color(accentHex), thickness);

  const endRad = ((startDeg + sweepDeg * clamped) * Math.PI) / 180;
  const ex = cx + r * Math.cos(endRad);
  const ey = cy + r * Math.sin(endRad);
  ctx.setFillColor(new Color(accentHex));
  ctx.fillEllipse(new Rect(ex - thickness / 2, ey - thickness / 2, thickness, thickness));
  return ctx.getImage();
};

const addCpuGauge = (parent, ratio, bucket, size = 60, thickness = 5.5) => {
  const box = parent.addStack();
  box.layoutVertically();
  box.centerAlignContent();
  box.size = new Size(size, size);
  box.backgroundImage = drawCpuArcRing(ratio, bucket, size, thickness);

  const showSub = size >= 44;
  const pctFontSize = Math.round(size * (showSub ? 0.24 : 0.28));
  box.addSpacer();
  addText(box, `${Math.round((Number(ratio) || 0) * 100)}%`, Font.boldRoundedSystemFont(pctFontSize), C.text, {
    align: 'center',
    lineLimit: 1,
    scale: 0.75,
  });
  if (showSub) {
    addText(box, 'LOAD', Font.semiboldMonospacedSystemFont(Math.max(7, Math.round(size * 0.12))), C.muted, {
      align: 'center',
      lineLimit: 1,
    });
  }
  box.addSpacer();
  return box;
};

// 精致平滑面积趋势图（双主题自适应中灰网格 + 高可读青色线）
const drawSparkline = (series, limit, width, height) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const dark = isDarkMode();
  const strokeHex = dark === false ? '#0D9488' : dark === true ? '#4ecdc4' : '#18B3A8';
  const limitHex = dark === false ? '#94A3B8' : '#8060b0';

  const pts = series.length >= 2 ? series : [0, limit * 0.4];
  const maxVal = Math.max(limit * 1.12, ...pts, 1);
  const minVal = Math.max(0, Math.min(...pts) * 0.65);
  const span = Math.max(1, maxVal - minVal);
  const padX = 3;
  const padY = 4;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  if (height >= 30) {
    const midY = padY + innerH * 0.5;
    ctx.setFillColor(new Color('#7F8AA3', 0.16));
    ctx.fillRect(new Rect(padX, midY, innerW, 0.75));
  }

  if (limit > minVal && limit <= maxVal) {
    const limitY = padY + innerH * (1 - (limit - minVal) / span);
    ctx.setFillColor(new Color(limitHex, 0.45));
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
  ctx.setFillColor(new Color(strokeHex, 0.15));
  ctx.fillPath();

  const line = new Path();
  line.move(new Point(coords[0].x, coords[0].y));
  for (let i = 1; i < coords.length; i += 1) {
    line.addLine(new Point(coords[i].x, coords[i].y));
  }
  ctx.addPath(line);
  ctx.setStrokeColor(new Color(strokeHex));
  ctx.setLineWidth(1.65);
  ctx.strokePath();

  const last = coords[coords.length - 1];
  ctx.setFillColor(new Color(strokeHex, 0.28));
  ctx.fillEllipse(new Rect(last.x - 4.2, last.y - 4.2, 8.4, 8.4));
  ctx.setFillColor(new Color(strokeHex));
  ctx.fillEllipse(new Rect(last.x - 2.1, last.y - 2.1, 4.2, 4.2));
  return ctx.getImage();
};

const drawBar = (value, colorHex, width, height = 4) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = height / 2;

  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, height), r, r);
  ctx.addPath(track);
  ctx.setFillColor(new Color('#7F8AA3', 0.22));
  ctx.fillPath();

  const fillW = Math.max(height, Math.min(width, width * Math.max(0, Math.min(1, value))));
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, 0, fillW, height), r, r);
  ctx.addPath(fill);
  ctx.setFillColor(new Color(colorHex));
  ctx.fillPath();
  return ctx.getImage();
};

const readAlertField = (alert, index) => {
  try {
    return String(alert.textFieldValue(index) ?? '').trim();
  } catch {
    return '';
  }
};

const configure = async () => {
  const alert = new Alert();
  alert.title = '配置 Screeps 帝国面板';
  alert.message = '填入 Auth Token 即自动识别全部分片、核弹、安全模式、能量与余额。';
  alert.addTextField('Auth Token', readKeychain(KC_TOKEN));
  alert.addTextField('Shards（留空自动发现，如 shard2,shard3,shardX）', readKeychain(KC_SHARD));
  alert.addTextField('房间（留空自动获取，可用 shard2:E43N29 格式）', readKeychain(KC_ROOMS));
  alert.addAction('保存');
  alert.addCancelAction('取消');
  if ((await alert.presentAlert()) !== 0) return false;
  const token = readAlertField(alert, 0);
  if (!token) {
    const tip = new Alert();
    tip.title = '未保存配置';
    tip.message = 'Auth Token 不能为空，请重新输入。';
    tip.addAction('好');
    await tip.presentAlert();
    return false;
  }
  writeKeychain(KC_TOKEN, token);
  writeKeychain(KC_SHARD, readAlertField(alert, 1));
  writeKeychain(KC_ROOMS, readAlertField(alert, 2));
  writeCache(cacheSignature(getConfig()), { snapshot: null, directory: null, rooms: null, cooldownUntil: 0 });
  const done = new Alert();
  done.title = '配置已保存';
  done.message = '返回主屏幕刷新组件，或点击下方立即预览。';
  done.addAction('立即预览');
  done.addCancelAction('完成');
  if ((await done.presentAlert()) === 0) {
    await presentWidgetPreviews(createWidget, ['medium']);
  }
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
  const maxRoomEnergy = Math.max(1, ...rooms.map((r) => r.totalEnergy));

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
    maxRoomEnergy,
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

  if (cooldownUntil > now) {
    if (snap) return { ...snap, cooldownUntil, cacheNote: '限流退避' };
    throw new Error('API 限流退避中，请稍后刷新');
  }

  if (!forceRefresh && snap) {
    const ttl = snap.incomingNukeCount > 0 || snap.activeSafeModes?.length > 0 ? ALERT_TTL_MS : SNAPSHOT_TTL_MS;
    if (now - Number(snap.fetchedAt || 0) < ttl) return snap;
  }

  try {
    return await fetchLiveData(cfg, cache, sig);
  } catch (error) {
    if (error?.isRateLimit) {
      const nextCooldown = now + (error.retryAfterMs || DEFAULT_COOLDOWN_MS);
      writeCache(sig, { cooldownUntil: nextCooldown });
      if (snap) return { ...snap, cooldownUntil: nextCooldown, cacheNote: '限流退避' };
    } else if (snap) {
      return { ...snap, cacheNote: '离线缓存' };
    }
    throw error;
  }
};

// ==========================================
// 通用视觉构件（Bento 卡片 / 固定列宽矩阵 / 矢量微图标）
// ==========================================
const addHeader = (widget, data, mode = 'medium') => {
  const compact = mode === 'small';
  const wide = mode === 'extraLarge';
  const header = widget.addStack();
  header.centerAlignContent();

  addIcon(header, 'hex', data.incomingNukeCount > 0 ? C.red : C.cyan, compact ? 12 : 14);
  header.addSpacer(5);
  addText(header, 'Screeps', Font.boldSystemFont(compact ? 12 : 13), C.text, { lineLimit: 1 });

  if (!compact) {
    header.addSpacer(6);
    const meta = data.cacheNote
      ? `${data.shards.length}S · ${data.cacheNote}`
      : wide
        ? `${data.shards.length} Shards · ${data.totalRooms} 房 · GCL ${data.gclLevel}`
        : `${data.shards.length}S · ${data.totalRooms}房`;
    addText(header, meta, Font.mediumSystemFont(10), data.cacheNote === '限流退避' ? C.yellow : C.muted, {
      lineLimit: 1,
    });
  }

  header.addSpacer();

  if (!compact && data.incomingNukeCount > 0) {
    pill(header, `来袭 ${data.incomingNukeCount}`, C.red, C.redBg, 9, [2, 6, 2, 6]);
    header.addSpacer(6);
  } else if (!compact && data.activeSafeModes.length > 0) {
    const safeLabel = wide
      ? `安全模式 · ${data.activeSafeModes[0].room}`
      : `安全 · ${data.activeSafeModes[0].room}`;
    pill(header, safeLabel, C.green, C.greenBg, 9, [2, 6, 2, 6]);
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
    backgroundColor: C.tile,
    cornerRadius: 7,
    padding: [3, 7, 3, 7],
  });
};

const addMetricTile = (parent, { width, height, icon, iconColor, label, value, valueColor, sub, compact = false }) => {
  const tile = bento(parent, width, height, compact ? [6, 8, 6, 8] : [9, 11, 8, 11], compact ? 10 : 12);
  const top = tile.addStack();
  top.centerAlignContent();
  addIcon(top, icon, iconColor || valueColor, compact ? 9 : 10);
  top.addSpacer(4);
  addText(top, label, Font.mediumSystemFont(compact ? 9 : 10), C.muted, { lineLimit: 1 });
  tile.addSpacer();
  addText(tile, value, Font.boldRoundedSystemFont(compact ? 15 : 19), valueColor, { lineLimit: 1, scale: 0.72 });
  if (sub) {
    tile.addSpacer(compact ? 1 : 2);
    addText(tile, sub, Font.regularMonospacedSystemFont(compact ? 8 : 9), C.muted, { lineLimit: 1, scale: 0.8 });
  }
  return tile;
};

const addShardCompactRow = (parent, s, barW, showBucket = false) => {
  const row = parent.addStack();
  row.centerAlignContent();

  const nameBox = row.addStack();
  nameBox.size = new Size(24, 0);
  addText(nameBox, shortShard(s.shard), Font.boldMonospacedSystemFont(9), C.sub, { lineLimit: 1 });

  row.addSpacer(4);
  const barImg = row.addImage(drawBar(s.ratio, statusHex(s.ratio, s.bucket), barW, 4));
  barImg.imageSize = new Size(barW, 4);

  row.addSpacer();
  const label = showBucket
    ? `${s.cpu.toFixed(0)}/${Math.round(s.cpuLimit)} · ${formatCompact(s.bucket)}`
    : `${s.cpu.toFixed(0)}/${Math.round(s.cpuLimit)}`;
  addText(row, label, Font.semiboldMonospacedSystemFont(9), C.text, { lineLimit: 1, align: 'right' });
};

// 瑞士固定列宽房间矩阵行（彻底消灭参差错位与大片留白）
const addRoomTableRow = (parent, room, maxEnergy, wide = false) => {
  const row = parent.addStack();
  row.centerAlignContent();

  // Col 1: Shard 胶囊 + 房间名（固定宽度对齐）
  const colRoom = row.addStack();
  colRoom.centerAlignContent();
  colRoom.size = new Size(wide ? 96 : 86, 0);
  pill(colRoom, shortShard(room.shard), C.pillText, C.pillBg, 8, [1, 4, 1, 4]);
  colRoom.addSpacer(5);
  addText(colRoom, room.room, Font.semiboldMonospacedSystemFont(10), C.text, { lineLimit: 1 });
  colRoom.addSpacer();

  // Col 2: RCL（宽屏展示）
  if (wide) {
    const colRcl = row.addStack();
    colRcl.size = new Size(24, 0);
    addText(colRcl, `R${room.rcl || '-'}`, Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  }

  // Col 3: 安全模式状态（固定宽度 + 语义胶囊）
  const colSafe = row.addStack();
  colSafe.centerAlignContent();
  colSafe.size = new Size(wide ? 78 : 66, 0);
  if (room.safeModeRemaining > 0) {
    pill(colSafe, `激活 ${formatCompact(room.safeModeRemaining)}`, C.green, C.greenBg, 8, [1, 5, 1, 5]);
  } else if (room.safeModeCooldown > 0) {
    pill(colSafe, `CD ${formatCompact(room.safeModeCooldown)}`, C.yellow, C.yellowBg, 8, [1, 5, 1, 5]);
  } else {
    addText(colSafe, `安全 ×${room.safeModeAvailable}`, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
  }
  colSafe.addSpacer();

  // Col 4: 核弹井状态（固定宽度 + 语义胶囊）
  const colNuke = row.addStack();
  colNuke.centerAlignContent();
  colNuke.size = new Size(wide ? 52 : 48, 0);
  if (room.incomingNukes.length > 0) {
    pill(colNuke, `来袭${room.incomingNukes.length}`, C.red, C.redBg, 8, [1, 4, 1, 4]);
  } else if (room.nuker?.ready) {
    pill(colNuke, '就绪', C.yellow, C.yellowBg, 8, [1, 5, 1, 5]);
  } else if (room.nuker) {
    addText(colNuke, `${room.nuker.fillPct}%`, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
  } else {
    addText(colNuke, '—', Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  }
  colNuke.addSpacer();

  // Col 5: 能量进度条 + 右对齐数值（充足宽度确保 222.9k 不截断）
  row.addSpacer();
  if (wide) {
    const energyRatio = progress(room.totalEnergy, maxEnergy);
    const dark = isDarkMode();
    const barHex = dark === false ? '#0D9488' : dark === true ? '#4ecdc4' : '#18B3A8';
    const barImg = row.addImage(drawBar(energyRatio, barHex, 50, 4));
    barImg.imageSize = new Size(50, 4);
    row.addSpacer(6);
  }
  const colEnergy = row.addStack();
  colEnergy.size = new Size(52, 0);
  addText(colEnergy, formatCompact(room.totalEnergy), Font.semiboldMonospacedSystemFont(10), C.cyan, {
    lineLimit: 1,
    scale: 0.85,
    align: 'right',
  });
};

// ==========================================
// 5 大主屏尺寸布局（无死角 Bento 对称排版）
// ==========================================
const renderSmall = (widget, data) => {
  addHeader(widget, data, 'small');
  widget.addSpacer(6);

  // CPU 焦点 Bento 卡片
  const cpuCard = bento(widget, 134, 40, [6, 8, 6, 8], 10);
  const cRow = cpuCard.addStack();
  cRow.centerAlignContent();
  const cLeft = cRow.addStack();
  cLeft.layoutVertically();
  addText(cLeft, 'CPU 水平', Font.mediumSystemFont(8), C.muted, { lineLimit: 1 });
  const cNum = cLeft.addStack();
  cNum.centerAlignContent();
  addText(cNum, data.cpu.toFixed(1), Font.boldRoundedSystemFont(15), C.cyan, { lineLimit: 1, scale: 0.75 });
  addText(cNum, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(9), C.muted, { lineLimit: 1 });
  cRow.addSpacer();
  addCpuGauge(cRow, data.ratio, data.bucket, 28, 3.2);

  widget.addSpacer(6);

  // 2×2 核心 Bento 方阵（核弹 / 安全模式 / 余额 / 能量）
  const r1 = widget.addStack();
  r1.spacing = 6;
  addMetricTile(r1, {
    width: 64,
    height: 36,
    icon: 'nuke',
    label: '核弹',
    value: data.incomingNukeCount > 0 ? `来袭${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount}`,
    valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
    compact: true,
  });
  addMetricTile(r1, {
    width: 64,
    height: 36,
    icon: 'shield',
    iconColor: data.activeSafeModes.length > 0 ? C.green : C.sub,
    label: '安全',
    value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 激活` : `×${data.totalSafeModeCharges}`,
    valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
    compact: true,
  });

  widget.addSpacer(6);

  const r2 = widget.addStack();
  r2.spacing = 6;
  addMetricTile(r2, {
    width: 64,
    height: 36,
    icon: 'coin',
    label: '余额',
    value: formatMoney(data.credits),
    valueColor: C.yellow,
    compact: true,
  });
  addMetricTile(r2, {
    width: 64,
    height: 36,
    icon: 'bolt',
    label: '能量',
    value: formatCompact(data.totalEnergy),
    valueColor: C.cyan,
    compact: true,
  });
};

const renderMedium = (widget, data) => {
  addHeader(widget, data, 'medium');
  widget.addSpacer(7);

  const grid = widget.addStack();
  grid.spacing = 8;

  // 左 Bento 主卡：CPU 大字 + 曲线 + 三分片负载条（134 × 108）
  const cpuCard = bento(grid, 134, 108, [8, 9, 8, 9], 12);
  const ch = cpuCard.addStack();
  ch.centerAlignContent();
  addText(ch, 'CPU 水平', Font.mediumSystemFont(9), C.muted, { lineLimit: 1 });
  ch.addSpacer();
  addText(ch, `B ${formatCompact(data.bucket)}`, Font.regularMonospacedSystemFont(8), C.muted, { lineLimit: 1 });

  cpuCard.addSpacer(1);
  const cNum = cpuCard.addStack();
  cNum.centerAlignContent();
  addText(cNum, data.cpu.toFixed(1), Font.boldRoundedSystemFont(19), C.cyan, { lineLimit: 1, scale: 0.72 });
  cNum.addSpacer(2);
  addText(cNum, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(10), C.muted, { lineLimit: 1 });

  cpuCard.addSpacer(3);
  const spark = cpuCard.addImage(drawSparkline(data.cpuSeries, data.cpuLimit, 116, 22));
  spark.imageSize = new Size(116, 22);

  cpuCard.addSpacer();
  const sRow = cpuCard.addStack();
  sRow.centerAlignContent();
  data.shards.slice(0, 3).forEach((s, i) => {
    if (i > 0) sRow.addSpacer();
    addText(
      sRow,
      `${shortShard(s.shard)}:${Math.round(s.ratio * 100)}%`,
      Font.semiboldMonospacedSystemFont(8),
      statusColor(s.ratio, s.bucket),
      { lineLimit: 1, scale: 0.78 }
    );
  });

  // 右 Bento 2×2 方阵（172 × 108）：核弹 / 安全模式 / 余额 / 能量
  const rightCol = grid.addStack();
  rightCol.layoutVertically();
  rightCol.spacing = 6;

  const topRow = rightCol.addStack();
  topRow.spacing = 6;
  addMetricTile(topRow, {
    width: 83,
    height: 51,
    icon: 'nuke',
    label: '核弹数量',
    value: data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount}`,
    valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
    sub: data.incomingNukeCount > 0 ? '紧急预警' : '就绪发射',
    compact: true,
  });
  addMetricTile(topRow, {
    width: 83,
    height: 51,
    icon: 'shield',
    iconColor: data.activeSafeModes.length > 0 ? C.green : C.sub,
    label: '安全模式',
    value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 激活` : `×${data.totalSafeModeCharges}`,
    valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
    sub: data.activeSafeModes.length > 0 ? data.activeSafeModes[0].room : '可用储备',
    compact: true,
  });

  const botRow = rightCol.addStack();
  botRow.spacing = 6;
  addMetricTile(botRow, {
    width: 83,
    height: 51,
    icon: 'coin',
    label: '账户余额',
    value: formatMoney(data.credits),
    valueColor: C.yellow,
    sub: `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`,
    compact: true,
  });
  addMetricTile(botRow, {
    width: 83,
    height: 51,
    icon: 'bolt',
    label: '能量水平',
    value: formatCompact(data.totalEnergy),
    valueColor: C.cyan,
    sub: `仓 ${formatCompact(data.totalStorageEnergy)}`,
    compact: true,
  });
};

const renderLarge = (widget, data, family = 'large') => {
  const isXL = family === 'extraLarge';
  const isPortrait = family === 'extraLargePortrait';

  addHeader(widget, data, family);
  widget.addSpacer(10);

  if (isXL) {
    // ====================================================
    // EXTRA LARGE (720×338)：左右满框 Bento 战略驾驶舱
    // Inner: 692 × 280
    // ====================================================
    const shell = widget.addStack();
    shell.spacing = 10;

    // 左侧战略区（292 × 280）：上 CPU 仪表卡（138）+ 下 2×2 四大指标卡（134）
    const leftCol = shell.addStack();
    leftCol.layoutVertically();
    leftCol.spacing = 8;

    const cpuCard = bento(leftCol, 292, 138, [10, 12, 10, 12], 13);
    const cpuTop = cpuCard.addStack();
    cpuTop.centerAlignContent();

    addCpuGauge(cpuTop, data.ratio, data.bucket, 62, 5.5);
    cpuTop.addSpacer(11);

    const cpuMeta = cpuTop.addStack();
    cpuMeta.layoutVertically();
    cpuMeta.size = new Size(195, 0);

    const cmHead = cpuMeta.addStack();
    cmHead.centerAlignContent();
    addText(cmHead, data.cpu.toFixed(1), Font.boldRoundedSystemFont(20), C.cyan, { lineLimit: 1 });
    cmHead.addSpacer(3);
    addText(cmHead, `/ ${data.cpuLimit} CPU`, Font.mediumRoundedSystemFont(10), C.muted, { lineLimit: 1 });
    cmHead.addSpacer();
    addText(cmHead, `BKT ${formatCompact(data.bucket)}`, Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });

    cpuMeta.addSpacer(6);
    data.shards.slice(0, 3).forEach((s, idx) => {
      if (idx > 0) cpuMeta.addSpacer(4);
      addShardCompactRow(cpuMeta, s, 98, false);
    });

    cpuCard.addSpacer(8);
    const spark = cpuCard.addImage(drawSparkline(data.cpuSeries, data.cpuLimit, 268, 42));
    spark.imageSize = new Size(268, 42);

    // 左下 2×2 Bento 卡片（292 × 134）
    const kpiRow1 = leftCol.addStack();
    kpiRow1.spacing = 8;
    addMetricTile(kpiRow1, {
      width: 142,
      height: 63,
      icon: 'nuke',
      label: '核弹储备',
      value: data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady} / ${data.nukerCount}`,
      valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
      sub: data.incomingNukeCount > 0 ? '高危警报' : `${data.nukesReady} 就绪 · 0 来袭`,
    });
    addMetricTile(kpiRow1, {
      width: 142,
      height: 63,
      icon: 'shield',
      iconColor: data.activeSafeModes.length > 0 ? C.green : C.sub,
      label: '安全模式',
      value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 房激活` : `×${data.totalSafeModeCharges} 次`,
      valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
      sub: data.activeSafeModes.length > 0 ? `${data.activeSafeModes[0].room} 防护中` : '总可用储备',
    });

    const kpiRow2 = leftCol.addStack();
    kpiRow2.spacing = 8;
    addMetricTile(kpiRow2, {
      width: 142,
      height: 63,
      icon: 'coin',
      label: '账户余额',
      value: formatMoney(data.credits),
      valueColor: C.yellow,
      sub: `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`,
    });
    addMetricTile(kpiRow2, {
      width: 142,
      height: 63,
      icon: 'bolt',
      label: '帝国能量',
      value: formatCompact(data.totalEnergy),
      valueColor: C.cyan,
      sub: `仓 ${formatCompact(data.totalStorageEnergy)} · 终 ${formatCompact(data.totalTerminalEnergy)}`,
    });

    // 右侧瑞士对齐房间矩阵卡（390 × 280）
    const roomCard = bento(shell, 390, 280, [10, 12, 10, 12], 13);
    const rh = roomCard.addStack();
    rh.centerAlignContent();
    addText(rh, '房间态势矩阵', Font.semiboldSystemFont(11), C.text, { lineLimit: 1 });
    rh.addSpacer(8);
    addText(rh, '安全模式 · 核弹 · 能量储备', Font.systemFont(9), C.muted, { lineLimit: 1 });
    rh.addSpacer();
    addText(rh, `${data.totalRooms} ROOMS`, Font.semiboldMonospacedSystemFont(9), C.muted, { lineLimit: 1 });

    roomCard.addSpacer(7);
    addHDivider(roomCard);
    roomCard.addSpacer(7);

    if (!data.rooms.length) {
      addText(roomCard, '配置 Token 后自动同步跨分片房间态势', Font.systemFont(11), C.muted);
    } else {
      data.rooms.slice(0, 8).forEach((room, idx) => {
        if (idx > 0) roomCard.addSpacer(7);
        addRoomTableRow(roomCard, room, data.maxRoomEnergy, true);
      });
    }
    roomCard.addSpacer();
    addHDivider(roomCard);
    roomCard.addSpacer(6);
    const xlFoot = roomCard.addStack();
    xlFoot.centerAlignContent();
    addText(
      xlFoot,
      `Storage ${formatCompact(data.totalStorageEnergy)} · Terminal ${formatCompact(data.totalTerminalEnergy)}`,
      Font.regularMonospacedSystemFont(9),
      C.sub,
      { lineLimit: 1 }
    );
    xlFoot.addSpacer();
    addText(xlFoot, `${Math.round(data.creeps)} Creeps · 可用安全 ×${data.totalSafeModeCharges}`, Font.semiboldMonospacedSystemFont(9), C.muted, {
      lineLimit: 1,
    });
    return;
  }

  // ====================================================
  // LARGE (338×354) & EXTRA LARGE PORTRAIT (338×720)
  // Inner width: 310
  // ====================================================
  const cpuCard = bento(widget, 310, isPortrait ? 156 : 102, [9, 11, 9, 11], 13);
  const cTop = cpuCard.addStack();
  cTop.centerAlignContent();

  const arcSize = isPortrait ? 64 : 56;
  addCpuGauge(cTop, data.ratio, data.bucket, arcSize, 5);
  cTop.addSpacer(10);

  const cInfo = cTop.addStack();
  cInfo.layoutVertically();
  cInfo.size = new Size(218, 0);

  const cTitle = cInfo.addStack();
  cTitle.centerAlignContent();
  addText(cTitle, data.cpu.toFixed(1), Font.boldRoundedSystemFont(19), C.cyan, { lineLimit: 1 });
  cTitle.addSpacer(3);
  addText(cTitle, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(10), C.muted, { lineLimit: 1 });
  cTitle.addSpacer();
  addText(cTitle, `BKT ${formatCompact(data.bucket)}`, Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });

  cInfo.addSpacer(5);
  data.shards.slice(0, 3).forEach((s, idx) => {
    if (idx > 0) cInfo.addSpacer(3);
    addShardCompactRow(cInfo, s, 108, false);
  });

  if (isPortrait) {
    cpuCard.addSpacer(10);
    const spark = cpuCard.addImage(drawSparkline(data.cpuSeries, data.cpuLimit, 288, 60));
    spark.imageSize = new Size(288, 60);
  } else {
    cpuCard.addSpacer(5);
    const spark = cpuCard.addImage(drawSparkline(data.cpuSeries, data.cpuLimit, 288, 22));
    spark.imageSize = new Size(288, 22);
  }

  widget.addSpacer(8);

  if (isPortrait) {
    const pRow1 = widget.addStack();
    pRow1.spacing = 8;
    addMetricTile(pRow1, {
      width: 151,
      height: 66,
      icon: 'nuke',
      label: '核弹储备',
      value: data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady} / ${data.nukerCount}`,
      valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
      sub: data.incomingNukeCount > 0 ? '紧急预警' : '0 来袭 · 发射就绪',
    });
    addMetricTile(pRow1, {
      width: 151,
      height: 66,
      icon: 'shield',
      iconColor: data.activeSafeModes.length > 0 ? C.green : C.sub,
      label: '安全模式',
      value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 房激活` : `×${data.totalSafeModeCharges} 次`,
      valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
      sub: data.activeSafeModes.length > 0 ? `${data.activeSafeModes[0].room} 开启中` : '全局可用储备',
    });
    widget.addSpacer(8);
    const pRow2 = widget.addStack();
    pRow2.spacing = 8;
    addMetricTile(pRow2, {
      width: 151,
      height: 66,
      icon: 'coin',
      label: '账户余额',
      value: formatMoney(data.credits),
      valueColor: C.yellow,
      sub: `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`,
    });
    addMetricTile(pRow2, {
      width: 151,
      height: 66,
      icon: 'bolt',
      label: '帝国能量',
      value: formatCompact(data.totalEnergy),
      valueColor: C.cyan,
      sub: `仓 ${formatCompact(data.totalStorageEnergy)} · 终 ${formatCompact(data.totalTerminalEnergy)}`,
    });
  } else {
    const strip = widget.addStack();
    strip.spacing = 6;
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: 'nuke',
      label: '核弹',
      value: data.incomingNukeCount > 0 ? `来袭${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount}`,
      valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
      sub: '0 来袭',
      compact: true,
    });
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: 'shield',
      iconColor: data.activeSafeModes.length > 0 ? C.green : C.sub,
      label: '安全',
      value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length}激活` : `×${data.totalSafeModeCharges}`,
      valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
      sub: `×${data.totalSafeModeCharges} 次`,
      compact: true,
    });
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: 'coin',
      label: '余额',
      value: formatMoney(data.credits),
      valueColor: C.yellow,
      sub: `GCL ${data.gclLevel}`,
      compact: true,
    });
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: 'bolt',
      label: '能量',
      value: formatCompact(data.totalEnergy),
      valueColor: C.cyan,
      sub: `仓${formatCompact(data.totalStorageEnergy)}`,
      compact: true,
    });
  }

  widget.addSpacer(8);

  // 3. 瑞士对齐房间态势 Bento 卡（填满剩余高度）
  const roomCard = bento(widget, 310, isPortrait ? 336 : 132, [9, 11, 9, 11], 13);
  const rh = roomCard.addStack();
  rh.centerAlignContent();
  addText(rh, '房间态势 · 安全 · 核弹 · 能量', Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  rh.addSpacer();
  addText(rh, `${data.totalRooms} 房`, Font.semiboldMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  roomCard.addSpacer(6);
  addHDivider(roomCard);
  roomCard.addSpacer(6);

  const maxRooms = isPortrait ? 10 : 5;
  if (!data.rooms.length) {
    addText(roomCard, '配置 Token 后自动同步跨分片房间态势', Font.systemFont(11), C.muted);
  } else {
    data.rooms.slice(0, maxRooms).forEach((room, idx) => {
      if (idx > 0) roomCard.addSpacer(isPortrait ? 9 : 4);
      addRoomTableRow(roomCard, room, data.maxRoomEnergy, false);
    });
  }

  if (isPortrait) {
    roomCard.addSpacer();
    addHDivider(roomCard);
    roomCard.addSpacer(7);
    const foot = roomCard.addStack();
    foot.centerAlignContent();
    addText(
      foot,
      `Storage ${formatCompact(data.totalStorageEnergy)} · Terminal ${formatCompact(data.totalTerminalEnergy)}`,
      Font.regularMonospacedSystemFont(9),
      C.sub,
      { lineLimit: 1 }
    );
    foot.addSpacer();
    addText(foot, `${Math.round(data.creeps)} Creeps`, Font.semiboldMonospacedSystemFont(9), C.muted, {
      lineLimit: 1,
    });
  } else {
    roomCard.addSpacer();
  }
};

// ==========================================
// 锁屏组件（极简单色）
// ==========================================
const renderAccessory = (widget, family, data) => {
  widget.setPadding(0, 0, 0, 0);
  const pct = Math.round(data.ratio * 100);
  if (family === 'accessoryInline') {
    const alert = data.incomingNukeCount > 0 ? `来袭${data.incomingNukeCount}` : `核${data.nukesReady}`;
    addText(
      widget,
      `SCREEPS CPU ${pct}% · ${alert} · ${formatCompact(data.totalEnergy)}`,
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
  addText(top, `核 ${data.nukesReady}/${data.nukerCount}`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1 });
  widget.addSpacer(3);
  addText(
    widget,
    `余额 ${formatMoney(data.credits)} · 能量 ${formatCompact(data.totalEnergy)}`,
    Font.boldRoundedSystemFont(11),
    C.accessory,
    { lineLimit: 1, scale: 0.75 }
  );
  widget.addSpacer(3);
  addLinearProgress(widget, data.ratio * 100, {
    width: 152,
    thickness: 4,
    progressColor: C.accessory,
    trackColor: C.accessoryTrack,
  });
  widget.addSpacer(3);
  const smStatus = data.activeSafeModes.length > 0 ? `安全激活 ${data.activeSafeModes.length}` : `安全 ×${data.totalSafeModeCharges}`;
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
  widget.setPadding(12, 14, 12, 14);

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
