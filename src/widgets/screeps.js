import { createUpdater } from '../lib/updater.js';
import { attachMenuURL, presentWidgetPreviews, runWidgetMenu, shouldShowWidgetMenu } from '../lib/widget-menu.js';
import {
  ACCESSORY_FAMILIES,
  addCircularProgress,
  addLinearProgress,
  addRefreshAction,
  applyTransparentBackground,
  attachStackAction,
  isLargeFamily,
} from '../lib/widget-v18.js';

// Screeps 运营面板：紫蓝仪表盘风格（兼容官方 Memory.history 与 Grafana Memory.stats）。
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
  bgTop: dyn('#F6F3FC', '#101020'),
  bgBottom: dyn('#EAE4F7', '#181330'),
  bg: dyn('#f5f2fa', '#101020'),
  panel: dyn('#ffffff', '#201040'),
  panelSoft: dyn('#F1ECF9', '#2A194E'),
  line: dyn('#e2daf0', '#302050'),
  text: dyn('#221836', '#f0ecf7'),
  muted: dyn('#6F6682', '#aaa0b8'),
  purple: dyn('#7351a3', '#8060b0'),
  badgeText: dyn('#593990', '#b89af0'),
  cyan: dyn('#147D87', '#4ecdc4'),
  yellow: dyn('#A86A00', '#ffe66d'),
  red: dyn('#C43C52', '#ff7185'),
  green: dyn('#177A52', '#65d6a2'),
  accessory: dyn('#111111', '#FFFFFF'),
};

const getConfig = () => ({
  token: Keychain.get(KC_TOKEN),
  shard: Keychain.get(KC_SHARD) || 'shard2',
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

const memory = async (key, cfg) =>
  api(`user/memory?path=${encodeURIComponent(key)}&shard=${encodeURIComponent(cfg.shard)}`, cfg);

const formatMoney = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v)}`;
};

const formatNumber = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}m`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
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
    ...(Array.isArray(prev) ? prev.slice(-8) : []),
    ...(Array.isArray(medium) ? medium : []),
    ...(Array.isArray(fine) ? fine.slice(-6) : []),
  ].filter((v) => Number.isFinite(Number(v)));
  return combined.slice(-16).map(Number);
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

const spacer = (p, n = null) => p.addSpacer(n);

const bar = (p, value, color = C.purple, width = 100, thickness = 5, trackColor = C.line) =>
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
      fill.size = new Size(Math.max(3, width * Math.max(0, Math.min(1, value))), thickness);
      fill.cornerRadius = thickness / 2;
      fill.backgroundColor = color;
      return s;
    },
  });

const sparkPalette = () => {
  const isDark = typeof Device !== 'undefined' && Device.isUsingDarkAppearance ? Device.isUsingDarkAppearance() : true;
  return isDark
    ? { stroke: '#4ecdc4', limit: '#8060b0', grid: '#3c2b63', alpha: 0.2 }
    : { stroke: '#147D87', limit: '#7351A3', grid: '#D5CCE8', alpha: 0.14 };
};

