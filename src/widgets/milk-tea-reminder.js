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
const PREVIEW_FAMILIES = ['small', 'medium', 'large', ...ACCESSORY_FAMILIES];
const COLORS = {
  brown: Color.dynamic(new Color('#613C2D'), new Color('#F1D0B8')),
  caramel: Color.dynamic(new Color('#B8612D'), new Color('#F3A66F')),
  muted: Color.dynamic(new Color('#735C50'), new Color('#C8B6A9')),
  card: Color.dynamic(new Color('#FFF8EF'), new Color('#35271F')),
};
const ACCESSORY_COLOR = Color.dynamic(new Color('#111111'), new Color('#FFFFFF'));

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

const addMain = (widget, family, message) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#FFF5E7'), new Color('#2B201B')),
    Color.dynamic(new Color('#F2D3B1'), new Color('#513426')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
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

  widget.addSpacer();
  const title = widget.addText(message.title);
  title.font = Font.boldRoundedSystemFont(family === 'large' ? 32 : family === 'medium' ? 26 : 24);
  title.textColor = COLORS.brown;
  title.minimumScaleFactor = 0.7;
  const detail = widget.addText(message.detail);
  detail.font = Font.mediumSystemFont(family === 'small' ? 11 : 13);
  detail.textColor = COLORS.muted;
  detail.lineLimit = family === 'small' ? 2 : 1;
  detail.minimumScaleFactor = 0.75;
  widget.addSpacer();

  if (family !== 'small') {
    const choices = widget.addStack();
    for (const [index, choice] of ['低糖', '少冰', '加珍珠'].entries()) {
      const chip = choices.addStack();
      chip.setPadding(5, 9, 5, 9);
      chip.backgroundColor = COLORS.card;
      chip.cornerRadius = 10;
      const text = chip.addText(choice);
      text.font = Font.semiboldSystemFont(10);
      text.textColor = COLORS.brown;
      if (index < 2) choices.addSpacer(7);
    }
  }
  if (family === 'large') {
    widget.addSpacer(12);
    const note = widget.addText('运行脚本即可发送提醒，通知中可直接打开地图或外卖应用。');
    note.font = Font.systemFont(11);
    note.textColor = COLORS.muted;
    note.lineLimit = 2;
  }
};

const createWidget = (family = config.widgetFamily || 'small') => {
  const widget = new ListWidget();
  const message = getMessage();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, message);
  else addMain(widget, family, message);
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
