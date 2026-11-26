// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: gamepad;
// @script-id screeps
// @version 1.0.0

// src/lib/updater.js
var DEFAULT_CHECK_INTERVAL = 24 * 3600;
var UPDATE_KEY_PREFIX = "zkl2333.widgetUpdater";
var compareVersions = (left, right) => {
  const leftParts = String(left).split(".").map((part) => Number(part) || 0);
  const rightParts = String(right).split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let i = 0; i < length; i++) {
    const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
};
var readMetadata = (source) => ({
  scriptId: source.match(/@script-id\s+([a-z0-9-]+)/i)?.[1],
  version: source.match(/@version\s+([0-9]+(?:\.[0-9]+){1,2})/)?.[1]
});
var getTargetFileManager = (filePath) => {
  try {
    const iCloud = FileManager.iCloud();
    if (iCloud.isFileStoredIniCloud(filePath)) return iCloud;
  } catch {
  }
  return FileManager.local();
};
var saveBackup = (scriptId, source) => {
  const local = FileManager.local();
  const backupDir = local.joinPath(local.libraryDirectory(), "widget-update-backups");
  if (!local.fileExists(backupDir)) local.createDirectory(backupDir, true);
  local.writeString(local.joinPath(backupDir, `${scriptId}.js.bak`), source);
};
var createUpdater = ({
  scriptId,
  version,
  updateURL,
  checkInterval = DEFAULT_CHECK_INTERVAL
}) => {
  const checkedAtKey = `${UPDATE_KEY_PREFIX}.${scriptId}.checkedAt`;
  const checkForUpdate2 = async ({ force = false } = {}) => {
    const lastCheckedAt = Keychain.contains(checkedAtKey) ? Number(Keychain.get(checkedAtKey)) : 0;
    const now = Math.floor(Date.now() / 1e3);
    if (!force && now - lastCheckedAt < checkInterval) return null;
    Keychain.set(checkedAtKey, String(now));
    const request = new Request(`${updateURL}?t=${Date.now()}`);
    request.timeoutInterval = 10;
    const source = await request.loadString();
    const metadata = readMetadata(source);
    if (metadata.scriptId !== scriptId) {
      throw new Error(`更新文件标识不匹配：${metadata.scriptId || "missing"}`);
    }
    if (!metadata.version) throw new Error("更新文件缺少版本号");
    if (source.length < 200) throw new Error("更新文件内容不完整");
    if (compareVersions(metadata.version, version) <= 0) return null;
    return { source, version: metadata.version };
  };
  const applyUpdateIfAny = async ({ interactive = false, force = interactive } = {}) => {
    const update = await checkForUpdate2({ force });
    if (!update) return false;
    if (interactive) {
      const alert = new Alert();
      alert.title = `发现新版本 v${update.version}`;
      alert.message = `是否更新 ${Script.name()}？`;
      alert.addAction("更新");
      alert.addCancelAction("取消");
      if (await alert.presentAlert() !== 0) return false;
    }
    const targetPath = module.filename;
    if (!targetPath) throw new Error("无法定位当前脚本文件");
    const fileManager = getTargetFileManager(targetPath);
    saveBackup(scriptId, fileManager.readString(targetPath));
    fileManager.writeString(targetPath, update.source);
    return true;
  };
  const autoUpdate = async () => {
    if (config.runsInApp && config.runsInActionExtension) return false;
    try {
      return await applyUpdateIfAny();
    } catch {
      return false;
    }
  };
  return { applyUpdateIfAny, autoUpdate, checkForUpdate: checkForUpdate2 };
};

