import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';
import {
  ACCESSORY_FAMILIES,
  ALL_PREVIEW_FAMILIES,
  addCircularProgress,
  addLinearProgress,
  addRefreshAction,
  applyTransparentBackground,
  isLargeFamily,
} from '../lib/widget-v18.js';

const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
await updater.autoUpdate();

const PREVIEW_FAMILIES = ALL_PREVIEW_FAMILIES;
const COLORS = {
  text: Color.dynamic(new Color('#202124'), new Color('#F3F4F6')),
  muted: Color.dynamic(new Color('#72777F'), new Color('#9DA3AB')),
  track: Color.dynamic(new Color('#DCE1E5'), new Color('#353A40')),
  accents: ['#E05D5D', '#E19A37', '#2F9C82', '#4D78CC'],
};
const ACCESSORY_COLOR = Color.dynamic(new Color('#111111'), new Color('#FFFFFF'));
const ACCESSORY_TRACK = Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.22));

const clamp = (value) => Math.min(1, Math.max(0, value));

const getProgressItems = (now = new Date()) => {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const nextDay = new Date(startOfDay);
  nextDay.setDate(nextDay.getDate() + 1);

  const weekday = (now.getDay() + 6) % 7;
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - weekday);
  const nextWeek = new Date(startOfWeek);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);

  const ratio = (start, end) => clamp((now - start) / (end - start));
  return [
    { label: '今日', progress: ratio(startOfDay, nextDay) },
    { label: '本周', progress: ratio(startOfWeek, nextWeek) },
    { label: '本月', progress: ratio(startOfMonth, nextMonth) },
    { label: '今年', progress: ratio(startOfYear, nextYear) },
  ];
};

const drawProgress = (width, height, progress, color, track = COLORS.track) => {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;
  context.setFillColor(track);
  const background = new Path();
  background.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  context.addPath(background);
  context.fillPath();
  const fillWidth = Math.round(width * clamp(progress));
  if (fillWidth > 0) {
    context.setFillColor(color);
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, fillWidth, height), height / 2, height / 2);
    context.addPath(fill);
    context.fillPath();
  }
  return context.getImage();
};

const addProgressRow = (parent, item, width, compact = false, monochrome = false) => {
  const row = parent.addStack();
  row.centerAlignContent();
  const label = row.addText(item.label);
  label.font = Font.semiboldSystemFont(compact ? 10 : 11);
  label.textColor = monochrome ? ACCESSORY_COLOR : COLORS.muted;
  label.lineLimit = 1;
  row.addSpacer(compact ? 6 : 9);
  const barHeight = compact ? 4 : 6;
  const barColor = monochrome ? ACCESSORY_COLOR : new Color(COLORS.accents[item.index]);
  const barTrack = monochrome ? ACCESSORY_TRACK : COLORS.track;
  addLinearProgress(row, item.progress * 100, {
    width,
    thickness: barHeight,
    progressColor: barColor,
    trackColor: barTrack,
    fallback: () => {
      const image = row.addImage(drawProgress(width, barHeight, item.progress, barColor, barTrack));
      image.imageSize = new Size(width, barHeight);
    },
  });
  row.addSpacer(compact ? 5 : 8);
  const percent = row.addText(`${Math.round(item.progress * 100)}%`);
  percent.font = Font.semiboldRoundedSystemFont(compact ? 10 : 11);
  percent.textColor = monochrome ? ACCESSORY_COLOR : COLORS.text;
};

