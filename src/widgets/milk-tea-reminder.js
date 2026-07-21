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

const createWidget = () => {
  const widget = new ListWidget();
  widget.addText('来一杯');
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