const makeSparkline = (series, limit, width, height) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;

  const pal = sparkPalette();
  const pts = series.length >= 2 ? series : [0, limit * 0.4];
  const maxVal = Math.max(limit * 1.15, ...pts, 1);
  const padX = 2;
  const padY = 3;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  if (height >= 40) {
    const midY = padY + innerH * 0.5;
    ctx.setFillColor(new Color(pal.grid, 0.45));
    ctx.fillRect(new Rect(padX, midY, innerW, 0.75));
  }

  // Grafana CPU limit 参考线
  if (limit > 0 && limit <= maxVal) {
    const limitY = padY + innerH * (1 - limit / maxVal);
    ctx.setFillColor(new Color(pal.limit, 0.45));
    for (let x = padX; x < width - padX; x += 6) {
      ctx.fillRect(new Rect(x, limitY, 3, 1));
    }
  }

  const coords = pts.map((v, idx) => ({
    x: padX + (innerW * idx) / Math.max(1, pts.length - 1),
    y: padY + innerH * (1 - Math.max(0, Math.min(1, v / maxVal))),
  }));

  // 面积填充
  const area = new Path();
  area.move(new Point(coords[0].x, height - padY));
  coords.forEach((pt) => area.addLine(new Point(pt.x, pt.y)));
  area.addLine(new Point(coords[coords.length - 1].x, height - padY));
  area.closeSubpath();
  ctx.addPath(area);
  ctx.setFillColor(new Color(pal.stroke, pal.alpha));
  ctx.fillPath();

  // 折线本体
  const line = new Path();
  line.move(new Point(coords[0].x, coords[0].y));
  for (let i = 1; i < coords.length; i += 1) {
    line.addLine(new Point(coords[i].x, coords[i].y));
  }
  ctx.addPath(line);
  ctx.setStrokeColor(new Color(pal.stroke));
  ctx.setLineWidth(1.6);
  ctx.strokePath();

  // 末点高亮
  const last = coords[coords.length - 1];
  ctx.setFillColor(new Color(pal.stroke));
  ctx.fillEllipse(new Rect(last.x - 2.3, last.y - 2.3, 4.6, 4.6));
  return ctx.getImage();
};

const card = (p, width = null, padding = [7, 9, 7, 9]) => {
  const s = p.addStack();
  s.layoutVertically();
  s.backgroundColor = C.panel;
  s.cornerRadius = 10;
  s.borderWidth = 1;
  s.borderColor = C.line;
  s.setPadding(padding[0], padding[1], padding[2], padding[3]);
  if (width) s.size = new Size(width, 0);
  return s;
};

const kpiTile = (p, label, value, color, sub = '', width = null, compact = false) => {
  const s = card(p, width, compact ? [6, 8, 6, 8] : [7, 9, 7, 9]);
  const top = s.addStack();
  top.centerAlignContent();
  addText(top, label.toUpperCase(), Font.semiboldMonospacedSystemFont(compact ? 8 : 8), C.muted, { lineLimit: 1 });
  if (sub) {
    spacer(top);
    addText(top, sub, Font.mediumMonospacedSystemFont(8), C.muted, { lineLimit: 1, scale: 0.75 });
  }
  spacer(s, compact ? 2 : 3);
  addText(s, value, Font.boldRoundedSystemFont(compact ? 15 : 18), color, { lineLimit: 1, scale: 0.65 });
  return s;
};

const configure = async () => {
  const alert = new Alert();
  alert.title = '配置 Screeps';
  alert.message = '输入 Auth Token、Shard 和监控房间（逗号分隔）。';
  alert.addTextField('Auth Token', Keychain.get(KC_TOKEN) || '');
  alert.addTextField('Shard', Keychain.get(KC_SHARD) || 'shard2');
  alert.addTextField('房间', Keychain.get(KC_ROOMS) || '');
  alert.addAction('保存');
  alert.addCancelAction('取消');
  if ((await alert.present()) < 0) return false;
  const token = alert.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(KC_TOKEN, token);
  Keychain.set(KC_SHARD, alert.textFieldValue(1).trim() || 'shard2');
  Keychain.set(KC_ROOMS, alert.textFieldValue(2).trim());
  return true;
};

