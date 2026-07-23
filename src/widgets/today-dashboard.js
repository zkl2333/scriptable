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

const ACCESSORY_FAMILIES = [
  'accessoryInline',
  'accessoryCircular',
  'accessoryRectangular',
];
const PREVIEW_FAMILIES = ['small', 'medium', 'large', 'extraLarge', ...ACCESSORY_FAMILIES];
const COLORS = {
  text: Color.dynamic(new Color('#1D252C'), new Color('#F3F5F7')),
  muted: Color.dynamic(new Color('#6E7882'), new Color('#98A2AD')),
  calendar: Color.dynamic(new Color('#2563A8'), new Color('#74B9FF')),
  calendarSoft: Color.dynamic(new Color('#E5F0FA'), new Color('#1C3348')),
  reminder: Color.dynamic(new Color('#B05C18'), new Color('#FFB56E')),
  reminderSoft: Color.dynamic(new Color('#FCEEDC'), new Color('#42301E')),
  line: Color.dynamic(new Color('#D9E0E5'), new Color('#39424A')),
  accessory: Color.dynamic(new Color('#111111'), new Color('#FFFFFF')),
};

const startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (date) => {
  const result = startOfDay(date);
  result.setDate(result.getDate() + 1);
  return result;
};

const formatTime = (date) =>
  date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

const formatWeekday = (date) => ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];

const getEventTime = (event, now) => {
  if (event.isAllDay) return '全天';
  if (event.startDate <= now && event.endDate > now) return '进行中';
  return formatTime(event.startDate);
};

const loadEvents = async () => {
  if (typeof CalendarEvent === 'undefined') return { items: [], available: false };
  try {
    const items = await CalendarEvent.today();
    return {
      items: items
        .filter((event) => event.startDate && event.endDate)
        .sort((left, right) => left.startDate - right.startDate),
      available: true,
    };
  } catch {
    return { items: [], available: false };
  }
};

const loadReminders = async (now) => {
  if (typeof Reminder === 'undefined') return { items: [], available: false, undated: 0 };
  try {
    const tomorrow = endOfDay(now);
    const all = await Reminder.allIncomplete();
    const dated = all
      .filter((reminder) => reminder.dueDate && reminder.dueDate < tomorrow)
      .sort((left, right) => left.dueDate - right.dueDate);
    return {
      items: dated,
      available: true,
      undated: all.filter((reminder) => !reminder.dueDate).length,
    };
  } catch {
    return { items: [], available: false, undated: 0 };
  }
};

const getDashboard = async (now = new Date()) => {
  const [events, reminders] = await Promise.all([loadEvents(), loadReminders(now)]);
  const nextEvent = events.items.find((event) => event.endDate > now) || null;
  return { now, events, reminders, nextEvent };
};

const addText = (parent, text, font, color, options = {}) => {
  const node = parent.addText(text);
  node.font = font;
  node.textColor = color;
  if (options.lineLimit) node.lineLimit = options.lineLimit;
  if (options.minimumScaleFactor) node.minimumScaleFactor = options.minimumScaleFactor;
  return node;
};

