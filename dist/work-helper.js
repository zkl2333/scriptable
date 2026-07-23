// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// @script-id work-helper
// @version 2.1.2

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

// src/widgets/work-helper.js
var updater = createUpdater({
  scriptId: "work-helper",
  version: "2.1.2",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/work-helper.js"
});
await updater.autoUpdate();
var WORK_HOURS = {
  start: { hour: 9, minute: 30 },
  end: { hour: 18, minute: 0 }
};
var nowDate = /* @__PURE__ */ new Date();
var startDate = new Date(nowDate);
startDate.setHours(WORK_HOURS.start.hour, WORK_HOURS.start.minute, 0, 0);
var endDate = new Date(nowDate);
endDate.setHours(WORK_HOURS.end.hour, WORK_HOURS.end.minute, 0, 0);
var FILE_MGR = FileManager.local();
var cacheDir = FILE_MGR.joinPath(FILE_MGR.documentsDirectory(), "apiCache");
var CACHE_KEEP_DAYS = 7;
var pad2 = (n) => String(n).padStart(2, "0");
var localDateString = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
var dateStr = localDateString(nowDate);
var parseLocalDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
var ensureCacheDir = () => {
  if (!FILE_MGR.fileExists(cacheDir)) {
    FILE_MGR.createDirectory(cacheDir);
  }
};
var pruneCache = () => {
  ensureCacheDir();
  const cutoff = new Date(nowDate);
  cutoff.setDate(cutoff.getDate() - CACHE_KEEP_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  for (const name of FILE_MGR.listContents(cacheDir)) {
    const match = name.match(/_(\d{4}-\d{2}-\d{2})\.json$/);
    if (match && parseLocalDate(match[1]) < cutoff) {
      FILE_MGR.remove(FILE_MGR.joinPath(cacheDir, name));
    }
  }
};
var readCache = (key) => {
  const file = FILE_MGR.joinPath(cacheDir, `${key}_${dateStr}.json`);
  if (!FILE_MGR.fileExists(file)) return null;
  try {
    return JSON.parse(FILE_MGR.readString(file)).data;
  } catch {
    FILE_MGR.remove(file);
    return null;
  }
};
var writeCache = (key, data) => {
  ensureCacheDir();
  FILE_MGR.writeString(
    FILE_MGR.joinPath(cacheDir, `${key}_${dateStr}.json`),
    JSON.stringify({ data })
  );
  pruneCache();
};
var loadJSON = async (url) => {
  const request = new Request(url);
  const response = await request.loadJSON();
  if (response.code === 429) {
    throw new Error("请求过于频繁，请稍后重试");
  }
  return response;
};
var getTodayInfo = async () => {
  const cached = readCache("todayInfo");
  if (cached) return cached;
  const response = await loadJSON(`https://timor.tech/api/holiday/info/${dateStr}`);
  const todayInfo = {
    name: response.type.name,
    isWorkDay: response.type.type === 0 || response.type.type === 3
  };
  writeCache("todayInfo", todayInfo);
  return todayInfo;
};
var getNextWorkDay = async () => {
  const cached = readCache("nextWorkDay");
  const nextWorkDayStr = cached || (await loadJSON(`https://timor.tech/api/holiday/workday/next/${dateStr}`)).workday.date;
  if (!cached) writeCache("nextWorkDay", nextWorkDayStr);
  const nextWorkDay = parseLocalDate(nextWorkDayStr);
  nextWorkDay.setHours(WORK_HOURS.start.hour, WORK_HOURS.start.minute, 0, 0);
  return nextWorkDay;
};
var getNextHoliday = async () => {
  const cached = readCache("nextHoliday");
  if (cached) return cached;
  const response = await loadJSON(
    `https://timor.tech/api/holiday/next/${dateStr}?type=Y&week=N`
  );
  writeCache("nextHoliday", response);
  return response;
};
var getHolidayInfo = async (dates) => {
  const cached = readCache("holidayInfo");
  if (cached) return cached;
  const dateParams = dates.map((date) => `d=${date}`).join("&");
  const response = await loadJSON(
    `https://timor.tech/api/holiday/batch?${dateParams}&type=Y`
  );
  writeCache("holidayInfo", response);
  return response;
};
var getLastWorkdayBeforeHoliday = async (holidayDateStr) => {
  const holidayDate = parseLocalDate(holidayDateStr);
  const dates = [];
  for (let i = 1; i <= 7; i++) {
    const date = new Date(holidayDate);
    date.setDate(date.getDate() - i);
    dates.push(localDateString(date));
  }
  const holidayInfo = await getHolidayInfo(dates);
  for (const value of dates) {
    const typeInfo = holidayInfo.type[value];
    if (typeInfo && (typeInfo.type === 0 || typeInfo.type === 3)) {
      return value;
    }
  }
  const fallback = new Date(holidayDate);
  fallback.setDate(fallback.getDate() - 1);
  return localDateString(fallback);
};
var getWorkCountdown = async (todayInfo) => {
  if (todayInfo.isWorkDay && nowDate < startDate) {
    return { title: "距离上班还有", date: startDate };
  }
  if (todayInfo.isWorkDay && nowDate < endDate) {
    return { title: "距离下班还有", date: endDate };
  }
  return { title: "距离下次上班", date: await getNextWorkDay() };
};
var getHolidayCountdown = async () => {
  const nextHolidayInfo = await getNextHoliday();
  if (!nextHolidayInfo.holiday) return null;
  const holidayName = nextHolidayInfo.holiday.name;
  const lastWorkdayStr = await getLastWorkdayBeforeHoliday(
    nextHolidayInfo.holiday.date
  );
  const countdownDate = parseLocalDate(lastWorkdayStr);
  countdownDate.setHours(WORK_HOURS.end.hour, WORK_HOURS.end.minute, 0, 0);
  if (nowDate > countdownDate) {
    return { title: `现在是${holidayName}假期`, date: null };
  }
  return { title: `距离${holidayName}放假`, date: countdownDate };
};
var setRefreshAfterDate = (widget, todayInfo) => {
  if (todayInfo.isWorkDay && nowDate < startDate) {
    widget.refreshAfterDate = startDate;
  } else if (todayInfo.isWorkDay && nowDate < endDate) {
    widget.refreshAfterDate = new Date(
      Math.min(endDate.getTime(), nowDate.getTime() + 15 * 60 * 1e3)
    );
  } else {
    const tomorrow = new Date(nowDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    widget.refreshAfterDate = tomorrow;
  }
};
var COLORS = {
  // 工作/进度用沉稳的青蓝，假期提示用暖琥珀，底色保持中性
  work: Color.dynamic(new Color("#0F766E"), new Color("#4FD1C5")),
  workSoft: Color.dynamic(new Color("#E1EFED"), new Color("#1E3532")),
  holiday: Color.dynamic(new Color("#C26A0A"), new Color("#F2B155")),
  holidaySoft: Color.dynamic(new Color("#F7EDDD"), new Color("#38301F")),
  text: Color.dynamic(new Color("#1C1E21"), new Color("#F2F3F5")),
  subtext: Color.dynamic(new Color("#6E7478"), new Color("#9BA1A6")),
  track: Color.dynamic(new Color("#E3E6E8"), new Color("#33373B"))
};
var METRICS = {
  small: { hero: 26, barWidth: 118, showHoliday: false },
  medium: { hero: 32, barWidth: 290, showHoliday: true },
  large: { hero: 36, barWidth: 290, showHoliday: true }
};
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var PREVIEW_FAMILIES = [
  "small",
  "medium",
  "large",
  ...ACCESSORY_FAMILIES
];
var ACCESSORY_FOREGROUND = Color.dynamic(
  new Color("#111111"),
  new Color("#FFFFFF")
);
var ACCESSORY_SECONDARY = Color.dynamic(
  new Color("#111111", 0.62),
  new Color("#FFFFFF", 0.68)
);
var ACCESSORY_TRACK = Color.dynamic(
  new Color("#111111", 0.2),
  new Color("#FFFFFF", 0.22)
);
var WEEKDAYS = "日一二三四五六";
var PHASES = {
  beforeWork: { label: "待上班", symbol: "sunrise.fill" },
  working: { label: "工作中", symbol: "sun.max.fill" },
  afterWork: { label: "已下班", symbol: "moon.stars.fill" },
  rest: { label: "休息日", symbol: "cup.and.saucer.fill" }
};
var ACCESSORY_PHASES = {
  beforeWork: { label: "待上班", symbol: "sunrise.fill" },
  working: { label: "工作中", symbol: "briefcase.fill" },
  afterWork: { label: "已下班", symbol: "sunset.fill" },
  rest: { label: "休息日", symbol: "leaf.fill" }
};
var getPhase = (todayInfo) => {
  if (!todayInfo.isWorkDay) return "rest";
  if (nowDate < startDate) return "beforeWork";
  if (nowDate < endDate) return "working";
  return "afterWork";
};
var getWorkProgress = () => {
  const total = endDate - startDate;
  return Math.min(Math.max((nowDate - startDate) / total, 0), 1);
};
var formatCompactDuration = (date) => {
  const totalMinutes = Math.max(1, Math.ceil((date - nowDate) / 6e4));
  if (totalMinutes < 60) return `${totalMinutes}分钟`;
  if (totalMinutes < 24 * 60) {
    const hours2 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours2}时${minutes ? `${minutes}分` : ""}`;
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor(totalMinutes % (24 * 60) / 60);
  return `${days}天${hours ? `${hours}时` : ""}`;
};
var setAccessoryRefreshAfterDate = (widget) => {
  const nextRefresh = new Date(nowDate.getTime() + 15 * 60 * 1e3);
  if (!widget.refreshAfterDate || widget.refreshAfterDate > nextRefresh) {
    widget.refreshAfterDate = nextRefresh;
  }
};
var addAccessoryInline = (widget, phase, countdown) => {
  widget.setPadding(0, 0, 0, 0);
  const row = widget.addStack();
  row.centerAlignContent();
  const info = ACCESSORY_PHASES[phase];
  const icon = row.addImage(SFSymbol.named(info.symbol).image);
  icon.imageSize = new Size(12, 12);
  icon.tintColor = ACCESSORY_FOREGROUND;
  row.addSpacer(4);
  let value;
  if (phase === "working") {
    value = `上班中 ${Math.round(getWorkProgress() * 100)}%`;
  } else if (phase === "afterWork") {
    value = `距上班 ${formatCompactDuration(countdown.date)}`;
  } else if (phase === "rest") {
    value = `休息 · 距上班 ${formatCompactDuration(countdown.date)}`;
  } else {
    value = `距上班 ${formatCompactDuration(countdown.date)}`;
  }
  const text = row.addText(value);
  text.font = Font.semiboldSystemFont(12);
  text.textColor = ACCESSORY_FOREGROUND;
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.8;
};
var createAccessoryCircularImage = (phase) => {
  const size = 54;
  const center = size / 2;
  const radius = 23;
  const dotSize = 3;
  const dotCount = 48;
  const context = new DrawContext();
  context.size = new Size(size, size);
  context.opaque = false;
  context.respectScreenScale = true;
  const progress = phase === "working" ? getWorkProgress() : phase === "afterWork" ? 1 : 0;
  const activeDots = Math.round(progress * dotCount);
  for (let index = 0; index < dotCount; index++) {
    const angle = -Math.PI / 2 + index / dotCount * Math.PI * 2;
    const x = center + Math.cos(angle) * radius - dotSize / 2;
    const y = center + Math.sin(angle) * radius - dotSize / 2;
    context.setFillColor(
      new Color("#FFFFFF", index < activeDots ? 1 : 0.2)
    );
    context.fillEllipse(new Rect(x, y, dotSize, dotSize));
  }
  context.setTextAlignedCenter();
  context.setTextColor(new Color("#FFFFFF"));
  if (phase === "working") {
    context.setFont(Font.semiboldRoundedSystemFont(15));
    context.drawTextInRect(
      `${Math.round(progress * 100)}%`,
      new Rect(4, 18, size - 8, 20)
    );
  } else {
    const info = ACCESSORY_PHASES[phase];
    const symbol = SFSymbol.named(info.symbol);
    symbol.applyFont(Font.systemFont(18));
    context.drawImageInRect(symbol.image, new Rect(18, 11, 18, 18));
    context.setFont(Font.mediumSystemFont(9));
    context.drawTextInRect(info.label, new Rect(4, 32, size - 8, 13));
  }
  return context.getImage();
};
var addAccessoryCircular = (widget, phase) => {
  widget.setPadding(0, 0, 0, 0);
  widget.addSpacer();
  const row = widget.addStack();
  row.addSpacer();
  const image = row.addImage(createAccessoryCircularImage(phase));
  image.imageSize = new Size(54, 54);
  image.tintColor = ACCESSORY_FOREGROUND;
  row.addSpacer();
  widget.addSpacer();
};
var addAccessoryRectangular = (widget, phase, countdown) => {
  widget.setPadding(5, 7, 5, 7);
  const info = ACCESSORY_PHASES[phase];
  const progress = getWorkProgress();
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named(info.symbol).image);
  icon.imageSize = new Size(11, 11);
  icon.tintColor = ACCESSORY_FOREGROUND;
  header.addSpacer(4);
  const status = header.addText(info.label);
  status.font = Font.semiboldSystemFont(11);
  status.textColor = ACCESSORY_FOREGROUND;
  header.addSpacer();
  const schedule = header.addText("09:30–18:00");
  schedule.font = Font.mediumSystemFont(9);
  schedule.textColor = ACCESSORY_SECONDARY;
  widget.addSpacer(2);
  const main = widget.addStack();
  main.centerAlignContent();
  const prefix = main.addText(phase === "working" ? "还剩 " : "距上班 ");
  prefix.font = Font.mediumSystemFont(11);
  prefix.textColor = ACCESSORY_SECONDARY;
  const duration = main.addText(formatCompactDuration(countdown.date));
  duration.font = Font.semiboldRoundedSystemFont(16);
  duration.textColor = ACCESSORY_FOREGROUND;
  duration.lineLimit = 1;
  duration.minimumScaleFactor = 0.8;
  if (phase === "working") {
    main.addSpacer();
    const percent = main.addText(`${Math.round(progress * 100)}%`);
    percent.font = Font.semiboldRoundedSystemFont(11);
    percent.textColor = ACCESSORY_SECONDARY;
    widget.addSpacer(5);
    const barWidth = 140;
    const bar = widget.addStack();
    bar.size = new Size(barWidth, 3);
    bar.cornerRadius = 1.5;
    bar.backgroundColor = ACCESSORY_TRACK;
    const fill = bar.addStack();
    const fillWidth = Math.round(barWidth * progress);
    if (fillWidth > 0) {
      fill.size = new Size(fillWidth, 3);
      fill.cornerRadius = 1.5;
      fill.backgroundColor = ACCESSORY_FOREGROUND;
    }
    bar.addSpacer();
  }
};
var addAccessoryError = (widget, family) => {
  widget.setPadding(4, 6, 4, 6);
  const row = widget.addStack();
  row.centerAlignContent();
  row.addSpacer();
  const icon = row.addImage(
    SFSymbol.named("exclamationmark.triangle.fill").image
  );
  icon.imageSize = new Size(13, 13);
  icon.tintColor = ACCESSORY_FOREGROUND;
  if (family !== "accessoryCircular") {
    row.addSpacer(4);
    const text = row.addText("数据加载失败");
    text.font = Font.mediumSystemFont(11);
    text.textColor = ACCESSORY_FOREGROUND;
    text.lineLimit = 1;
  }
  row.addSpacer();
};
var addAccessoryContent = (widget, family, phase, countdown) => {
  if (family === "accessoryInline") {
    addAccessoryInline(widget, phase, countdown);
  } else if (family === "accessoryCircular") {
    addAccessoryCircular(widget, phase);
  } else {
    addAccessoryRectangular(widget, phase, countdown);
  }
};
var addHeader = (widget, phase) => {
  const header = widget.addStack();
  header.centerAlignContent();
  const info = PHASES[phase];
  const icon = header.addImage(SFSymbol.named(info.symbol).image);
  icon.imageSize = new Size(14, 14);
  icon.tintColor = COLORS.work;
  header.addSpacer(6);
  const dateText = header.addText(
    `${nowDate.getMonth() + 1}月${nowDate.getDate()}日 周${WEEKDAYS[nowDate.getDay()]}`
  );
  dateText.font = Font.mediumSystemFont(12);
  dateText.textColor = COLORS.subtext;
  dateText.lineLimit = 1;
  header.addSpacer();
  const pill = header.addStack();
  pill.setPadding(3, 10, 3, 10);
  pill.backgroundColor = COLORS.workSoft;
  pill.cornerRadius = 10;
  const pillText = pill.addText(info.label);
  pillText.font = Font.semiboldSystemFont(11);
  pillText.textColor = COLORS.work;
};
var addHero = (widget, countdown, metrics) => {
  const title = widget.addText(countdown.title);
  title.textColor = COLORS.subtext;
  title.lineLimit = 1;
  if (countdown.date) {
    title.font = Font.mediumSystemFont(13);
    widget.addSpacer(2);
    const time = widget.addDate(countdown.date);
    time.font = Font.boldSystemFont(metrics.hero);
    time.textColor = COLORS.text;
    time.applyRelativeStyle();
    time.minimumScaleFactor = 0.6;
  } else {
    title.font = Font.boldSystemFont(metrics.hero - 8);
    title.textColor = COLORS.text;
    title.minimumScaleFactor = 0.7;
  }
};
var addProgress = (widget, metrics) => {
  const pct = getWorkProgress();
  const bar = widget.addStack();
  bar.size = new Size(metrics.barWidth, 8);
  bar.cornerRadius = 4;
  bar.backgroundColor = COLORS.track;
  const fill = bar.addStack();
  const fillWidth = Math.round(metrics.barWidth * pct);
  if (fillWidth > 0) {
    fill.size = new Size(fillWidth, 8);
    fill.cornerRadius = 4;
    fill.backgroundColor = COLORS.work;
  }
  bar.addSpacer();
  widget.addSpacer(6);
  const label = widget.addText(`今日工作进度 ${Math.round(pct * 100)}%`);
  label.font = Font.mediumSystemFont(11);
  label.textColor = COLORS.subtext;
};
var addHolidayCard = (widget, holiday) => {
  const card = widget.addStack();
  card.setPadding(8, 12, 8, 12);
  card.backgroundColor = COLORS.holidaySoft;
  card.cornerRadius = 12;
  card.centerAlignContent();
  const icon = card.addImage(SFSymbol.named("airplane").image);
  icon.imageSize = new Size(16, 16);
  icon.tintColor = COLORS.holiday;
  card.addSpacer(8);
  const content = card.addStack();
  content.layoutVertically();
  const title = content.addText(holiday.title);
  title.font = Font.mediumSystemFont(11);
  title.textColor = COLORS.subtext;
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.8;
  if (holiday.date) {
    content.addSpacer(2);
    const date = content.addDate(holiday.date);
    date.font = Font.semiboldSystemFont(15);
    date.textColor = COLORS.text;
    date.applyRelativeStyle();
    date.minimumScaleFactor = 0.7;
  }
};
var addMediumWorkingContent = (widget, countdown, holiday, metrics) => {
  const main = widget.addStack();
  main.centerAlignContent();
  const hero = main.addStack();
  hero.layoutVertically();
  addHero(hero, countdown, metrics);
  if (holiday) {
    main.addSpacer(12);
    addHolidayCard(main, holiday);
  }
  widget.addSpacer(10);
  addProgress(widget, metrics);
};
var createWidget = async (family = config.widgetFamily || "medium") => {
  const widget = new ListWidget();
  const widgetFamily = family;
  const metrics = METRICS[widgetFamily] || METRICS.medium;
  const isAccessory = ACCESSORY_FAMILIES.includes(widgetFamily);
  if (!isAccessory) {
    const gradient = new LinearGradient();
    gradient.colors = [
      Color.dynamic(new Color("#FAFAF8"), new Color("#161719")),
      Color.dynamic(new Color("#EEF0F1"), new Color("#222426"))
    ];
    gradient.locations = [0, 1];
    gradient.startPoint = new Point(0, 0);
    gradient.endPoint = new Point(1, 1);
    widget.backgroundGradient = gradient;
    widget.setPadding(14, 16, 14, 16);
  }
  try {
    const todayInfo = await getTodayInfo();
    const workCountdown = await getWorkCountdown(todayInfo);
    setRefreshAfterDate(widget, todayInfo);
    const phase = getPhase(todayInfo);
    if (isAccessory) {
      setAccessoryRefreshAfterDate(widget);
      addAccessoryContent(widget, widgetFamily, phase, workCountdown);
      return attachMenuURL(widget);
    }
    let holidayCountdown = null;
    if (metrics.showHoliday) {
      try {
        holidayCountdown = await getHolidayCountdown();
      } catch {
      }
    }
    addHeader(widget, phase);
    widget.addSpacer();
    if (widgetFamily === "medium" && phase === "working") {
      addMediumWorkingContent(widget, workCountdown, holidayCountdown, metrics);
    } else {
      addHero(widget, workCountdown, metrics);
      if (phase === "working") {
        widget.addSpacer(10);
        addProgress(widget, metrics);
      }
      if (holidayCountdown) {
        widget.addSpacer();
        addHolidayCard(widget, holidayCountdown);
      }
    }
    if (widgetFamily === "large") {
      widget.addSpacer(8);
      const footer = widget.addText(
        `工作时间 ${pad2(WORK_HOURS.start.hour)}:${pad2(WORK_HOURS.start.minute)} – ${pad2(WORK_HOURS.end.hour)}:${pad2(WORK_HOURS.end.minute)}`
      );
      footer.font = Font.systemFont(10);
      footer.textColor = COLORS.subtext;
    }
  } catch (error) {
    if (isAccessory) {
      addAccessoryError(widget, widgetFamily);
      return attachMenuURL(widget);
    }
    widget.addSpacer();
    const icon = widget.addImage(
      SFSymbol.named("exclamationmark.triangle.fill").image
    );
    icon.imageSize = new Size(24, 24);
    icon.tintColor = COLORS.work;
    widget.addSpacer(6);
    const errorText = widget.addText(error.message || "数据加载失败");
    errorText.font = Font.mediumSystemFont(13);
    errorText.textColor = COLORS.text;
    errorText.minimumScaleFactor = 0.7;
    widget.addSpacer();
  }
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "下班助手",
    version: "2.1.2",
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
