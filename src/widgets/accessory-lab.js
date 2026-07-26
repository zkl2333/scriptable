const family = config.widgetFamily || 'medium';
const isAccessory = family.startsWith('accessory');
const foreground = Color.dynamic(new Color('#17202B'), new Color('#F7FAFF'));
const accent = Color.dynamic(new Color('#7A4DFF'), new Color('#B7A2FF'));
const secondary = Color.dynamic(new Color('#17202B', 0.62), new Color('#F7FAFF', 0.68));

const makeRing = () => {
  const context = new DrawContext();
  context.size = new Size(56, 56);
  context.opaque = false;
  context.setStrokeColor(new Color('#7A4DFF', 0.3));
  context.setLineWidth(4);
  context.strokeEllipse(new Rect(4, 4, 48, 48));
  context.setStrokeColor(new Color('#7A4DFF'));
  context.setLineWidth(4);
  const arc = new Path();
  arc.addRoundedRect(new Rect(11, 11, 34, 34), 17, 17);
  context.addPath(arc);
  context.strokePath();
  context.setTextColor(Color.white());
  context.setFont(Font.boldRoundedSystemFont(14));
  context.setTextAlignedCenter();
  context.drawTextInRect('API', new Rect(4, 20, 48, 18));
  return context.getImage();
};

const widget = new ListWidget();
widget.url = URLScheme.forRunningScript();

if (!isAccessory) {
  widget.backgroundGradient = (() => {
    const gradient = new LinearGradient();
    gradient.colors = [Color.dynamic(new Color('#FBF9FF'), new Color('#191626')), Color.dynamic(new Color('#F0EAFF'), new Color('#24203A'))];
    gradient.locations = [0, 1];
    gradient.startPoint = new Point(0, 0);
    gradient.endPoint = new Point(1, 1);
    return gradient;
  })();
  widget.setPadding(15, 16, 15, 16);
  const icon = widget.addImage(makeRing());
  icon.imageSize = new Size(family === 'small' ? 52 : 60, family === 'small' ? 52 : 60);
  icon.centerAlignImage();
  widget.addSpacer(8);
  const title = widget.addText('锁屏组件实验室');
  title.font = Font.semiboldRoundedSystemFont(family === 'small' ? 18 : 22);
  title.textColor = foreground;
  title.centerAlignText();
  const detail = widget.addText('Inline · Circular · Rectangular');
  detail.font = Font.mediumMonospacedSystemFont(10);
  detail.textColor = secondary;
  detail.centerAlignText();
} else if (family === 'accessoryInline') {
  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(0, 0, 0, 0);
  const row = widget.addStack();
  row.centerAlignContent();
  const icon = row.addImage(SFSymbol.named('calendar').image);
  icon.imageSize = new Size(12, 12);
  icon.tintColor = accent;
  row.addSpacer(4);
  const text = row.addText('API 实验室 · 3 种锁屏尺寸');
  text.font = Font.semiboldSystemFont(11);
  text.textColor = foreground;
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.7;
} else if (family === 'accessoryCircular') {
  widget.setPadding(0, 0, 0, 0);
  const image = widget.addImage(makeRing());
  image.imageSize = new Size(56, 56);
  image.centerAlignImage();
} else {
  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(5, 7, 5, 7);
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named('calendar').image);
  icon.imageSize = new Size(11, 11);
  icon.tintColor = accent;
  header.addSpacer(4);
  const title = header.addText('LOCK SCREEN LAB');
  title.font = Font.semiboldMonospacedSystemFont(10);
  title.textColor = foreground;
  header.addSpacer();
  const state = header.addText('READY');
  state.font = Font.boldMonospacedSystemFont(9);
  state.textColor = accent;
  widget.addSpacer(4);
  const main = widget.addStack();
  main.centerAlignContent();
  const label = main.addText('覆盖 ');
  label.font = Font.mediumSystemFont(11);
  label.textColor = secondary;
  const value = main.addText('渲染 API');
  value.font = Font.semiboldRoundedSystemFont(16);
  value.textColor = foreground;
  value.minimumScaleFactor = 0.7;
}

Script.setWidget(widget);
Script.complete();
