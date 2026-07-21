// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// @script-id work-helper
// @version 2.0.2

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
  const checkForUpdate = async ({ force = false } = {}) => {
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
  const applyUpdateIfAny = async ({ interactive = false } = {}) => {
    const update = await checkForUpdate({ force: interactive });
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
  return { applyUpdateIfAny, autoUpdate, checkForUpdate };
};

// src/widgets/work-helper.js
var updater = createUpdater({
  scriptId: "work-helper",
  version: "2.0.2",
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
var setRefreshAfterDate = (widget2, todayInfo) => {
  if (todayInfo.isWorkDay && nowDate < startDate) {
    widget2.refreshAfterDate = startDate;
  } else if (todayInfo.isWorkDay && nowDate < endDate) {
    widget2.refreshAfterDate = endDate;
  } else {
    const tomorrow = new Date(nowDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    widget2.refreshAfterDate = tomorrow;
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
var WEEKDAYS = "日一二三四五六";
var PHASES = {
  beforeWork: { label: "待上班", symbol: "sunrise.fill" },
  working: { label: "工作中", symbol: "sun.max.fill" },
  afterWork: { label: "已下班", symbol: "moon.stars.fill" },
  rest: { label: "休息日", symbol: "cup.and.saucer.fill" }
};
var getPhase = (todayInfo) => {
  if (!todayInfo.isWorkDay) return "rest";
  if (nowDate < startDate) return "beforeWork";
  if (nowDate < endDate) return "working";
  return "afterWork";
};
var addHeader = (widget2, phase) => {
  const header = widget2.addStack();
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
var addHero = (widget2, countdown, metrics) => {
  const title = widget2.addText(countdown.title);
  title.textColor = COLORS.subtext;
  title.lineLimit = 1;
  if (countdown.date) {
    title.font = Font.mediumSystemFont(13);
    widget2.addSpacer(2);
    const time = widget2.addDate(countdown.date);
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
var addProgress = (widget2, metrics) => {
  const total = endDate - startDate;
  const pct = Math.min(Math.max((nowDate - startDate) / total, 0), 1);
  const bar = widget2.addStack();
  bar.size = new Size(metrics.barWidth, 8);
  bar.cornerRadius = 4;
  bar.backgroundColor = COLORS.track;
  const fill = bar.addStack();
  fill.size = new Size(Math.max(8, Math.round(metrics.barWidth * pct)), 8);
  fill.cornerRadius = 4;
  fill.backgroundColor = COLORS.work;
  widget2.addSpacer(6);
  const label = widget2.addText(`今日工作进度 ${Math.round(pct * 100)}%`);
  label.font = Font.mediumSystemFont(11);
  label.textColor = COLORS.subtext;
};
var addHolidayCard = (widget2, holiday) => {
  const card = widget2.addStack();
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
var createWidget = async () => {
  const widget2 = new ListWidget();
  const widgetFamily = config.widgetFamily || "medium";
  const metrics = METRICS[widgetFamily] || METRICS.medium;
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#FAFAF8"), new Color("#161719")),
    Color.dynamic(new Color("#EEF0F1"), new Color("#222426"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget2.backgroundGradient = gradient;
  widget2.setPadding(14, 16, 14, 16);
  try {
    const todayInfo = await getTodayInfo();
    const workCountdown = await getWorkCountdown(todayInfo);
    setRefreshAfterDate(widget2, todayInfo);
    const phase = getPhase(todayInfo);
    addHeader(widget2, phase);
    widget2.addSpacer();
    addHero(widget2, workCountdown, metrics);
    if (phase === "working") {
      widget2.addSpacer(10);
      addProgress(widget2, metrics);
    }
    if (metrics.showHoliday) {
      let holidayCountdown = null;
      try {
        holidayCountdown = await getHolidayCountdown();
      } catch {
      }
      if (holidayCountdown) {
        widget2.addSpacer();
        addHolidayCard(widget2, holidayCountdown);
      }
    }
    if (widgetFamily === "large") {
      widget2.addSpacer(8);
      const footer = widget2.addText(
        `工作时间 ${pad2(WORK_HOURS.start.hour)}:${pad2(WORK_HOURS.start.minute)} – ${pad2(WORK_HOURS.end.hour)}:${pad2(WORK_HOURS.end.minute)}`
      );
      footer.font = Font.systemFont(10);
      footer.textColor = COLORS.subtext;
    }
  } catch (error) {
    widget2.addSpacer();
    const icon = widget2.addImage(
      SFSymbol.named("exclamationmark.triangle.fill").image
    );
    icon.imageSize = new Size(24, 24);
    icon.tintColor = COLORS.work;
    widget2.addSpacer(6);
    const errorText = widget2.addText(error.message || "数据加载失败");
    errorText.font = Font.mediumSystemFont(13);
    errorText.textColor = COLORS.text;
    errorText.minimumScaleFactor = 0.7;
    widget2.addSpacer();
  }
  return widget2;
};
var widget = await createWidget();
Script.setWidget(widget);
if (config.runsInApp) {
  widget.presentMedium();
}
