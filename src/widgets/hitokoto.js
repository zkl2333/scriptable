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

const request = new Request('https://v1.hitokoto.cn/?c=d&encode=text');

const createWidget = async () => {
  const widget = new ListWidget();
  const textWidget = widget.addText('loading...');
  textWidget.centerAlignText();
  textWidget.font = Font.systemFont(24);
  textWidget.text = await request.loadString();
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '一言',
    version: __SCRIPT_VERSION__,
    updater,
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(await createWidget());
}

Script.complete();
