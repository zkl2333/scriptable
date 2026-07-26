import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';
import {
  createSeededRandom,
  drawPixelText,
  measurePixelText,
} from '../lib/pixel.js';

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
const PREVIEW_FAMILIES = [
  'small',
  'medium',
  'large',
  'extraLarge',
  ...ACCESSORY_FAMILIES,
];
const FAMILY_CANVAS = {
  small: { width: 158, height: 158, clockScale: 4, labelScale: 2 },
  medium: { width: 338, height: 158, clockScale: 7, labelScale: 2 },
  large: { width: 338, height: 354, clockScale: 10, labelScale: 2 },
  extraLarge: { width: 720, height: 338, clockScale: 12, labelScale: 3 },
};
const COLORS = {
  background: new Color('#070B08'),
  grid: new Color('#0E2114'),
  primary: new Color('#35FF6D'),
  dim: new Color('#1C7A3A'),
  faint: new Color('#134021'),
  cyan: new Color('#3AE0FF'),
  magenta: new Color('#FF4D9D'),
  scanline: new Color('#000000', 0.12),
};
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const pad = (value) => String(value).padStart(2, '0');

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
};

const drawGrid = (context, width, height) => {
  context.setFillColor(COLORS.grid);
  for (let x = 6; x < width; x += 14) {
    for (let y = 6; y < height; y += 14) {
      context.fillRect(new Rect(x, y, 1, 1));
    }
  }
};

const drawScanlines = (context, width, height) => {
  context.setFillColor(COLORS.scanline);
  for (let y = 2; y < height; y += 5) {
    context.fillRect(new Rect(0, y, width, 1));
  }
};

const drawCorners = (context, width, height) => {
  const arm = 10;
  const inset = 6;
  context.setFillColor(COLORS.dim);
  const corners = [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1],
  ];
  for (const [x, y, directionX, directionY] of corners) {
    context.fillRect(new Rect(
      directionX > 0 ? x : x - arm,
      y,
      arm,
      2
    ));
    context.fillRect(new Rect(
      directionX > 0 ? x : x - 2,
      directionY > 0 ? y : y - arm,
      2,
      arm
    ));
  }
};

const drawGlitch = (context, random, timeText, timeX, timeY, scale, width) => {
  drawPixelText(context, timeText, timeX - scale, timeY, scale, new Color('#FF4D9D66'));
  drawPixelText(context, timeText, timeX + scale, timeY, scale, new Color('#3AE0FF66'));
  drawPixelText(context, timeText, timeX, timeY, scale, COLORS.primary);
  const slices = 2 + Math.floor(random() * 3);
  for (let index = 0; index < slices; index += 1) {
    const sliceY = Math.round(timeY - 4 + random() * (7 * scale + 8));
    const sliceWidth = Math.round(20 + random() * 90);
    const sliceX = Math.round(random() * (width - sliceWidth));
    context.setFillColor(random() > 0.5 ? new Color('#35FF6D4D') : new Color('#3AE0FF4D'));
    context.fillRect(new Rect(sliceX, sliceY, sliceWidth, 2 + Math.floor(random() * 4)));
  }
};

const drawNoise = (context, random, width, height) => {
  for (let index = 0; index < 42; index += 1) {
    context.setFillColor(random() > 0.8 ? COLORS.cyan : COLORS.faint);
    context.fillRect(new Rect(
      Math.round(random() * (width - 2)),
      Math.round(random() * (height - 2)),
      2,
      2
    ));
  }
};

