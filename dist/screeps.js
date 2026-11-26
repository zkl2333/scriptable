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
var applyTransparentBackground = (widget, scriptId, { isAccessory: isAccessory2 = false, force = null } = {}) => {
  if (!widget || isAccessory2) return false;
  const enabled = force === null ? isTransparentEnabled(scriptId) : Boolean(force);
  if (!enabled) return false;
  widget.backgroundStyle = "transparent";
  widget.backgroundColor = null;
  widget.backgroundGradient = null;
  widget.backgroundImage = null;
  return true;
};
var addRefreshAction = (parent, {
  title = "刷新组件",
  id = "refresh",
  text = "",
  font = null,
  textColor = null,
  iconColor = null,
  iconSize = 10,
  backgroundColor = null,
  cornerRadius = 0,
  padding = null
} = {}) => {
  const stack = parent.addStack();
  stack.centerAlignContent();
  if (backgroundColor) stack.backgroundColor = backgroundColor;
  if (cornerRadius) stack.cornerRadius = cornerRadius;
  if (padding) stack.setPadding(padding[0], padding[1], padding[2], padding[3]);
  if (text) {
    const label = stack.addText(text);
    if (font) label.font = font;
    if (textColor) label.textColor = textColor;
    label.lineLimit = 1;
    label.minimumScaleFactor = 0.72;
  }
  if (typeof stack.setAction === "function") {
    if (text) stack.addSpacer(4);
    const symbol = SFSymbol.named("arrow.clockwise");
    if (symbol?.image) {
      const icon = stack.addImage(symbol.image);
      icon.imageSize = new Size(iconSize, iconSize);
      if (iconColor || textColor) icon.tintColor = iconColor || textColor;
    }
    stack.setAction(title, { id });
  }
  return stack;
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
var addCircularProgress = (parent, percent, {
  size = 40,
  thickness = 5,
  progressColor,
  trackColor,
  buildCenter,
  fallback
} = {}) => {
  const clamped = clampPercent(percent);
  if (supportsProgress(parent)) {
    const ring = parent.addProgress(clamped, {
      style: "circular",
      progressColor,
      trackColor,
      thickness
    });
    ring.size = new Size(size, size);
    if (typeof buildCenter === "function") buildCenter(ring);
    return ring;
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
var attachMenuURL = (widget) => {
  widget.url = URLScheme.forRunningScript();
  return widget;
};
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
var updater = createUpdater({
  scriptId: "screeps",
  version: "1.0.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/screeps.js"
});
if (!config.runsInWidget) await updater.autoUpdate();
var ID = "screeps";
var KC_TOKEN = `${ID}.token`;
var KC_SHARD = `${ID}.shard`;
var KC_ROOMS = `${ID}.rooms`;
var BASE_URL = "https://screeps.com/api";
var F = config.widgetFamily || "medium";
var isAccessory = ACCESSORY_FAMILIES.includes(F);
var dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
var C = {
  bgTop: dyn("#F7F8FC", "#101020"),
  bgBottom: dyn("#ECEFF7", "#16182C"),
  pill: dyn("#E7E9F4", "#201040"),
  surface: dyn("#FFFFFF", "#181A30"),
  line: dyn("#DCE1EE", "#282B48"),
  text: dyn("#141724", "#F1F3FA"),
  sub: dyn("#4A5268", "#AEB6CC"),
  muted: dyn("#7E879D", "#767F98"),
  purple: dyn("#65469E", "#8060b0"),
  pillText: dyn("#593B93", "#C4A8F5"),
  cyan: dyn("#0E8A85", "#4ecdc4"),
  yellow: dyn("#B87300", "#ffe66d"),
  red: dyn("#C9364B", "#FF6E7F"),
  green: dyn("#158054", "#58D69B"),
  accessory: dyn("#111111", "#FFFFFF"),
  accessoryTrack: Color.dynamic(new Color("#111111", 0.2), new Color("#FFFFFF", 0.24))
};
var getConfig = () => ({
  token: Keychain.get(KC_TOKEN),
  shard: (Keychain.get(KC_SHARD) || "").trim(),
  rooms: (Keychain.get(KC_ROOMS) || "").split(",").map((x) => x.trim()).filter(Boolean)
});
var api = async (path, params = {}) => {
  const url = `${BASE_URL}/${path}`;
  const request = new Request(url);
  request.headers = { "X-Token": params.token, "X-Username": params.token };
  request.timeoutInterval = 8;
  return await request.loadJSON();
};
var memory = async (key, shard, cfg) => api(`user/memory?path=${encodeURIComponent(key)}&shard=${encodeURIComponent(shard)}`, cfg);
var formatMoney = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v)}`;
};
var formatCompact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return `${Math.round(v)}`;
};
var shortShard = (name) => {
  const m = String(name || "").match(/^shard(\w+)$/i);
  return m ? `S${m[1].toUpperCase()}` : String(name || "").toUpperCase();
};
var latestAverage = (data, fallback = null) => data?.["10"]?.currentValues?.length ? data["10"].currentValues.at(-1) : data?.["1"]?.currentValues?.at(-1) ?? fallback;
var extractSeries = (data) => {
  const fine = data?.["1"]?.currentValues;
  const medium = data?.["10"]?.currentValues;
  const prev = data?.["10"]?.previousValues;
  const combined = [
    ...Array.isArray(prev) ? prev.slice(-6) : [],
    ...Array.isArray(medium) ? medium : [],
    ...Array.isArray(fine) ? fine.slice(-8) : []
  ].filter((v) => Number.isFinite(Number(v)));
  return combined.slice(-16).map(Number);
};
var sumSeries = (seriesList, fallbackVal) => {
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
var progress = (value, total) => Math.max(0, Math.min(1, (Number(value) || 0) / (Number(total) || 1)));
var addText = (p, text, font, color = C.text, options = {}) => {
  const n = p.addText(String(text));
  n.font = font;
  n.textColor = color;
  if (options.lineLimit) n.lineLimit = options.lineLimit;
  if (options.scale) n.minimumScaleFactor = options.scale;
  if (options.align === "center") n.centerAlignText();
  if (options.align === "right") n.rightAlignText();
  return n;
};
var addHDivider = (parent) => {
  const line = parent.addStack();
  line.backgroundColor = C.line;
  line.size = new Size(0, 1);
  return line;
};
var addVDivider = (parent, height = 56) => {
  const line = parent.addStack();
  line.backgroundColor = C.line;
  line.size = new Size(1, height);
  return line;
};
var bar = (p, value, color = C.cyan, width = 100, thickness = 4, trackColor = C.line) => addLinearProgress(p, value * 100, {
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
  }
});
var makeEmblem = () => {
  const size = 14;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  const isDark = typeof Device !== "undefined" && Device.isUsingDarkAppearance ? Device.isUsingDarkAppearance() : true;
  const color = isDark ? "#4ecdc4" : "#0E8A85";
  const r = 5.4;
  const cx = size / 2;
  const cy = size / 2;
  const hex = new Path();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 3 * i - Math.PI / 2;
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
var makeSparkline = (series, limit, width, height) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  const isDark = typeof Device !== "undefined" && Device.isUsingDarkAppearance ? Device.isUsingDarkAppearance() : true;
  const strokeHex = isDark ? "#4ecdc4" : "#0E8A85";
  const limitHex = isDark ? "#8060b0" : "#7E879D";
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
    x: padX + innerW * idx / Math.max(1, pts.length - 1),
    y: padY + innerH * (1 - Math.max(0, Math.min(1, (v - minVal) / span)))
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
var configure = async () => {
  const alert = new Alert();
  alert.title = "配置 Screeps 帝国面板";
  alert.message = "填入 Auth Token 即自动识别所有活跃 Shard 与房间；也可手动覆盖分片（逗号分隔）。";
  alert.addTextField("Auth Token", Keychain.get(KC_TOKEN) || "");
  alert.addTextField("Shards（留空自动发现，如 shard2,shard3,shardX）", Keychain.get(KC_SHARD) || "");
  alert.addTextField("房间（留空自动获取，可用 shard2:E43N29 格式）", Keychain.get(KC_ROOMS) || "");
  alert.addAction("保存");
  alert.addCancelAction("取消");
  if (await alert.present() < 0) return false;
  const token = alert.textFieldValue(0).trim();
  if (!token) return false;
  Keychain.set(KC_TOKEN, token);
  Keychain.set(KC_SHARD, alert.textFieldValue(1).trim());
  Keychain.set(KC_ROOMS, alert.textFieldValue(2).trim());
  return true;
};
var parseManualRooms = (entries, fallbackShard) => {
  const byShard = {};
  for (const raw of entries) {
    if (raw.includes(":")) {
      const [s, r] = raw.split(":").map((x) => x.trim());
      if (s && r) (byShard[s] || (byShard[s] = [])).push(r);
    } else if (raw) {
      (byShard[fallbackShard] || (byShard[fallbackShard] = [])).push(raw);
    }
  }
  return byShard;
};
var loadData = async (cfg) => {
  const me = await api("auth/me", cfg);
  const [userRoomsRes, shardInfoRes] = await Promise.all([
    me?._id ? api(`user/rooms?id=${encodeURIComponent(me._id)}`, cfg).catch(() => null) : Promise.resolve(null),
    api("game/shards/info", cfg).catch(() => null)
  ]);
  const cpuMap = me?.cpuShard || {};
  const apiRoomsByShard = userRoomsRes?.shards || {};
  const manualShards = cfg.shard && cfg.shard.toLowerCase() !== "auto" ? cfg.shard.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const discovered = new Set(manualShards);
  if (!discovered.size) {
    Object.entries(cpuMap).forEach(([s, v]) => {
      if (Number(v) > 0) discovered.add(s);
    });
    Object.entries(apiRoomsByShard).forEach(([s, list]) => {
      if (Array.isArray(list) && list.length > 0) discovered.add(s);
    });
  }
  if (!discovered.size) discovered.add("shard2");
  const activeShards = [...discovered].sort((a, b) => (Number(cpuMap[b]) || 0) - (Number(cpuMap[a]) || 0));
  const manualRoomsMap = parseManualRooms(cfg.rooms, activeShards[0]);
  const shardTickMap = {};
  (shardInfoRes?.shards || []).forEach((s) => {
    if (s?.name) shardTickMap[s.name] = s.tick;
  });
  const shardDetails = await Promise.all(
    activeShards.map(async (shardName) => {
      const [cpuRes, limitRes, bucketRes, deltaRes, creepsRes, statsRes] = await Promise.all([
        memory("history.cpu_total", shardName, cfg).catch(() => null),
        memory("history.cpu_limit", shardName, cfg).catch(() => null),
        memory("history.bucket", shardName, cfg).catch(() => null),
        memory("history.bucket_delta", shardName, cfg).catch(() => null),
        memory("history.creeps", shardName, cfg).catch(() => null),
        memory("stats", shardName, cfg).catch(() => null)
      ]);
      const rawStats = statsRes?.data && typeof statsRes.data === "object" ? statsRes.data : statsRes;
      const gStats = rawStats && typeof rawStats === "object" && ("cpu.used" in rawStats || "gcl.level" in rawStats) ? rawStats : null;
      const cpuVal = gStats?.["cpu.used"] ?? latestAverage(cpuRes, 0);
      const limitVal = gStats?.["cpu.limit"] ?? latestAverage(limitRes, null) ?? cpuMap[shardName] ?? me?.cpu ?? 20;
      const bucketVal = gStats?.["cpu.bucket"] ?? latestAverage(bucketRes, 0);
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
        hasGrafanaStats: Boolean(gStats)
      };
    })
  );
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
        rcl: gStats ? gStats[`${prefix}controllerLevel`] : void 0,
        rclPercent: gStats ? gStats[`${prefix}controllerProgressPercent`] : void 0,
        storageEnergy: gStats ? gStats[`${prefix}storageEnergy`] : void 0,
        terminalEnergy: gStats ? gStats[`${prefix}terminalEnergy`] : void 0,
        energyAvailable: gStats ? gStats[`${prefix}energyAvailable`] : void 0,
        energyCapacity: gStats ? gStats[`${prefix}energyCapacityAvailable`] : void 0
      };
    })
  );
  const primaryStats = shardDetails.find((s) => s.gStats)?.gStats || null;
  rooms.sort(
    (a, b) => (b.totals?.energyHarvested || 0) + (b.totals?.energyControl || 0) - ((a.totals?.energyHarvested || 0) + (a.totals?.energyControl || 0))
  );
  const totalCpu = shardDetails.reduce((sum, s) => sum + s.cpu, 0);
  const sumShardLimits = shardDetails.reduce((sum, s) => sum + s.cpuLimit, 0);
  const totalLimit = Number(me?.cpu) || sumShardLimits || 100;
  const totalCreeps = shardDetails.reduce((sum, s) => sum + s.creeps, 0);
  const minBucket = shardDetails.length ? Math.min(...shardDetails.map((s) => s.bucket)) : 0;
  const gclLevel = primaryStats?.["gcl.level"] ?? me?.gcl?.level ?? 0;
  const gclRatio = primaryStats && Number.isFinite(primaryStats["gcl.progressPercent"]) ? Math.max(0, Math.min(1, primaryStats["gcl.progressPercent"] / 100)) : progress(me?.gcl?.progress, me?.gcl?.progressTotal);
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
    hasGrafanaStats: shardDetails.some((s) => s.hasGrafanaStats)
  };
};
var statusColor = (ratio, bucket = 1e4) => ratio > 0.9 || bucket < 1e3 ? C.red : ratio > 0.75 || bucket < 5e3 ? C.yellow : C.cyan;
var addHeader = (widget, data, compact = false) => {
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(makeEmblem());
  icon.imageSize = new Size(compact ? 12 : 14, compact ? 12 : 14);
  header.addSpacer(5);
  addText(header, "Screeps", Font.semiboldSystemFont(compact ? 12 : 13), C.text, { lineLimit: 1 });
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
    title: "刷新 Screeps 面板",
    id: "refresh",
    text: compact ? `${data.shards.length}S` : `${Math.round(data.ratio * 100)}%`,
    font: Font.semiboldMonospacedSystemFont(compact ? 9 : 10),
    textColor: statusColor(data.ratio, data.bucket),
    iconColor: C.muted,
    iconSize: 10,
    backgroundColor: C.pill,
    cornerRadius: 7,
    padding: [3, 7, 3, 7]
  });
  return right;
};
var addInfoCell = (parent, label, value, color = C.text) => {
  const cell = parent.addStack();
  cell.layoutVertically();
  addText(cell, label, Font.systemFont(9), C.muted, { lineLimit: 1 });
  cell.addSpacer(2);
  addText(cell, value, Font.semiboldRoundedSystemFont(13), color, { lineLimit: 1, scale: 0.75 });
  return cell;
};
var addShardRow = (parent, s, barW = 54, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  addText(row, shortShard(s.shard), Font.boldMonospacedSystemFont(compact ? 9 : 10), C.sub, { lineLimit: 1 });
  row.addSpacer(5);
  bar(row, s.ratio, statusColor(s.ratio, s.bucket), barW, 3);
  row.addSpacer();
  const limitLabel = s.cpuLimit > 0 ? `/${Math.round(s.cpuLimit)}` : "";
  addText(row, `${s.cpu.toFixed(compact ? 0 : 1)}${limitLabel}`, Font.semiboldMonospacedSystemFont(compact ? 9 : 10), C.text, {
    lineLimit: 1,
    scale: 0.8
  });
};
var addRoomLine = (parent, item, wide = false) => {
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
      lineLimit: 1
    });
  } else {
    addText(row, `+${harvest}  ↑${control}`, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
  }
};
var renderSmall = (widget, data) => {
  addHeader(widget, data, true);
  widget.addSpacer(6);
  const hero = widget.addStack();
  hero.centerAlignContent();
  addText(hero, data.cpu.toFixed(1), Font.boldRoundedSystemFont(21), C.cyan, { lineLimit: 1, scale: 0.7 });
  hero.addSpacer(3);
  addText(hero, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(11), C.muted, { lineLimit: 1 });
  hero.addSpacer();
  addText(hero, `${Math.round(data.ratio * 100)}%`, Font.semiboldMonospacedSystemFont(10), statusColor(data.ratio, data.bucket), {
    lineLimit: 1
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
    lineLimit: 1
  });
};
var renderMedium = (widget, data) => {
  addHeader(widget, data, false);
  widget.addSpacer(8);
  const main = widget.addStack();
  main.centerAlignContent();
  const left = main.addStack();
  left.layoutVertically();
  left.size = new Size(150, 0);
  const cpuHead = left.addStack();
  cpuHead.centerAlignContent();
  addText(cpuHead, "帝国 CPU", Font.systemFont(10), C.muted, { lineLimit: 1 });
  cpuHead.addSpacer();
  addText(cpuHead, `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`, Font.mediumSystemFont(9), C.yellow, {
    lineLimit: 1
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
  const right = main.addStack();
  right.layoutVertically();
  right.size = new Size(134, 0);
  const shHead = right.addStack();
  shHead.centerAlignContent();
  addText(shHead, "分片负载", Font.systemFont(10), C.muted, { lineLimit: 1 });
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
  const strip = widget.addStack();
  addInfoCell(strip, "信用点", formatMoney(data.credits), C.yellow);
  strip.addSpacer();
  addInfoCell(strip, "最低 Bucket", formatCompact(data.bucket), statusColor(data.ratio, data.bucket));
  strip.addSpacer();
  addInfoCell(strip, "全军 Creeps", `${Math.round(data.creeps)}`, C.text);
  strip.addSpacer();
  addInfoCell(strip, "控制房间", `${data.totalRooms}`, C.cyan);
};
var renderLarge = (widget, data, family = "large") => {
  const isXL = family === "extraLarge";
  const isPortrait = family === "extraLargePortrait";
  addHeader(widget, data, false);
  widget.addSpacer(10);
  const gclRow = widget.addStack();
  gclRow.centerAlignContent();
  addText(gclRow, `GCL ${data.gclLevel}`, Font.boldRoundedSystemFont(15), C.text, { lineLimit: 1 });
  gclRow.addSpacer(10);
  bar(gclRow, data.gclRatio, C.yellow, isXL ? 540 : 196, 5);
  gclRow.addSpacer(10);
  addText(gclRow, `${Math.round(data.gclRatio * 100)}%`, Font.semiboldMonospacedSystemFont(11), C.yellow, {
    lineLimit: 1
  });
  widget.addSpacer(10);
  addHDivider(widget);
  widget.addSpacer(10);
  const strip = widget.addStack();
  addInfoCell(strip, "帝国 CPU", `${data.cpu.toFixed(1)}/${data.cpuLimit}`, C.cyan);
  strip.addSpacer();
  addInfoCell(strip, "信用点", formatMoney(data.credits), C.yellow);
  strip.addSpacer();
  addInfoCell(strip, "最低 Bucket", formatCompact(data.bucket), statusColor(data.ratio, data.bucket));
  strip.addSpacer();
  addInfoCell(strip, "全军 Creeps", `${Math.round(data.creeps)}`, C.text);
  widget.addSpacer(10);
  addHDivider(widget);
  widget.addSpacer(10);
  const body = widget.addStack();
  if (!isXL) body.layoutVertically();
  const leftW = isXL ? 326 : 310;
  const chartH = isXL ? 86 : isPortrait ? 104 : 62;
  const telemetry = body.addStack();
  telemetry.layoutVertically();
  telemetry.size = new Size(leftW, 0);
  const tHead = telemetry.addStack();
  tHead.centerAlignContent();
  addText(tHead, "CPU 趋势 · GRAFANA", Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  tHead.addSpacer();
  addText(tHead, `${Math.round(data.ratio * 100)}% LOAD`, Font.semiboldMonospacedSystemFont(10), C.cyan, {
    lineLimit: 1
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
      lineLimit: 1
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
  const rightW = isXL ? 334 : 310;
  const roomsCol = body.addStack();
  roomsCol.layoutVertically();
  roomsCol.size = new Size(rightW, 0);
  const rHead = roomsCol.addStack();
  rHead.centerAlignContent();
  addText(rHead, "跨 Shard 房间 · 8H", Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  rHead.addSpacer();
  addText(rHead, `${data.totalRooms} ROOMS`, Font.mediumMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  roomsCol.addSpacer(6);
  const maxRooms = isPortrait ? 8 : isXL ? 7 : 4;
  if (!data.rooms.length) {
    addText(roomsCol, "运行脚本配置或同步房间数据", Font.systemFont(11), C.muted);
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
      lineLimit: 1
    });
    rFoot.addSpacer();
    addText(rFoot, data.hasGrafanaStats ? "Grafana 已同步" : "History 模式", Font.systemFont(9), C.muted, {
      lineLimit: 1
    });
  }
  if (isPortrait) {
    widget.addSpacer(12);
    addHDivider(widget);
    widget.addSpacer(10);
    const gHead = widget.addStack();
    gHead.centerAlignContent();
    addText(gHead, "RCL 进度与储能 · GRAFANA", Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
    gHead.addSpacer();
    if (totalStorage > 0) {
      addText(gHead, `仓 ${formatCompact(totalStorage)}`, Font.semiboldMonospacedSystemFont(9), C.cyan, {
        lineLimit: 1
      });
    }
    widget.addSpacer(8);
    data.rooms.slice(0, 8).forEach((item, idx) => {
      if (idx > 0) widget.addSpacer(7);
      const rRow = widget.addStack();
      rRow.centerAlignContent();
      addText(rRow, `${shortShard(item.shard)} ${item.room}`, Font.semiboldMonospacedSystemFont(10), C.text, {
        lineLimit: 1
      });
      rRow.addSpacer(8);
      const rclRatio = Number.isFinite(item.rclPercent) ? Math.max(0, Math.min(1, item.rclPercent / 100)) : 0;
      bar(rRow, rclRatio, item.rcl >= 8 ? C.green : C.cyan, 86, 4);
      rRow.addSpacer();
      const cap = Number.isFinite(item.energyCapacity) ? `⚡${formatCompact(item.energyAvailable || 0)}/${formatCompact(item.energyCapacity)}` : "";
      const stor = Number.isFinite(item.storageEnergy) ? `仓${formatCompact(item.storageEnergy)}` : "";
      addText(rRow, [stor, cap].filter(Boolean).join(" · ") || "—", Font.regularMonospacedSystemFont(9), C.sub, {
        lineLimit: 1
      });
    });
  }
  widget.addSpacer();
};
var renderAccessory = (widget, data) => {
  widget.setPadding(0, 0, 0, 0);
  const pct = Math.round(data.ratio * 100);
  if (F === "accessoryInline") {
    addText(
      widget,
      `SCREEPS · CPU ${pct}% · ${data.shards.length}S/${data.totalRooms}R`,
      Font.semiboldMonospacedSystemFont(11),
      C.accessory,
      { lineLimit: 1, scale: 0.7 }
    );
    return;
  }
  if (F === "accessoryCircular") {
    addCircularProgress(widget, pct, {
      size: 60,
      thickness: 5,
      progressColor: C.accessory,
      trackColor: C.accessoryTrack,
      buildCenter: (ring) => {
        addText(ring, `${pct}%`, Font.boldRoundedSystemFont(13), C.accessory, { align: "center", lineLimit: 1 });
        addText(ring, "CPU", Font.semiboldMonospacedSystemFont(7), C.accessory, { align: "center", lineLimit: 1 });
      },
      fallback: () => {
        addText(widget, `${pct}%`, Font.boldRoundedSystemFont(14), C.accessory, { align: "center" });
      }
    });
    return;
  }
  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(5, 8, 5, 8);
  const top = widget.addStack();
  top.centerAlignContent();
  addText(top, `SCREEPS · ${data.shards.length} SHARDS`, Font.boldMonospacedSystemFont(9), C.accessory, {
    lineLimit: 1,
    scale: 0.75
  });
  top.addSpacer();
  addText(top, `${pct}%`, Font.boldMonospacedSystemFont(9), C.accessory, { lineLimit: 1 });
  widget.addSpacer(3);
  addText(widget, `CPU ${data.cpu.toFixed(1)}/${data.cpuLimit}`, Font.boldRoundedSystemFont(13), C.accessory, {
    lineLimit: 1,
    scale: 0.75
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
var render = async () => {
  const widget = new ListWidget();
  const cfg = getConfig();
  if (isAccessory) {
    if (!cfg.token) {
      widget.setPadding(4, 6, 4, 6);
      addText(widget, "SCREEPS · 未配置", Font.semiboldMonospacedSystemFont(10), C.accessory, {
        lineLimit: 1,
        scale: 0.7
      });
      return widget;
    }
    try {
      const data2 = await loadData(cfg);
      renderAccessory(widget, data2);
    } catch {
      widget.setPadding(4, 6, 4, 6);
      addText(widget, "SCREEPS · 离线", Font.semiboldMonospacedSystemFont(10), C.accessory, { lineLimit: 1 });
    }
    return widget;
  }
  const grad = new LinearGradient();
  grad.colors = [C.bgTop, C.bgBottom];
  grad.locations = [0, 1];
  grad.startPoint = new Point(0, 0);
  grad.endPoint = new Point(1, 1);
  widget.backgroundGradient = grad;
  applyTransparentBackground(widget, "screeps");
  widget.setPadding(14, 14, 12, 14);
  if (!cfg.token) {
    addText(widget, "Screeps", Font.boldRoundedSystemFont(18), C.cyan);
    widget.addSpacer(8);
    addText(widget, "运行脚本配置 Auth Token\n即可自动识别跨 Shard 帝国", Font.mediumSystemFont(12), C.muted);
    widget.url = `scriptable:///run?scriptName=${encodeURIComponent(Script.name())}`;
    return widget;
  }
  let data;
  try {
    data = await loadData(cfg);
  } catch (error) {
    addText(widget, "Screeps", Font.boldRoundedSystemFont(16), C.cyan);
    widget.addSpacer(8);
    addText(widget, "数据暂时不可用", Font.mediumSystemFont(14), C.red);
    addText(widget, error.message?.slice(0, 40) || "请检查配置", Font.systemFont(10), C.muted);
    return widget;
  }
  if (F === "small") renderSmall(widget, data);
  else if (isLargeFamily(F)) renderLarge(widget, data, F);
  else renderMedium(widget, data);
  return attachMenuURL(widget);
};
var run = async () => {
  if (shouldShowWidgetMenu()) {
    await runWidgetMenu({
      title: "Screeps",
      actions: [
        { title: "刷新预览", handler: async () => {
        } },
        { title: "重新配置", handler: configure },
        { title: "检查更新", handler: () => updater.checkForUpdate({ notify: true }) }
      ]
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