const loadData = async (cfg) => {
  const me = await api('auth/me', cfg);
  const [cpu, ratio, bucket, bucketDelta, creeps, cpuLimit, statsRes, rooms] = await Promise.all([
    memory('history.cpu_total', cfg).catch(() => null),
    memory('history.cpu_ratio', cfg).catch(() => null),
    memory('history.bucket', cfg).catch(() => null),
    memory('history.bucket_delta', cfg).catch(() => null),
    memory('history.creeps', cfg).catch(() => null),
    memory('history.cpu_limit', cfg).catch(() => null),
    memory('stats', cfg).catch(() => null),
    cfg.rooms.length
      ? Promise.all(
          cfg.rooms.map((room) =>
            api(`game/room-overview?room=${encodeURIComponent(room)}&interval=8&shard=${cfg.shard}`, cfg)
              .then((data) => ({ room, ...data }))
              .catch(() => ({ room, totals: {} }))
          )
        )
      : Promise.resolve([]),
  ]);

  const stats = statsRes?.data && typeof statsRes.data === 'object' ? statsRes.data : statsRes;
  const gStats = stats && typeof stats === 'object' && ('cpu.used' in stats || 'gcl.level' in stats) ? stats : null;

  const cpuVal = gStats?.['cpu.used'] ?? latestAverage(cpu, 0);
  const limitVal = gStats?.['cpu.limit'] ?? latestAverage(cpuLimit, null) ?? me?.cpu ?? 100;
  const ratioVal = latestAverage(ratio, null) ?? (limitVal > 0 ? cpuVal / limitVal : 0);
  const bucketVal = gStats?.['cpu.bucket'] ?? latestAverage(bucket, 0);
  const deltaVal = latestAverage(bucketDelta, null);
  const creepsVal = gStats?.creeps ?? latestAverage(creeps, 0);
  const creditsVal = gStats?.credits ?? me?.money ?? 0;

  const gclLevel = gStats?.['gcl.level'] ?? me?.gcl?.level ?? 0;
  const gclRatio = gStats && Number.isFinite(gStats['gcl.progressPercent'])
    ? Math.max(0, Math.min(1, gStats['gcl.progressPercent'] / 100))
    : progress(me?.gcl?.progress, me?.gcl?.progressTotal);

  const enrichedRooms = rooms.map((item) => {
    const prefix = `room.${item.room}.`;
    return {
      ...item,
      rcl: gStats ? gStats[`${prefix}controllerLevel`] : undefined,
      rclPercent: gStats ? gStats[`${prefix}controllerProgressPercent`] : undefined,
      storageEnergy: gStats ? gStats[`${prefix}storageEnergy`] : undefined,
      terminalEnergy: gStats ? gStats[`${prefix}terminalEnergy`] : undefined,
      energyAvailable: gStats ? gStats[`${prefix}energyAvailable`] : undefined,
      energyCapacity: gStats ? gStats[`${prefix}energyCapacityAvailable`] : undefined,
    };
  });

  return {
    me,
    cpu: cpuVal,
    cpuLimit: limitVal,
    cpuSeries: extractSeries(cpu),
    ratio: ratioVal,
    bucket: bucketVal,
    bucketDelta: deltaVal,
    creeps: creepsVal,
    credits: creditsVal,
    gclLevel,
    gclRatio,
    rooms: enrichedRooms,
    hasGrafanaStats: Boolean(gStats),
  };
};

const statusColor = (data) =>
  data.ratio > 0.9 || data.bucket < 1000
    ? C.red
    : data.ratio > 0.75 || data.bucket < 5000
      ? C.yellow
      : C.green;

const addHeader = (widget, cfg, data, compact = false) => {
  const header = widget.addStack();
  header.centerAlignContent();

  const brand = header.addStack();
  brand.centerAlignContent();
  addText(brand, 'SCREEPS', Font.boldMonospacedSystemFont(compact ? 12 : 14), C.purple, { lineLimit: 1 });
  spacer(brand, 6);

  const shardBadge = brand.addStack();
  shardBadge.backgroundColor = C.panelSoft;
  shardBadge.cornerRadius = 5;
  shardBadge.setPadding(2, 5, 2, 5);
  addText(shardBadge, cfg.shard, Font.semiboldMonospacedSystemFont(8), C.muted, { lineLimit: 1 });

  spacer(header);

  const right = addRefreshAction(header, {
    title: '刷新 Screeps 面板',
    id: 'refresh',
    text: compact ? '' : `${Math.round(data.ratio * 100)}%`,
    font: Font.semiboldMonospacedSystemFont(9),
    textColor: statusColor(data),
    iconColor: C.muted,
    iconSize: 10,
    backgroundColor: C.panel,
    cornerRadius: 8,
    padding: [3, 7, 3, 7],
  });
  right.borderWidth = 1;
  right.borderColor = C.line;
};