// src/lib/widget-v18.js
var STYLE_KEY_PREFIX = "zkl2333.widgetStyle";
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var ALL_PREVIEW_FAMILIES = [
  "small",
  "medium",
  "large",
  "extraLarge",
  "extraLargePortrait",
  ...ACCESSORY_FAMILIES
];
var isLargeFamily = (family) => family === "large" || family === "extraLarge" || family === "extraLargePortrait";
var clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));
var supportsProgress = (target) => typeof target?.addProgress === "function";
var transparentKey = (scriptId) => `${STYLE_KEY_PREFIX}.${scriptId}.transparent`;
var parameterRequestsTransparent = () => {
  if (typeof args === "undefined" || !args?.widgetParameter) return false;
  const raw = String(args.widgetParameter).trim().toLowerCase();
  if (!raw) return false;
  return raw.split(/[\s,;|]+/).some((token) => token === "transparent" || token === "透明" || token === "bg=transparent");
};
var isTransparentEnabled = (scriptId) => {
  if (parameterRequestsTransparent()) return true;
  if (!scriptId || typeof Keychain === "undefined") return false;
  try {
    return Keychain.contains(transparentKey(scriptId)) && Keychain.get(transparentKey(scriptId)) === "1";
  } catch {
    return false;
  }
};
var setTransparentEnabled = (scriptId, enabled) => {
  if (!scriptId || typeof Keychain === "undefined") return false;
  const key = transparentKey(scriptId);
  if (enabled) {
    Keychain.set(key, "1");
    return true;
  }
  if (Keychain.contains(key)) Keychain.remove(key);
  return false;
};
var toggleTransparentBackground = (scriptId) => {
  const next = !isTransparentEnabled(scriptId);
  setTransparentEnabled(scriptId, next);
  return next;
};
var applyTransparentBackground = (widget, scriptId, { isAccessory = false, force = null } = {}) => {
  if (!widget || isAccessory) return false;
  const enabled = force === null ? isTransparentEnabled(scriptId) : Boolean(force);
  if (!enabled) return false;
  widget.backgroundStyle = "transparent";
  widget.backgroundColor = null;
  widget.backgroundGradient = null;
  widget.backgroundImage = null;
  return true;
};
var attachStackAction = (stack, title, id) => {
  if (!stack || typeof stack.setAction !== "function" || !id) return false;
  stack.setAction(title || id, { id: String(id) });
  return true;
};
var addLinearProgress = (parent, percent, {
  width = 120,
  thickness = 6,
  progressColor,
  trackColor,
  fallback
} = {}) => {
  const clamped = clampPercent(percent);
  if (supportsProgress(parent)) {
    const bar2 = parent.addProgress(clamped, {
      style: "linear",
      progressColor,
      trackColor,
      thickness
    });
    if (width > 0) bar2.size = new Size(width, thickness);
    return bar2;
  }
  return typeof fallback === "function" ? fallback(clamped) : null;
};

