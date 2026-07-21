// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// @script-id work-helper
// @version 2.0.0

// src/lib/updater.js
var DEFAULT_CHECK_INTERVAL = 24 * 3600;
var UPDATE_KEY_PREFIX = "scriptable.updater";
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
  version: "2.0.0",
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
var addCountdown = (widget2, countdown, secondary = false) => {
  const title = widget2.addText(countdown.title);
  title.font = Font.boldSystemFont(secondary ? 14 : 18);
  title.centerAlignText();
  if (countdown.date) {
    const date = widget2.addDate(countdown.date);
    date.font = Font.boldSystemFont(secondary ? 16 : 20);
    date.applyRelativeStyle();
    date.centerAlignText();
  }
};
var createWidget = async () => {
  const widget2 = new ListWidget();
  widget2.spacing = 8;
  try {
    const todayInfo = await getTodayInfo();
    const workCountdown = await getWorkCountdown(todayInfo);
    setRefreshAfterDate(widget2, todayInfo);
    addCountdown(widget2, workCountdown);
    const widgetFamily = config.widgetFamily || "medium";
    if (widgetFamily !== "small") {
      try {
        const holidayCountdown = await getHolidayCountdown();
        if (holidayCountdown) {
          widget2.addSpacer(4);
          addCountdown(widget2, holidayCountdown, true);
        }
      } catch {
      }
    }
  } catch (error) {
    const errorText = widget2.addText(error.message || "数据加载失败");
    errorText.font = Font.boldSystemFont(18);
    errorText.centerAlignText();
  }
  return widget2;
};
var widget = await createWidget();
Script.setWidget(widget);
if (config.runsInApp) {
  widget.presentMedium();
}
