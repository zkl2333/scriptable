import { createUpdater } from '../lib/updater.js';
import { attachMenuURL, presentWidgetPreviews, runWidgetMenu, shouldShowWidgetMenu } from '../lib/widget-menu.js';
import {
  ACCESSORY_FAMILIES,
  addCircularProgress,
  addLinearProgress,
  addRefreshAction,
  applyTransparentBackground,
  isLargeFamily,
} from '../lib/widget-v18.js';

// Screeps 跨 Shard 帝国运营面板：克制排版 + 多分片负载 + Grafana Memory.stats 兼容。
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
const F = config.widgetFamily || 'medium';
const isAccessory = ACCESSORY_FAMILIES.includes(F);

const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bgTop: dyn('#F7F8FC', '#101020'),
  bgBottom: dyn('#ECEFF7', '#16182C'),
  pill: dyn('#E7E9F4', '#201040'),
  surface: dyn('#FFFFFF', '#181A30'),
  line: dyn('#DCE1EE', '#282B48'),
  text: dyn('#141724', '#F1F3FA'),
  sub: dyn('#4A5268', '#AEB6CC'),
  muted: dyn('#7E879D', '#767F98'),
  purple: dyn('#65469E', '#8060b0'),
  pillText: dyn('#593B93', '#C4A8F5'),
  cyan: dyn('#0E8A85', '#4ecdc4'),
  yellow: dyn('#B87300', '#ffe66d'),
  red: dyn('#C9364B', '#FF6E7F'),
  green: dyn('#158054', '#58D69B'),
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