const addAccessory = (widget, family, items) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = widget.addText(`今日 ${Math.round(items[0].progress * 100)}% · 本周 ${Math.round(items[1].progress * 100)}%`);
    text.font = Font.semiboldSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    return;
  }
  if (family === 'accessoryCircular') {
    widget.addSpacer();
    const row = widget.addStack();
    row.addSpacer();
    const pct = Math.round(items[0].progress * 100);
    addCircularProgress(row, pct, {
      size: 56,
      thickness: 5,
      progressColor: ACCESSORY_COLOR,
      trackColor: ACCESSORY_TRACK,
      buildCenter: (ring) => {
        const label = ring.addText('今日');
        label.font = Font.mediumSystemFont(8);
        label.textColor = ACCESSORY_COLOR;
        label.centerAlignText();
        const value = ring.addText(`${pct}%`);
        value.font = Font.boldRoundedSystemFont(13);
        value.textColor = ACCESSORY_COLOR;
        value.centerAlignText();
      },
      fallback: () => {
        const stack = row.addStack();
        stack.layoutVertically();
        const label = stack.addText('今日');
        label.font = Font.mediumSystemFont(9);
        label.textColor = ACCESSORY_COLOR;
        label.centerAlignText();
        const value = stack.addText(`${pct}%`);
        value.font = Font.boldRoundedSystemFont(17);
        value.textColor = ACCESSORY_COLOR;
        value.centerAlignText();
      },
    });
    row.addSpacer();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 5, 5, 5);
  addProgressRow(widget, { ...items[0], index: 0 }, 62, true, true);
  widget.addSpacer(6);
  addProgressRow(widget, { ...items[1], index: 1 }, 62, true, true);
};

const addMain = (widget, family, items) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#F8FAFB'), new Color('#17191C')),
    Color.dynamic(new Color('#E8EDF0'), new Color('#25292E')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  applyTransparentBackground(widget, __SCRIPT_ID__);
  widget.setPadding(family === 'small' ? 13 : 16, family === 'small' ? 13 : 18, 13, family === 'small' ? 13 : 18);

  const isLarge = isLargeFamily(family);
  const header = widget.addStack();
  header.centerAlignContent();
  const titleColumn = header.addStack();
  titleColumn.layoutVertically();
  const title = titleColumn.addText('时间进度');
  title.font = Font.boldSystemFont(isLarge ? 18 : 14);
  title.textColor = COLORS.text;
  const subtitle = titleColumn.addText('把时间看见');
  subtitle.font = Font.mediumSystemFont(10);
  subtitle.textColor = COLORS.muted;
  header.addSpacer();
  addRefreshAction(header, {
    title: '刷新时间进度',
    iconColor: COLORS.muted,
    iconSize: 12,
  });

  if (family === 'extraLargePortrait') {
    widget.addSpacer(24);
    const ringsRow = widget.addStack();
    ringsRow.centerAlignContent();
    ringsRow.addSpacer();
    for (const [idx, target] of [
      { item: items[0], color: COLORS.accents[0] },
      { item: items[3], color: COLORS.accents[3] },
    ].entries()) {
      const pct = Math.round(target.item.progress * 100);
      addCircularProgress(ringsRow, pct, {
        size: 112,
        thickness: 10,
        progressColor: new Color(target.color),
        trackColor: COLORS.track,
        buildCenter: (ring) => {
          const val = ring.addText(`${pct}%`);
          val.font = Font.boldRoundedSystemFont(22);
          val.textColor = COLORS.text;
          val.centerAlignText();
          const cap = ring.addText(target.item.label);
          cap.font = Font.mediumSystemFont(11);
          cap.textColor = COLORS.muted;
          cap.centerAlignText();
        },
      });
      if (idx === 0) ringsRow.addSpacer(28);
    }
    ringsRow.addSpacer();
  }

  widget.addSpacer();

  const width = family === 'small' ? 56 : family === 'medium' ? 220 : family === 'extraLarge' ? 560 : 210;
  for (const [index, item] of items.entries()) {
    addProgressRow(widget, { ...item, index }, width, family === 'small');
    if (index < items.length - 1) widget.addSpacer(family === 'small' ? 8 : family === 'medium' ? 7 : 16);
  }

  if (isLarge) {
    widget.addSpacer();
    const note = widget.addText('进度按实际日历长度计算，支持桌面原生进度条与一键刷新');
    note.font = Font.systemFont(10);
    note.textColor = COLORS.muted;
  }
};

const createWidget = (family = config.widgetFamily || 'small') => {
  const widget = new ListWidget();
  const items = getProgressItems();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, items);
  else addMain(widget, family, items);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '时间进度',
    version: __SCRIPT_VERSION__,
    updater,
    scriptId: __SCRIPT_ID__,
    previewFamilies: PREVIEW_FAMILIES,
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(createWidget());
}

Script.complete();