const addGclRow = (parent, data, barWidth, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  addText(row, `GCL ${data.gclLevel}`, Font.boldRoundedSystemFont(compact ? 13 : 15), C.text, { lineLimit: 1 });
  spacer(row, 8);
  bar(row, data.gclRatio, C.yellow, barWidth, compact ? 4 : 5);
  spacer(row, 8);
  addText(row, `${Math.round(data.gclRatio * 100)}%`, Font.semiboldMonospacedSystemFont(compact ? 10 : 11), C.yellow, {
    lineLimit: 1,
  });
};

const addRoomRow = (parent, item, wide = false) => {
  const { room, totals = {}, rcl, storageEnergy } = item;
  const row = parent.addStack();
  row.centerAlignContent();

  const left = row.addStack();
  left.centerAlignContent();
  addText(left, room, Font.boldMonospacedSystemFont(10), C.text, { lineLimit: 1 });
  if (rcl) {
    spacer(left, 4);
    const badge = left.addStack();
    badge.backgroundColor = C.panelSoft;
    badge.cornerRadius = 4;
    badge.setPadding(1, 4, 1, 4);
    addText(badge, `R${rcl}`, Font.semiboldMonospacedSystemFont(7), C.badgeText, { lineLimit: 1 });
  }

  spacer(row);

  const statsRow = row.addStack();
  statsRow.centerAlignContent();
  statsRow.spacing = wide ? 8 : 6;
  addText(statsRow, `+${formatNumber(totals.energyHarvested)}`, Font.mediumMonospacedSystemFont(9), C.yellow, { lineLimit: 1 });
  addText(statsRow, `⚒${formatNumber(totals.energyConstruction)}`, Font.mediumMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  addText(statsRow, `↻${formatNumber(totals.energyCreeps)}`, Font.mediumMonospacedSystemFont(9), C.cyan, { lineLimit: 1 });
  addText(statsRow, `↑${formatNumber(totals.energyControl)}`, Font.mediumMonospacedSystemFont(9), C.green, { lineLimit: 1 });
  if (wide && Number.isFinite(storageEnergy)) {
    addText(statsRow, `仓${formatNumber(storageEnergy)}`, Font.mediumMonospacedSystemFont(9), C.purple, { lineLimit: 1 });
  }
};

const renderSmall = (widget, cfg, data) => {
  addHeader(widget, cfg, data, true);
  spacer(widget, 6);

  const hero = card(widget, 134, [6, 8, 6, 8]);
  const top = hero.addStack();
  top.centerAlignContent();
  addText(top, 'CPU', Font.semiboldMonospacedSystemFont(8), C.muted, { lineLimit: 1 });
  spacer(top);
  addText(top, `${data.cpu.toFixed(1)}/${data.cpuLimit}`, Font.boldMonospacedSystemFont(10), C.cyan, {
    lineLimit: 1,
    scale: 0.75,
  });
  spacer(hero, 4);
  const chart = hero.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, 118, 24));
  chart.imageSize = new Size(118, 24);

  spacer(widget, 6);
  const kpis = widget.addStack();
  kpis.spacing = 6;
  kpiTile(kpis, 'BUCKET', formatNumber(data.bucket), statusColor(data), '', 64, true);
  kpiTile(kpis, 'CREEPS', `${Math.round(data.creeps)}`, C.purple, '', 64, true);

  spacer(widget);
  addGclRow(widget, data, 54, true);
};