const api = async (path, params = {}) => {
  const url = `${BASE_URL}/${path}`;
  const request = new Request(url);
  request.headers = { 'X-Token': params.token, 'X-Username': params.token };
  request.timeoutInterval = 8;
  return await request.loadJSON();
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
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
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

const makeEmblem = () => {
  const size = 14;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  const isDark = typeof Device !== 'undefined' && Device.isUsingDarkAppearance ? Device.isUsingDarkAppearance() : true;
  const color = isDark ? '#4ecdc4' : '#0E8A85';
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
  alert.message = '填入 Auth Token 即自动识别所有活跃 Shard 与房间；也可手动覆盖分片（逗号分隔）。';
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

const loadData = async (cfg) => {
  const me = await api('auth/me', cfg);
  const [userRoomsRes, shardInfoRes] = await Promise.all([
    me?._id ? api(`user/rooms?id=${encodeURIComponent(me._id)}`, cfg).catch(() => null) : Promise.resolve(null),
    api('game/shards/info', cfg).catch(() => null),
  ]);

  const cpuMap = me?.cpuShard || {};
  const apiRoomsByShard = userRoomsRes?.shards || {};
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

  const shardTickMap = {};
  (shardInfoRes?.shards || []).forEach((s) => {
    if (s?.name) shardTickMap[s.name] = s.tick;
  });

  const shardDetails = await Promise.all(
    activeShards.map(async (shardName) => {
      const [cpuRes, limitRes, bucketRes, deltaRes, creepsRes, statsRes] = await Promise.all([
        memory('history.cpu_total', shardName, cfg).catch(() => null),
        memory('history.cpu_limit', shardName, cfg).catch(() => null),
        memory('history.bucket', shardName, cfg).catch(() => null),
        memory('history.bucket_delta', shardName, cfg).catch(() => null),
        memory('history.creeps', shardName, cfg).catch(() => null),
        memory('stats', shardName, cfg).catch(() => null),
      ]);

      const rawStats = statsRes?.data && typeof statsRes.data === 'object' ? statsRes.data : statsRes;
      const gStats = rawStats && typeof rawStats === 'object' && ('cpu.used' in rawStats || 'gcl.level' in rawStats)
        ? rawStats
        : null;

      const cpuVal = gStats?.['cpu.used'] ?? latestAverage(cpuRes, 0);
      const limitVal = gStats?.['cpu.limit'] ?? latestAverage(limitRes, null) ?? cpuMap[shardName] ?? me?.cpu ?? 20;
      const bucketVal = gStats?.['cpu.bucket'] ?? latestAverage(bucketRes, 0);
      const deltaVal = latestAverage(deltaRes, null);
      const creepsVal = gStats?.creeps ?? latestAverage(creepsRes, 0);
      const roomNames = manualRoomsMap[shardName] || apiRoomsByShard[shardName] || [];

      return {
        shard: shardName,
        cpu: Number(cpuVal) || 0,
        cpuLimit: Number(limitVal) || 0,
        ratio: limitVal > 0 ? (Number(cpuVal) || 0) / limitVal : 0,
        bucket: Number(bucketVal) || 0,
        bucketDelta: Number.isFinite(Number(deltaVal)) ? Number(deltaVal) : null,
        creeps: Number(creepsVal) || 0,
        tickMs: shardTickMap[shardName] || null,
        cpuSeries: extractSeries(cpuRes),
        roomNames,
        gStats,
        hasGrafanaStats: Boolean(gStats),
      };
    })
  );

  // 轮询各活跃分片收集前列房间（确保跨 Shard 均等展示，最多 9 间控制延迟）
  const roomTargets = [];
  const maxShardRooms = Math.max(0, ...shardDetails.map((s) => s.roomNames.length));
  for (let idx = 0; idx < maxShardRooms; idx += 1) {
    for (const sd of shardDetails) {
      if (sd.roomNames[idx]) {
        roomTargets.push({ shard: sd.shard, room: sd.roomNames[idx], gStats: sd.gStats });
      }
    }
  }
  const rooms = await Promise.all(
    roomTargets.slice(0, 9).map(async ({ shard, room, gStats }) => {
      const overview = await api(
        `game/room-overview?room=${encodeURIComponent(room)}&interval=8&shard=${encodeURIComponent(shard)}`,
        cfg
      ).catch(() => ({ totals: {} }));
      const prefix = `room.${room}.`;
      return {
        shard,
        room,
        totals: overview?.totals || {},
        rcl: gStats ? gStats[`${prefix}controllerLevel`] : undefined,
        rclPercent: gStats ? gStats[`${prefix}controllerProgressPercent`] : undefined,
        storageEnergy: gStats ? gStats[`${prefix}storageEnergy`] : undefined,
        terminalEnergy: gStats ? gStats[`${prefix}terminalEnergy`] : undefined,
        energyAvailable: gStats ? gStats[`${prefix}energyAvailable`] : undefined,
        energyCapacity: gStats ? gStats[`${prefix}energyCapacityAvailable`] : undefined,
      };
    })
  );

  const primaryStats = shardDetails.find((s) => s.gStats)?.gStats || null;
  rooms.sort(
    (a, b) =>
      (b.totals?.energyHarvested || 0) +
      (b.totals?.energyControl || 0) -
      ((a.totals?.energyHarvested || 0) + (a.totals?.energyControl || 0))
  );
  const totalCpu = shardDetails.reduce((sum, s) => sum + s.cpu, 0);
  const sumShardLimits = shardDetails.reduce((sum, s) => sum + s.cpuLimit, 0);
  const totalLimit = Number(me?.cpu) || sumShardLimits || 100;
  const totalCreeps = shardDetails.reduce((sum, s) => sum + s.creeps, 0);
  const minBucket = shardDetails.length ? Math.min(...shardDetails.map((s) => s.bucket)) : 0;
  const gclLevel = primaryStats?.['gcl.level'] ?? me?.gcl?.level ?? 0;
  const gclRatio = primaryStats && Number.isFinite(primaryStats['gcl.progressPercent'])
    ? Math.max(0, Math.min(1, primaryStats['gcl.progressPercent'] / 100))
    : progress(me?.gcl?.progress, me?.gcl?.progressTotal);

  return {
    me,
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
    hasGrafanaStats: shardDetails.some((s) => s.hasGrafanaStats),
  };
};

const statusColor = (ratio, bucket = 10000) =>
  ratio > 0.9 || bucket < 1000 ? C.red : ratio > 0.75 || bucket < 5000 ? C.yellow : C.cyan;

const addHeader = (widget, data, compact = false) => {
  const header = widget.addStack();
  header.centerAlignContent();

  const icon = header.addImage(makeEmblem());
  icon.imageSize = new Size(compact ? 12 : 14, compact ? 12 : 14);
  header.addSpacer(5);
  addText(header, 'Screeps', Font.semiboldSystemFont(compact ? 12 : 13), C.text, { lineLimit: 1 });

  if (!compact) {
    header.addSpacer(6);
    addText(
      header,
      `${data.shards.length} Shards · ${data.totalRooms} 房`,
      Font.systemFont(10),
      C.muted,
      { lineLimit: 1 }
    );
  }

  header.addSpacer();

  const right = addRefreshAction(header, {
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
  return right;
};

const addInfoCell = (parent, label, value, color = C.text) => {
  const cell = parent.addStack();
  cell.layoutVertically();
  addText(cell, label, Font.systemFont(9), C.muted, { lineLimit: 1 });
  cell.addSpacer(2);
  addText(cell, value, Font.semiboldRoundedSystemFont(13), color, { lineLimit: 1, scale: 0.75 });
  return cell;
};

const addShardRow = (parent, s, barW = 54, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  addText(row, shortShard(s.shard), Font.boldMonospacedSystemFont(compact ? 9 : 10), C.sub, { lineLimit: 1 });
  row.addSpacer(5);
  bar(row, s.ratio, statusColor(s.ratio, s.bucket), barW, 3);
  row.addSpacer();
  const limitLabel = s.cpuLimit > 0 ? `/${Math.round(s.cpuLimit)}` : '';
  addText(row, `${s.cpu.toFixed(compact ? 0 : 1)}${limitLabel}`, Font.semiboldMonospacedSystemFont(compact ? 9 : 10), C.text, {
    lineLimit: 1,
    scale: 0.8,
  });
};

const addRoomLine = (parent, item, wide = false) => {
  const row = parent.addStack();
  row.centerAlignContent();

  const badge = row.addStack();
  badge.backgroundColor = C.pill;
  badge.cornerRadius = 4;
  badge.setPadding(1, 4, 1, 4);
  addText(badge, shortShard(item.shard), Font.semiboldMonospacedSystemFont(8), C.pillText, { lineLimit: 1 });

  row.addSpacer(5);
  addText(row, item.room, Font.semiboldMonospacedSystemFont(10), C.text, { lineLimit: 1 });
  if (item.rcl) {
    row.addSpacer(4);
    addText(row, `R${item.rcl}`, Font.mediumMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  }

  row.addSpacer();

  const harvest = formatCompact(item.totals?.energyHarvested || 0);
  const control = formatCompact(item.totals?.energyControl || 0);
  if (wide && Number.isFinite(item.storageEnergy)) {
    addText(row, `+${harvest} · ↑${control}`, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
    row.addSpacer(8);
    addText(row, `仓 ${formatCompact(item.storageEnergy)}`, Font.semiboldMonospacedSystemFont(9), C.cyan, {
      lineLimit: 1,
    });
  } else {
    addText(row, `+${harvest}  ↑${control}`, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
  }
};

const renderSmall = (widget, data) => {
  addHeader(widget, data, true);
  widget.addSpacer(6);

  const hero = widget.addStack();
  hero.centerAlignContent();
  addText(hero, data.cpu.toFixed(1), Font.boldRoundedSystemFont(21), C.cyan, { lineLimit: 1, scale: 0.7 });
  hero.addSpacer(3);
  addText(hero, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(11), C.muted, { lineLimit: 1 });
  hero.addSpacer();
  addText(hero, `${Math.round(data.ratio * 100)}%`, Font.semiboldMonospacedSystemFont(10), statusColor(data.ratio, data.bucket), {
    lineLimit: 1,
  });

  widget.addSpacer(3);
  const spark = widget.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, 130, 20));
  spark.imageSize = new Size(130, 20);

  widget.addSpacer(6);
  addHDivider(widget);
  widget.addSpacer(6);

  data.shards.slice(0, 3).forEach((s, idx) => {
    if (idx > 0) widget.addSpacer(4);
    addShardRow(widget, s, 46, true);
  });

  widget.addSpacer();
  const foot = widget.addStack();
  foot.centerAlignContent();
  addText(foot, `GCL ${data.gclLevel}`, Font.semiboldSystemFont(9), C.yellow, { lineLimit: 1 });
  foot.addSpacer();
  addText(foot, `${data.totalRooms} 房 · ${Math.round(data.creeps)}c`, Font.mediumSystemFont(9), C.muted, {
    lineLimit: 1,
  });
};

const renderMedium = (widget, data) => {
  addHeader(widget, data, false);
  widget.addSpacer(8);

  const main = widget.addStack();
  main.centerAlignContent();

  // 左区：帝国总 CPU 数值 + Grafana 折线趋势（无外框，纯净呼吸感）
  const left = main.addStack();
  left.layoutVertically();
  left.size = new Size(150, 0);

  const cpuHead = left.addStack();
  cpuHead.centerAlignContent();
  addText(cpuHead, '帝国 CPU', Font.systemFont(10), C.muted, { lineLimit: 1 });
  cpuHead.addSpacer();
  addText(cpuHead, `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`, Font.mediumSystemFont(9), C.yellow, {
    lineLimit: 1,
  });

  left.addSpacer(2);
  const numRow = left.addStack();
  numRow.centerAlignContent();
  addText(numRow, data.cpu.toFixed(1), Font.boldRoundedSystemFont(21), C.cyan, { lineLimit: 1, scale: 0.7 });
  numRow.addSpacer(3);
  addText(numRow, `/ ${data.cpuLimit}`, Font.mediumRoundedSystemFont(11), C.muted, { lineLimit: 1 });

  left.addSpacer(4);
  const spark = left.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, 150, 22));
  spark.imageSize = new Size(150, 22);

  main.addSpacer(12);
  addVDivider(main, 62);
  main.addSpacer(12);

  // 右区：多 Shard 分片配额与实时负载条
  const right = main.addStack();
  right.layoutVertically();
  right.size = new Size(134, 0);

  const shHead = right.addStack();
  shHead.centerAlignContent();
  addText(shHead, '分片负载', Font.systemFont(10), C.muted, { lineLimit: 1 });
  shHead.addSpacer();
  addText(shHead, `${data.shards.length} Shards`, Font.mediumSystemFont(9), C.muted, { lineLimit: 1 });
  right.addSpacer(6);

  data.shards.slice(0, 3).forEach((s, idx) => {
    if (idx > 0) right.addSpacer(7);
    addShardRow(right, s, 44, false);
  });

  widget.addSpacer(9);
  addHDivider(widget);
  widget.addSpacer(7);

  // 底部四栏摘要（对齐 ikuai 简洁信息带）
  const strip = widget.addStack();
  addInfoCell(strip, '信用点', formatMoney(data.credits), C.yellow);
  strip.addSpacer();
  addInfoCell(strip, '最低 Bucket', formatCompact(data.bucket), statusColor(data.ratio, data.bucket));
  strip.addSpacer();
  addInfoCell(strip, '全军 Creeps', `${Math.round(data.creeps)}`, C.text);
  strip.addSpacer();
  addInfoCell(strip, '控制房间', `${data.totalRooms}`, C.cyan);
};

const renderLarge = (widget, data, family = 'large') => {
  const isXL = family === 'extraLarge';
  const isPortrait = family === 'extraLargePortrait';

  addHeader(widget, data, false);
  widget.addSpacer(10);

  // 顶部 GCL 进度条带
  const gclRow = widget.addStack();
  gclRow.centerAlignContent();
  addText(gclRow, `GCL ${data.gclLevel}`, Font.boldRoundedSystemFont(15), C.text, { lineLimit: 1 });
  gclRow.addSpacer(10);
  bar(gclRow, data.gclRatio, C.yellow, isXL ? 540 : 196, 5);
  gclRow.addSpacer(10);
  addText(gclRow, `${Math.round(data.gclRatio * 100)}%`, Font.semiboldMonospacedSystemFont(11), C.yellow, {
    lineLimit: 1,
  });

  widget.addSpacer(10);
  addHDivider(widget);
  widget.addSpacer(10);

  // 核心 4 指标带
  const strip = widget.addStack();
  addInfoCell(strip, '帝国 CPU', `${data.cpu.toFixed(1)}/${data.cpuLimit}`, C.cyan);
  strip.addSpacer();
  addInfoCell(strip, '信用点', formatMoney(data.credits), C.yellow);
  strip.addSpacer();
  addInfoCell(strip, '最低 Bucket', formatCompact(data.bucket), statusColor(data.ratio, data.bucket));
  strip.addSpacer();
  addInfoCell(strip, '全军 Creeps', `${Math.round(data.creeps)}`, C.text);

  widget.addSpacer(10);
  addHDivider(widget);
  widget.addSpacer(10);

  const body = widget.addStack();
  if (!isXL) body.layoutVertically();

  // 左/上：Grafana CPU 曲线 + 各 Shard 分片条
  const leftW = isXL ? 326 : 310;
  const chartH = isXL ? 86 : isPortrait ? 104 : 62;
  const telemetry = body.addStack();
  telemetry.layoutVertically();
  telemetry.size = new Size(leftW, 0);

  const tHead = telemetry.addStack();
  tHead.centerAlignContent();
  addText(tHead, 'CPU 趋势 · GRAFANA', Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  tHead.addSpacer();
  addText(tHead, `${Math.round(data.ratio * 100)}% LOAD`, Font.semiboldMonospacedSystemFont(10), C.cyan, {
    lineLimit: 1,
  });
  telemetry.addSpacer(6);
  const spark = telemetry.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, leftW, chartH));
  spark.imageSize = new Size(leftW, chartH);

  telemetry.addSpacer(8);
  data.shards.slice(0, 4).forEach((s, idx) => {
    if (idx > 0) telemetry.addSpacer(5);
    const sRow = telemetry.addStack();
    sRow.centerAlignContent();
    addText(sRow, s.shard, Font.semiboldMonospacedSystemFont(10), C.sub, { lineLimit: 1 });
    sRow.addSpacer(6);
    addText(sRow, `${s.roomNames.length} 房`, Font.systemFont(9), C.muted, { lineLimit: 1 });
    sRow.addSpacer(8);
    bar(sRow, s.ratio, statusColor(s.ratio, s.bucket), isXL ? 110 : 104, 4);
    sRow.addSpacer();
    addText(sRow, `${s.cpu.toFixed(1)}/${s.cpuLimit} · B ${formatCompact(s.bucket)}`, Font.regularMonospacedSystemFont(9), C.text, {
      lineLimit: 1,
    });
  });

  if (isXL) {
    body.addSpacer(14);
    addVDivider(body, 186);
    body.addSpacer(14);
  } else {
    body.addSpacer(10);
    addHDivider(body);
    body.addSpacer(10);
  }

  // 右/下：跨 Shard 房间经济表
  const rightW = isXL ? 334 : 310;
  const roomsCol = body.addStack();
  roomsCol.layoutVertically();
  roomsCol.size = new Size(rightW, 0);

  const rHead = roomsCol.addStack();
  rHead.centerAlignContent();
  addText(rHead, '跨 Shard 房间 · 8H', Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  rHead.addSpacer();
  addText(rHead, `${data.totalRooms} ROOMS`, Font.mediumMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  roomsCol.addSpacer(6);

  const maxRooms = isPortrait ? 8 : isXL ? 7 : 4;
  if (!data.rooms.length) {
    addText(roomsCol, '运行脚本配置或同步房间数据', Font.systemFont(11), C.muted);
  } else {
    data.rooms.slice(0, maxRooms).forEach((item, idx) => {
      if (idx > 0) roomsCol.addSpacer(isPortrait ? 7 : 5);
      addRoomLine(roomsCol, item, isXL || isPortrait);
    });
  }

  const totalStorage = data.rooms.reduce((sum, r) => sum + (Number(r.storageEnergy) || 0), 0);
  if (isXL && totalStorage > 0) {
    roomsCol.addSpacer(8);
    addHDivider(roomsCol);
    roomsCol.addSpacer(6);
    const rFoot = roomsCol.addStack();
    rFoot.centerAlignContent();
    addText(rFoot, `Storage 总量 ${formatCompact(totalStorage)}`, Font.mediumMonospacedSystemFont(9), C.cyan, {
      lineLimit: 1,
    });
    rFoot.addSpacer();
    addText(rFoot, data.hasGrafanaStats ? 'Grafana 已同步' : 'History 模式', Font.systemFont(9), C.muted, {
      lineLimit: 1,
    });
  }

  if (isPortrait) {
    widget.addSpacer(12);
    addHDivider(widget);
    widget.addSpacer(10);

    const gHead = widget.addStack();
    gHead.centerAlignContent();
    addText(gHead, 'RCL 进度与储能 · GRAFANA', Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
    gHead.addSpacer();
    if (totalStorage > 0) {
      addText(gHead, `仓 ${formatCompact(totalStorage)}`, Font.semiboldMonospacedSystemFont(9), C.cyan, {
        lineLimit: 1,
      });
    }
    widget.addSpacer(8);

    data.rooms.slice(0, 8).forEach((item, idx) => {
      if (idx > 0) widget.addSpacer(7);
      const rRow = widget.addStack();
      rRow.centerAlignContent();
      addText(rRow, `${shortShard(item.shard)} ${item.room}`, Font.semiboldMonospacedSystemFont(10), C.text, {
        lineLimit: 1,
      });
      rRow.addSpacer(8);
      const rclRatio = Number.isFinite(item.rclPercent) ? Math.max(0, Math.min(1, item.rclPercent / 100)) : 0;
      bar(rRow, rclRatio, item.rcl >= 8 ? C.green : C.cyan, 86, 4);
      rRow.addSpacer();
      const cap = Number.isFinite(item.energyCapacity)
        ? `⚡${formatCompact(item.energyAvailable || 0)}/${formatCompact(item.energyCapacity)}`
        : '';
      const stor = Number.isFinite(item.storageEnergy) ? `仓${formatCompact(item.storageEnergy)}` : '';
      addText(rRow, [stor, cap].filter(Boolean).join(' · ') || '—', Font.regularMonospacedSystemFont(9), C.sub, {
        lineLimit: 1,
      });
    });
  }

  widget.addSpacer();
};

const renderAccessory = (widget, data) => {
  widget.setPadding(0, 0, 0, 0);
  const pct = Math.round(data.ratio * 100);
  if (F === 'accessoryInline') {
    addText(
      widget,
      `SCREEPS · CPU ${pct}% · ${data.shards.length}S/${data.totalRooms}R`,
      Font.semiboldMonospacedSystemFont(11),
      C.accessory,
      { lineLimit: 1, scale: 0.7 }
    );
    return;
  }
  if (F === 'accessoryCircular') {
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
  addText(top, `SCREEPS · ${data.shards.length} SHARDS`, Font.boldMonospacedSystemFont(9), C.accessory, {
    lineLimit: 1,
    scale: 0.75,
  });
  top.addSpacer();
  addText(top, `${pct}%`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1 });
  widget.addSpacer(3);
  addText(widget, `CPU ${data.cpu.toFixed(1)}/${data.cpuLimit}`, Font.boldRoundedSystemFont(13), C.accessory, {
    lineLimit: 1,
    scale: 0.75,
  });
  widget.addSpacer(3);
  bar(widget, data.ratio, C.accessory, 152, 4, C.accessoryTrack);
  widget.addSpacer(3);
  addText(
    widget,
    `GCL ${data.gclLevel} · BKT ${formatCompact(data.bucket)} · ${data.totalRooms}R`,
    Font.mediumMonospacedSystemFont(8),
    C.accessory,
    { lineLimit: 1, scale: 0.75 }
  );
};

const render = async () => {
  const widget = new ListWidget();
  const cfg = getConfig();

  if (isAccessory) {
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
      renderAccessory(widget, data);
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
    addText(widget, '运行脚本配置 Auth Token\n即可自动识别跨 Shard 帝国', Font.mediumSystemFont(12), C.muted);
    widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}`;
    return widget;
  }

  let data;
  try {
    data = await loadData(cfg);
  } catch (error) {
    addText(widget, 'Screeps', Font.boldRoundedSystemFont(16), C.cyan);
    widget.addSpacer(8);
    addText(widget, '数据暂时不可用', Font.mediumSystemFont(14), C.red);
    addText(widget, error.message?.slice(0, 40) || '请检查配置', Font.systemFont(10), C.muted);
    return widget;
  }

  if (F === 'small') renderSmall(widget, data);
  else if (isLargeFamily(F)) renderLarge(widget, data, F);
  else renderMedium(widget, data);

  return attachMenuURL(widget);
};

const run = async () => {
  if (shouldShowWidgetMenu()) {
    await runWidgetMenu({
      title: 'Screeps',
      actions: [
        { title: '刷新预览', handler: async () => {} },
        { title: '重新配置', handler: configure },
        { title: '检查更新', handler: () => updater.checkForUpdate({ notify: true }) },
      ],
    });
    return;
  }
  const widget = await render();
  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await presentWidgetPreviews(widget, { family: F });
  }
  Script.complete();
};

await run();
