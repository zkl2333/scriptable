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
    const bar = parent.addProgress(clamped, {
      style: "linear",
      progressColor,
      trackColor,
      thickness
    });
    if (width > 0) bar.size = new Size(width, thickness);
    return bar;
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
var presentWidgetPreviews = async (createWidget2, families) => {
  const previewFamilies = normalizePreviewFamilies(families);
  const presented = [];
  const failures = [];
  for (const family of previewFamilies) {
    try {
      await presentWidget(await createWidget2(family), family);
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
var SNAPSHOT_TTL_MS = 3 * 60 * 1e3;
var ALERT_TTL_MS = 60 * 1e3;
var DIRECTORY_TTL_MS = 30 * 60 * 1e3;
var ROOM_TTL_MS = 4 * 60 * 1e3;
var ROOM_BATCH_SIZE = 3;
var ROOM_BATCH_DELAY_MS = 80;
var REFRESH_INTERVAL_MS = 15 * 60 * 1e3;
var DEFAULT_COOLDOWN_MS = 3 * 60 * 1e3;
var dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
var C = {
  bgTop: dyn("#F2F4F9", "#0B0D18"),
  bgBottom: dyn("#E6EBF4", "#101020"),
  tile: dyn("#FFFFFF", "#16192B"),
  tileDeep: dyn("#EEF1F8", "#201040"),
  tileBorder: Color.dynamic(new Color("#0F172A", 0.06), new Color("#FFFFFF", 0.07)),
  divider: Color.dynamic(new Color("#0F172A", 0.08), new Color("#FFFFFF", 0.08)),
  track: Color.dynamic(new Color("#CBD5E1", 0.55), new Color("#FFFFFF", 0.1)),
  text: dyn("#0F172A", "#F4F6FB"),
  sub: dyn("#475569", "#A8B3C9"),
  muted: dyn("#64748B", "#6F7B94"),
  purple: dyn("#6D4DB5", "#8060b0"),
  pillBg: Color.dynamic(new Color("#6D4DB5", 0.12), new Color("#8060b0", 0.24)),
  pillText: dyn("#5A38A3", "#C8B0F8"),
  cyan: dyn("#0D9488", "#4ecdc4"),
  cyanBg: Color.dynamic(new Color("#0D9488", 0.12), new Color("#4ecdc4", 0.16)),
  yellow: dyn("#B4690E", "#ffe66d"),
  yellowBg: Color.dynamic(new Color("#D97706", 0.13), new Color("#ffe66d", 0.16)),
  green: dyn("#0F8A5F", "#34D399"),
  greenBg: Color.dynamic(new Color("#0F8A5F", 0.13), new Color("#34D399", 0.16)),
  red: dyn("#DC2626", "#FB7185"),
  redBg: Color.dynamic(new Color("#DC2626", 0.13), new Color("#FB7185", 0.18)),
  accessory: dyn("#111111", "#FFFFFF"),
  accessoryTrack: Color.dynamic(new Color("#111111", 0.2), new Color("#FFFFFF", 0.24))
};
var isDarkMode = () => typeof Device !== "undefined" && typeof Device.isUsingDarkAppearance === "function" ? Device.isUsingDarkAppearance() : true;
var readKeychain = (key) => {
  try {
    return Keychain.contains(key) ? String(Keychain.get(key) ?? "") : "";
  } catch {
    return "";
  }
};
var writeKeychain = (key, value) => {
  if (value) Keychain.set(key, value);
  else if (Keychain.contains(key)) Keychain.remove(key);
};
var getConfig = () => ({
  token: readKeychain(KC_TOKEN).trim(),
  shard: readKeychain(KC_SHARD).trim(),
  rooms: readKeychain(KC_ROOMS).split(",").map((x) => x.trim()).filter(Boolean)
});
var cacheSignature = (cfg) => `${String(cfg.token || "").slice(-8)}|${cfg.shard}|${cfg.rooms.join(",")}`;
var getCacheFile = () => {
  if (typeof FileManager === "undefined") return null;
  try {
    const fm = FileManager.local();
    const dir = fm.joinPath(fm.libraryDirectory(), "screeps-cache");
    if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
    return { fm, path: fm.joinPath(dir, "state-v2.json") };
  } catch {
    return null;
  }
};
var readCache = (sig) => {
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
var writeCache = (sig, patch) => {
  const handle = getCacheFile();
  if (!handle) return;
  try {
    const prev = readCache(sig);
    const next = { ...prev, ...patch, sig };
    handle.fm.writeString(handle.path, JSON.stringify(next));
  } catch {
  }
};
var sleep = (ms) => new Promise((resolve) => {
  if (typeof Timer !== "undefined" && typeof Timer.schedule === "function") {
    Timer.schedule(ms, false, resolve);
  } else {
    setTimeout(resolve, ms);
  }
});
var mapInBatches = async (items, size, delayMs, worker) => {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    const chunk = items.slice(i, i + size);
    const part = await Promise.all(chunk.map(worker));
    results.push(...part);
  }
  return results;
};
var headerValue = (headers, name) => {
  if (!headers || typeof headers !== "object") return void 0;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return void 0;
};
var computeRetryAfterMs = (response, body) => {
  const headers = response?.headers;
  const retryAfter = Number(headerValue(headers, "retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(15 * 60 * 1e3, Math.max(60 * 1e3, retryAfter * 1e3));
  }
  const resetSec = Number(headerValue(headers, "x-ratelimit-reset"));
  if (Number.isFinite(resetSec) && resetSec > 0) {
    const diff = resetSec * 1e3 - Date.now();
    if (diff > 5e3) return Math.min(15 * 60 * 1e3, Math.max(60 * 1e3, diff + 3e3));
  }
  const bodyWait = Number(body?.retryAfter);
  if (Number.isFinite(bodyWait) && bodyWait > 0) {
    return Math.min(15 * 60 * 1e3, Math.max(60 * 1e3, bodyWait));
  }
  return DEFAULT_COOLDOWN_MS;
};
var rateState = { remaining: null, resetAt: 0 };
var api = async (path, params = {}) => {
  const url = `${BASE_URL}/${path}`;
  const request = new Request(url);
  request.headers = { "X-Token": params.token, "X-Username": params.token };
  request.timeoutInterval = 8;
  const body = await request.loadJSON();
  const status = Number(request.response?.statusCode || body?.statusCode || 200);
  const headers = request.response?.headers;
  const remRaw = headerValue(headers, "x-ratelimit-remaining");
  if (remRaw !== void 0 && Number.isFinite(Number(remRaw))) {
    rateState.remaining = Number(remRaw);
  }
  const resetRaw = headerValue(headers, "x-ratelimit-reset");
  if (resetRaw !== void 0 && Number.isFinite(Number(resetRaw))) {
    rateState.resetAt = Number(resetRaw) * 1e3;
  }
  const errMsg = String(body?.error || "").toLowerCase();
  if (status === 429 || errMsg.includes("rate")) {
    const err = new Error("Screeps API 触发限流");
    err.isRateLimit = true;
    err.retryAfterMs = computeRetryAfterMs(request.response, body);
    throw err;
  }
  if (status >= 500) {
    throw new Error(`Screeps HTTP ${status}`);
  }
  return body;
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
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
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
  line.backgroundColor = C.divider;
  line.size = new Size(0, 1);
  return line;
};
var bento = (parent, width, height = 0, padding = [10, 11, 10, 11], radius = 12) => {
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
var pill = (parent, text, fg, bg, fontSize = 8, pad = [2, 5, 2, 5]) => {
  const p = parent.addStack();
  p.centerAlignContent();
  p.backgroundColor = bg;
  p.cornerRadius = 5;
  p.setPadding(pad[0], pad[1], pad[2], pad[3]);
  addText(p, text, Font.semiboldMonospacedSystemFont(fontSize), fg, { lineLimit: 1 });
  return p;
};
var statusColor = (ratio, bucket = 1e4) => ratio > 0.9 || bucket < 1e3 ? C.red : ratio > 0.75 || bucket < 5e3 ? C.yellow : C.cyan;
var statusHex = (ratio, bucket = 1e4) => {
  const dark = isDarkMode();
  if (ratio > 0.9 || bucket < 1e3) return dark ? "#FB7185" : "#DC2626";
  if (ratio > 0.75 || bucket < 5e3) return dark ? "#ffe66d" : "#D97706";
  return dark ? "#4ecdc4" : "#0D9488";
};
var drawIcon = (kind, hex, size = 11) => {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const col = new Color(hex);
  const c = size / 2;
  if (kind === "hex") {
    const r = size * 0.42;
    const hexPath = new Path();
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI / 3 * i - Math.PI / 2;
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
  } else if (kind === "nuke") {
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.2);
    ctx.strokeEllipse(new Rect(1.4, 1.4, size - 2.8, size - 2.8));
    ctx.setFillColor(col);
    ctx.fillEllipse(new Rect(c - 1.5, c - 1.5, 3, 3));
    for (let i = 0; i < 3; i += 1) {
      const a = Math.PI * 2 * i / 3 - Math.PI / 2;
      const x = c + Math.cos(a) * (size * 0.27);
      const y = c + Math.sin(a) * (size * 0.27);
      ctx.fillEllipse(new Rect(x - 0.9, y - 0.9, 1.8, 1.8));
    }
  } else if (kind === "shield") {
    const p = new Path();
    p.move(new Point(c, 1.1));
    p.addLine(new Point(size - 1.6, 2.7));
    p.addLine(new Point(size - 2, size * 0.58));
    p.addLine(new Point(c, size - 1));
    p.addLine(new Point(2, size * 0.58));
    p.addLine(new Point(1.6, 2.7));
    p.closeSubpath();
    ctx.addPath(p);
    ctx.setFillColor(new Color(hex, 0.22));
    ctx.fillPath();
    ctx.addPath(p);
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.2);
    ctx.strokePath();
  } else if (kind === "bolt") {
    const p = new Path();
    p.move(new Point(c + 0.8, 1));
    p.addLine(new Point(2.2, c + 0.7));
    p.addLine(new Point(c + 0.2, c + 0.7));
    p.addLine(new Point(c - 1, size - 1));
    p.addLine(new Point(size - 2.2, c - 0.7));
    p.addLine(new Point(c - 0.2, c - 0.7));
    p.closeSubpath();
    ctx.addPath(p);
    ctx.setFillColor(col);
    ctx.fillPath();
  } else if (kind === "coin") {
    const p = new Path();
    p.move(new Point(c, 1.2));
    p.addLine(new Point(size - 1.5, c));
    p.addLine(new Point(c, size - 1.2));
    p.addLine(new Point(1.5, c));
    p.closeSubpath();
    ctx.addPath(p);
    ctx.setFillColor(new Color(hex, 0.24));
    ctx.fillPath();
    ctx.addPath(p);
    ctx.setStrokeColor(col);
    ctx.setLineWidth(1.2);
    ctx.strokePath();
  }
  return ctx.getImage();
};
var drawCpuArc = (ratio, bucket, size = 60, thickness = 5.5) => {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const dark = isDarkMode();
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
      const rad = (startDeg + degSpan * i / steps) * Math.PI / 180;
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
  drawArc(sweepDeg, dark ? new Color("#FFFFFF", 0.1) : new Color("#0F172A", 0.1), thickness);
  const accentHex = statusHex(ratio, bucket);
  drawArc(sweepDeg * clamped, new Color(accentHex), thickness);
  const endRad = (startDeg + sweepDeg * clamped) * Math.PI / 180;
  const ex = cx + r * Math.cos(endRad);
  const ey = cy + r * Math.sin(endRad);
  ctx.setFillColor(new Color(accentHex));
  ctx.fillEllipse(new Rect(ex - thickness / 2, ey - thickness / 2, thickness, thickness));
  const pctStr = `${Math.round((Number(ratio) || 0) * 100)}%`;
  const showSub = size >= 44;
  const fontSize = Math.round(size * (showSub ? 0.25 : 0.29));
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldRoundedSystemFont(fontSize));
  ctx.setTextColor(dark ? new Color("#F4F6FB") : new Color("#0F172A"));
  ctx.drawTextInRect(
    pctStr,
    new Rect(0, cy - fontSize * (showSub ? 0.72 : 0.58), size, fontSize * 1.25)
  );
  if (showSub) {
    const subSize = Math.max(7, Math.round(size * 0.13));
    ctx.setFont(Font.semiboldMonospacedSystemFont(subSize));
    ctx.setTextColor(dark ? new Color("#7B86A0") : new Color("#64748B"));
    ctx.drawTextInRect("LOAD", new Rect(0, cy + fontSize * 0.48, size, subSize * 1.4));
  }
  return ctx.getImage();
};
var drawSparkline = (series, limit, width, height) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const dark = isDarkMode();
  const strokeHex = dark ? "#4ecdc4" : "#0D9488";
  const limitHex = dark ? "#8060b0" : "#94A3B8";
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
    ctx.setFillColor(dark ? new Color("#FFFFFF", 0.05) : new Color("#0F172A", 0.05));
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
    x: padX + innerW * idx / Math.max(1, pts.length - 1),
    y: padY + innerH * (1 - Math.max(0, Math.min(1, (v - minVal) / span)))
  }));
  const area = new Path();
  area.move(new Point(coords[0].x, height - padY));
  coords.forEach((pt) => area.addLine(new Point(pt.x, pt.y)));
  area.addLine(new Point(coords[coords.length - 1].x, height - padY));
  area.closeSubpath();
  ctx.addPath(area);
  ctx.setFillColor(new Color(strokeHex, dark ? 0.16 : 0.11));
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
var drawBar = (value, colorHex, width, height = 4) => {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const dark = isDarkMode();
  const r = height / 2;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, height), r, r);
  ctx.addPath(track);
  ctx.setFillColor(dark ? new Color("#FFFFFF", 0.1) : new Color("#0F172A", 0.1));
  ctx.fillPath();
  const fillW = Math.max(height, Math.min(width, width * Math.max(0, Math.min(1, value))));
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, 0, fillW, height), r, r);
  ctx.addPath(fill);
  ctx.setFillColor(new Color(colorHex));
  ctx.fillPath();
  return ctx.getImage();
};
var readAlertField = (alert, index) => {
  try {
    return String(alert.textFieldValue(index) ?? "").trim();
  } catch {
    return "";
  }
};
var configure = async () => {
  const alert = new Alert();
  alert.title = "配置 Screeps 帝国面板";
  alert.message = "填入 Auth Token 即自动识别全部分片、核弹、安全模式、能量与余额。";
  alert.addTextField("Auth Token", readKeychain(KC_TOKEN));
  alert.addTextField("Shards（留空自动发现，如 shard2,shard3,shardX）", readKeychain(KC_SHARD));
  alert.addTextField("房间（留空自动获取，可用 shard2:E43N29 格式）", readKeychain(KC_ROOMS));
  alert.addAction("保存");
  alert.addCancelAction("取消");
  if (await alert.presentAlert() !== 0) return false;
  const token = readAlertField(alert, 0);
  if (!token) {
    const tip = new Alert();
    tip.title = "未保存配置";
    tip.message = "Auth Token 不能为空，请重新输入。";
    tip.addAction("好");
    await tip.presentAlert();
    return false;
  }
  writeKeychain(KC_TOKEN, token);
  writeKeychain(KC_SHARD, readAlertField(alert, 1));
  writeKeychain(KC_ROOMS, readAlertField(alert, 2));
  writeCache(cacheSignature(getConfig()), { snapshot: null, directory: null, rooms: null, cooldownUntil: 0 });
  const done = new Alert();
  done.title = "配置已保存";
  done.message = "返回主屏幕刷新组件，或点击下方立即预览。";
  done.addAction("立即预览");
  done.addCancelAction("完成");
  if (await done.presentAlert() === 0) {
    await presentWidgetPreviews(createWidget, ["medium"]);
  }
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
var parseNuker = (nuker, gameTime) => {
  if (!nuker) return null;
  const energy = Number(nuker.store?.energy ?? nuker.energy ?? 0);
  const ghodium = Number(nuker.store?.G ?? nuker.G ?? 0);
  const cdTicks = nuker.cooldownTime && gameTime ? Math.max(0, nuker.cooldownTime - gameTime) : 0;
  const ready = energy >= 3e5 && ghodium >= 5e3 && cdTicks === 0;
  const fillPct = Math.round(Math.min(1, Math.min(energy / 3e5, ghodium / 5e3)) * 100);
  return { energy, ghodium, cdTicks, ready, fillPct };
};
var parseRoomObjects = (room, shard, objectsRes, gameTime, gStats, shardIncomingNukes) => {
  const objects = Array.isArray(objectsRes?.objects) ? objectsRes.objects : [];
  const ctrl = objects.find((o) => o.type === "controller") || null;
  const storage = objects.find((o) => o.type === "storage") || null;
  const terminal = objects.find((o) => o.type === "terminal") || null;
  const nukerObj = objects.find((o) => o.type === "nuker") || null;
  const spawnsAndExt = objects.filter((o) => o.type === "spawn" || o.type === "extension");
  const prefix = `room.${room}.`;
  const storageEnergy = Number(storage?.store?.energy ?? storage?.energy ?? gStats?.[`${prefix}storageEnergy`] ?? 0);
  const terminalEnergy = Number(terminal?.store?.energy ?? terminal?.energy ?? gStats?.[`${prefix}terminalEnergy`] ?? 0);
  const energyAvail = spawnsAndExt.length ? spawnsAndExt.reduce((sum, o) => sum + Number(o.store?.energy ?? o.energy ?? 0), 0) : Number(gStats?.[`${prefix}energyAvailable`] ?? 0);
  const energyCap = spawnsAndExt.length ? spawnsAndExt.reduce((sum, o) => sum + Number(o.storeCapacityResource?.energy ?? o.energyCapacity ?? 0), 0) : Number(gStats?.[`${prefix}energyCapacityAvailable`] ?? 0);
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
    incomingNukes
  };
};
var fetchShardHistory = async (shardName, cfg) => {
  const full = await memory("history", shardName, cfg).catch(() => null);
  const root = full?.data && typeof full.data === "object" ? full.data : full;
  if (root && typeof root === "object" && ("cpu_total" in root || "bucket" in root || "creeps" in root)) {
    return root;
  }
  return null;
};
var fetchLiveData = async (cfg, cache, sig) => {
  const now = Date.now();
  const me = await api("auth/me", cfg);
  const cachedDir = cache.directory;
  const hasFreshDir = cachedDir && now - Number(cachedDir.at || 0) < DIRECTORY_TTL_MS;
  const [userRoomsRes, nukesRes] = await Promise.all([
    hasFreshDir ? Promise.resolve({ ok: 1, shards: cachedDir.shards }) : me?._id ? api(`user/rooms?id=${encodeURIComponent(me._id)}`, cfg).catch(() => null) : Promise.resolve(null),
    api("experimental/nukes", cfg).catch((err) => {
      if (err?.isRateLimit) throw err;
      return null;
    })
  ]);
  const cpuMap = me?.cpuShard || {};
  const apiRoomsByShard = userRoomsRes?.shards || cachedDir?.shards || {};
  if (!hasFreshDir && userRoomsRes?.shards) {
    writeCache(sig, { directory: { at: now, shards: userRoomsRes.shards } });
  }
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
  const shardDetails = await mapInBatches(activeShards, ROOM_BATCH_SIZE, ROOM_BATCH_DELAY_MS, async (shardName) => {
    const [hist, statsRes] = await Promise.all([
      fetchShardHistory(shardName, cfg),
      memory("stats", shardName, cfg).catch((err) => {
        if (err?.isRateLimit) throw err;
        return null;
      })
    ]);
    const rawStats = statsRes?.data && typeof statsRes.data === "object" ? statsRes.data : statsRes;
    const gStats = rawStats && typeof rawStats === "object" && ("cpu.used" in rawStats || "gcl.level" in rawStats) ? rawStats : null;
    let gameTime = Number(gStats?.time) || 0;
    if (!gameTime && (rateState.remaining === null || rateState.remaining > 6)) {
      const timeRes = await api(`game/time?shard=${encodeURIComponent(shardName)}`, cfg).catch(() => null);
      gameTime = Number(timeRes?.time) || 0;
    }
    const cpuVal = gStats?.["cpu.used"] ?? latestAverage(hist?.cpu_total, 0);
    const limitVal = gStats?.["cpu.limit"] ?? latestAverage(hist?.cpu_limit, null) ?? cpuMap[shardName] ?? me?.cpu ?? 20;
    const bucketVal = gStats?.["cpu.bucket"] ?? latestAverage(hist?.bucket, 0);
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
      hasGrafanaStats: Boolean(gStats)
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
    const urgA = (a.incomingNukes.length ? 1e3 : 0) + (a.safeModeRemaining ? 500 : 0) + (a.nuker?.ready ? 100 : 0);
    const urgB = (b.incomingNukes.length ? 1e3 : 0) + (b.safeModeRemaining ? 500 : 0) + (b.nuker?.ready ? 100 : 0);
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
  const gclLevel = primaryStats?.["gcl.level"] ?? me?.gcl?.level ?? 0;
  const gclRatio = primaryStats && Number.isFinite(primaryStats["gcl.progressPercent"]) ? Math.max(0, Math.min(1, primaryStats["gcl.progressPercent"] / 100)) : progress(me?.gcl?.progress, me?.gcl?.progressTotal);
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
    cacheNote: quotaTight ? "节流缓存" : "",
    cooldownUntil: 0
  };
  writeCache(sig, { snapshot: data, cooldownUntil: 0 });
  return data;
};
var loadData = async (cfg) => {
  const now = Date.now();
  const sig = cacheSignature(cfg);
  const cache = readCache(sig);
  const snap = cache.snapshot || null;
  const forceRefresh = typeof args !== "undefined" && args?.widgetAction?.id === "refresh";
  const cooldownUntil = Number(cache.cooldownUntil || 0);
  if (cooldownUntil > now) {
    if (snap) return { ...snap, cooldownUntil, cacheNote: "限流退避" };
    throw new Error("API 限流退避中，请稍后刷新");
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
      if (snap) return { ...snap, cooldownUntil: nextCooldown, cacheNote: "限流退避" };
    } else if (snap) {
      return { ...snap, cacheNote: "离线缓存" };
    }
    throw error;
  }
};
var addHeader = (widget, data, mode = "medium") => {
  const compact = mode === "small";
  const wide = mode === "extraLarge";
  const header = widget.addStack();
  header.centerAlignContent();
  const iconHex = data.incomingNukeCount > 0 ? "#FB7185" : isDarkMode() ? "#4ecdc4" : "#0D9488";
  const icon = header.addImage(drawIcon("hex", iconHex, compact ? 12 : 14));
  icon.imageSize = new Size(compact ? 12 : 14, compact ? 12 : 14);
  header.addSpacer(5);
  addText(header, "Screeps", Font.boldSystemFont(compact ? 12 : 13), C.text, { lineLimit: 1 });
  if (!compact) {
    header.addSpacer(6);
    const meta = data.cacheNote ? `${data.shards.length}S · ${data.cacheNote}` : wide ? `${data.shards.length} Shards · ${data.totalRooms} 房 · GCL ${data.gclLevel}` : `${data.shards.length}S · ${data.totalRooms}房`;
    addText(header, meta, Font.mediumSystemFont(10), data.cacheNote === "限流退避" ? C.yellow : C.muted, {
      lineLimit: 1
    });
  }
  header.addSpacer();
  if (!compact && data.incomingNukeCount > 0) {
    pill(header, `来袭 ${data.incomingNukeCount}`, C.red, C.redBg, 9, [2, 6, 2, 6]);
    header.addSpacer(6);
  } else if (!compact && data.activeSafeModes.length > 0) {
    const safeLabel = wide ? `安全模式 · ${data.activeSafeModes[0].room}` : `安全 · ${data.activeSafeModes[0].room}`;
    pill(header, safeLabel, C.green, C.greenBg, 9, [2, 6, 2, 6]);
    header.addSpacer(6);
  }
  addRefreshAction(header, {
    title: "刷新 Screeps 面板",
    id: "refresh",
    text: compact ? `${data.shards.length}S` : `${Math.round(data.ratio * 100)}%`,
    font: Font.semiboldMonospacedSystemFont(compact ? 9 : 10),
    textColor: statusColor(data.ratio, data.bucket),
    iconColor: C.muted,
    iconSize: 10,
    backgroundColor: C.tile,
    cornerRadius: 7,
    padding: [3, 7, 3, 7]
  });
};
var addMetricTile = (parent, { width, height, icon, iconHex, label, value, valueColor, sub, compact = false }) => {
  const tile = bento(parent, width, height, compact ? [6, 8, 6, 8] : [9, 11, 8, 11], compact ? 10 : 12);
  const top = tile.addStack();
  top.centerAlignContent();
  const img = top.addImage(drawIcon(icon, iconHex, compact ? 9 : 10));
  img.imageSize = new Size(compact ? 9 : 10, compact ? 9 : 10);
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
var addShardCompactRow = (parent, s, barW, showBucket = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const nameBox = row.addStack();
  nameBox.size = new Size(24, 0);
  addText(nameBox, shortShard(s.shard), Font.boldMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
  row.addSpacer(4);
  const barImg = row.addImage(drawBar(s.ratio, statusHex(s.ratio, s.bucket), barW, 4));
  barImg.imageSize = new Size(barW, 4);
  row.addSpacer();
  const label = showBucket ? `${s.cpu.toFixed(0)}/${Math.round(s.cpuLimit)} · ${formatCompact(s.bucket)}` : `${s.cpu.toFixed(0)}/${Math.round(s.cpuLimit)}`;
  addText(row, label, Font.semiboldMonospacedSystemFont(9), C.text, { lineLimit: 1, align: "right" });
};
var addRoomTableRow = (parent, room, maxEnergy, wide = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const colRoom = row.addStack();
  colRoom.centerAlignContent();
  colRoom.size = new Size(wide ? 96 : 86, 0);
  pill(colRoom, shortShard(room.shard), C.pillText, C.pillBg, 8, [1, 4, 1, 4]);
  colRoom.addSpacer(5);
  addText(colRoom, room.room, Font.semiboldMonospacedSystemFont(10), C.text, { lineLimit: 1 });
  colRoom.addSpacer();
  if (wide) {
    const colRcl = row.addStack();
    colRcl.size = new Size(24, 0);
    addText(colRcl, `R${room.rcl || "-"}`, Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  }
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
  const colNuke = row.addStack();
  colNuke.centerAlignContent();
  colNuke.size = new Size(wide ? 52 : 48, 0);
  if (room.incomingNukes.length > 0) {
    pill(colNuke, `来袭${room.incomingNukes.length}`, C.red, C.redBg, 8, [1, 4, 1, 4]);
  } else if (room.nuker?.ready) {
    pill(colNuke, "就绪", C.yellow, C.yellowBg, 8, [1, 5, 1, 5]);
  } else if (room.nuker) {
    addText(colNuke, `${room.nuker.fillPct}%`, Font.regularMonospacedSystemFont(9), C.sub, { lineLimit: 1 });
  } else {
    addText(colNuke, "—", Font.regularMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  }
  colNuke.addSpacer();
  row.addSpacer();
  if (wide) {
    const energyRatio = progress(room.totalEnergy, maxEnergy);
    const barImg = row.addImage(drawBar(energyRatio, isDarkMode() ? "#4ecdc4" : "#0D9488", 50, 4));
    barImg.imageSize = new Size(50, 4);
    row.addSpacer(6);
  }
  const colEnergy = row.addStack();
  colEnergy.size = new Size(52, 0);
  addText(colEnergy, formatCompact(room.totalEnergy), Font.semiboldMonospacedSystemFont(10), C.cyan, {
    lineLimit: 1,
    scale: 0.85,
    align: "right"
  });
};
var renderSmall = (widget, data) => {
  const dark = isDarkMode();
  addHeader(widget, data, "small");
  widget.addSpacer(6);
  const cpuCard = bento(widget, 134, 40, [6, 8, 6, 8], 10);
  const cRow = cpuCard.addStack();
  cRow.centerAlignContent();
  const cLeft = cRow.addStack();
  cLeft.layoutVertically();
  addText(cLeft, "CPU 水平", Font.mediumSystemFont(8), C.muted, { lineLimit: 1 });
  const cNum = cLeft.addStack();
  cNum.centerAlignContent();
  addText(cNum, data.cpu.toFixed(1), Font.boldRoundedSystemFont(15), C.cyan, { lineLimit: 1, scale: 0.75 });
  addText(cNum, `/${data.cpuLimit}`, Font.mediumRoundedSystemFont(9), C.muted, { lineLimit: 1 });
  cRow.addSpacer();
  const arc = cRow.addImage(drawCpuArc(data.ratio, data.bucket, 28, 3.2));
  arc.imageSize = new Size(28, 28);
  widget.addSpacer(6);
  const r1 = widget.addStack();
  r1.spacing = 6;
  addMetricTile(r1, {
    width: 64,
    height: 36,
    icon: "nuke",
    iconHex: data.incomingNukeCount > 0 ? "#FB7185" : dark ? "#ffe66d" : "#D97706",
    label: "核弹",
    value: data.incomingNukeCount > 0 ? `来袭${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount}`,
    valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
    compact: true
  });
  addMetricTile(r1, {
    width: 64,
    height: 36,
    icon: "shield",
    iconHex: data.activeSafeModes.length > 0 ? dark ? "#34D399" : "#0F8A5F" : dark ? "#A8B3C9" : "#475569",
    label: "安全",
    value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 激活` : `×${data.totalSafeModeCharges}`,
    valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
    compact: true
  });
  widget.addSpacer(6);
  const r2 = widget.addStack();
  r2.spacing = 6;
  addMetricTile(r2, {
    width: 64,
    height: 36,
    icon: "coin",
    iconHex: dark ? "#ffe66d" : "#D97706",
    label: "余额",
    value: formatMoney(data.credits),
    valueColor: C.yellow,
    compact: true
  });
  addMetricTile(r2, {
    width: 64,
    height: 36,
    icon: "bolt",
    iconHex: dark ? "#4ecdc4" : "#0D9488",
    label: "能量",
    value: formatCompact(data.totalEnergy),
    valueColor: C.cyan,
    compact: true
  });
};
var renderMedium = (widget, data) => {
  const dark = isDarkMode();
  addHeader(widget, data, "medium");
  widget.addSpacer(7);
  const grid = widget.addStack();
  grid.spacing = 8;
  const cpuCard = bento(grid, 134, 108, [8, 9, 8, 9], 12);
  const ch = cpuCard.addStack();
  ch.centerAlignContent();
  addText(ch, "CPU 水平", Font.mediumSystemFont(9), C.muted, { lineLimit: 1 });
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
  const rightCol = grid.addStack();
  rightCol.layoutVertically();
  rightCol.spacing = 6;
  const topRow = rightCol.addStack();
  topRow.spacing = 6;
  addMetricTile(topRow, {
    width: 83,
    height: 51,
    icon: "nuke",
    iconHex: data.incomingNukeCount > 0 ? "#FB7185" : dark ? "#ffe66d" : "#D97706",
    label: "核弹数量",
    value: data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount}`,
    valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
    sub: data.incomingNukeCount > 0 ? "紧急预警" : "就绪发射",
    compact: true
  });
  addMetricTile(topRow, {
    width: 83,
    height: 51,
    icon: "shield",
    iconHex: data.activeSafeModes.length > 0 ? dark ? "#34D399" : "#0F8A5F" : dark ? "#A8B3C9" : "#475569",
    label: "安全模式",
    value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 激活` : `×${data.totalSafeModeCharges}`,
    valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
    sub: data.activeSafeModes.length > 0 ? data.activeSafeModes[0].room : "可用储备",
    compact: true
  });
  const botRow = rightCol.addStack();
  botRow.spacing = 6;
  addMetricTile(botRow, {
    width: 83,
    height: 51,
    icon: "coin",
    iconHex: dark ? "#ffe66d" : "#D97706",
    label: "账户余额",
    value: formatMoney(data.credits),
    valueColor: C.yellow,
    sub: `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`,
    compact: true
  });
  addMetricTile(botRow, {
    width: 83,
    height: 51,
    icon: "bolt",
    iconHex: dark ? "#4ecdc4" : "#0D9488",
    label: "能量水平",
    value: formatCompact(data.totalEnergy),
    valueColor: C.cyan,
    sub: `仓 ${formatCompact(data.totalStorageEnergy)}`,
    compact: true
  });
};
var renderLarge = (widget, data, family = "large") => {
  const isXL = family === "extraLarge";
  const isPortrait = family === "extraLargePortrait";
  const dark = isDarkMode();
  addHeader(widget, data, family);
  widget.addSpacer(10);
  if (isXL) {
    const shell = widget.addStack();
    shell.spacing = 10;
    const leftCol = shell.addStack();
    leftCol.layoutVertically();
    leftCol.spacing = 8;
    const cpuCard2 = bento(leftCol, 292, 138, [10, 12, 10, 12], 13);
    const cpuTop = cpuCard2.addStack();
    cpuTop.centerAlignContent();
    const arcImg2 = cpuTop.addImage(drawCpuArc(data.ratio, data.bucket, 62, 5.5));
    arcImg2.imageSize = new Size(62, 62);
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
    cpuCard2.addSpacer(8);
    const spark = cpuCard2.addImage(drawSparkline(data.cpuSeries, data.cpuLimit, 268, 42));
    spark.imageSize = new Size(268, 42);
    const kpiRow1 = leftCol.addStack();
    kpiRow1.spacing = 8;
    addMetricTile(kpiRow1, {
      width: 142,
      height: 63,
      icon: "nuke",
      iconHex: data.incomingNukeCount > 0 ? "#FB7185" : dark ? "#ffe66d" : "#D97706",
      label: "核弹储备",
      value: data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady} / ${data.nukerCount}`,
      valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
      sub: data.incomingNukeCount > 0 ? "高危警报" : `${data.nukesReady} 就绪 · 0 来袭`
    });
    addMetricTile(kpiRow1, {
      width: 142,
      height: 63,
      icon: "shield",
      iconHex: data.activeSafeModes.length > 0 ? dark ? "#34D399" : "#0F8A5F" : dark ? "#A8B3C9" : "#475569",
      label: "安全模式",
      value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 房激活` : `×${data.totalSafeModeCharges} 次`,
      valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
      sub: data.activeSafeModes.length > 0 ? `${data.activeSafeModes[0].room} 防护中` : `总可用储备`
    });
    const kpiRow2 = leftCol.addStack();
    kpiRow2.spacing = 8;
    addMetricTile(kpiRow2, {
      width: 142,
      height: 63,
      icon: "coin",
      iconHex: dark ? "#ffe66d" : "#D97706",
      label: "账户余额",
      value: formatMoney(data.credits),
      valueColor: C.yellow,
      sub: `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`
    });
    addMetricTile(kpiRow2, {
      width: 142,
      height: 63,
      icon: "bolt",
      iconHex: dark ? "#4ecdc4" : "#0D9488",
      label: "帝国能量",
      value: formatCompact(data.totalEnergy),
      valueColor: C.cyan,
      sub: `仓 ${formatCompact(data.totalStorageEnergy)} · 终 ${formatCompact(data.totalTerminalEnergy)}`
    });
    const roomCard2 = bento(shell, 390, 280, [10, 12, 10, 12], 13);
    const rh2 = roomCard2.addStack();
    rh2.centerAlignContent();
    addText(rh2, "房间态势矩阵", Font.semiboldSystemFont(11), C.text, { lineLimit: 1 });
    rh2.addSpacer(8);
    addText(rh2, "安全模式 · 核弹 · 能量储备", Font.systemFont(9), C.muted, { lineLimit: 1 });
    rh2.addSpacer();
    addText(rh2, `${data.totalRooms} ROOMS`, Font.semiboldMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
    roomCard2.addSpacer(7);
    addHDivider(roomCard2);
    roomCard2.addSpacer(7);
    if (!data.rooms.length) {
      addText(roomCard2, "配置 Token 后自动同步跨分片房间态势", Font.systemFont(11), C.muted);
    } else {
      data.rooms.slice(0, 8).forEach((room, idx) => {
        if (idx > 0) roomCard2.addSpacer(7);
        addRoomTableRow(roomCard2, room, data.maxRoomEnergy, true);
      });
    }
    roomCard2.addSpacer();
    addHDivider(roomCard2);
    roomCard2.addSpacer(6);
    const xlFoot = roomCard2.addStack();
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
      lineLimit: 1
    });
    return;
  }
  const cpuCard = bento(widget, 310, isPortrait ? 156 : 102, [9, 11, 9, 11], 13);
  const cTop = cpuCard.addStack();
  cTop.centerAlignContent();
  const arcSize = isPortrait ? 64 : 56;
  const arcImg = cTop.addImage(drawCpuArc(data.ratio, data.bucket, arcSize, 5));
  arcImg.imageSize = new Size(arcSize, arcSize);
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
      icon: "nuke",
      iconHex: data.incomingNukeCount > 0 ? "#FB7185" : dark ? "#ffe66d" : "#D97706",
      label: "核弹储备",
      value: data.incomingNukeCount > 0 ? `来袭 ${data.incomingNukeCount}` : `${data.nukesReady} / ${data.nukerCount}`,
      valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
      sub: data.incomingNukeCount > 0 ? "紧急预警" : "0 来袭 · 发射就绪"
    });
    addMetricTile(pRow1, {
      width: 151,
      height: 66,
      icon: "shield",
      iconHex: data.activeSafeModes.length > 0 ? dark ? "#34D399" : "#0F8A5F" : dark ? "#A8B3C9" : "#475569",
      label: "安全模式",
      value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length} 房激活` : `×${data.totalSafeModeCharges} 次`,
      valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
      sub: data.activeSafeModes.length > 0 ? `${data.activeSafeModes[0].room} 开启中` : "全局可用储备"
    });
    widget.addSpacer(8);
    const pRow2 = widget.addStack();
    pRow2.spacing = 8;
    addMetricTile(pRow2, {
      width: 151,
      height: 66,
      icon: "coin",
      iconHex: dark ? "#ffe66d" : "#D97706",
      label: "账户余额",
      value: formatMoney(data.credits),
      valueColor: C.yellow,
      sub: `GCL ${data.gclLevel} · ${Math.round(data.gclRatio * 100)}%`
    });
    addMetricTile(pRow2, {
      width: 151,
      height: 66,
      icon: "bolt",
      iconHex: dark ? "#4ecdc4" : "#0D9488",
      label: "帝国能量",
      value: formatCompact(data.totalEnergy),
      valueColor: C.cyan,
      sub: `仓 ${formatCompact(data.totalStorageEnergy)} · 终 ${formatCompact(data.totalTerminalEnergy)}`
    });
  } else {
    const strip = widget.addStack();
    strip.spacing = 6;
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: "nuke",
      iconHex: data.incomingNukeCount > 0 ? "#FB7185" : dark ? "#ffe66d" : "#D97706",
      label: "核弹",
      value: data.incomingNukeCount > 0 ? `来袭${data.incomingNukeCount}` : `${data.nukesReady}/${data.nukerCount}`,
      valueColor: data.incomingNukeCount > 0 ? C.red : C.yellow,
      sub: "0 来袭",
      compact: true
    });
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: "shield",
      iconHex: data.activeSafeModes.length > 0 ? dark ? "#34D399" : "#0F8A5F" : dark ? "#A8B3C9" : "#475569",
      label: "安全",
      value: data.activeSafeModes.length > 0 ? `${data.activeSafeModes.length}激活` : `×${data.totalSafeModeCharges}`,
      valueColor: data.activeSafeModes.length > 0 ? C.green : C.text,
      sub: `×${data.totalSafeModeCharges} 次`,
      compact: true
    });
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: "coin",
      iconHex: dark ? "#ffe66d" : "#D97706",
      label: "余额",
      value: formatMoney(data.credits),
      valueColor: C.yellow,
      sub: `GCL ${data.gclLevel}`,
      compact: true
    });
    addMetricTile(strip, {
      width: 73,
      height: 54,
      icon: "bolt",
      iconHex: dark ? "#4ecdc4" : "#0D9488",
      label: "能量",
      value: formatCompact(data.totalEnergy),
      valueColor: C.cyan,
      sub: `仓${formatCompact(data.totalStorageEnergy)}`,
      compact: true
    });
  }
  widget.addSpacer(8);
  const roomCard = bento(widget, 310, isPortrait ? 336 : 132, [9, 11, 9, 11], 13);
  const rh = roomCard.addStack();
  rh.centerAlignContent();
  addText(rh, "房间态势 · 安全 · 核弹 · 能量", Font.semiboldSystemFont(10), C.muted, { lineLimit: 1 });
  rh.addSpacer();
  addText(rh, `${data.totalRooms} 房`, Font.semiboldMonospacedSystemFont(9), C.muted, { lineLimit: 1 });
  roomCard.addSpacer(6);
  addHDivider(roomCard);
  roomCard.addSpacer(6);
  const maxRooms = isPortrait ? 10 : 5;
  if (!data.rooms.length) {
    addText(roomCard, "配置 Token 后自动同步跨分片房间态势", Font.systemFont(11), C.muted);
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
      lineLimit: 1
    });
  } else {
    roomCard.addSpacer();
  }
};
var renderAccessory = (widget, family, data) => {
  widget.setPadding(0, 0, 0, 0);
  const pct = Math.round(data.ratio * 100);
  if (family === "accessoryInline") {
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
  if (family === "accessoryCircular") {
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
    trackColor: C.accessoryTrack
  });
  widget.addSpacer(3);
  const smStatus = data.activeSafeModes.length > 0 ? `安全激活 ${data.activeSafeModes.length}` : `安全 ×${data.totalSafeModeCharges}`;
  addText(widget, `${smStatus} · BKT ${formatCompact(data.bucket)}`, Font.mediumMonospacedSystemFont(8), C.accessory, {
    lineLimit: 1,
    scale: 0.75
  });
};
var createWidget = async (family = config.widgetFamily || "medium") => {
  const widget = new ListWidget();
  const cfg = getConfig();
  const accessory = ACCESSORY_FAMILIES.includes(family);
  if (accessory) {
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
      renderAccessory(widget, family, data2);
      widget.refreshAfterDate = new Date(
        Math.max(Date.now() + REFRESH_INTERVAL_MS, (data2.cooldownUntil || 0) + 5e3)
      );
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
  widget.setPadding(12, 14, 12, 14);
  if (!cfg.token) {
    addText(widget, "Screeps", Font.boldRoundedSystemFont(18), C.cyan);
    widget.addSpacer(8);
    addText(widget, "点击配置 Auth Token\n查看核弹、安全模式、余额、能量与 CPU", Font.mediumSystemFont(12), C.muted);
    return attachMenuURL(widget);
  }
  let data;
  try {
    data = await loadData(cfg);
  } catch (error) {
    addText(widget, "Screeps", Font.boldRoundedSystemFont(16), C.cyan);
    widget.addSpacer(8);
    addText(widget, "数据暂时不可用", Font.mediumSystemFont(14), C.red);
    addText(widget, error.message?.slice(0, 40) || "请检查配置", Font.systemFont(10), C.muted);
    widget.refreshAfterDate = new Date(Date.now() + DEFAULT_COOLDOWN_MS);
    return attachMenuURL(widget);
  }
  if (family === "small") renderSmall(widget, data);
  else if (isLargeFamily(family)) renderLarge(widget, data, family);
  else renderMedium(widget, data);
  const nextMs = Math.max(Date.now() + REFRESH_INTERVAL_MS, (data.cooldownUntil || 0) + 5e3);
  widget.refreshAfterDate = new Date(nextMs);
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "Screeps 运营面板",
    message: "跨 Shard 核弹、安全模式、账户余额、能量与 CPU 监控。",
    version: "1.0.0",
    updater,
    scriptId: "screeps",
    previewFamilies: ALL_PREVIEW_FAMILIES,
    actions: [{ id: "configure", title: "配置 Token 与分片" }]
  });
  if (menu?.action === "preview") {
    await presentWidgetPreviews(createWidget, menu.families);
  } else if (menu?.action === "configure") {
    await configure();
  }
} else {
  Script.setWidget(await createWidget());
}
Script.complete();