const renderMedium = (widget, cfg, data) => {
  addHeader(widget, cfg, data);
  spacer(widget, 6);

  const topRow = widget.addStack();
  topRow.centerAlignContent();
  topRow.spacing = 7;

  const cpuSub = `${Math.round(data.ratio * 100)}%`;
  kpiTile(topRow, 'CREDITS', formatMoney(data.credits), C.yellow, `GCL ${data.gclLevel}`, 98, true);
  kpiTile(topRow, 'CPU AVG', `${data.cpu.toFixed(1)}/${data.cpuLimit}`, C.cyan, cpuSub, 114, true);

  const sparkCard = card(topRow, 88, [5, 7, 5, 7]);
  const scHead = sparkCard.addStack();
  scHead.centerAlignContent();
  addText(scHead, 'TREND', Font.semiboldMonospacedSystemFont(7), C.muted, { lineLimit: 1 });
  spacer(scHead);
  addText(scHead, formatNumber(data.bucket), Font.semiboldMonospacedSystemFont(8), statusColor(data), { lineLimit: 1 });
  spacer(sparkCard, 3);
  const spark = sparkCard.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, 74, 21));
  spark.imageSize = new Size(74, 21);

  spacer(widget, 6);

  const roomCard = card(widget, 314, [5, 9, 5, 9]);
  const rcHead = roomCard.addStack();
  rcHead.centerAlignContent();
  addText(rcHead, 'ROOM ECONOMY · 8H', Font.semiboldMonospacedSystemFont(7), C.muted, { lineLimit: 1 });
  spacer(rcHead);
  addText(
    rcHead,
    `GCL ${data.gclLevel} (${Math.round(data.gclRatio * 100)}%) · ${Math.round(data.creeps)} creeps`,
    Font.mediumMonospacedSystemFont(8),
    C.muted,
    { lineLimit: 1, scale: 0.75 }
  );
  spacer(roomCard, 3);
  if (!data.rooms.length) {
    addText(roomCard, '运行脚本配置监控房间', Font.systemFont(10), C.muted, { lineLimit: 1 });
  } else {
    data.rooms.slice(0, 3).forEach((item, idx) => {
      if (idx > 0) spacer(roomCard, 2);
      addRoomRow(roomCard, item, false);
    });
  }
};

