// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
// @script-id hitokoto
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

// src/widgets/hitokoto.js
var updater = createUpdater({
  scriptId: "hitokoto",
  version: "1.1.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/hitokoto.js"
});
await updater.autoUpdate();
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var PREVIEW_FAMILIES = ["small", "medium", "large", ...ACCESSORY_FAMILIES];
var COLORS = {
  text: Color.dynamic(new Color("#24211D"), new Color("#F4F0E8")),
  muted: Color.dynamic(new Color("#777069"), new Color("#AAA39A")),
  accent: Color.dynamic(new Color("#A44A3F"), new Color("#E58C7D"))
};
var ACCESSORY_COLOR = Color.dynamic(new Color("#111111"), new Color("#FFFFFF"));
var loadQuote = async () => {
  try {
    const request = new Request("https://v1.hitokoto.cn/?c=d&encode=text");
    request.timeoutInterval = 8;
    const quote = (await request.loadString()).trim();
    return quote || "心有山海，静而不争。";
  } catch {
    return "慢一点，也是在向前走。";
  }
};
var addAccessory = (widget, family, quote) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text2 = widget.addText(`“${quote}”`);
    text2.font = Font.mediumSystemFont(12);
    text2.textColor = ACCESSORY_COLOR;
    text2.lineLimit = 1;
    text2.minimumScaleFactor = 0.72;
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const icon = widget.addImage(SFSymbol.named("quote.opening").image);
    icon.imageSize = new Size(20, 16);
    icon.tintColor = ACCESSORY_COLOR;
    icon.centerAlignImage();
    const text2 = widget.addText(quote.slice(0, 4));
    text2.font = Font.semiboldSystemFont(10);
    text2.textColor = ACCESSORY_COLOR;
    text2.lineLimit = 1;
    text2.centerAlignText();
    widget.addSpacer();
    return;
  }
  const text = widget.addText(`“${quote}`);
  text.font = Font.semiboldSystemFont(12);
  text.textColor = ACCESSORY_COLOR;
  text.lineLimit = 2;
  text.minimumScaleFactor = 0.75;
};
var addMain = (widget, family, quote) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#FBF6EC"), new Color("#211E1B")),
    Color.dynamic(new Color("#F0E4D2"), new Color("#302824"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  widget.setPadding(family === "small" ? 14 : 18, family === "small" ? 14 : 20, 14, family === "small" ? 14 : 20);
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named("quote.bubble.fill").image);
  icon.imageSize = new Size(14, 14);
  icon.tintColor = COLORS.accent;
  header.addSpacer(6);
  const label = header.addText("一言");
  label.font = Font.semiboldSystemFont(11);
  label.textColor = COLORS.muted;
  widget.addSpacer();
  const text = widget.addText(quote);
  text.font = Font.semiboldSystemFont(family === "large" ? 28 : family === "medium" ? 22 : 19);
  text.textColor = COLORS.text;
  text.lineLimit = family === "small" ? 4 : family === "medium" ? 3 : 6;
  text.minimumScaleFactor = 0.58;
  if (family !== "medium") text.centerAlignText();
  widget.addSpacer();
  if (family === "large") {
    const footer = widget.addText("HITOKOTO · 此刻的一句话");
    footer.font = Font.mediumSystemFont(10);
    footer.textColor = COLORS.muted;
    footer.centerAlignText();
  }
};
var createWidget = async (family = config.widgetFamily || "small") => {
  const widget = new ListWidget();
  const quote = await loadQuote();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, quote);
  else addMain(widget, family, quote);
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1e3);
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "一言",
    version: "1.1.0",
    updater,
    previewFamilies: PREVIEW_FAMILIES
  });
  if (menu?.action === "preview") {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(await createWidget());
}
Script.complete();
