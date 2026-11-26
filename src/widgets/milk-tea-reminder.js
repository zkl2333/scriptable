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
  addLinearProgress,
  applyTransparentBackground,
  attachStackAction,
  getWidgetAction,
  isLargeFamily,
  readWidgetState,
  writeWidgetState,
} from '../lib/widget-v18.js';

const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
await updater.autoUpdate();

const PREVIEW_FAMILIES = ALL_PREVIEW_FAMILIES;
const DAILY_LIMIT = 2;
const CHOICE_ITEMS = [
  { id: 'opt-low-sugar', label: '低糖' },
  { id: 'opt-less-ice', label: '少冰' },
  { id: 'opt-boba', label: '加珍珠' },
];
const COLORS = {
  brown: Color.dynamic(new Color('#613C2D'), new Color('#F1D0B8')),
  caramel: Color.dynamic(new Color('#B8612D'), new Color('#F3A66F')),
  muted: Color.dynamic(new Color('#735C50'), new Color('#C8B6A9')),
  card: Color.dynamic(new Color('#FFF8EF'), new Color('#35271F')),
  cardActive: Color.dynamic(new Color('#B8612D'), new Color('#D97A40')),
  cardActiveText: new Color('#FFFFFF'),
  track: Color.dynamic(new Color('#E6CEBA'), new Color('#473125')),
};
const ACCESSORY_COLOR = Color.dynamic(new Color('#111111'), new Color('#FFFFFF'));

const todayKey = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const loadDrinkState = (now = new Date()) => {
  const day = todayKey(now);
  const stored = readWidgetState(__SCRIPT_ID__, {
    day,
    cups: 0,
    options: ['opt-low-sugar', 'opt-less-ice'],
  });
  const options = Array.isArray(stored.options) ? stored.options : ['opt-low-sugar', 'opt-less-ice'];
  return {
    day,
    cups: stored.day === day ? Math.max(0, Math.min(6, Number(stored.cups) || 0)) : 0,
    options,
  };
};

const resolveDrinkState = () => {
  const state = loadDrinkState();
  const action = getWidgetAction();
  if (!action?.id) return state;

  if (action.id === 'cup-add') {
    state.cups = Math.min(6, state.cups + 1);
  } else if (action.id === 'cup-reset') {
    state.cups = 0;
  } else if (CHOICE_ITEMS.some((item) => item.id === action.id)) {
    const exists = state.options.includes(action.id);
    state.options = exists
      ? state.options.filter((id) => id !== action.id)
      : [...state.options, action.id];
  }
  return writeWidgetState(__SCRIPT_ID__, state);
};

const getMessage = () => {
  const hour = new Date().getHours();
  if (hour < 11) return { title: '上午好', detail: '今天的第一杯，慢慢选' };
  if (hour < 15) return { title: '午后续航', detail: '三分糖，也有好心情' };
  if (hour < 20) return { title: '来杯奶茶', detail: '忙里偷闲，奖励一下自己' };
  return { title: '晚间克制', detail: '想喝的话，记得选低糖' };
};

const addAccessory = (widget, family, message) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = widget.addText(`🧋 ${message.title} · ${message.detail}`);
    text.font = Font.mediumSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.72;
  } else if (family === 'accessoryCircular') {
    widget.addSpacer();
    const icon = widget.addImage(SFSymbol.named('cup.and.saucer.fill').image);
    icon.imageSize = new Size(23, 20);
    icon.tintColor = ACCESSORY_COLOR;
    icon.centerAlignImage();
    const text = widget.addText('来一杯');
    text.font = Font.semiboldSystemFont(10);
    text.textColor = ACCESSORY_COLOR;
    text.centerAlignText();
    widget.addSpacer();
  } else {
    const title = widget.addText(message.title);
    title.font = Font.boldSystemFont(15);
    title.textColor = ACCESSORY_COLOR;
    const detail = widget.addText(message.detail);
    detail.font = Font.mediumSystemFont(11);
    detail.textColor = ACCESSORY_COLOR;
    detail.lineLimit = 1;
    detail.minimumScaleFactor = 0.75;
  }
};