const drawTerminal = (family, now) => {
  const { width, height, clockScale, labelScale } = FAMILY_CANVAS[family];
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = true;
  context.respectScreenScale = true;

  context.setFillColor(COLORS.background);
  context.fillRect(new Rect(0, 0, width, height));
  drawGrid(context, width, height);

  const minuteSeed = Math.floor(now.getTime() / 60000);
  const random = createSeededRandom(minuteSeed);
  const hourRandom = createSeededRandom(Math.floor(now.getTime() / 3600000));

  const showColon = now.getSeconds() % 2 === 0;
  const timeText = `${pad(now.getHours())}${showColon ? ':' : ' '}${pad(now.getMinutes())}`;
  const timeWidth = measurePixelText(timeText, clockScale);
  const hasStatus = family === 'large' || family === 'extraLarge';
  const timeZoneWidth = family === 'extraLarge' ? width * 0.56 : width;
  const timeX = (timeZoneWidth - timeWidth) / 2;
  const dateGap = Math.round(clockScale * 2.2);
  const blockHeight = 7 * clockScale + dateGap + 7 * labelScale;
  const timeY = hasStatus
    ? Math.round(height * 0.28 - (7 * clockScale) / 2)
    : Math.round((height - blockHeight) / 2);

  if (random() < 0.45) {
    drawGlitch(context, random, timeText, timeX, timeY, clockScale, width);
  } else {
    drawPixelText(context, timeText, timeX, timeY, clockScale, COLORS.primary);
  }

  const dateText = `${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${WEEKDAYS[now.getDay()]}`;
  const dateWidth = measurePixelText(dateText, labelScale);
  drawPixelText(
    context,
    dateText,
    (timeZoneWidth - dateWidth) / 2,
    timeY + 7 * clockScale + dateGap,
    labelScale,
    COLORS.dim
  );

  const uptime = 96 + Math.floor(hourRandom() * 4);
  const dayOfYear = getDayOfYear(now);

  if (family === 'medium' || family === 'small') {
    const statusScale = 1;
    const statusY = height - 7 * statusScale - 8;
    drawPixelText(context, `> DAY ${dayOfYear}`, 10, statusY, statusScale, COLORS.faint);
    const rightText = `UP ${uptime}%`;
    const rightWidth = measurePixelText(rightText, statusScale);
    drawPixelText(context, rightText, width - rightWidth - 10, statusY, statusScale, COLORS.faint);
  }

  if (hasStatus) {
    const memory = 38 + Math.floor(hourRandom() * 47);
    const lines = [
      '> SYS.ONLINE',
      `> UPLINK ${uptime}%`,
      `> MEM ${memory}%`,
      `> DAY ${dayOfYear}/365`,
    ];
    const lineHeight = 7 * labelScale + Math.round(labelScale * 2.5);
    const statusHeight = lines.length * lineHeight;
    let cursorY = height - statusHeight - 18;
    if (family === 'extraLarge') cursorY = height * 0.28 - (7 * clockScale) / 2;
    const cursorX = family === 'extraLarge' ? width * 0.62 : 22;
    lines.forEach((line, index) => {
      const suffix = index === lines.length - 1 && showColon ? '_' : '';
      drawPixelText(context, line + suffix, cursorX, cursorY + index * lineHeight, labelScale, COLORS.dim);
    });
    if (family === 'extraLarge') {
      const decoWidth = measurePixelText('SYS', labelScale);
      drawPixelText(context, 'SYS', width - decoWidth - 18, height - 7 * labelScale - 16, labelScale, COLORS.faint);
    }
  }

  drawNoise(context, random, width, height);
  drawScanlines(context, width, height);
  drawCorners(context, width, height);
  return context.getImage();
};

const addAccessory = (widget, family, now) => {
  const color = Color.dynamic(new Color('#111111'), new Color('#EEEEEE'));
  const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const weekday = WEEKDAYS[now.getDay()];
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = widget.addText(`${timeText} · ${weekday}`);
    text.font = Font.semiboldMonospacedSystemFont(12);
    text.textColor = color;
    text.lineLimit = 1;
    return;
  }
  if (family === 'accessoryCircular') {
    widget.addSpacer();
    const time = widget.addText(timeText);
    time.font = Font.boldMonospacedSystemFont(15);
    time.textColor = color;
    time.centerAlignText();
    const label = widget.addText(weekday);
    label.font = Font.mediumMonospacedSystemFont(9);
    label.textColor = color;
    label.centerAlignText();
    widget.addSpacer();
    return;
  }
  widget.setPadding(4, 8, 4, 8);
  const time = widget.addText(timeText);
  time.font = Font.boldMonospacedSystemFont(22);
  time.textColor = color;
  widget.addSpacer(2);
  const detail = widget.addText(`${weekday} ${pad(now.getMonth() + 1)}.${pad(now.getDate())} · DAY ${getDayOfYear(now)}`);
  detail.font = Font.mediumMonospacedSystemFont(10);
  detail.textColor = color;
  detail.lineLimit = 1;
};

const createWidget = (family = config.widgetFamily || 'medium') => {
  const widget = new ListWidget();
  const now = new Date();
  if (ACCESSORY_FAMILIES.includes(family)) {
    addAccessory(widget, family, now);
  } else {
    widget.setPadding(0, 0, 0, 0);
    widget.backgroundImage = drawTerminal(family, now);
  }
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  widget.refreshAfterDate = nextMinute;
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '赛博时钟',
    version: __SCRIPT_VERSION__,
    updater,
    previewFamilies: PREVIEW_FAMILIES,
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(createWidget());
}

Script.complete();
