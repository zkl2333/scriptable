import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';
import { drawBitmap } from '../lib/pixel.js';

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

const SPECIES = [
  {
    id: 'slime',
    name: '冻冻',
    kind: '史莱姆',
    accent: new Color('#0D9488'),
    palette: {
      K: new Color('#0F766E'),
      B: new Color('#5EEAD4'),
      E: new Color('#134E4A'),
      W: new Color('#FFFFFF'),
      R: new Color('#FB7185'),
      M: new Color('#134E4A'),
    },
    blink: { 6: '.KBBBBBBBBBBBBK.' },
    rows: [
      '................',
      '......KK........',
      '.....KBBK.......',
      '.....KBBBK......',
      '....KBBBBBK.....',
      '..KKBBBBBBBKK...',
      '.KBBBBBBBBBBBK..',
      '.KBBWEBBBBWEBBK.',
      '.KBBEEBBBBEEBBK.',
      '.KBRRBBBBBBRRBK.',
      '.KBBBBBMMBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '..KBBBBBBBBBBK..',
      '...KBBBBBBBBK...',
      '....KKKKKKKK....',
    ],
  },
  {
    id: 'cat',
    name: '蛋挞',
    kind: '橘猫',
    accent: new Color('#D97706'),
    palette: {
      K: new Color('#44403C'),
      B: new Color('#FCD34D'),
      E: new Color('#44403C'),
      N: new Color('#F472B6'),
      R: new Color('#FB923C'),
    },
    blink: { 7: '.KBBBBBBBBBBBBK.' },
    rows: [
      '................',
      '..K..........K..',
      '..KK........KK..',
      '..KBK......KBK..',
      '..KBBK....KBBK..',
      '.KBBBBBKKBBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBEEBBBBEEBBK.',
      '.KBBEEBBBBEEBBK.',
      '.KBBBBBNNBBBBBK.',
      '.KRRBBBBBBBBRRK.',
      '..KBBBBBBBBBBK..',
      '...KKKKKKKKKK...',
      '................',
      '................',
      '................',
    ],
  },
  {
    id: 'robo',
    name: '瓦特',
    kind: '机器人',
    accent: new Color('#0284C7'),
    palette: {
      K: new Color('#334155'),
      B: new Color('#CBD5E1'),
      E: new Color('#0284C7'),
      M: new Color('#64748B'),
      A: new Color('#F43F5E'),
    },
    blink: { 5: '.KBBBBBBBBBBBBK.' },
    rows: [
      '................',
      '.......KAK......',
      '...KKKKKKKKKK...',
      '..KBBBBBBBBBBK..',
      '.KBBBBBBBBBBBBK.',
      '.KBEEEBBBBEEEBK.',
      '.KBEEEBBBBEEEBK.',
      '.KBBMMMMMMBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '..KBBBBBBBBBBK..',
      '...KKKKKKKKKK...',
      '...KBBBBBBBBK...',
      '...KBAABBAABK...',
      '...KBBBBBBBBK...',
      '...KKKKKKKKKK...',
      '................',
    ],
  },
  {
    id: 'birb',
    name: '团子',
    kind: '文鸟',
    accent: new Color('#EA580C'),
    palette: {
      K: new Color('#7C2D12'),
      B: new Color('#FDBA74'),
      E: new Color('#431407'),
      O: new Color('#EA580C'),
      W: new Color('#FB923C'),
    },
    blink: { 6: '.KBBBBBBBBBBBBK.' },
    rows: [
      '................',
      '................',
      '.....KKKKKK.....',
      '...KKBBBBBBKK...',
      '..KBBBBBBBBBBK..',
      '.KBBBBBBBBBBBBK.',
      '.KBBEEBBBBEEBBK.',
      '.KBBBBBOOBBBBBK.',
      '.KBBBBBBOOBBBBK.',
      '.KBBBBBBBBBBBBK.',
      '.KBBWWBBBBWWBBK.',
      '.KBBWWBBBBWWBBK.',
      '..KBBBBBBBBBBK..',
      '...KKBBBBBBKK...',
      '......O..O......',
      '................',
    ],
  },
];

const HEART_ROWS = ['#.#..', '#####', '#####', '.###.', '..#..'];
const ZZZ_ROWS = ['ZZZ', '..Z', '.Z.', 'ZZZ'];
const BAR_SEGMENTS = 12;

