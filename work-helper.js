// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// 定义上下班时间常量
const WORK_HOURS = {
  start: { hour: 9, minute: 30 },
  end: { hour: 18, minute: 0 },
};

const nowDate = new Date();
const startDate = new Date(
  new Date().setHours(WORK_HOURS.start.hour, WORK_HOURS.start.minute, 0)
);
const endDate = new Date(
  new Date().setHours(WORK_HOURS.end.hour, WORK_HOURS.end.minute, 0)
);

const isWorkTime = startDate < nowDate && nowDate < endDate;

// 缓存是纯本地产物，始终用 local FileManager，不进 iCloud、不跨设备同步
const FILE_MGR = FileManager.local();

// 定义缓存目录和文件路径
const cacheDir = FILE_MGR.joinPath(FILE_MGR.documentsDirectory(), 'apiCache');
const CACHE_KEEP_DAYS = 7; // 只保留最近 7 天的缓存

const ensureCacheDir = () => {
  if (!FILE_MGR.fileExists(cacheDir)) {
    FILE_MGR.createDirectory(cacheDir);
  }
};

// 清理过期缓存文件
const pruneCache = () => {
  ensureCacheDir();
  const cutoff = Date.now() - CACHE_KEEP_DAYS * 86400 * 1000;
  for (const name of FILE_MGR.listContents(cacheDir)) {
    const m = name.match(/_(\d{4}-\d{2}-\d{2})\.json$/);
    if (m && new Date(m[1]).getTime() < cutoff) {
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
    // 缓存损坏：删除并回源重新请求
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

// 获取今天的日期字符串（本地时区，避免 UTC 偏差导致早上取错日期）
const pad2 = (n) => String(n).padStart(2, '0');
const dateStr = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}-${pad2(nowDate.getDate())}`;

// 获取今天是否是工作日
const getTodayInfo = async () => {
  // 检查缓存
  const cached = readCache('todayInfo');
  if (cached) return cached;

  // 请求API
  try {
    const url = `https://timor.tech/api/holiday/info/${dateStr}`;
    const request = new Request(url);
    const res = await request.loadJSON();

    if (res.code === 429) {
      throw new Error('请求过于频繁，请稍后重试');
    }

    // 根据 res.type.type 判断类型
    let todayInfo;
    if (res.type.type === 0 || res.type.type === 3) {
      todayInfo = {
        name: res.type.name,
        isWorkDay: true,
      };
    } else {
      todayInfo = {
        name: res.type.name,
        isWorkDay: false,
      };
    }

    // 缓存数据
    writeCache('todayInfo', todayInfo);

    return todayInfo;
  } catch (error) {
    throw error;
  }
};

// 获取下一个工作日
const getNextWorkDay = async () => {
  // 检查缓存
  const cached = readCache('nextWorkDay');
  if (cached) {
    return new Date(
      new Date(cached).setHours(
        WORK_HOURS.start.hour,
        WORK_HOURS.start.minute,
        0
      )
    );
  }

  // 请求API
  try {
    const url = `https://timor.tech/api/holiday/workday/next/${dateStr}`;
    const request = new Request(url);
    const res = await request.loadJSON();

    if (res.code === 429) {
      throw new Error('请求过于频繁，请稍后重试');
    }

    const nextWorkDayDate = res.workday.date;

    // 缓存数据
    writeCache('nextWorkDay', nextWorkDayDate);

    return new Date(
      new Date(nextWorkDayDate).setHours(
        WORK_HOURS.start.hour,
        WORK_HOURS.start.minute,
        0
      )
    );
  } catch (error) {
    throw error;
  }
};

// 设置刷新时间
const setRefreshAfterDate = (widget) => {
  const dayEndDate = new Date(new Date().setHours(23, 59, 59));
  if (isWorkTime) {
    widget.refreshAfterDate = endDate;
  } else if (nowDate > endDate) {
    widget.refreshAfterDate = dayEndDate;
  } else {
    widget.refreshAfterDate = startDate;
  }
};

const createWidget = async () => {
  // 创建小部件
  const widget = new ListWidget();
  widget.spacing = 12;
  setRefreshAfterDate(widget);

  try {
    const todayInfo = await getTodayInfo();
    const nextWorkDay = await getNextWorkDay();

    // 今天是工作日的早上
    if (todayInfo.isWorkDay && nowDate < startDate) {
      const titleText = widget.addText('距离上班还有');
      titleText.font = Font.boldSystemFont(18);
      titleText.centerAlignText();

      const widgetData = widget.addDate(startDate);
      widgetData.font = Font.boldSystemFont(18);
      widgetData.applyRelativeStyle();
      widgetData.centerAlignText();
    }

    // 今天是工作日的工作时间
    else if (todayInfo.isWorkDay && isWorkTime) {
      const titleText = widget.addText('距离下班还有');
      titleText.font = Font.boldSystemFont(18);
      titleText.centerAlignText();

      const widgetData = widget.addDate(endDate);
      widgetData.font = Font.boldSystemFont(18);
      widgetData.applyRelativeStyle();
      widgetData.centerAlignText();
    }

    // 其他时间
    else {
      const titleText = widget.addText('距离下次上班');
      titleText.font = Font.boldSystemFont(18);
      titleText.centerAlignText();

      const widgetData = widget.addDate(nextWorkDay);
      widgetData.font = Font.boldSystemFont(18);
      widgetData.applyRelativeStyle();
      widgetData.centerAlignText();
    }
  } catch (error) {
    // 显示错误信息
    const errorText = widget.addText(error.message || '数据加载失败');
    errorText.font = Font.boldSystemFont(18);
    errorText.centerAlignText();
  }

  return widget;
};

const widget = await createWidget();

// 设置部件
Script.setWidget(widget);

if (config.runsInApp) {
  widget.presentMedium();
}
