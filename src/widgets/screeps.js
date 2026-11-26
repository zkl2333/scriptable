import { createUpdater } from '../lib/updater.js';
import { attachMenuURL, presentWidgetPreviews, runWidgetMenu, shouldShowWidgetMenu } from '../lib/widget-menu.js';
import { addLinearProgress, applyTransparentBackground, attachStackAction, isLargeFamily } from '../lib/widget-v18.js';

// Screeps 运营面板：紫蓝仪表盘风格。
// 数据：官方 HTTP API + bot Memory.history（CPU 平均）。凭证只存 Scriptable Keychain。
const updater = createUpdater({ scriptId: __SCRIPT_ID__, version: __SCRIPT_VERSION__, updateURL: __UPDATE_URL__ });
if (!config.runsInWidget) await updater.autoUpdate();

const ID = 'screeps';
const KC_TOKEN = `${ID}.token`;
const KC_SHARD = `${ID}.shard`;
const KC_ROOMS = `${ID}.rooms`;
const BASE_URL = 'https://screeps.com/api';
const F = config.widgetFamily || 'medium';
const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const C = {
  bg: dyn('#f5f2fa', '#101020'), panel: dyn('#ffffff', '#201040'), line: dyn('#e6e0ef', '#302050'),
  text: dyn('#241b35', '#f0ecf7'), muted: dyn('#766d82', '#aaa0b8'), purple: dyn('#7351a3', '#8060b0'),
  cyan: dyn('#197d87', '#4ecdc4'), yellow: dyn('#a66a00', '#ffe66d'), red: dyn('#c43c52', '#ff7185'), green: dyn('#19764f', '#65d6a2'),
};

const getConfig = () => ({ token: Keychain.get(KC_TOKEN), shard: Keychain.get(KC_SHARD) || 'shard2', rooms: (Keychain.get(KC_ROOMS) || '').split(',').map((x) => x.trim()).filter(Boolean) });
const api = async (path, params = {}) => {
  const url = `${BASE_URL}/${path}`;
  const request = new Request(url);
  request.headers = { 'X-Token': params.token, 'X-Username': params.token };
  request.timeoutInterval = 8;
  return await request.loadJSON();
};
const memory = async (key, cfg) => api(`user/memory?path=${encodeURIComponent(key)}&shard=${encodeURIComponent(cfg.shard)}`, cfg);
const formatMoney = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n || 0)}`;
const formatNumber = (n) => Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n || 0)}`;
const latestAverage = (data, fallback = null) => data?.['10']?.currentValues?.length ? data['10'].currentValues.at(-1) : data?.['1']?.currentValues?.at(-1) ?? fallback;
const progress = (value, total) => Math.max(0, Math.min(1, (value || 0) / (total || 1)));
const addText = (p, text, font, color = C.text, options = {}) => { const n = p.addText(String(text)); n.font = font; n.textColor = color; if (options.lineLimit) n.lineLimit = options.lineLimit; if (options.scale) n.minimumScaleFactor = options.scale; return n; };
const spacer = (p, n = 0) => p.addSpacer(n);
const bar = (p, value, color = C.purple, width = 100) => addLinearProgress(p, value * 100, {
  width,
  thickness: 5,
  progressColor: color,
  trackColor: C.line,
  fallback: () => {
    const s = p.addStack(); s.size = new Size(width, 5); s.cornerRadius = 3; s.backgroundColor = C.line;
    const fill = s.addStack(); fill.size = new Size(Math.max(3, width * Math.max(0, Math.min(1, value))), 5); fill.cornerRadius = 3; fill.backgroundColor = color;
    return s;
  },
});
const card = (p) => { const s = p.addStack(); s.backgroundColor = C.panel; s.cornerRadius = 10; s.setPadding(8, 9, 8, 9); return s; };
const metric = (p, label, value, color) => { const s = card(p); addText(s, label.toUpperCase(), Font.mediumSystemFont(8), C.muted); spacer(s, 3); addText(s, value, Font.boldSystemFont(18), color, { scale: true }); return s; };

const configure = async () => {
  const alert = new Alert(); alert.title = '配置 Screeps'; alert.message = '输入 Auth Token、Shard 和监控房间（逗号分隔）。';
  alert.addTextField('Auth Token', Keychain.get(KC_TOKEN) || ''); alert.addTextField('Shard', Keychain.get(KC_SHARD) || 'shard2'); alert.addTextField('房间', Keychain.get(KC_ROOMS) || ''); alert.addAction('保存'); alert.addCancelAction('取消');
  if (await alert.present() < 0) return false;
  const token = alert.textFieldValue(0).trim(); if (!token) return false;
  Keychain.set(KC_TOKEN, token); Keychain.set(KC_SHARD, alert.textFieldValue(1).trim() || 'shard2'); Keychain.set(KC_ROOMS, alert.textFieldValue(2).trim()); return true;
};

const loadData = async (cfg) => {
  const me = await api('auth/me', cfg);
  const [cpu, ratio, bucket, creeps, rooms] = await Promise.all([
    memory('history.cpu_total', cfg), memory('history.cpu_ratio', cfg), memory('history.bucket', cfg), memory('history.creeps', cfg),
    cfg.rooms.length ? Promise.all(cfg.rooms.map((room) => api(`game/room-overview?room=${encodeURIComponent(room)}&interval=8&shard=${cfg.shard}`, cfg).then((data) => ({ room, ...data })).catch(() => ({ room, totals: {} })))) : Promise.resolve([]),
  ]);
  return { me, cpu: latestAverage(cpu, 0), ratio: latestAverage(ratio, 0), bucket: latestAverage(bucket, 0), creeps: latestAverage(creeps, 0), rooms };
};

