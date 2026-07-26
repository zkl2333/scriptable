// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: paint-brush;
// @script-id render-api-lab
// @version 1.0.0

// src/widgets/render-api-lab.js
var family = config.widgetFamily || "medium";
var isAccessory = family.startsWith("accessory");
var palette = {
  ink: Color.dynamic(new Color("#18212B"), new Color("#F3F7FA")),
  muted: Color.dynamic(new Color("#637080"), new Color("#AAB6C3")),
  accent: Color.dynamic(new Color("#3867E8"), new Color("#8EA9FF")),
  accentSoft: Color.dynamic(new Color("#E6EDFF"), new Color("#202B4B")),
  border: Color.dynamic(new Color("#C9D4E3"), new Color("#3B4658")),
  panel: Color.dynamic(new Color("#F8FBFF"), new Color("#161D28"))
};
var makeGradient = (colors, start, end) => {
  const gradient = new LinearGradient();
  gradient.colors = colors;
  gradient.locations = colors.map((_, index) => index / Math.max(1, colors.length - 1));
  gradient.startPoint = start;
  gradient.endPoint = end;
  return gradient;
};
var makeTexture = () => {
  const context = new DrawContext();
  context.size = new Size(160, 100);
  context.opaque = false;
  context.setFillColor(new Color("#3867E8", 0.07));
  for (let x = 4; x < 160; x += 16) {
    for (let y = 4; y < 100; y += 16) context.fillEllipse(new Rect(x, y, 2, 2));
  }
  return context.getImage();
};
var addAccessory = (widget2) => {
  widget2.addAccessoryWidgetBackground = true;
  widget2.setPadding(4, 6, 4, 6);
  const row = widget2.addStack();
  row.centerAlignContent();
  const symbol = row.addImage(SFSymbol.named("circle").image);
  symbol.imageSize = new Size(family === "accessoryCircular" ? 20 : 13, family === "accessoryCircular" ? 20 : 13);
  symbol.tintColor = palette.accent;
  if (family === "accessoryCircular") {
    row.addSpacer();
    return;
  }
  row.addSpacer(5);
  const text = row.addText(family === "accessoryInline" ? "渲染 API 实验室" : "字体 · 颜色 · Stack");
  text.font = Font.semiboldSystemFont(family === "accessoryInline" ? 11 : 10);
  text.textColor = palette.ink;
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.7;
};
var addHome = (widget2) => {
  widget2.backgroundGradient = makeGradient(
    [Color.dynamic(new Color("#F9FBFF"), new Color("#151A24")), Color.dynamic(new Color("#E9F0FF"), new Color("#202A3C"))],
    new Point(0, 0),
    new Point(1, 1)
  );
  widget2.setPadding(14, 16, 14, 16);
  widget2.spacing = 7;
  const header = widget2.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named("circle").image);
  icon.imageSize = new Size(16, 16);
  icon.tintColor = palette.accent;
  icon.cornerRadius = 5;
  icon.borderWidth = 1;
  icon.borderColor = palette.border;
  header.addSpacer(7);
  const title = header.addText("RENDER API LAB");
  title.font = Font.boldMonospacedSystemFont(11);
  title.textColor = palette.ink;
  title.shadowColor = new Color("#3867E8", 0.25);
  title.shadowRadius = 2;
  title.shadowOffset = new Point(0, 1);
  header.addSpacer();
  const stamp = header.addText("LIVE");
  stamp.font = Font.semiboldRoundedSystemFont(10);
  stamp.textColor = palette.accent;
  stamp.textOpacity = 0.82;
  const card = widget2.addStack();
  card.layoutVertically();
  card.setPadding(9, 10, 9, 10);
  card.cornerRadius = 13;
  card.borderWidth = 1;
  card.borderColor = palette.border;
  card.backgroundColor = palette.panel;
  card.backgroundImage = makeTexture();
  card.spacing = 3;
  const hero = card.addText("组件渲染语义");
  hero.font = Font.semiboldRoundedSystemFont(family === "small" ? 17 : 20);
  hero.textColor = palette.ink;
  hero.lineLimit = 1;
  hero.minimumScaleFactor = 0.65;
  const detail = card.addText("动态颜色 · 渐变 · 阴影 · 边框");
  detail.font = Font.mediumSystemFont(10);
  detail.textColor = palette.muted;
  detail.textOpacity = 0.82;
  detail.lineLimit = 1;
  detail.minimumScaleFactor = 0.72;
  const status = card.addStack();
  status.centerAlignContent();
  const swatch = status.addImage(SFSymbol.named("circle").image);
  swatch.imageSize = new Size(12, 12);
  swatch.tintColor = palette.accent;
  swatch.applyFillingContentMode();
  status.addSpacer(5);
  const time = status.addDate(new Date(Date.now() + 52 * 60 * 1e3));
  time.font = Font.mediumMonospacedSystemFont(10);
  time.textColor = palette.ink;
  time.applyTimerStyle();
  status.addSpacer();
  const zone = status.addText("T+52M");
  zone.font = Font.semiboldMonospacedSystemFont(9);
  zone.textColor = palette.accent;
  if (family !== "small") {
    const dates = widget2.addStack();
    dates.centerAlignContent();
    const relative = dates.addDate(new Date(Date.now() + 2 * 60 * 60 * 1e3));
    relative.font = Font.regularSystemFont(10);
    relative.textColor = palette.muted;
    relative.applyRelativeStyle();
    dates.addSpacer();
    const offset = dates.addDate(new Date(Date.now() - 30 * 60 * 1e3));
    offset.font = Font.regularMonospacedSystemFont(10);
    offset.textColor = palette.muted;
    offset.applyOffsetStyle();
  }
  if (family === "large" || family === "extraLarge") {
    widget2.addSpacer();
    const foot = widget2.addText("Text · Date · Image · Stack · Gradient");
    foot.font = Font.regularMonospacedSystemFont(9);
    foot.textColor = palette.muted;
    foot.centerAlignText();
  }
};
var widget = new ListWidget();
widget.url = URLScheme.forRunningScript();
if (isAccessory) addAccessory(widget);
else addHome(widget);
Script.setWidget(widget);
Script.complete();