// src/lib/widget-menu.js
var showMessage = async (title, message) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("好");
  await alert.presentAlert();
};
var checkForUpdate = async ({ updater: updater2, version }) => {
  try {
    const update = await updater2.checkForUpdate({ force: true });
    if (!update) {
      await showMessage("已是最新", `当前 v${version}`);
      return false;
    }
    const confirm = new Alert();
    confirm.title = `发现新版本 v${update.version}`;
    confirm.message = `是否更新 ${Script.name()}？`;
    confirm.addAction("更新");
    confirm.addCancelAction("取消");
    if (await confirm.presentAlert() !== 0) return false;
    const updated = await updater2.applyUpdateIfAny({ force: true });
    if (!updated) {
      await showMessage("更新未完成", "远端版本已变化，请重新检查。");
      return false;
    }
    await showMessage("更新完成", "脚本已更新，请重新运行。");
    return true;
  } catch (error) {
    await showMessage("检查失败", String(error));
    return false;
  }
};
var shouldShowWidgetMenu = () => config.runsInApp && !config.runsWithSiri && !config.runsInActionExtension;
var PREVIEW_DEFINITIONS = {
  small: { label: "小尺寸 Small", method: "presentSmall", group: "home" },
  medium: { label: "中尺寸 Medium", method: "presentMedium", group: "home" },
  large: { label: "大尺寸 Large", method: "presentLarge", group: "home" },
  extraLarge: {
    label: "超大尺寸 Extra Large（iPad）",
    method: "presentExtraLarge",
    group: "home"
  },
  extraLargePortrait: {
    label: "竖屏超大 Extra Large Portrait",
    method: "presentExtraLargePortrait",
    group: "home"
  },
  accessoryInline: {
    label: "锁屏单行 Inline",
    method: "presentAccessoryInline",
    group: "accessory"
  },
  accessoryCircular: {
    label: "锁屏圆形 Circular",
    method: "presentAccessoryCircular",
    group: "accessory"
  },
  accessoryRectangular: {
    label: "锁屏矩形 Rectangular",
    method: "presentAccessoryRectangular",
    group: "accessory"
  }
};
var getPreviewDefinition = (family) => {
  const definition = PREVIEW_DEFINITIONS[family];
  if (!definition) throw new RangeError(`不支持的组件尺寸：${family}`);
  return definition;
};
var normalizePreviewFamilies = (families) => {
  if (!Array.isArray(families)) throw new TypeError("预览尺寸必须是数组");
  const uniqueFamilies = [...new Set(families)];
  uniqueFamilies.forEach(getPreviewDefinition);
  return uniqueFamilies;
};
var isPreviewAvailable = (family) => {
  if (family === "extraLarge") {
    return typeof Device !== "undefined" && typeof Device.isPad === "function" && Device.isPad();
  }
  if (family === "extraLargePortrait") {
    return typeof ListWidget !== "undefined" && typeof ListWidget.prototype?.presentExtraLargePortrait === "function";
  }
  return true;
};
var presentWidget = async (widget, family = "medium") => {
  const { method } = getPreviewDefinition(family);
  if (typeof widget?.[method] !== "function") {
    throw new TypeError(`当前 Scriptable 不支持 ${family} 预览`);
  }
  return widget[method]();
};
var DEFAULT_PREVIEW_FAMILIES = ["small", "medium", "large", "extraLarge"];
var selectPreviewFamilies = async (families) => {
  const availableFamilies = normalizePreviewFamilies(families).filter(isPreviewAvailable);
  if (availableFamilies.length === 0) {
    await showMessage("无法预览", "当前设备不支持此组件提供的尺寸。");
    return null;
  }
  const choices = availableFamilies.map((family) => ({
    label: getPreviewDefinition(family).label,
    families: [family]
  }));
  const homeFamilies = availableFamilies.filter(
    (family) => getPreviewDefinition(family).group === "home"
  );
  const accessoryFamilies = availableFamilies.filter(
    (family) => getPreviewDefinition(family).group === "accessory"
  );
  if (homeFamilies.length > 0 && accessoryFamilies.length > 0) {
    choices.push(
      { label: "全部主屏 Home Screen", families: homeFamilies },
      { label: "全部锁屏 Lock Screen", families: accessoryFamilies }
    );
  }
  if (availableFamilies.length > 1) {
    choices.push({ label: "全部尺寸 All", families: availableFamilies });
  }
  const alert = new Alert();
  alert.title = "预览组件";
  alert.message = "选择一个尺寸，或按类别连续预览";
  choices.forEach((choice) => alert.addAction(choice.label));
  alert.addCancelAction("取消操作");
  const index = await alert.presentSheet();
  return choices[index]?.families || null;
};
var presentWidgetPreviews = async (createWidget, families) => {
  const previewFamilies = normalizePreviewFamilies(families);
  const presented = [];
  const failures = [];
  for (const family of previewFamilies) {
    try {
      await presentWidget(await createWidget(family), family);
      presented.push(family);
    } catch (error) {
      failures.push({ family, error });
    }
  }
  if (failures.length > 0) {
    const message = failures.map(({ family, error }) => `${getPreviewDefinition(family).label}：${String(error)}`).join("\n");
    await showMessage(
      failures.length === previewFamilies.length ? "预览失败" : "部分预览失败",
      message
    );
  }
  return { presented, failures };
};
var runWidgetMenu = async ({
  title,
  message = "",
  version,
  updater: updater2,
  actions = [],
  previewFamilies = DEFAULT_PREVIEW_FAMILIES,
  scriptId = null
}) => {
  const hasTransparentToggle = Boolean(scriptId);
  const transparentOn = hasTransparentToggle ? isTransparentEnabled(scriptId) : false;
  const alert = new Alert();
  alert.title = title;
  alert.message = message || `当前版本 v${version}`;
  alert.addAction("预览组件");
  actions.forEach((action) => alert.addAction(action.title));
  if (hasTransparentToggle) {
    alert.addAction(`透明背景：${transparentOn ? "已开启" : "未开启"}`);
  }
  alert.addAction("检查更新");
  alert.addCancelAction("取消操作");
  const index = await alert.presentSheet();
  if (index === -1) return null;
  if (index === 0) {
    const families = await selectPreviewFamilies(previewFamilies);
    return families ? { action: "preview", families } : null;
  }
  const actionIndex = index - 1;
  if (actionIndex < actions.length) return { action: actions[actionIndex].id };
  if (hasTransparentToggle && actionIndex === actions.length) {
    const enabled = toggleTransparentBackground(scriptId);
    await showMessage(
      enabled ? "已开启透明背景" : "已关闭透明背景",
      enabled ? "需 Scriptable 1.8 与 iOS/iPadOS 27.2+；返回主屏幕刷新后生效。" : "已恢复组件默认背景样式；返回主屏幕刷新后生效。"
    );
    return null;
  }
  await checkForUpdate({ updater: updater2, version });
  return null;
};