const COLORS = {
  text: Color.dynamic(new Color('#292524'), new Color('#F5F5F4')),
  muted: Color.dynamic(new Color('#78716C'), new Color('#A8A29E')),
  track: Color.dynamic(new Color('#E7E5E4'), new Color('#44403C')),
  ground: Color.dynamic(new Color('#000000', 0.08), new Color('#000000', 0.35)),
  heart: new Color('#F43F5E'),
  zzz: new Color('#78716C'),
};

const getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
};

const getPetState = (now = new Date()) => {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const progress = Math.min(1, Math.max(0, (now - startOfDay) / 86400000));
  const sleeping = now.getHours() >= 23 || now.getHours() < 7;
  const blinking = !sleeping && now.getMinutes() % 4 === 0;
  const species = SPECIES[getDayOfYear(now) % SPECIES.length];
  const mood = sleeping
    ? '呼呼大睡中，请勿打扰'
    : progress < 0.25
      ? '刚睡醒，迷迷糊糊'
      : progress < 0.6
        ? '精力旺盛，四处蹦跶'
        : progress < 0.85
          ? '有点困，还在坚持'
          : '进入省电睡眠模式';
  const hearts = 2 + (getDayOfYear(now) % 3);
  return { species, progress, sleeping, blinking, mood, hearts };
};

const getSpriteRows = (species, closedEyes) => {
  if (!closedEyes) return species.rows;
  return species.rows.map((row, index) => species.blink[index] || row);
};

const drawGrowthBar = (context, x, y, width, progress, accent) => {
  const gap = 2;
  const segmentWidth = Math.floor((width - gap * (BAR_SEGMENTS - 1)) / BAR_SEGMENTS);
  const filled = Math.round(progress * BAR_SEGMENTS);
  for (let index = 0; index < BAR_SEGMENTS; index += 1) {
    context.setFillColor(index < filled ? accent : COLORS.track);
    context.fillRect(new Rect(x + index * (segmentWidth + gap), y, segmentWidth, 5));
  }
};

const drawHearts = (context, x, y, count) => {
  for (let index = 0; index < count; index += 1) {
    drawBitmap(context, HEART_ROWS, x + index * 13, y, 2, { '#': COLORS.heart });
  }
};

const drawSleepZzz = (context, x, y) => {
  const palette = { Z: COLORS.zzz };
  drawBitmap(context, ZZZ_ROWS, x, y + 14, 2, palette);
  drawBitmap(context, ZZZ_ROWS, x + 12, y + 6, 3, palette);
  drawBitmap(context, ZZZ_ROWS, x + 26, y - 4, 4, palette);
};

const drawPetScene = (state, width, height, scale, minimal = false) => {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;

  const spriteSize = 16 * scale;
  const spriteX = Math.round((width - spriteSize) / 2);
  const spriteY = minimal
    ? Math.round((height - spriteSize) / 2)
    : Math.max(2, height - spriteSize - 14);

  if (!minimal) {
    context.setFillColor(COLORS.ground);
    context.fillEllipse(new Rect(spriteX + scale, spriteY + spriteSize - scale, spriteSize - 2 * scale, scale * 2));
  }

  const rows = getSpriteRows(state.species, state.sleeping || state.blinking);
  drawBitmap(context, rows, spriteX, spriteY, scale, state.species.palette);

  if (state.sleeping) {
    drawSleepZzz(context, spriteX + spriteSize - 8 * scale, spriteY + 2);
  }
  if (!minimal) {
    drawHearts(context, width - 8 - state.hearts * 13, 6, state.hearts);
    drawGrowthBar(context, 6, height - 9, width - 12, state.progress, state.species.accent);
  }
  return context.getImage();
};

const addTextLine = (parent, value, font, color, align = 'left') => {
  const text = parent.addText(value);
  text.font = font;
  text.textColor = color;
  if (align === 'center') text.centerAlignText();
  return text;
};

const buildInfoColumn = (parent, state, compact = false) => {
  parent.layoutVertically();
  addTextLine(parent, 'PIXEL PET', Font.boldMonospacedSystemFont(9), state.species.accent);
  parent.addSpacer(4);
  addTextLine(parent, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(compact ? 14 : 17), COLORS.text);
  parent.addSpacer(4);
  addTextLine(parent, state.mood, Font.systemFont(compact ? 10 : 11), COLORS.muted);
  parent.addSpacer(4);
  addTextLine(parent, `今日陪伴 ${Math.round(state.progress * 100)}%`, Font.mediumSystemFont(compact ? 10 : 11), COLORS.muted);
};