const renderLarge = (widget, cfg, data, family = 'large') => {
  const isXL = family === 'extraLarge';
  const isPortrait = family === 'extraLargePortrait';
  addHeader(widget, cfg, data);
  spacer(widget, 8);

  addGclRow(widget, data, isXL ? 560 : 196, false);
  spacer(widget, 8);

  const kpis = widget.addStack();
  kpis.spacing = 7;
  const deltaText = Number.isFinite(data.bucketDelta)
    ? `${data.bucketDelta >= 0 ? '+' : ''}${Math.round(data.bucketDelta)}/t`
    : '';
  if (isXL) {
    kpiTile(kpis, 'CREDITS', formatMoney(data.credits), C.yellow, '', 168);
    kpiTile(kpis, 'CPU AVG', `${data.cpu.toFixed(1)}/${data.cpuLimit}`, C.cyan, `${Math.round(data.ratio * 100)}%`, 168);
    kpiTile(kpis, 'BUCKET', formatNumber(data.bucket), statusColor(data), deltaText, 168);
    kpiTile(kpis, 'CREEPS', `${Math.round(data.creeps)}`, C.purple, `${data.rooms.length} rooms`, 168);
  } else {
    kpiTile(kpis, 'CREDITS', formatMoney(data.credits), C.yellow, '', 100);
    kpiTile(kpis, 'CPU', `${data.cpu.toFixed(1)}/${data.cpuLimit}`, C.cyan, `${Math.round(data.ratio * 100)}%`, 104);
    kpiTile(kpis, 'BUCKET', formatNumber(data.bucket), statusColor(data), deltaText, 96);
  }

  spacer(widget, 8);

  const body = widget.addStack();
  if (!isXL) body.layoutVertically();
  body.spacing = 8;

  const chartW = isXL ? 326 : 314;
  const chartH = isXL ? 148 : isPortrait ? 110 : 66;
  const cpuCard = card(body, chartW, [8, 10, 8, 10]);
  const cpuHead = cpuCard.addStack();
  cpuHead.centerAlignContent();
  addText(cpuHead, 'CPU TELEMETRY · GRAFANA', Font.semiboldMonospacedSystemFont(8), C.muted, { lineLimit: 1 });
  spacer(cpuHead);
  addText(cpuHead, `${Math.round(data.ratio * 100)}% LOAD`, Font.boldMonospacedSystemFont(9), C.cyan, { lineLimit: 1 });
  spacer(cpuCard, 5);
  const spark = cpuCard.addImage(makeSparkline(data.cpuSeries, data.cpuLimit, chartW - 20, chartH));
  spark.imageSize = new Size(chartW - 20, chartH);
  spacer(cpuCard, 4);
  const cpuFoot = cpuCard.addStack();
  cpuFoot.centerAlignContent();
  addText(cpuFoot, `LIMIT ${data.cpuLimit}`, Font.mediumMonospacedSystemFont(8), C.muted, { lineLimit: 1 });
  spacer(cpuFoot);
  addText(cpuFoot, `${Math.round(data.creeps)} CREEPS`, Font.semiboldMonospacedSystemFont(8), C.badgeText, {
    lineLimit: 1,
  });

  const roomCardW = isXL ? 358 : 314;
  const roomCard = card(body, roomCardW, [8, 10, 8, 10]);
  const rHead = roomCard.addStack();
  rHead.centerAlignContent();
  addText(rHead, 'ROOM ECONOMY · 8H', Font.semiboldMonospacedSystemFont(8), C.muted, { lineLimit: 1 });
  spacer(rHead);
  addText(rHead, `${data.rooms.length} ROOMS`, Font.mediumMonospacedSystemFont(8), C.badgeText, { lineLimit: 1 });
  spacer(roomCard, 5);
  const maxRooms = isPortrait ? 6 : isXL ? 6 : 4;
  if (!data.rooms.length) {
    addText(roomCard, '运行脚本配置监控房间', Font.systemFont(11), C.muted);
  } else {
    data.rooms.slice(0, maxRooms).forEach((item, idx) => {
      if (idx > 0) spacer(roomCard, isPortrait ? 5 : 4);
      addRoomRow(roomCard, item, isXL);
    });
  }

  const totalStorage = data.rooms.reduce((sum, r) => sum + (Number(r.storageEnergy) || 0), 0);
  const totalAvail = data.rooms.reduce((sum, r) => sum + (Number(r.energyAvailable) || 0), 0);
  const totalCap = data.rooms.reduce((sum, r) => sum + (Number(r.energyCapacity) || 0), 0);
  if (isXL && totalStorage > 0) {
    spacer(roomCard, 8);
    const rFoot = roomCard.addStack();
    rFoot.centerAlignContent();
    addText(rFoot, `STORAGE ${formatNumber(totalStorage)}`, Font.semiboldMonospacedSystemFont(8), C.badgeText, {
      lineLimit: 1,
    });
    spacer(rFoot);
    if (totalCap > 0) {
      addText(
        rFoot,
        `SPAWN ${formatNumber(totalAvail)}/${formatNumber(totalCap)}`,
        Font.mediumMonospacedSystemFont(8),
        C.yellow,
        { lineLimit: 1 }
      );
    }
  }

  if (isPortrait) {
    const telemetryCard = card(body, 314, [8, 10, 8, 10]);
    const tHead = telemetryCard.addStack();
    tHead.centerAlignContent();
    addText(tHead, 'STORAGE & RCL · GRAFANA', Font.semiboldMonospacedSystemFont(8), C.muted, { lineLimit: 1 });
    spacer(tHead);
    addText(
      tHead,
      totalStorage > 0 ? `${formatNumber(totalStorage)} TOTAL` : `${data.rooms.length} ROOMS`,
      Font.semiboldMonospacedSystemFont(8),
      C.cyan,
      { lineLimit: 1 }
    );
    spacer(telemetryCard, 6);
    if (!data.rooms.length) {
      addText(telemetryCard, '等待 Grafana Memory.stats 同步', Font.systemFont(11), C.muted);
    } else {
      data.rooms.slice(0, 6).forEach((item, idx) => {
        if (idx > 0) spacer(telemetryCard, 6);
        const rRow = telemetryCard.addStack();
        rRow.centerAlignContent();
        addText(rRow, item.room, Font.boldMonospacedSystemFont(10), C.text, { lineLimit: 1 });
        spacer(rRow, 6);
        const rclLabel = item.rcl ? `R${item.rcl}` : 'R-';
        addText(rRow, rclLabel, Font.semiboldMonospacedSystemFont(8), C.badgeText, { lineLimit: 1 });
        spacer(rRow, 6);
        const rclRatio = Number.isFinite(item.rclPercent) ? Math.max(0, Math.min(1, item.rclPercent / 100)) : 0;
        bar(rRow, rclRatio, item.rcl >= 8 ? C.green : C.cyan, 82, 4);
        spacer(rRow);
        const stor = Number.isFinite(item.storageEnergy) ? `仓${formatNumber(item.storageEnergy)}` : '—';
        const spn = Number.isFinite(item.energyCapacity)
          ? ` ⚡${formatNumber(item.energyAvailable || 0)}/${formatNumber(item.energyCapacity)}`
          : '';
        addText(rRow, `${stor}${spn}`, Font.mediumMonospacedSystemFont(8), C.muted, {
          lineLimit: 1,
          scale: 0.75,
        });
      });
    }
    spacer(telemetryCard, 6);
    const tFoot = telemetryCard.addStack();
    tFoot.centerAlignContent();
    addText(
      tFoot,
      data.hasGrafanaStats ? 'SOURCE · MEMORY.STATS' : 'SOURCE · MEMORY.HISTORY',
      Font.semiboldMonospacedSystemFont(8),
      C.muted,
      { lineLimit: 1 }
    );
    spacer(tFoot);
    addText(
      tFoot,
      `GCL ${data.gclLevel} (${Math.round(data.gclRatio * 100)}%)`,
      Font.semiboldMonospacedSystemFont(8),
      C.yellow,
      { lineLimit: 1 }
    );
  }

  spacer(widget);
};