// src/widgets/screeps.js
var updater = createUpdater({ scriptId: "screeps", version: "1.0.0", updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/screeps.js" });
if (!config.runsInWidget) await updater.autoUpdate();
var ID = "screeps";
var KC_TOKEN = `${ID}.token`;
var KC_SHARD = `${ID}.shard`;
var KC_ROOMS = `${ID}.rooms`;
var BASE_URL = "https://screeps.com/api";
var F = config.widgetFamily || "medium";
var dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
var C = {
  bg: dyn("#f5f2fa", "#101020"),
  panel: dyn("#ffffff", "#201040"),
  line: dyn("#e6e0ef", "#302050"),
  text: dyn("#241b35", "#f0ecf7"),
  muted: dyn("#766d82", "#aaa0b8"),
  purple: dyn("#7351a3", "#8060b0"),
  cyan: dyn("#197d87", "#4ecdc4"),
  yellow: dyn("#a66a00", "#ffe66d"),
  red: dyn("#c43c52", "#ff7185"),
  green: dyn("#19764f", "#65d6a2")
};
var getConfig = () => ({ token: Keychain.get(KC_TOKEN), shard: Keychain.get(KC_SHARD) || "shard2", rooms: (Keychain.get(KC_ROOMS) || "").split(",").map((x) => x.trim()).filter(Boolean) });
var api = async (path, params = {}) => {
  const url = `${BASE_URL}/${path}`;
  const request = new Request(url);
  request.headers = { "X-Token": params.token, "X-Username": params.token };
  request.timeoutInterval = 8;
  return await request.loadJSON();
};
var memory = async (key, cfg) => api(`user/memory?path=${encodeURIComponent(key)}&shard=${encodeURIComponent(cfg.shard)}`, cfg);
var formatMoney = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n || 0)}`;
var formatNumber = (n) => Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n || 0)}`;
var latestAverage = (data, fallback = null) => data?.["10"]?.currentValues?.length ? data["10"].currentValues.at(-1) : data?.["1"]?.currentValues?.at(-1) ?? fallback;
var progress = (value, total) => Math.max(0, Math.min(1, (value || 0) / (total || 1)));
var addText = (p, text, font, color = C.text, options = {}) => {
  const n = p.addText(String(text));
  n.font = font;
  n.textColor = color;
  if (options.lineLimit) n.lineLimit = options.lineLimit;
  if (options.scale) n.minimumScaleFactor = options.scale;
  return n;
};
var spacer = (p, n = 0) => p.addSpacer(n);
var bar = (p, value, color = C.purple, width = 100) => addLinearProgress(p, value * 100, {
  width,
  thickness: 5,
  progressColor: color,
  trackColor: C.line,
  fallback: () => {
    const s = p.addStack();
    s.size = new Size(width, 5);
    s.cornerRadius = 3;
    s.backgroundColor = C.line;
    const fill = s.addStack();
    fill.size = new Size(Math.max(3, width * Math.max(0, Math.min(1, value))), 5);
    fill.cornerRadius = 3;
    fill.backgroundColor = color;
    return s;
  }
});
var card = (p) => {
  const s = p.addStack();
  s.backgroundColor = C.panel;
  s.cornerRadius = 10;
  s.setPadding(8, 9, 8, 9);
  return s;
};
var metric = (p, label, value, color) => {
  const s = card(p);
  addText(s, label.toUpperCase(), Font.mediumSystemFont(8), C.muted);
  spacer(s, 3);
  addText(s, value, Font.boldSystemFont(18), color, { scale: true });
  return s;
};
var configure = async () => {
  const alert = new Alert();
  alert.title = "配置 Screeps";
  alert.message = "输入 Auth Token、Shard 和监控房间（逗号分隔）。";
  alert.addTextField("Auth Token", Keychain.get(KC_TOKEN) || "");
  alert.addTextField("Shard", Keychain.get(KC_SHARD) || "shard2");
  alert.addTextField("房间", Keychain.get(KC_ROOMS) || "");
  alert.addAction("保存");
  alert.addCancelAction("取消");
  if (await alert.present() < 0) return false;
  const token = alert.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(KC_TOKEN, token);
  Keychain.set(KC_SHARD, alert.textFieldValue(1).trim() || "shard2");
  Keychain.set(KC_ROOMS, alert.textFieldValue(2).trim());
  return true;
};
var loadData = async (cfg) => {
  const me = await api("auth/me", cfg);
  const [cpu, ratio, bucket, creeps, rooms] = await Promise.all([
    memory("history.cpu_total", cfg),
    memory("history.cpu_ratio", cfg),
    memory("history.bucket", cfg),
    memory("history.creeps", cfg),
    cfg.rooms.length ? Promise.all(cfg.rooms.map((room) => api(`game/room-overview?room=${encodeURIComponent(room)}&interval=8&shard=${cfg.shard}`, cfg).then((data) => ({ room, ...data })).catch(() => ({ room, totals: {} })))) : Promise.resolve([])
  ]);
  return { me, cpu: latestAverage(cpu, 0), ratio: latestAverage(ratio, 0), bucket: latestAverage(bucket, 0), creeps: latestAverage(creeps, 0), rooms };
};
var render = async () => {
  const widget = new ListWidget();
  widget.backgroundColor = C.bg;
  applyTransparentBackground(widget, "screeps");
  widget.setPadding(12, 12, 10, 12);
  const cfg = getConfig();
  if (!cfg.token) {
    addText(widget, "SCREEPS", Font.boldSystemFont(18), C.purple);
    spacer(widget, 8);
    addText(widget, "请运行脚本配置\nAuth Token 和监控房间", Font.mediumSystemFont(13), C.muted);
    widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}`;
    return widget;
  }
  let data;
  try {
    data = await loadData(cfg);
  } catch (error) {
    addText(widget, "SCREEPS", Font.boldSystemFont(16), C.purple);
    spacer(widget, 8);
    addText(widget, "数据暂时不可用", Font.mediumSystemFont(14), C.red);
    addText(widget, error.message?.slice(0, 40) || "请检查配置", Font.systemFont(10), C.muted);
    return widget;
  }
  const status = data.ratio > 0.9 || data.bucket < 1e3 ? C.red : data.ratio > 0.75 || data.bucket < 5e3 ? C.yellow : C.green;
  const header = widget.addStack();
  header.centerAlignContent();
  addText(header, "SCREEPS", Font.boldSystemFont(14), C.purple);
  spacer(header);
  const right = header.addStack();
  right.centerAlignContent();
  addText(right, cfg.shard, Font.mediumSystemFont(9), C.muted);
  spacer(right, 6);
  const dot = right.addText("●");
  dot.font = Font.boldSystemFont(13);
  dot.textColor = status;
  attachStackAction(right, "刷新 Screeps 面板", "refresh");
  spacer(widget, 8);
  const gcl = data.me.gcl || {};
  const gclRatio = progress(gcl.progress, gcl.progressTotal);
  const gclRow = widget.addStack();
  gclRow.centerAlignContent();
  addText(gclRow, `GCL ${gcl.level || 0}`, Font.boldSystemFont(16), C.text);
  spacer(gclRow, 8);
  bar(gclRow, gclRatio, C.yellow, 62);
  spacer(gclRow, 6);
  addText(gclRow, `${Math.round(gclRatio * 100)}%`, Font.semiboldSystemFont(11), C.yellow);
  spacer(widget, 8);
  const metrics = widget.addStack();
  metrics.spacing = 7;
  metric(metrics, "MONEY", formatMoney(data.me.money), C.yellow);
  spacer(metrics, 2);
  metric(metrics, "CPU AVG", `${data.cpu.toFixed(1)}/${data.me.cpu || 0}`, C.cyan);
  spacer(widget, 8);
  if (isLargeFamily(F)) renderLarge(widget, data);
  else renderMedium(widget, data);
  return widget;
};
var renderMedium = (widget, data) => {
  addText(widget, "ROOM ECONOMY · 8H", Font.mediumSystemFont(8), C.muted);
  spacer(widget, 5);
  if (!data.rooms.length) {
    addText(widget, "运行脚本配置监控房间", Font.systemFont(11), C.muted);
  }
  data.rooms.slice(0, 3).forEach(({ room, totals = {} }) => {
    const row = widget.addStack();
    row.centerAlignContent();
    addText(row, room, Font.semiboldSystemFont(10), C.text, { scale: true });
    spacer(row);
    addText(row, `⚡${formatNumber(totals.energyHarvested)}  🔨${formatNumber(totals.energyConstruction)}  ↻${formatNumber(totals.energyCreeps)}  ↑${formatNumber(totals.energyControl)}`, Font.systemFont(9), C.muted, { scale: true });
  });
  spacer(widget);
  addText(widget, `CPU ${(data.ratio * 100).toFixed(0)}%  ·  bucket ${formatNumber(data.bucket)}  ·  ${Math.round(data.creeps)} creeps`, Font.systemFont(8), C.muted, { scale: true });
};
var renderLarge = (widget, data) => {
  const cpu = widget.addStack();
  cpu.centerAlignContent();
  addText(cpu, "CPU LOAD", Font.mediumSystemFont(8), C.muted);
  spacer(cpu);
  addText(cpu, `${(data.ratio * 100).toFixed(0)}%`, Font.semiboldSystemFont(11), C.cyan);
  spacer(widget, 5);
  bar(widget, data.ratio, C.cyan, 180);
  spacer(widget, 8);
  addText(widget, "ROOM ECONOMY · 8H", Font.mediumSystemFont(8), C.muted);
  spacer(widget, 5);
  data.rooms.forEach(({ room, totals = {} }) => {
    addText(widget, room, Font.semiboldSystemFont(10), C.text);
    const row = widget.addStack();
    row.spacing = 5;
    addText(row, `⚡ ${formatNumber(totals.energyHarvested)}`, Font.systemFont(9), C.yellow);
    addText(row, `🔨 ${formatNumber(totals.energyConstruction)}`, Font.systemFont(9), C.text);
    addText(row, `↻ ${formatNumber(totals.energyCreeps)}`, Font.systemFont(9), C.cyan);
    addText(row, `↑ ${formatNumber(totals.energyControl)}`, Font.systemFont(9), C.green);
    spacer(widget, 4);
  });
  addText(widget, `bucket ${formatNumber(data.bucket)}  ·  ${Math.round(data.creeps)} creeps`, Font.systemFont(9), C.muted);
};
var run = async () => {
  if (shouldShowWidgetMenu()) {
    await runWidgetMenu({ title: "Screeps", actions: [{ title: "刷新预览", handler: async () => {
    } }, { title: "重新配置", handler: configure }, { title: "检查更新", handler: () => updater.checkForUpdate({ notify: true }) }] });
    return;
  }
  const widget = await render();
  Script.setWidget(widget);
  if (!config.runsInWidget) {
    await presentWidgetPreviews(widget, ["medium", "large"]);
    Script.complete();
  }
};
await run();
