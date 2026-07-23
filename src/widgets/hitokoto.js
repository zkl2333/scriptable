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
const PREVIEW_FAMILIES = [
  'small',
  'medium',
  'large',
  'extraLarge',
  ...ACCESSORY_FAMILIES,
];
const COLORS = {
  text: Color.dynamic(new Color('#24211D'), new Color('#F4F0E8')),
  muted: Color.dynamic(new Color('#777069'), new Color('#AAA39A')),
  accent: Color.dynamic(new Color('#A44A3F'), new Color('#E58C7D')),
};
const ACCESSORY_COLOR = Color.dynamic(new Color('#111111'), new Color('#FFFFFF'));

const loadQuote = async () => {
  try {
    const request = new Request('https://v1.hitokoto.cn/?c=d&encode=text');
    request.timeoutInterval = 8;
    const quote = (await request.loadString()).trim();
    return quote || '心有山海，静而不争。';
  } catch {
    return '慢一点，也是在向前走。';
  }
};

const addAccessory = (widget, family, quote) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = widget.addText(`“${quote}”`);
    text.font = Font.mediumSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.72;
    return;
  }

  if (family === 'accessoryCircular') {
    widget.addSpacer();
    const icon = widget.addImage(SFSymbol.named('quote.opening').image);
    icon.imageSize = new Size(20, 16);
    icon.tintColor = ACCESSORY_COLOR;
    icon.centerAlignImage();
    const text = widget.addText(quote.slice(0, 4));
    text.font = Font.semiboldSystemFont(10);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    text.centerAlignText();
    widget.addSpacer();
    return;
  }

  const text = widget.addText(`“${quote}`);
  text.font = Font.semiboldSystemFont(12);
  text.textColor = ACCESSORY_COLOR;
  text.lineLimit = 2;
  text.minimumScaleFactor = 0.75;
};

const addMain = (widget, family, quote) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#FBF6EC'), new Color('#211E1B')),
    Color.dynamic(new Color('#F0E4D2'), new Color('#302824')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  widget.setPadding(family === 'small' ? 14 : 18, family === 'small' ? 14 : 20, 14, family === 'small' ? 14 : 20);

  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named('quote.bubble.fill').image);
  icon.imageSize = new Size(14, 14);
  icon.tintColor = COLORS.accent;
  header.addSpacer(6);
  const label = header.addText('一言');
  label.font = Font.semiboldSystemFont(11);
  label.textColor = COLORS.muted;

  widget.addSpacer();
  const text = widget.addText(quote);
  const isLarge = family === 'large' || family === 'extraLarge';
  text.font = Font.semiboldSystemFont(isLarge ? 28 : family === 'medium' ? 22 : 19);
  text.textColor = COLORS.text;
  text.lineLimit = family === 'small' ? 4 : family === 'medium' ? 3 : 6;
  text.minimumScaleFactor = 0.58;
  if (family !== 'medium') text.centerAlignText();
  widget.addSpacer();

  if (isLarge) {
    const footer = widget.addText('HITOKOTO · 此刻的一句话');
    footer.font = Font.mediumSystemFont(10);
    footer.textColor = COLORS.muted;
    footer.centerAlignText();
  }
};

const createWidget = async (family = config.widgetFamily || 'small') => {
  const widget = new ListWidget();
  const quote = await loadQuote();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, quote);
  else addMain(widget, family, quote);
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: '一言',
    version: __SCRIPT_VERSION__,
    updater,
    previewFamilies: PREVIEW_FAMILIES,
  });
  if (menu?.action === 'preview') {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(await createWidget());
}

Script.complete();