const renderAccessory = (widget, cfg, data) => {
  widget.setPadding(0, 0, 0, 0);
  const pct = Math.round(data.ratio * 100);
  if (F === 'accessoryInline') {
    addText(widget, `SCREEPS · CPU ${pct}% · GCL ${data.gclLevel}`, Font.semiboldMonospacedSystemFont(11), C.accessory, {
      lineLimit: 1,
      scale: 0.7,
    });
    return;
  }
  if (F === 'accessoryCircular') {
    addCircularProgress(widget, pct, {
      size: 60,
      thickness: 5,
      progressColor: C.accessory,
      trackColor: Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.24)),
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
  addText(top, `SCREEPS · ${cfg.shard}`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1, scale: 0.75 });
  spacer(top);
  addText(top, `${pct}%`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1 });
  spacer(widget, 3);
  addText(widget, `CPU ${data.cpu.toFixed(1)}/${data.cpuLimit}`, Font.boldRoundedSystemFont(13), C.accessory, {
    lineLimit: 1,
    scale: 0.75,
  });
  spacer(widget, 3);
  bar(
    widget,
    data.ratio,
    C.accessory,
    152,
    4,
    Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.24))
  );
  spacer(widget, 3);
  addText(
    widget,
    `GCL ${data.gclLevel} · BKT ${formatNumber(data.bucket)} · ${Math.round(data.creeps)}c`,
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
      renderAccessory(widget, cfg, data);
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
  widget.setPadding(12, 12, 10, 12);

  if (!cfg.token) {
    addText(widget, 'SCREEPS', Font.boldMonospacedSystemFont(18), C.purple);
    spacer(widget, 8);
    addText(widget, '请运行脚本配置\nAuth Token 和监控房间', Font.mediumSystemFont(13), C.muted);
    widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}`;
    return widget;
  }

  let data;
  try {
    data = await loadData(cfg);
  } catch (error) {
    addText(widget, 'SCREEPS', Font.boldMonospacedSystemFont(16), C.purple);
    spacer(widget, 8);
    addText(widget, '数据暂时不可用', Font.mediumSystemFont(14), C.red);
    addText(widget, error.message?.slice(0, 40) || '请检查配置', Font.systemFont(10), C.muted);
    return widget;
  }

  if (F === 'small') renderSmall(widget, cfg, data);
  else if (isLargeFamily(F)) renderLarge(widget, cfg, data, F);
  else renderMedium(widget, cfg, data);

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
  Script.setWidget(widget);
  if (!config.runsInWidget) {
    await presentWidgetPreviews(widget, ['small', 'medium', 'large']);
    Script.complete();
  }
};

await run();
