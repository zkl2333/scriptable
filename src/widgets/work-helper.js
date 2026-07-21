import { createUpdater } from '../lib/updater.js';

const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
await updater.autoUpdate();

const WORK_HOURS = {
  start: { hour: 9, minute: 30 },
  end: { hour: 18, minute: 0 },
};

const nowDate = new Date();
const startDate = new Date(nowDate);
startDate.setHours(WORK_HOURS.start.hour, WORK_HOURS.start.minute, 0, 0);
const endDate = new Date(nowDate);
endDate.setHours(WORK_HOURS.end.hour, WORK_HOURS.end.minute, 0, 0);

// 缓存是纯本地产物，始终用 local FileManager，不进 iCloud、不跨设备同步
const FILE_MGR = FileManager.local();
const cacheDir = FILE_MGR.joinPath(FILE_MGR.documentsDirectory(), 'apiCache');
const CACHE_KEEP_DAYS = 7;

const pad2 = (n) => String(n).padStart(2, '0');
const localDateString = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const dateStr = localDateString(nowDate);

const parseLocalDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const ensureCacheDir = () => {
  if (!FILE_MGR.fileExists(cacheDir)) {
    FILE_MGR.createDirectory(cacheDir);
  }
};

const pruneCache = () => {
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

const readCache = (key) => {
  const file = FILE_MGR.joinPath(cacheDir, `${key}_${dateStr}.json`);
  if (!FILE_MGR.fileExists(file)) return null;
  try {
    return JSON.parse(FILE_MGR.readString(file)).data;
  } catch {
    FILE_MGR.remove(file);
    return null;
  }
};

const writeCache = (key, data) => {
  ensureCacheDir();
  FILE_MGR.writeString(
    FILE_MGR.joinPath(cacheDir, `${key}_${dateStr}.json`),
    JSON.stringify({ data })
  );
  pruneCache();
};

const loadJSON = async (url) => {
  const request = new Request(url);
  const response = await request.loadJSON();
  if (response.code === 429) {
    throw new Error('请求过于频繁，请稍后重试');
  }
  return response;
};

const getTodayInfo = async () => {
  const cached = readCache('todayInfo');
  if (cached) return cached;

  const response = await loadJSON(`https://timor.tech/api/holiday/info/${dateStr}`);
  const todayInfo = {
    name: response.type.name,
    isWorkDay: response.type.type === 0 || response.type.type === 3,
  };
  writeCache('todayInfo', todayInfo);
  return todayInfo;
};

const getNextWorkDay = async () => {
  const cached = readCache('nextWorkDay');
  const nextWorkDayStr =
    cached ||
    (await loadJSON(`https://timor.tech/api/holiday/workday/next/${dateStr}`)).workday.date;

  if (!cached) writeCache('nextWorkDay', nextWorkDayStr);

  const nextWorkDay = parseLocalDate(nextWorkDayStr);
  nextWorkDay.setHours(WORK_HOURS.start.hour, WORK_HOURS.start.minute, 0, 0);
  return nextWorkDay;
};

const getNextHoliday = async () => {
  const cached = readCache('nextHoliday');
  if (cached) return cached;

  const response = await loadJSON(
    `https://timor.tech/api/holiday/next/${dateStr}?type=Y&week=N`
  );
  writeCache('nextHoliday', response);
  return response;
};

const getHolidayInfo = async (dates) => {
  const cached = readCache('holidayInfo');
  if (cached) return cached;

  const dateParams = dates.map((date) => `d=${date}`).join('&');
  const response = await loadJSON(
    `https://timor.tech/api/holiday/batch?${dateParams}&type=Y`
  );
  writeCache('holidayInfo', response);
  return response;
};

const getLastWorkdayBeforeHoliday = async (holidayDateStr) => {
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

const getWorkCountdown = async (todayInfo) => {
  if (todayInfo.isWorkDay && nowDate < startDate) {
    return { title: '距离上班还有', date: startDate };
  }

  if (todayInfo.isWorkDay && nowDate < endDate) {
    return { title: '距离下班还有', date: endDate };
  }

  return { title: '距离下次上班', date: await getNextWorkDay() };
};

const getHolidayCountdown = async () => {
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

const setRefreshAfterDate = (widget, todayInfo) => {
  if (todayInfo.isWorkDay && nowDate < startDate) {
    widget.refreshAfterDate = startDate;
  } else if (todayInfo.isWorkDay && nowDate < endDate) {
    widget.refreshAfterDate = endDate;
  } else {
    const tomorrow = new Date(nowDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    widget.refreshAfterDate = tomorrow;
  }
};

const addCountdown = (widget, countdown, secondary = false) => {
  const title = widget.addText(countdown.title);
  title.font = Font.boldSystemFont(secondary ? 14 : 18);
  title.centerAlignText();

  if (countdown.date) {
    const date = widget.addDate(countdown.date);
    date.font = Font.boldSystemFont(secondary ? 16 : 20);
    date.applyRelativeStyle();
    date.centerAlignText();
  }
};

const createWidget = async () => {
  const widget = new ListWidget();
  widget.spacing = 8;

  try {
    const todayInfo = await getTodayInfo();
    const workCountdown = await getWorkCountdown(todayInfo);
    setRefreshAfterDate(widget, todayInfo);
    addCountdown(widget, workCountdown);

    const widgetFamily = config.widgetFamily || 'medium';
    if (widgetFamily !== 'small') {
      try {
        const holidayCountdown = await getHolidayCountdown();
        if (holidayCountdown) {
          widget.addSpacer(4);
          addCountdown(widget, holidayCountdown, true);
        }
      } catch {
        // 假期信息是次要内容，加载失败时仍保留上班倒计时
      }
    }
  } catch (error) {
    const errorText = widget.addText(error.message || '数据加载失败');
    errorText.font = Font.boldSystemFont(18);
    errorText.centerAlignText();
  }

  return widget;
};

const widget = await createWidget();
Script.setWidget(widget);

if (config.runsInApp) {
  widget.presentMedium();
}
