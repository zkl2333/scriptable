// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: hourglass-half;
// @script-id time-progress
// @version 1.1.0

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
var presentWidget = async (widget, fallbackFamily = "medium") => {
  const family = fallbackFamily;
  if (family === "accessoryInline") return widget.presentAccessoryInline();
  if (family === "accessoryCircular") return widget.presentAccessoryCircular();
  if (family === "accessoryRectangular") {
    return widget.presentAccessoryRectangular();
  }
  if (family === "large") return widget.presentLarge();
  if (family === "small") return widget.presentSmall();
  return widget.presentMedium();
};
var PREVIEW_LABELS = {
  small: "小尺寸 Small",
  medium: "中尺寸 Medium",
  large: "大尺寸 Large",
  accessoryInline: "锁屏单行 Inline",
  accessoryCircular: "锁屏圆形 Circular",
  accessoryRectangular: "锁屏矩形 Rectangular"
};
var DEFAULT_PREVIEW_FAMILIES = ["small", "medium", "large"];
var selectPreviewFamilies = async (families) => {
  const alert = new Alert();
  alert.title = "预览组件";
  alert.message = "测试组件在各种尺寸下的显示效果";
  families.forEach((family) => alert.addAction(PREVIEW_LABELS[family] || family));
  alert.addAction("全部 All");
  alert.addCancelAction("取消操作");
  const index = await alert.presentSheet();
  if (index < 0) return null;
  if (index < families.length) return [families[index]];
  if (index === families.length) return families;
  return null;
};
var presentWidgetPreviews = async (createWidget2, families) => {
  for (const family of families) {
    await presentWidget(await createWidget2(family), family);
  }
};
var runWidgetMenu = async ({
  title,
  message = "",
  version,
  updater: updater2,
  actions = [],
  previewFamilies = DEFAULT_PREVIEW_FAMILIES
}) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message || `当前版本 v${version}`;
  alert.addAction("预览组件");
  actions.forEach((action) => alert.addAction(action.title));
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
  await checkForUpdate({ updater: updater2, version });
  return null;
};

// src/widgets/time-progress.js
var updater = createUpdater({
  scriptId: "time-progress",
  version: "1.1.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/time-progress.js"
});
await updater.autoUpdate();
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var PREVIEW_FAMILIES = ["small", "medium", "large", ...ACCESSORY_FAMILIES];
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
  const image = row.addImage(
    drawProgress(
      width,
      compact ? 4 : 6,
      item.progress,
      monochrome ? ACCESSORY_COLOR : new Color(COLORS.accents[item.index]),
      monochrome ? ACCESSORY_TRACK : COLORS.track
    )
  );
  image.imageSize = new Size(width, compact ? 4 : 6);
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
    const label = widget.addText("今日");
    label.font = Font.mediumSystemFont(9);
    label.textColor = ACCESSORY_COLOR;
    label.centerAlignText();
    const value = widget.addText(`${Math.round(items[0].progress * 100)}%`);
    value.font = Font.boldRoundedSystemFont(17);
    value.textColor = ACCESSORY_COLOR;
    value.centerAlignText();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 5, 5, 5);
  addProgressRow(widget, items[0], 62, true, true);
  widget.addSpacer(6);
  addProgressRow(widget, items[1], 62, true, true);
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
  widget.setPadding(family === "small" ? 13 : 16, family === "small" ? 13 : 18, 13, family === "small" ? 13 : 18);
  const title = widget.addText("时间进度");
  title.font = Font.boldSystemFont(family === "large" ? 18 : 14);
  title.textColor = COLORS.text;
  const subtitle = widget.addText("把时间看见");
  subtitle.font = Font.mediumSystemFont(10);
  subtitle.textColor = COLORS.muted;
  widget.addSpacer();
  const width = family === "small" ? 56 : family === "medium" ? 220 : 270;
  for (const [index, item] of items.entries()) {
    addProgressRow(widget, { ...item, index }, width, family === "small");
    if (index < items.length - 1) widget.addSpacer(family === "small" ? 8 : family === "medium" ? 7 : 14);
  }
  if (family === "large") {
    widget.addSpacer();
    const note = widget.addText("进度按实际日历长度计算，每 15 分钟自动刷新");
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
    version: "1.1.0",
    updater,
    previewFamilies: PREVIEW_FAMILIES
  });
  if (menu?.action === "preview") {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(createWidget());
}
Script.complete();
