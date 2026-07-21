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

// 自动选择文件管理器实例
const FILE_MGR = FileManager[
  module.filename.includes('Documents/iCloud~') ? 'iCloud' : 'local'
]();

// 定义缓存目录和文件路径
const cacheDir = FILE_MGR.joinPath(FILE_MGR.documentsDirectory(), 'apiCache');
if (!FILE_MGR.fileExists(cacheDir)) {
  FILE_MGR.createDirectory(cacheDir);
}

// 获取今天的日期字符串
const dateStr = nowDate.toISOString().split('T')[0];

// 获取今天是否是工作日
const getTodayInfo = async () => {
  const cacheFile = FILE_MGR.joinPath(cacheDir, `todayInfo_${dateStr}.json`);

  // 检查缓存
  if (FILE_MGR.fileExists(cacheFile)) {
    // 如果使用 iCloud，需要确保文件已下载
    if (FILE_MGR.isFileStoredIniCloud(cacheFile)) {
      await FILE_MGR.downloadFileFromiCloud(cacheFile);
    }
    const cachedContent = FILE_MGR.readString(cacheFile);
    const cachedData = JSON.parse(cachedContent);
    return cachedData.data;
  }

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
    const cacheData = {
      data: todayInfo,
    };
    FILE_MGR.writeString(cacheFile, JSON.stringify(cacheData));

    return todayInfo;
  } catch (error) {
    throw error;
  }
};

// 获取下一个工作日
const getNextWorkDay = async () => {
  const cacheFile = FILE_MGR.joinPath(cacheDir, `nextWorkDay_${dateStr}.json`);

  // 检查缓存
  if (FILE_MGR.fileExists(cacheFile)) {
    if (FILE_MGR.isFileStoredIniCloud(cacheFile)) {
      await FILE_MGR.downloadFileFromiCloud(cacheFile);
    }
    const cachedContent = FILE_MGR.readString(cacheFile);
    const cachedData = JSON.parse(cachedContent);
    return new Date(
      new Date(cachedData.data).setHours(
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
    const cacheData = {
      data: nextWorkDayDate,
    };
    FILE_MGR.writeString(cacheFile, JSON.stringify(cacheData));

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