const addSectionHeader = (parent, icon, title, count, color) => {
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

const addEventRow = (parent, event, now, compact = false) => {
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
  const title = addText(row, event.title || '未命名日程', Font.systemFont(compact ? 10 : 11), COLORS.text, {
    lineLimit: 1,
  });
  title.minimumScaleFactor = 0.75;
};

const addReminderRow = (parent, reminder, now, compact = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const overdue = reminder.dueDate && startOfDay(reminder.dueDate) < startOfDay(now);
  const icon = row.addImage(SFSymbol.named(overdue ? 'exclamationmark.circle.fill' : 'circle').image);
  icon.tintColor = overdue ? new Color('#D85A4A') : COLORS.reminder;
  icon.imageSize = new Size(compact ? 9 : 10, compact ? 9 : 10);
  row.addSpacer(compact ? 5 : 7);
  const title = addText(row, reminder.title || '未命名提醒', Font.systemFont(compact ? 10 : 11), COLORS.text, {
    lineLimit: 1,
  });
  title.minimumScaleFactor = 0.75;
};

const addEmpty = (parent, text, compact = false) =>
  addText(parent, text, Font.systemFont(compact ? 10 : 11), COLORS.muted, { lineLimit: 1 });

const setBackground = (widget) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#F8FBFD'), new Color('#171C21')),
    Color.dynamic(new Color('#EDF2F5'), new Color('#252B31')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
};

const addHeader = (widget, now, large = false) => {
  const row = widget.addStack();
  row.centerAlignContent();
  const date = addText(row, `${now.getMonth() + 1}月${now.getDate()}日`, Font.boldRoundedSystemFont(large ? 19 : 16), COLORS.text);
  date.minimumScaleFactor = 0.8;
  row.addSpacer(7);
  addText(row, `周${formatWeekday(now)}`, Font.mediumSystemFont(11), COLORS.muted);
  row.addSpacer();
  const icon = row.addImage(SFSymbol.named('sun.max.fill').image);
  icon.tintColor = COLORS.reminder;
  icon.imageSize = new Size(15, 15);
};

const addNextEventCard = (widget, dashboard, compact = false) => {
  const card = widget.addStack();
  card.layoutVertically();
  card.backgroundColor = COLORS.calendarSoft;
  card.cornerRadius = 12;
  card.setPadding(compact ? 9 : 11, compact ? 10 : 12, compact ? 9 : 11, compact ? 10 : 12);
  const label = dashboard.nextEvent ? '下一项日程' : '日程';
  addText(card, label, Font.semiboldSystemFont(compact ? 9 : 10), COLORS.calendar);
  card.addSpacer(3);
  if (dashboard.nextEvent) {
    const title = addText(card, dashboard.nextEvent.title || '未命名日程', Font.semiboldSystemFont(compact ? 13 : 15), COLORS.text, { lineLimit: 1 });
    title.minimumScaleFactor = 0.7;
    card.addSpacer(2);
    addText(card, getEventTime(dashboard.nextEvent, dashboard.now), Font.mediumSystemFont(compact ? 10 : 11), COLORS.muted);
  } else {
    addText(card, dashboard.events.available ? '今天暂无日程' : '未获日历权限', Font.semiboldSystemFont(compact ? 12 : 14), COLORS.text, { lineLimit: 1 });
  }
};

const addSmall = (widget, dashboard) => {
  widget.setPadding(14, 14, 13, 14);
  addHeader(widget, dashboard.now);
  widget.addSpacer();
  addNextEventCard(widget, dashboard, true);
  widget.addSpacer(10);
  addSectionHeader(widget, 'checkmark.circle.fill', '待办', `${dashboard.reminders.items.length} 项`, COLORS.reminder);
  widget.addSpacer(5);
  if (dashboard.reminders.items[0]) addReminderRow(widget, dashboard.reminders.items[0], dashboard.now, true);
  else addEmpty(widget, dashboard.reminders.available ? '今天没有截止待办' : '未获提醒事项权限', true);
};

const addColumn = (parent, dashboard, type) => {
  const isEvents = type === 'events';
  const items = isEvents ? dashboard.events.items : dashboard.reminders.items;
  const available = isEvents ? dashboard.events.available : dashboard.reminders.available;
  const column = parent.addStack();
  column.layoutVertically();
  addSectionHeader(column, isEvents ? 'calendar' : 'checkmark.circle.fill', isEvents ? '今日日程' : '今日待办', `${items.length} 项`, isEvents ? COLORS.calendar : COLORS.reminder);
  column.addSpacer(7);
  if (items.length === 0) {
    addEmpty(column, available ? (isEvents ? '今天没有安排' : '今天没有截止待办') : `未获${isEvents ? '日历' : '提醒事项'}权限`);
    return;
  }
  for (const [index, item] of items.slice(0, 3).entries()) {
    if (isEvents) addEventRow(column, item, dashboard.now);
    else addReminderRow(column, item, dashboard.now);
    if (index < Math.min(items.length, 3) - 1) column.addSpacer(6);
  }
};

const addMedium = (widget, dashboard) => {
  widget.setPadding(16, 17, 14, 17);
  addHeader(widget, dashboard.now);
  widget.addSpacer(11);
  addNextEventCard(widget, dashboard);
  widget.addSpacer(12);
  const body = widget.addStack();
  addColumn(body, dashboard, 'events');
  body.addSpacer(16);
  addColumn(body, dashboard, 'reminders');
};

const addLarge = (widget, dashboard, extraLarge = false) => {
  widget.setPadding(18, 19, 16, 19);
  addHeader(widget, dashboard.now, true);
  widget.addSpacer(14);
  addNextEventCard(widget, dashboard);
  widget.addSpacer(15);
  const body = widget.addStack();
  addColumn(body, dashboard, 'events');
  body.addSpacer(extraLarge ? 28 : 20);
  addColumn(body, dashboard, 'reminders');
  widget.addSpacer();
  const footer = dashboard.reminders.undated > 0
    ? `另有 ${dashboard.reminders.undated} 项无截止日期待办`
    : '日历和提醒事项均在本机读取';
  addText(widget, footer, Font.systemFont(10), COLORS.muted, { lineLimit: 1 });
};

const addAccessory = (widget, family, dashboard) => {
  const { nextEvent, reminders, now } = dashboard;
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = nextEvent
      ? `下一项：${getEventTime(nextEvent, now)} ${nextEvent.title || '未命名日程'}`
      : `今日 ${reminders.items.length} 项待办`;
    addText(widget, text, Font.semiboldSystemFont(12), COLORS.accessory, { lineLimit: 1 });
    return;
  }
  if (family === 'accessoryCircular') {
    widget.addSpacer();
    const count = nextEvent ? dashboard.events.items.length : reminders.items.length;
    addText(widget, String(count), Font.boldRoundedSystemFont(24), COLORS.accessory).centerAlignText();
    addText(widget, nextEvent ? '日程' : '待办', Font.mediumSystemFont(10), COLORS.accessory).centerAlignText();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 7, 5, 7);
  addText(widget, nextEvent ? '下一项日程' : '今日待办', Font.mediumSystemFont(10), COLORS.accessory);
  widget.addSpacer(2);
  addText(widget, nextEvent ? nextEvent.title || '未命名日程' : `${reminders.items.length} 项待办`, Font.semiboldSystemFont(13), COLORS.accessory, { lineLimit: 1 });
  widget.addSpacer(2);
  addText(widget, nextEvent ? getEventTime(nextEvent, now) : '打开 Scriptable 授权日历和提醒事项', Font.systemFont(10), COLORS.accessory, { lineLimit: 1 });
};

const createWidget = async (family = config.widgetFamily || 'medium') => {
  const widget = new ListWidget();
  const dashboard = await getDashboard();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, dashboard);
  else {
    setBackground(widget);
    if (family === 'small') addSmall(widget, dashboard);
    else if (family === 'medium') addMedium(widget, dashboard);
    else addLarge(widget, dashboard, family === 'extraLarge');
  }
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '今日面板',
    message: '聚合今日日程与到期提醒。首次运行会请求系统权限。',
    version: __SCRIPT_VERSION__,
    updater,
    previewFamilies: PREVIEW_FAMILIES,
  });
  if (menu?.action === 'preview') await presentWidgetPreviews(createWidget, menu.families);
} else {
  Script.setWidget(await createWidget());
}

Script.complete();