const render = async () => {
  const widget = new ListWidget(); widget.backgroundColor = C.bg; applyTransparentBackground(widget, __SCRIPT_ID__); widget.setPadding(12, 12, 10, 12);
  const cfg = getConfig();
  if (!cfg.token) { addText(widget, 'SCREEPS', Font.boldSystemFont(18), C.purple); spacer(widget, 8); addText(widget, '请运行脚本配置\nAuth Token 和监控房间', Font.mediumSystemFont(13), C.muted); widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}`; return widget; }
  let data; try { data = await loadData(cfg); } catch (error) { addText(widget, 'SCREEPS', Font.boldSystemFont(16), C.purple); spacer(widget, 8); addText(widget, '数据暂时不可用', Font.mediumSystemFont(14), C.red); addText(widget, error.message?.slice(0, 40) || '请检查配置', Font.systemFont(10), C.muted); return widget; }
  const status = data.ratio > 0.9 || data.bucket < 1000 ? C.red : data.ratio > 0.75 || data.bucket < 5000 ? C.yellow : C.green;
  const header = widget.addStack(); header.centerAlignContent(); addText(header, 'SCREEPS', Font.boldSystemFont(14), C.purple); spacer(header); const right = header.addStack(); right.centerAlignContent(); addText(right, cfg.shard, Font.mediumSystemFont(9), C.muted); spacer(right, 6); const dot = right.addText('●'); dot.font = Font.boldSystemFont(13); dot.textColor = status; attachStackAction(right, '刷新 Screeps 面板', 'refresh');
  spacer(widget, 8);
  const gcl = data.me.gcl || {}; const gclRatio = progress(gcl.progress, gcl.progressTotal);
  const gclRow = widget.addStack(); gclRow.centerAlignContent(); addText(gclRow, `GCL ${gcl.level || 0}`, Font.boldSystemFont(16), C.text); spacer(gclRow, 8); bar(gclRow, gclRatio, C.yellow, 62); spacer(gclRow, 6); addText(gclRow, `${Math.round(gclRatio * 100)}%`, Font.semiboldSystemFont(11), C.yellow);
  spacer(widget, 8);
  const metrics = widget.addStack(); metrics.spacing = 7; metric(metrics, 'MONEY', formatMoney(data.me.money), C.yellow); spacer(metrics, 2); metric(metrics, 'CPU AVG', `${data.cpu.toFixed(1)}/${data.me.cpu || 0}`, C.cyan);
  spacer(widget, 8);
  if (isLargeFamily(F)) renderLarge(widget, data); else renderMedium(widget, data);
  return widget;
};
const renderMedium = (widget, data) => { addText(widget, 'ROOM ECONOMY · 8H', Font.mediumSystemFont(8), C.muted); spacer(widget, 5); if (!data.rooms.length) { addText(widget, '运行脚本配置监控房间', Font.systemFont(11), C.muted); } data.rooms.slice(0, 3).forEach(({ room, totals = {} }) => { const row = widget.addStack(); row.centerAlignContent(); addText(row, room, Font.semiboldSystemFont(10), C.text, { scale: true }); spacer(row); addText(row, `⚡${formatNumber(totals.energyHarvested)}  🔨${formatNumber(totals.energyConstruction)}  ↻${formatNumber(totals.energyCreeps)}  ↑${formatNumber(totals.energyControl)}`, Font.systemFont(9), C.muted, { scale: true }); }); spacer(widget); addText(widget, `CPU ${(data.ratio * 100).toFixed(0)}%  ·  bucket ${formatNumber(data.bucket)}  ·  ${Math.round(data.creeps)} creeps`, Font.systemFont(8), C.muted, { scale: true }); };
const renderLarge = (widget, data) => { const cpu = widget.addStack(); cpu.centerAlignContent(); addText(cpu, 'CPU LOAD', Font.mediumSystemFont(8), C.muted); spacer(cpu); addText(cpu, `${(data.ratio * 100).toFixed(0)}%`, Font.semiboldSystemFont(11), C.cyan); spacer(widget, 5); bar(widget, data.ratio, C.cyan, 180); spacer(widget, 8); addText(widget, 'ROOM ECONOMY · 8H', Font.mediumSystemFont(8), C.muted); spacer(widget, 5); data.rooms.forEach(({ room, totals = {} }) => { addText(widget, room, Font.semiboldSystemFont(10), C.text); const row = widget.addStack(); row.spacing = 5; addText(row, `⚡ ${formatNumber(totals.energyHarvested)}`, Font.systemFont(9), C.yellow); addText(row, `🔨 ${formatNumber(totals.energyConstruction)}`, Font.systemFont(9), C.text); addText(row, `↻ ${formatNumber(totals.energyCreeps)}`, Font.systemFont(9), C.cyan); addText(row, `↑ ${formatNumber(totals.energyControl)}`, Font.systemFont(9), C.green); spacer(widget, 4); }); addText(widget, `bucket ${formatNumber(data.bucket)}  ·  ${Math.round(data.creeps)} creeps`, Font.systemFont(9), C.muted); };

const run = async () => { if (shouldShowWidgetMenu()) { await runWidgetMenu({ title: 'Screeps', actions: [{ title: '刷新预览', handler: async () => {} }, { title: '重新配置', handler: configure }, { title: '检查更新', handler: () => updater.checkForUpdate({ notify: true }) }] }); return; } const widget = await render(); Script.setWidget(widget); if (!config.runsInWidget) { await presentWidgetPreviews(widget, ['medium', 'large']); Script.complete(); } };
await run();