const addSceneImage = (parent, state, width, height, scale, centered = false) => {
  const image = parent.addImage(drawPetScene(state, width, height, scale));
  image.imageSize = new Size(width, height);
  if (centered) image.centerAlignImage();
  return image;
};

const applyBackground = (widget) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#FFF7ED'), new Color('#1C1917')),
    Color.dynamic(new Color('#FFEDD5'), new Color('#292524')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(0, 1);
  widget.backgroundGradient = gradient;
};

const addAccessory = (widget, family, state) => {
  const color = Color.dynamic(new Color('#292524'), new Color('#F5F5F4'));
  const percent = Math.round(state.progress * 100);
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = widget.addText(`${state.species.name} · 陪伴 ${percent}%`);
    text.font = Font.semiboldSystemFont(12);
    text.textColor = color;
    text.lineLimit = 1;
    return;
  }
  if (family === 'accessoryCircular') {
    widget.addSpacer();
    const image = widget.addImage(drawPetScene(state, 64, 64, 3, true));
    image.imageSize = new Size(64, 64);
    image.centerAlignImage();
    widget.addSpacer();
    return;
  }
  widget.setPadding(6, 10, 6, 10);
  const row = widget.addStack();
  row.centerAlignContent();
  const image = row.addImage(drawPetScene(state, 56, 56, 3, true));
  image.imageSize = new Size(56, 56);
  row.addSpacer(8);
  const column = row.addStack();
  column.layoutVertically();
  addTextLine(column, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(12), color);
  column.addSpacer(2);
  addTextLine(column, state.sleeping ? '睡眠中' : `陪伴 ${percent}%`, Font.systemFont(10), color);
};

const createWidget = (family = config.widgetFamily || 'medium') => {
  const widget = new ListWidget();
  const state = getPetState();
  if (ACCESSORY_FAMILIES.includes(family)) {
    addAccessory(widget, family, state);
  } else if (family === 'small') {
    applyBackground(widget);
    widget.setPadding(10, 12, 6, 12);
    addSceneImage(widget, state, 134, 96, 5);
    widget.addSpacer(6);
    addTextLine(widget, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(13), COLORS.text);
    addTextLine(widget, state.mood, Font.systemFont(9), COLORS.muted).lineLimit = 1;
  } else if (family === 'medium') {
    applyBackground(widget);
    widget.setPadding(10, 14, 10, 14);
    const row = widget.addStack();
    row.centerAlignContent();
    addSceneImage(row, state, 150, 134, 7);
    row.addSpacer(14);
    buildInfoColumn(row.addStack(), state);
    row.addSpacer();
  } else if (family === 'extraLarge') {
    applyBackground(widget);
    widget.setPadding(18, 24, 18, 24);
    const row = widget.addStack();
    row.centerAlignContent();
    addSceneImage(row, state, 320, 300, 16);
    row.addSpacer(30);
    const column = row.addStack();
    column.layoutVertically();
    addTextLine(column, 'PIXEL PET', Font.boldMonospacedSystemFont(12), state.species.accent);
    column.addSpacer(8);
    addTextLine(column, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(30), COLORS.text);
    column.addSpacer(8);
    addTextLine(column, state.mood, Font.systemFont(16), COLORS.muted);
    column.addSpacer(8);
    addTextLine(column, `今日陪伴 ${Math.round(state.progress * 100)}% · 每日轮换 · 深夜睡眠`, Font.systemFont(13), COLORS.muted);
    row.addSpacer();
  } else {
    applyBackground(widget);
    widget.setPadding(14, 0, 10, 0);
    const column = widget.addStack();
    column.layoutVertically();
    column.centerAlignContent();
    addSceneImage(column, state, 220, 196, 10, true);
    column.addSpacer(8);
    addTextLine(column, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(18), COLORS.text, 'center');
    column.addSpacer(4);
    addTextLine(column, state.mood, Font.systemFont(11), COLORS.muted, 'center');
    widget.addSpacer();
    addTextLine(widget, `每日轮换 · 今日是${state.species.kind} · 深夜进入睡眠`, Font.systemFont(9), COLORS.muted, 'center');
  }
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '像素宠物',
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
