// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: calendar-day;
// @script-id today-dashboard
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
  if (family !== "extraLarge") return true;
  return typeof Device !== "undefined" && typeof Device.isPad === "function" && Device.isPad();
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

// src/widgets/today-dashboard.js
var updater = createUpdater({
  scriptId: "today-dashboard",
  version: "1.0.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/today-dashboard.js"
});
await updater.autoUpdate();
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var PREVIEW_FAMILIES = ["small", "medium", "large", "extraLarge", ...ACCESSORY_FAMILIES];
var COLORS = {
  text: Color.dynamic(new Color("#1D252C"), new Color("#F3F5F7")),
  muted: Color.dynamic(new Color("#6E7882"), new Color("#98A2AD")),
  calendar: Color.dynamic(new Color("#2563A8"), new Color("#74B9FF")),
  calendarSoft: Color.dynamic(new Color("#E5F0FA"), new Color("#1C3348")),
  reminder: Color.dynamic(new Color("#B05C18"), new Color("#FFB56E")),
  reminderSoft: Color.dynamic(new Color("#FCEEDC"), new Color("#42301E")),
  line: Color.dynamic(new Color("#D9E0E5"), new Color("#39424A")),
  accessory: Color.dynamic(new Color("#111111"), new Color("#FFFFFF"))
};
var startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};
var endOfDay = (date) => {
  const result = startOfDay(date);
  result.setDate(result.getDate() + 1);
  return result;
};
var formatTime = (date) => date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
var formatWeekday = (date) => ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
var getEventTime = (event, now) => {
  if (event.isAllDay) return "全天";
  if (event.startDate <= now && event.endDate > now) return "进行中";
  return formatTime(event.startDate);
};
var loadEvents = async () => {
  if (typeof CalendarEvent === "undefined") return { items: [], available: false };
  try {
    const items = await CalendarEvent.today();
    return {
      items: items.filter((event) => event.startDate && event.endDate).sort((left, right) => left.startDate - right.startDate),
      available: true
    };
  } catch {
    return { items: [], available: false };
  }
};
var loadReminders = async (now) => {
  if (typeof Reminder === "undefined") return { items: [], available: false, undated: 0 };
  try {
    const tomorrow = endOfDay(now);
    const all = await Reminder.allIncomplete();
    const dated = all.filter((reminder) => reminder.dueDate && reminder.dueDate < tomorrow).sort((left, right) => left.dueDate - right.dueDate);
    return {
      items: dated,
      available: true,
      undated: all.filter((reminder) => !reminder.dueDate).length
    };
  } catch {
    return { items: [], available: false, undated: 0 };
  }
};
var getDashboard = async (now = /* @__PURE__ */ new Date()) => {
  const [events, reminders] = await Promise.all([loadEvents(), loadReminders(now)]);
  const nextEvent = events.items.find((event) => event.endDate > now) || null;
  return { now, events, reminders, nextEvent };
};
var addText = (parent, text, font, color, options = {}) => {
  const node = parent.addText(text);
  node.font = font;
  node.textColor = color;
  if (options.lineLimit) node.lineLimit = options.lineLimit;
  if (options.minimumScaleFactor) node.minimumScaleFactor = options.minimumScaleFactor;
  return node;
};
var addSectionHeader = (parent, icon, title, count, color) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const image = row.addImage(SFSymbol.named(icon).image);
  image.tintColor = color;
  image.imageSize = new Size(12, 12);
  row.addSpacer(5);
  addText(row, title, Font.semiboldSystemFont(11), COLORS.text);
  row.addSpacer();
  addText(row, count, Font.mediumSystemFont(11), color);
};
var addEventRow = (parent, event, now, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const time = addText(
    row,
    getEventTime(event, now),
    Font.semiboldRoundedSystemFont(compact ? 9 : 10),
    COLORS.calendar
  );
  time.minimumScaleFactor = 0.7;
  row.addSpacer(compact ? 5 : 7);
  const title = addText(row, event.title || "未命名日程", Font.systemFont(compact ? 10 : 11), COLORS.text, {
    lineLimit: 1
  });
  title.minimumScaleFactor = 0.75;
};
var addReminderRow = (parent, reminder, now, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const overdue = reminder.dueDate && startOfDay(reminder.dueDate) < startOfDay(now);
  const icon = row.addImage(SFSymbol.named(overdue ? "exclamationmark.circle.fill" : "circle").image);
  icon.tintColor = overdue ? new Color("#D85A4A") : COLORS.reminder;
  icon.imageSize = new Size(compact ? 9 : 10, compact ? 9 : 10);
  row.addSpacer(compact ? 5 : 7);
  const title = addText(row, reminder.title || "未命名提醒", Font.systemFont(compact ? 10 : 11), COLORS.text, {
    lineLimit: 1
  });
  title.minimumScaleFactor = 0.75;
};
var addEmpty = (parent, text, compact = false) => addText(parent, text, Font.systemFont(compact ? 10 : 11), COLORS.muted, { lineLimit: 1 });
var setBackground = (widget) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#F8FBFD"), new Color("#171C21")),
    Color.dynamic(new Color("#EDF2F5"), new Color("#252B31"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
};
var addHeader = (widget, now, large = false) => {
  const row = widget.addStack();
  row.centerAlignContent();
  const date = addText(row, `${now.getMonth() + 1}月${now.getDate()}日`, Font.boldRoundedSystemFont(large ? 19 : 16), COLORS.text);
  date.minimumScaleFactor = 0.8;
  row.addSpacer(7);
  addText(row, `周${formatWeekday(now)}`, Font.mediumSystemFont(11), COLORS.muted);
  row.addSpacer();
  const icon = row.addImage(SFSymbol.named("sun.max.fill").image);
  icon.tintColor = COLORS.reminder;
  icon.imageSize = new Size(15, 15);
};
var addNextEventCard = (widget, dashboard, compact = false) => {
  const card = widget.addStack();
  card.layoutVertically();
  card.backgroundColor = COLORS.calendarSoft;
  card.cornerRadius = 12;
  card.setPadding(compact ? 9 : 11, compact ? 10 : 12, compact ? 9 : 11, compact ? 10 : 12);
  const label = dashboard.nextEvent ? "下一项日程" : "日程";
  addText(card, label, Font.semiboldSystemFont(compact ? 9 : 10), COLORS.calendar);
  card.addSpacer(3);
  if (dashboard.nextEvent) {
    const title = addText(card, dashboard.nextEvent.title || "未命名日程", Font.semiboldSystemFont(compact ? 13 : 15), COLORS.text, { lineLimit: 1 });
    title.minimumScaleFactor = 0.7;
    card.addSpacer(2);
    addText(card, getEventTime(dashboard.nextEvent, dashboard.now), Font.mediumSystemFont(compact ? 10 : 11), COLORS.muted);
  } else {
    addText(card, dashboard.events.available ? "今天暂无日程" : "未获日历权限", Font.semiboldSystemFont(compact ? 12 : 14), COLORS.text, { lineLimit: 1 });
  }
};
var addSmall = (widget, dashboard) => {
  widget.setPadding(14, 14, 13, 14);
  addHeader(widget, dashboard.now);
  widget.addSpacer();
  addNextEventCard(widget, dashboard, true);
  widget.addSpacer(10);
  addSectionHeader(widget, "checkmark.circle.fill", "待办", `${dashboard.reminders.items.length} 项`, COLORS.reminder);
  widget.addSpacer(5);
  if (dashboard.reminders.items[0]) addReminderRow(widget, dashboard.reminders.items[0], dashboard.now, true);
  else addEmpty(widget, dashboard.reminders.available ? "今天没有截止待办" : "未获提醒事项权限", true);
};
var addColumn = (parent, dashboard, type) => {
  const isEvents = type === "events";
  const items = isEvents ? dashboard.events.items : dashboard.reminders.items;
  const available = isEvents ? dashboard.events.available : dashboard.reminders.available;
  const column = parent.addStack();
  column.layoutVertically();
  addSectionHeader(column, isEvents ? "calendar" : "checkmark.circle.fill", isEvents ? "今日日程" : "今日待办", `${items.length} 项`, isEvents ? COLORS.calendar : COLORS.reminder);
  column.addSpacer(7);
  if (items.length === 0) {
    addEmpty(column, available ? isEvents ? "今天没有安排" : "今天没有截止待办" : `未获${isEvents ? "日历" : "提醒事项"}权限`);
    return;
  }
  for (const [index, item] of items.slice(0, 3).entries()) {
    if (isEvents) addEventRow(column, item, dashboard.now);
    else addReminderRow(column, item, dashboard.now);
    if (index < Math.min(items.length, 3) - 1) column.addSpacer(6);
  }
};
var addMedium = (widget, dashboard) => {
  widget.setPadding(16, 17, 14, 17);
  addHeader(widget, dashboard.now);
  widget.addSpacer(11);
  addNextEventCard(widget, dashboard);
  widget.addSpacer(12);
  const body = widget.addStack();
  addColumn(body, dashboard, "events");
  body.addSpacer(16);
  addColumn(body, dashboard, "reminders");
};
var addLarge = (widget, dashboard, extraLarge = false) => {
  widget.setPadding(18, 19, 16, 19);
  addHeader(widget, dashboard.now, true);
  widget.addSpacer(14);
  addNextEventCard(widget, dashboard);
  widget.addSpacer(15);
  const body = widget.addStack();
  addColumn(body, dashboard, "events");
  body.addSpacer(extraLarge ? 28 : 20);
  addColumn(body, dashboard, "reminders");
  widget.addSpacer();
  const footer = dashboard.reminders.undated > 0 ? `另有 ${dashboard.reminders.undated} 项无截止日期待办` : "日历和提醒事项均在本机读取";
  addText(widget, footer, Font.systemFont(10), COLORS.muted, { lineLimit: 1 });
};
var addAccessory = (widget, family, dashboard) => {
  const { nextEvent, reminders, now } = dashboard;
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = nextEvent ? `下一项：${getEventTime(nextEvent, now)} ${nextEvent.title || "未命名日程"}` : `今日 ${reminders.items.length} 项待办`;
    addText(widget, text, Font.semiboldSystemFont(12), COLORS.accessory, { lineLimit: 1 });
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const count = nextEvent ? dashboard.events.items.length : reminders.items.length;
    addText(widget, String(count), Font.boldRoundedSystemFont(24), COLORS.accessory).centerAlignText();
    addText(widget, nextEvent ? "日程" : "待办", Font.mediumSystemFont(10), COLORS.accessory).centerAlignText();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 7, 5, 7);
  addText(widget, nextEvent ? "下一项日程" : "今日待办", Font.mediumSystemFont(10), COLORS.accessory);
  widget.addSpacer(2);
  addText(widget, nextEvent ? nextEvent.title || "未命名日程" : `${reminders.items.length} 项待办`, Font.semiboldSystemFont(13), COLORS.accessory, { lineLimit: 1 });
  widget.addSpacer(2);
  addText(widget, nextEvent ? getEventTime(nextEvent, now) : "打开 Scriptable 授权日历和提醒事项", Font.systemFont(10), COLORS.accessory, { lineLimit: 1 });
};
var createWidget = async (family = config.widgetFamily || "medium") => {
  const widget = new ListWidget();
  const dashboard = await getDashboard();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, dashboard);
  else {
    setBackground(widget);
    if (family === "small") addSmall(widget, dashboard);
    else if (family === "medium") addMedium(widget, dashboard);
    else addLarge(widget, dashboard, family === "extraLarge");
  }
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1e3);
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "今日面板",
    message: "聚合今日日程与到期提醒。首次运行会请求系统权限。",
    version: "1.0.0",
    updater,
    previewFamilies: PREVIEW_FAMILIES
  });
  if (menu?.action === "preview") await presentWidgetPreviews(createWidget, menu.families);
} else {
  Script.setWidget(await createWidget());
}
Script.complete();
