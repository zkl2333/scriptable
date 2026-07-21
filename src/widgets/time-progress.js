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

const width = 300;
const h = 4;

const createWidget = () => {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#222222');

  const now = new Date();
  const weekday = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const minutes = now.getMinutes();
  const labels = Device.locale() === 'zh_CN'
    ? ['今日', '本周', '本月', '今年']
    : ['Today', 'This week', 'This month', 'This year'];

  addProgressRow(widget, 24 * 60, (now.getHours() + 1) * 60 + minutes, labels[0]);
  addProgressRow(widget, 7, weekday + 1, labels[1]);
  addProgressRow(widget, 30, now.getDate() + 1, labels[2]);
  addProgressRow(widget, 12, now.getMonth() + 1, labels[3]);
  return attachMenuURL(widget);
};

function addProgressRow(widget, total, haveGone, label) {
	const title = widget.addText(label);
	title.textColor = new Color('#e587ce');
	title.font = Font.boldSystemFont(13);
	widget.addSpacer(6);
	const image = widget.addImage(creatProgress(total, haveGone));
	image.imageSize = new Size(width, h);
	widget.addSpacer(6);
}

function creatProgress(total, havegone) {
	const context = new DrawContext();
	context.size = new Size(width, h);
	context.opaque = false;
	context.respectScreenScale = true;
	context.setFillColor(new Color('#48484b'));
	const path = new Path();
	path.addRoundedRect(new Rect(0, 0, width, h), 3, 2);
	context.addPath(path);
	context.fillPath();
	context.setFillColor(new Color('#ffd60a'));
	const path1 = new Path();
	path1.addRoundedRect(new Rect(0, 0, (width * havegone) / total, h), 3, 2);
	context.addPath(path1);
	context.fillPath();
	return context.getImage();
}

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '时间进度',
    version: __SCRIPT_VERSION__,
    updater,
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(createWidget());
}

Script.complete();
