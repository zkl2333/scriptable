// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: magic;
// 定义上下班时间常量
const WORK_HOURS = {
  start: { hour: 9, minute: 30 },
  end: { hour: 18, minute: 0 },
};

// 获取指定日期的节假日信息
const getHolidayInfo = async (dates) => {
  try {
    const dateParams = dates.map((date) => `d=${date}`).join("&");
    const url = `https://timor.tech/api/holiday/batch?${dateParams}&type=Y`;
    const request = new Request(url);
    const res = await request.loadJSON();

    // 检查是否返回了限流错误
    if (res.code === 429) {
      throw new Error('请求过于频繁，请稍后重试');
    }

    return res;
  } catch (error) {
    // 抛出错误，供上层处理
    throw error;
  }
};

// 获取指定日期的下一个节假日
const getNextHoliday = async (dateStr) => {
  try {
    const url = `https://timor.tech/api/holiday/next/${dateStr}?type=Y&week=N`;
    const request = new Request(url);
    const res = await request.loadJSON();

    // 检查是否返回了限流错误
    if (res.code === 429) {
      throw new Error('请求过于频繁，请稍后重试');
    }

    return res;
  } catch (error) {
    // 抛出错误，供上层处理
    throw error;
  }
};

// 获取放假前的最后一个工作日
const getLastWorkdayBeforeHoliday = async (holidayDateStr) => {
  try {
    const dates = [];
    const holidayDate = new Date(holidayDateStr);

    // 准备放假前的7天日期列表
    for (let i = 1; i <= 7; i++) {
      const date = new Date(holidayDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
    }

    // 获取这些日期的节假日信息
    const holidayInfo = await getHolidayInfo(dates);

    // 从接近节假日的日期开始，寻找最后一个工作日
    for (let dateStr of dates) {
      const typeInfo = holidayInfo.type[dateStr];

      if (typeInfo && (typeInfo.type === 0 || typeInfo.type === 3)) {
        // 找到工作日
        return dateStr;
      }
    }

    // 如果未找到，默认返回放假前一天
    const lastWorkday = new Date(holidayDate);
    lastWorkday.setDate(lastWorkday.getDate() - 1);
    return lastWorkday.toISOString().split('T')[0];
  } catch (error) {
    // 抛出错误，供上层处理
    throw error;
  }
};

// 创建小组件
const createWidget = async () => {
  const widget = new ListWidget();
  widget.spacing = 12;

  try {
    // 获取今天之后的下一个节假日
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const nextHolidayInfo = await getNextHoliday(dateStr);

    // 设置刷新时间为一天后
    widget.refreshAfterDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // 节假日展示
    if (nextHolidayInfo.holiday) {
      const holidayName = nextHolidayInfo.holiday.name;
      const holidayDateStr = nextHolidayInfo.holiday.date;

      // 获取放假前的最后一个工作日
      const lastWorkdayStr = await getLastWorkdayBeforeHoliday(holidayDateStr);
      const lastWorkdayDate = new Date(lastWorkdayStr);

      // 设置倒计时到最后一个工作日的下班时间
      const countdownDate = new Date(lastWorkdayDate);
      countdownDate.setHours(WORK_HOURS.end.hour, WORK_HOURS.end.minute, 0);

      // 如果最后一个工作日的下班时间已过，显示今天是节假日
      if (today > countdownDate) {
        const holidayTitle = widget.addText(`现在是${holidayName}假期`);
        holidayTitle.font = Font.boldSystemFont(18);
        holidayTitle.centerAlignText();
      } else {
        const holidayTitle = widget.addText(`距离${holidayName}放假`);
        holidayTitle.font = Font.boldSystemFont(18);
        holidayTitle.centerAlignText();

        const widgetData = widget.addDate(countdownDate);
        widgetData.font = Font.boldSystemFont(18);
        widgetData.applyRelativeStyle();
        widgetData.centerAlignText();
      }
    } else {
      const noHolidayText = widget.addText('未找到下一个节假日');
      noHolidayText.font = Font.boldSystemFont(20);
      noHolidayText.centerAlignText();
    }
  } catch (error) {
    // 当捕获到限流错误时，显示提示信息
    const errorText = widget.addText(error.message || '数据加载失败');
    errorText.font = Font.boldSystemFont(18);
    errorText.centerAlignText();
  }

  return widget;
};

// 设置部件
const widget = await createWidget();
Script.setWidget(widget);

if (config.runsInApp) {
  widget.presentMedium();
}
