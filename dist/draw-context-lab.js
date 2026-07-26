// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: pencil-alt;
// @script-id draw-context-lab
// @version 1.0.0

// src/widgets/draw-context-lab.js
var family = config.widgetFamily || "medium";
var isAccessory = family.startsWith("accessory");
var ink = Color.dynamic(new Color("#1B2430"), new Color("#F4F7FB"));
var muted = Color.dynamic(new Color("#687585"), new Color("#A6B2C1"));
var blue = Color.dynamic(new Color("#2F6BFF"), new Color("#8AA8FF"));
var makeCanvas = (width, height) => {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.setFillColor(new Color("#2F6BFF", 0.11));
  context.fill(new Rect(0, 0, width, height));
  context.setStrokeColor(new Color("#2F6BFF", 0.5));
  context.setLineWidth(1);
  context.strokeRect(new Rect(0.5, 0.5, width - 1, height - 1));
  context.setFillColor(new Color("#2F6BFF", 0.75));
  context.fillEllipse(new Rect(12, 12, 20, 20));
  context.setStrokeColor(new Color("#1B2430", 0.65));
  context.setLineWidth(2);
  context.strokeEllipse(new Rect(42, 12, 20, 20));
  const badge = new Path();
  badge.addRoundedRect(new Rect(width - 76, 10, 64, 24), 8, 8);
  context.addPath(badge);
  context.setFillColor(new Color("#1B2430", 0.88));
  context.fillPath();
  const triangle = new Path();
  triangle.addLines([
    new Point(width * 0.42, height - 13),
    new Point(width * 0.52, height - 39),
    new Point(width * 0.62, height - 13)
  ]);
  triangle.closeSubpath();
  context.addPath(triangle);
  context.setStrokeColor(new Color("#2F6BFF"));
  context.setLineWidth(2);
  context.strokePath();
  context.setTextColor(new Color("#1B2430"));
  context.setFont(Font.semiboldMonospacedSystemFont(10));
  context.setTextAlignedCenter();
  context.drawTextInRect("DRAW OPS", new Rect(width - 76, 16, 64, 13));
  context.setTextAlignedRight();
  context.setFont(Font.regularMonospacedSystemFont(8));
  context.drawText("FILL · STROKE · PATH", new Point(width - 10, height - 14));
  const symbol = SFSymbol.named("arrow.up").image;
  context.drawImageAtPoint(symbol, new Point(16, height - 35));
  return context.getImage();
};
var widget = new ListWidget();
widget.setPadding(isAccessory ? 0 : 14, isAccessory ? 0 : 16, isAccessory ? 0 : 14, isAccessory ? 0 : 16);
widget.backgroundColor = Color.dynamic(new Color("#F7FAFF"), new Color("#171D27"));
if (isAccessory) {
  widget.addAccessoryWidgetBackground = true;
  const image = widget.addImage(makeCanvas(family === "accessoryCircular" ? 60 : 150, family === "accessoryCircular" ? 60 : 48));
  image.imageSize = new Size(family === "accessoryCircular" ? 60 : 150, family === "accessoryCircular" ? 60 : 48);
  image.cornerRadius = family === "accessoryCircular" ? 30 : 8;
  image.applyFillingContentMode();
} else {
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named("arrow.up").image);
  icon.imageSize = new Size(15, 15);
  icon.tintColor = blue;
  header.addSpacer(6);
  const title = header.addText("DRAW CONTEXT");
  title.font = Font.boldMonospacedSystemFont(11);
  title.textColor = ink;
  header.addSpacer();
  const caption = header.addText("VECTOR");
  caption.font = Font.mediumMonospacedSystemFont(9);
  caption.textColor = muted;
  widget.addSpacer(8);
  const width = family === "small" ? 126 : 306;
  const height = family === "small" ? 86 : family === "large" ? 158 : 94;
  const image = widget.addImage(makeCanvas(width, height));
  image.imageSize = new Size(width, height);
  image.cornerRadius = 12;
  image.borderWidth = 1;
  image.borderColor = new Color("#2F6BFF", 0.28);
  image.applyFillingContentMode();
  widget.addSpacer(7);
  const note = widget.addText("fill / stroke / path / text / symbol");
  note.font = Font.regularMonospacedSystemFont(9);
  note.textColor = muted;
  note.lineLimit = 1;
  note.minimumScaleFactor = 0.7;
}
Script.setWidget(widget);
Script.complete();