const addMain = (widget, family, message, state) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#FFF5E7'), new Color('#2B201B')),
    Color.dynamic(new Color('#F2D3B1'), new Color('#513426')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  applyTransparentBackground(widget, __SCRIPT_ID__);
  widget.setPadding(16, 16, 14, 16);

  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named('cup.and.saucer.fill').image);
  icon.imageSize = new Size(17, 15);
  icon.tintColor = COLORS.caramel;
  header.addSpacer(6);
  const brand = header.addText('奶茶时刻');
  brand.font = Font.semiboldSystemFont(11);
  brand.textColor = COLORS.muted;
  header.addSpacer();
  const cupBadge = header.addStack();
  cupBadge.centerAlignContent();
  cupBadge.setPadding(3, 8, 3, 8);
  cupBadge.cornerRadius = 9;
  cupBadge.backgroundColor = COLORS.card;
  const cupText = cupBadge.addText(`今日 ${state.cups} 杯 +`);
  cupText.font = Font.semiboldSystemFont(9);
  cupText.textColor = COLORS.caramel;
  attachStackAction(cupBadge, '记录喝了一杯奶茶', 'cup-add');

  widget.addSpacer();
  const title = widget.addText(message.title);
  const isLarge = isLargeFamily(family);
  title.font = Font.boldRoundedSystemFont(isLarge ? 32 : family === 'medium' ? 26 : 24);
  title.textColor = COLORS.brown;
  title.minimumScaleFactor = 0.7;
  const detail = widget.addText(
    state.cups >= DAILY_LIMIT ? `今日已喝 ${state.cups} 杯，记得多喝水` : message.detail
  );
  detail.font = Font.mediumSystemFont(family === 'small' ? 11 : 13);
  detail.textColor = COLORS.muted;
  detail.lineLimit = family === 'small' ? 2 : 1;
  detail.minimumScaleFactor = 0.75;
  widget.addSpacer();

  if (family !== 'small') {
    const choices = widget.addStack();
    choices.centerAlignContent();
    for (const [index, choice] of CHOICE_ITEMS.entries()) {
      const active = state.options.includes(choice.id);
      const chip = choices.addStack();
      chip.centerAlignContent();
      chip.setPadding(5, 9, 5, 9);
      chip.backgroundColor = active ? COLORS.cardActive : COLORS.card;
      chip.cornerRadius = 10;
      const text = chip.addText(choice.label);
      text.font = Font.semiboldSystemFont(10);
      text.textColor = active ? COLORS.cardActiveText : COLORS.brown;
      attachStackAction(chip, `切换${choice.label}`, choice.id);
      if (index < CHOICE_ITEMS.length - 1) choices.addSpacer(7);
    }
    if (state.cups > 0) {
      choices.addSpacer();
      const resetChip = choices.addStack();
      resetChip.setPadding(5, 8, 5, 8);
      resetChip.backgroundColor = COLORS.card;
      resetChip.cornerRadius = 10;
      const resetText = resetChip.addText('清零');
      resetText.font = Font.mediumSystemFont(9);
      resetText.textColor = COLORS.muted;
      attachStackAction(resetChip, '清零今日杯数', 'cup-reset');
    }
  }
  if (isLarge) {
    widget.addSpacer(14);
    const barLabel = widget.addText(`今日克制额度 ${state.cups}/${DAILY_LIMIT} 杯`);
    barLabel.font = Font.mediumSystemFont(10);
    barLabel.textColor = COLORS.muted;
    widget.addSpacer(5);
    addLinearProgress(widget, Math.min(100, (state.cups / DAILY_LIMIT) * 100), {
      width: family === 'extraLarge' ? 560 : 280,
      thickness: 6,
      progressColor: COLORS.caramel,
      trackColor: COLORS.track,
    });
    widget.addSpacer(12);
    const note = widget.addText('桌面点击口味标签即可切换偏好；点击右上角记录今日杯数。');
    note.font = Font.systemFont(11);
    note.textColor = COLORS.muted;
    note.lineLimit = 2;
  }
};

const createWidget = (family = config.widgetFamily || 'small') => {
  const widget = new ListWidget();
  const message = getMessage();
  const state = resolveDrinkState();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, message);
  else addMain(widget, family, message, state);
  return attachMenuURL(widget);
};

const scheduleReminder = async () => {
  const notification = new Notification();
  notification.title = '提醒喝奶茶小助手';
  notification.body = '提醒你喝奶茶啦！';
  notification.identifier = 'naicha';
  notification.addAction('发朋友圈提醒大家喝奶茶', 'weixin://');
  notification.addAction('查找附近奶茶店', `http://maps.apple.com/?q=${encodeURI('奶茶')}`);
  notification.addAction('打开饿了吗', 'eleme://');
  notification.addAction('打开美团', 'imeituan://');
  notification.setTriggerDate(new Date(Date.now() + 3000));
  await notification.schedule();
};

const showReminderScheduled = async () => {
  const alert = new Alert();
  alert.title = '提醒已安排';
  alert.message = '将在 3 秒后发送通知。';
  alert.addAction('好');
  await alert.presentAlert();
};

if (shouldShowWidgetMenu()) {
  for (;;) {
    const action = await runWidgetMenu({
      title: '奶茶提醒',
      version: __SCRIPT_VERSION__,
      updater,
      scriptId: __SCRIPT_ID__,
      previewFamilies: PREVIEW_FAMILIES,
      actions: [
        {
          id: 'remind',
          icon: '🔔',
          title: '发送奶茶提醒',
          subtitle: '3 秒后推送，可从通知打开外卖应用',
        },
      ],
    });
    if (!action) break;
    if (action.action === 'preview') {
      await presentWidgetPreviews(createWidget, action.families);
    }
    if (action.action === 'remind') {
      await scheduleReminder();
      await showReminderScheduled();
    }
  }
} else {
  Script.setWidget(createWidget());
}

Script.complete();
