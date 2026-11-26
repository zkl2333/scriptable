// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: hourglass-half;
// @script-id time-progress
// @version 1.3.0

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

// src/widgets/time-progress.js
var updater = createUpdater({
  scriptId: "time-progress",
  version: "1.3.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/time-progress.js"
});
await updater.autoUpdate();
var PREVIEW_FAMILIES = ALL_PREVIEW_FAMILIES;
var COLORS = {
  text: Color.dynamic(new Color("#202124"), new Color("#F3F4F6")),
  muted: Color.dynamic(new Color("#72777F"), new Color("#9DA3AB")),
  track: Color.dynamic(new Color("#DCE1E5"), new Color("#353A40")),
  accents: ["#E05D5D", "#E19A37", "#2F9C82", "#4D78CC"]
};
var ACCESSORY_COLOR = Color.dynamic(new Color("#111111"), new Color("#FFFFFF"));
var ACCESSORY_TRACK = Color.dynamic(new Color("#111111", 0.2), new Color("#FFFFFF", 0.22));
var clamp = (value) => Math.min(1, Math.max(0, value));
var getProgressItems = (now = /* @__PURE__ */ new Date()) => {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const nextDay = new Date(startOfDay);
  nextDay.setDate(nextDay.getDate() + 1);
  const weekday = (now.getDay() + 6) % 7;
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - weekday);
  const nextWeek = new Date(startOfWeek);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);
  const ratio = (start, end) => clamp((now - start) / (end - start));
  return [
    { label: "今日", progress: ratio(startOfDay, nextDay) },
    { label: "本周", progress: ratio(startOfWeek, nextWeek) },
    { label: "本月", progress: ratio(startOfMonth, nextMonth) },
    { label: "今年", progress: ratio(startOfYear, nextYear) }
  ];
};
var drawProgress = (width, height, progress, color, track = COLORS.track) => {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;
  context.setFillColor(track);
  const background = new Path();
  background.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  context.addPath(background);
  context.fillPath();
  const fillWidth = Math.round(width * clamp(progress));
  if (fillWidth > 0) {
    context.setFillColor(color);
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, fillWidth, height), height / 2, height / 2);
    context.addPath(fill);
    context.fillPath();
  }
  return context.getImage();
};
var addProgressRow = (parent, item, width, compact = false, monochrome = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const label = row.addText(item.label);
  label.font = Font.semiboldSystemFont(compact ? 10 : 11);
  label.textColor = monochrome ? ACCESSORY_COLOR : COLORS.muted;
  label.lineLimit = 1;
  row.addSpacer(compact ? 6 : 9);
  const barHeight = compact ? 4 : 6;
  const barColor = monochrome ? ACCESSORY_COLOR : new Color(COLORS.accents[item.index]);
  const barTrack = monochrome ? ACCESSORY_TRACK : COLORS.track;
  addLinearProgress(row, item.progress * 100, {
    width,
    thickness: barHeight,
    progressColor: barColor,
    trackColor: barTrack,
    fallback: () => {
      const image = row.addImage(drawProgress(width, barHeight, item.progress, barColor, barTrack));
      image.imageSize = new Size(width, barHeight);
    }
  });
  row.addSpacer(compact ? 5 : 8);
  const percent = row.addText(`${Math.round(item.progress * 100)}%`);
  percent.font = Font.semiboldRoundedSystemFont(compact ? 10 : 11);
  percent.textColor = monochrome ? ACCESSORY_COLOR : COLORS.text;
};
var addAccessory = (widget, family, items) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(`今日 ${Math.round(items[0].progress * 100)}% · 本周 ${Math.round(items[1].progress * 100)}%`);
    text.font = Font.semiboldSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const row = widget.addStack();
    row.addSpacer();
    const pct = Math.round(items[0].progress * 100);
    addCircularProgress(row, pct, {
      size: 56,
      thickness: 5,
      progressColor: ACCESSORY_COLOR,
      trackColor: ACCESSORY_TRACK,
      buildCenter: (ring) => {
        const label = ring.addText("今日");
        label.font = Font.mediumSystemFont(8);
        label.textColor = ACCESSORY_COLOR;
        label.centerAlignText();
        const value = ring.addText(`${pct}%`);
        value.font = Font.boldRoundedSystemFont(13);
        value.textColor = ACCESSORY_COLOR;
        value.centerAlignText();
      },
      fallback: () => {
        const stack = row.addStack();
        stack.layoutVertically();
        const label = stack.addText("今日");
        label.font = Font.mediumSystemFont(9);
        label.textColor = ACCESSORY_COLOR;
        label.centerAlignText();
        const value = stack.addText(`${pct}%`);
        value.font = Font.boldRoundedSystemFont(17);
        value.textColor = ACCESSORY_COLOR;
        value.centerAlignText();
      }
    });
    row.addSpacer();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 5, 5, 5);
  addProgressRow(widget, { ...items[0], index: 0 }, 62, true, true);
  widget.addSpacer(6);
  addProgressRow(widget, { ...items[1], index: 1 }, 62, true, true);
};
var addMain = (widget, family, items) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#F8FAFB"), new Color("#17191C")),
    Color.dynamic(new Color("#E8EDF0"), new Color("#25292E"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  applyTransparentBackground(widget, "time-progress");
  widget.setPadding(family === "small" ? 13 : 16, family === "small" ? 13 : 18, 13, family === "small" ? 13 : 18);
  const isLarge = isLargeFamily(family);
  const header = widget.addStack();
  header.centerAlignContent();
  const titleColumn = header.addStack();
  titleColumn.layoutVertically();
  const title = titleColumn.addText("时间进度");
  title.font = Font.boldSystemFont(isLarge ? 18 : 14);
  title.textColor = COLORS.text;
  const subtitle = titleColumn.addText("把时间看见");
  subtitle.font = Font.mediumSystemFont(10);
  subtitle.textColor = COLORS.muted;
  header.addSpacer();
  addRefreshAction(header, {
    title: "刷新时间进度",
    iconColor: COLORS.muted,
    iconSize: 12
  });
  if (family === "extraLargePortrait") {
    widget.addSpacer(24);
    const ringsRow = widget.addStack();
    ringsRow.centerAlignContent();
    ringsRow.addSpacer();
    for (const [idx, target] of [
      { item: items[0], color: COLORS.accents[0] },
      { item: items[3], color: COLORS.accents[3] }
    ].entries()) {
      const pct = Math.round(target.item.progress * 100);
      addCircularProgress(ringsRow, pct, {
        size: 112,
        thickness: 10,
        progressColor: new Color(target.color),
        trackColor: COLORS.track,
        buildCenter: (ring) => {
          const val = ring.addText(`${pct}%`);
          val.font = Font.boldRoundedSystemFont(22);
          val.textColor = COLORS.text;
          val.centerAlignText();
          const cap = ring.addText(target.item.label);
          cap.font = Font.mediumSystemFont(11);
          cap.textColor = COLORS.muted;
          cap.centerAlignText();
        }
      });
      if (idx === 0) ringsRow.addSpacer(28);
    }
    ringsRow.addSpacer();
  }
  widget.addSpacer();
  const width = family === "small" ? 56 : family === "medium" ? 220 : family === "extraLarge" ? 560 : 210;
  for (const [index, item] of items.entries()) {
    addProgressRow(widget, { ...item, index }, width, family === "small");
    if (index < items.length - 1) widget.addSpacer(family === "small" ? 8 : family === "medium" ? 7 : 16);
  }
  if (isLarge) {
    widget.addSpacer();
    const note = widget.addText("进度按实际日历长度计算，支持桌面原生进度条与一键刷新");
    note.font = Font.systemFont(10);
    note.textColor = COLORS.muted;
  }
};
var createWidget = (family = config.widgetFamily || "small") => {
  const widget = new ListWidget();
  const items = getProgressItems();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, items);
  else addMain(widget, family, items);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1e3);
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "时间进度",
    version: "1.3.0",
    updater,
    scriptId: "time-progress",
    previewFamilies: PREVIEW_FAMILIES
  });
  if (menu?.action === "preview") {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(createWidget());
}
Script.complete();
