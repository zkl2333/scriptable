import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';

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

const COLORS = {
  // 工作/进度用沉稳的青蓝，假期提示用暖琥珀，底色保持中性
  work: Color.dynamic(new Color('#0F766E'), new Color('#4FD1C5')),
  workSoft: Color.dynamic(new Color('#E1EFED'), new Color('#1E3532')),
  holiday: Color.dynamic(new Color('#C26A0A'), new Color('#F2B155')),
  holidaySoft: Color.dynamic(new Color('#F7EDDD'), new Color('#38301F')),
  text: Color.dynamic(new Color('#1C1E21'), new Color('#F2F3F5')),
  subtext: Color.dynamic(new Color('#6E7478'), new Color('#9BA1A6')),
  track: Color.dynamic(new Color('#E3E6E8'), new Color('#33373B')),
};

const METRICS = {
  small: { hero: 26, barWidth: 118, showHoliday: false },
  medium: { hero: 32, barWidth: 290, showHoliday: true },
  large: { hero: 36, barWidth: 290, showHoliday: true },
};

const WEEKDAYS = '日一二三四五六';

const PHASES = {
  beforeWork: { label: '待上班', symbol: 'sunrise.fill' },
  working: { label: '工作中', symbol: 'sun.max.fill' },
  afterWork: { label: '已下班', symbol: 'moon.stars.fill' },
  rest: { label: '休息日', symbol: 'cup.and.saucer.fill' },
};

const getPhase = (todayInfo) => {
  if (!todayInfo.isWorkDay) return 'rest';
  if (nowDate < startDate) return 'beforeWork';
  if (nowDate < endDate) return 'working';
  return 'afterWork';
};

const addHeader = (widget, phase) => {
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

const addHero = (widget, countdown, metrics) => {
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
    // 假期中没有目标时间，标题即主体
    title.font = Font.boldSystemFont(metrics.hero - 8);
    title.textColor = COLORS.text;
    title.minimumScaleFactor = 0.7;
  }
};

const addProgress = (widget, metrics) => {
  const total = endDate - startDate;
  const pct = Math.min(Math.max((nowDate - startDate) / total, 0), 1);

  const bar = widget.addStack();
  bar.size = new Size(metrics.barWidth, 8);
  bar.cornerRadius = 4;
  bar.backgroundColor = COLORS.track;
  const fill = bar.addStack();
  fill.size = new Size(Math.max(8, Math.round(metrics.barWidth * pct)), 8);
  fill.cornerRadius = 4;
  fill.backgroundColor = COLORS.work;

  widget.addSpacer(6);
  const label = widget.addText(`今日工作进度 ${Math.round(pct * 100)}%`);
  label.font = Font.mediumSystemFont(11);
  label.textColor = COLORS.subtext;
};

const addHolidayCard = (widget, holiday) => {
  const card = widget.addStack();
  card.setPadding(8, 12, 8, 12);
  card.backgroundColor = COLORS.holidaySoft;
  card.cornerRadius = 12;
  card.centerAlignContent();

  const icon = card.addImage(SFSymbol.named('airplane').image);
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

const createWidget = async (family = config.widgetFamily || 'medium') => {
  const widget = new ListWidget();
  const widgetFamily = family;
  const metrics = METRICS[widgetFamily] || METRICS.medium;

  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#FAFAF8'), new Color('#161719')),
    Color.dynamic(new Color('#EEF0F1'), new Color('#222426')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  widget.setPadding(14, 16, 14, 16);

  try {
    const todayInfo = await getTodayInfo();
    const workCountdown = await getWorkCountdown(todayInfo);
    setRefreshAfterDate(widget, todayInfo);
    const phase = getPhase(todayInfo);

    addHeader(widget, phase);
    widget.addSpacer();
    addHero(widget, workCountdown, metrics);

    if (phase === 'working') {
      widget.addSpacer(10);
      addProgress(widget, metrics);
    }

    if (metrics.showHoliday) {
      let holidayCountdown = null;
      try {
        holidayCountdown = await getHolidayCountdown();
      } catch {
        // 假期信息是次要内容，加载失败时仍保留上班倒计时
      }
      if (holidayCountdown) {
        widget.addSpacer();
        addHolidayCard(widget, holidayCountdown);
      }
    }

    if (widgetFamily === 'large') {
      widget.addSpacer(8);
      const footer = widget.addText(
        `工作时间 ${pad2(WORK_HOURS.start.hour)}:${pad2(WORK_HOURS.start.minute)} – ${pad2(WORK_HOURS.end.hour)}:${pad2(WORK_HOURS.end.minute)}`
      );
      footer.font = Font.systemFont(10);
      footer.textColor = COLORS.subtext;
    }
  } catch (error) {
    widget.addSpacer();
    const icon = widget.addImage(
      SFSymbol.named('exclamationmark.triangle.fill').image
    );
    icon.imageSize = new Size(24, 24);
    icon.tintColor = COLORS.work;
    widget.addSpacer(6);
    const errorText = widget.addText(error.message || '数据加载失败');
    errorText.font = Font.mediumSystemFont(13);
    errorText.textColor = COLORS.text;
    errorText.minimumScaleFactor = 0.7;
    widget.addSpacer();
  }

  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '下班助手',
    version: __SCRIPT_VERSION__,
    updater,
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(await createWidget());
}

Script.complete();
