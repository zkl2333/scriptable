// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: coffee;
// @script-id milk-tea-reminder
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

// src/widgets/milk-tea-reminder.js
var updater = createUpdater({
  scriptId: "milk-tea-reminder",
  version: "1.1.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/milk-tea-reminder.js"
});
await updater.autoUpdate();
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var PREVIEW_FAMILIES = ["small", "medium", "large", ...ACCESSORY_FAMILIES];
var COLORS = {
  brown: Color.dynamic(new Color("#613C2D"), new Color("#F1D0B8")),
  caramel: Color.dynamic(new Color("#B8612D"), new Color("#F3A66F")),
  muted: Color.dynamic(new Color("#735C50"), new Color("#C8B6A9")),
  card: Color.dynamic(new Color("#FFF8EF"), new Color("#35271F"))
};
var ACCESSORY_COLOR = Color.dynamic(new Color("#111111"), new Color("#FFFFFF"));
var getMessage = () => {
  const hour = (/* @__PURE__ */ new Date()).getHours();
  if (hour < 11) return { title: "上午好", detail: "今天的第一杯，慢慢选" };
  if (hour < 15) return { title: "午后续航", detail: "三分糖，也有好心情" };
  if (hour < 20) return { title: "来杯奶茶", detail: "忙里偷闲，奖励一下自己" };
  return { title: "晚间克制", detail: "想喝的话，记得选低糖" };
};
var addAccessory = (widget, family, message) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(`🧋 ${message.title} · ${message.detail}`);
    text.font = Font.mediumSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.72;
  } else if (family === "accessoryCircular") {
    widget.addSpacer();
    const icon = widget.addImage(SFSymbol.named("cup.and.saucer.fill").image);
    icon.imageSize = new Size(23, 20);
    icon.tintColor = ACCESSORY_COLOR;
    icon.centerAlignImage();
    const text = widget.addText("来一杯");
    text.font = Font.semiboldSystemFont(10);
    text.textColor = ACCESSORY_COLOR;
    text.centerAlignText();
    widget.addSpacer();
  } else {
    const title = widget.addText(message.title);
    title.font = Font.boldSystemFont(15);
    title.textColor = ACCESSORY_COLOR;
    const detail = widget.addText(message.detail);
    detail.font = Font.mediumSystemFont(11);
    detail.textColor = ACCESSORY_COLOR;
    detail.lineLimit = 1;
    detail.minimumScaleFactor = 0.75;
  }
};
var addMain = (widget, family, message) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#FFF5E7"), new Color("#2B201B")),
    Color.dynamic(new Color("#F2D3B1"), new Color("#513426"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  widget.setPadding(16, 16, 14, 16);
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named("cup.and.saucer.fill").image);
  icon.imageSize = new Size(17, 15);
  icon.tintColor = COLORS.caramel;
  header.addSpacer(6);
  const brand = header.addText("奶茶时刻");
  brand.font = Font.semiboldSystemFont(11);
  brand.textColor = COLORS.muted;
  widget.addSpacer();
  const title = widget.addText(message.title);
  title.font = Font.boldRoundedSystemFont(family === "large" ? 32 : family === "medium" ? 26 : 24);
  title.textColor = COLORS.brown;
  title.minimumScaleFactor = 0.7;
  const detail = widget.addText(message.detail);
  detail.font = Font.mediumSystemFont(family === "small" ? 11 : 13);
  detail.textColor = COLORS.muted;
  detail.lineLimit = family === "small" ? 2 : 1;
  detail.minimumScaleFactor = 0.75;
  widget.addSpacer();
  if (family !== "small") {
    const choices = widget.addStack();
    for (const [index, choice] of ["低糖", "少冰", "加珍珠"].entries()) {
      const chip = choices.addStack();
      chip.setPadding(5, 9, 5, 9);
      chip.backgroundColor = COLORS.card;
      chip.cornerRadius = 10;
      const text = chip.addText(choice);
      text.font = Font.semiboldSystemFont(10);
      text.textColor = COLORS.brown;
      if (index < 2) choices.addSpacer(7);
    }
  }
  if (family === "large") {
    widget.addSpacer(12);
    const note = widget.addText("运行脚本即可发送提醒，通知中可直接打开地图或外卖应用。");
    note.font = Font.systemFont(11);
    note.textColor = COLORS.muted;
    note.lineLimit = 2;
  }
};
var createWidget = (family = config.widgetFamily || "small") => {
  const widget = new ListWidget();
  const message = getMessage();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, message);
  else addMain(widget, family, message);
  return attachMenuURL(widget);
};
var scheduleReminder = async () => {
  const notification = new Notification();
  notification.title = "提醒喝奶茶小助手";
  notification.body = "提醒你喝奶茶啦！";
  notification.identifier = "naicha";
  notification.addAction("发朋友圈提醒大家喝奶茶", "weixin://");
  notification.addAction("查找附近奶茶店", `http://maps.apple.com/?q=${encodeURI("奶茶")}`);
  notification.addAction("打开饿了吗", "eleme://");
  notification.addAction("打开美团", "imeituan://");
  notification.setTriggerDate(new Date(Date.now() + 3e3));
  await notification.schedule();
};
var showReminderScheduled = async () => {
  const alert = new Alert();
  alert.title = "提醒已安排";
  alert.message = "将在 3 秒后发送通知。";
  alert.addAction("好");
  await alert.presentAlert();
};
if (shouldShowWidgetMenu()) {
  for (; ; ) {
    const action = await runWidgetMenu({
      title: "奶茶提醒",
      version: "1.1.0",
      updater,
      previewFamilies: PREVIEW_FAMILIES,
      actions: [
        {
          id: "remind",
          icon: "🔔",
          title: "发送奶茶提醒",
          subtitle: "3 秒后推送，可从通知打开外卖应用"
        }
      ]
    });
    if (!action) break;
    if (action.action === "preview") {
      await presentWidgetPreviews(createWidget, action.families);
    }
    if (action.action === "remind") {
      await scheduleReminder();
      await showReminderScheduled();
    }
  }
} else {
  Script.setWidget(createWidget());
}
Script.complete();
