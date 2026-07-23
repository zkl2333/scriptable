let nextNodeId = 1;

const nodeId = () => `node-${nextNodeId++}`;

export class Point {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

export class Size {
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
  }
}

export class Rect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

export class Color {
  constructor(hex = '#000000', alpha = 1) {
    this.hex = hex;
    this.alpha = alpha;
    this.kind = 'color';
  }

  static dynamic(light, dark) {
    return { kind: 'dynamic-color', light, dark };
  }

  static black() {
    return new Color('#000000');
  }

  static white() {
    return new Color('#ffffff');
  }

  static red() {
    return new Color('#ff3b30');
  }

  static green() {
    return new Color('#34c759');
  }

  static blue() {
    return new Color('#007aff');
  }

  static gray() {
    return new Color('#8e8e93');
  }
}

export class Font {
  constructor(size = 12, { family = 'system', weight = 400, italic = false } = {}) {
    this.size = size;
    this.family = family;
    this.weight = weight;
    this.italic = italic;
  }

  static systemFont(size) {
    return new Font(size);
  }

  static regularSystemFont(size) {
    return new Font(size);
  }

  static mediumSystemFont(size) {
    return new Font(size, { weight: 500 });
  }

  static semiboldSystemFont(size) {
    return new Font(size, { weight: 600 });
  }

  static boldSystemFont(size) {
    return new Font(size, { weight: 700 });
  }

  static heavySystemFont(size) {
    return new Font(size, { weight: 800 });
  }

  static blackSystemFont(size) {
    return new Font(size, { weight: 900 });
  }

  static italicSystemFont(size) {
    return new Font(size, { italic: true });
  }

  static lightSystemFont(size) {
    return new Font(size, { weight: 300 });
  }

  static thinSystemFont(size) {
    return new Font(size, { weight: 200 });
  }

  static ultraLightSystemFont(size) {
    return new Font(size, { weight: 100 });
  }

  static mediumRoundedSystemFont(size) {
    return new Font(size, { family: 'rounded', weight: 500 });
  }

  static semiboldRoundedSystemFont(size) {
    return new Font(size, { family: 'rounded', weight: 600 });
  }

  static boldRoundedSystemFont(size) {
    return new Font(size, { family: 'rounded', weight: 700 });
  }

  static regularMonospacedSystemFont(size) {
    return new Font(size, { family: 'monospaced' });
  }

  static mediumMonospacedSystemFont(size) {
    return new Font(size, { family: 'monospaced', weight: 500 });
  }

  static boldMonospacedSystemFont(size) {
    return new Font(size, { family: 'monospaced', weight: 700 });
  }
}

export class LinearGradient {
  constructor() {
    this.colors = [];
    this.locations = [];
    this.startPoint = new Point(0, 0);
    this.endPoint = new Point(0, 1);
  }
}

class WidgetNode {
  constructor(type) {
    this.id = nodeId();
    this.type = type;
    this.size = null;
    this.url = null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      size: this.size,
      url: this.url,
    };
  }
}

class WidgetContainer extends WidgetNode {
  constructor(type, diagnostics) {
    super(type);
    this.diagnostics = diagnostics;
    this.children = [];
    this.layout = type === 'list-widget' ? 'vertical' : 'horizontal';
    this.alignment = type === 'list-widget' ? 'stretch' : 'center';
    this.padding = [0, 0, 0, 0];
    this.spacing = 0;
    this.backgroundColor = null;
    this.backgroundGradient = null;
    this.backgroundImage = null;
    this.cornerRadius = 0;
    this.borderWidth = 0;
    this.borderColor = null;
  }

  addStack() {
    const child = new WidgetStack(this.diagnostics);
    this.children.push(child);
    return child;
  }

  addText(text) {
    const child = new WidgetText(String(text));
    this.children.push(child);
    return child;
  }

  addDate(date) {
    const child = new WidgetDate(date);
    this.children.push(child);
    return child;
  }

  addImage(image) {
    const child = new WidgetImage(image, this.diagnostics);
    this.children.push(child);
    return child;
  }

  addSpacer(length = null) {
    const child = new WidgetSpacer(length);
    this.children.push(child);
    return child;
  }

  setPadding(top, leading, bottom, trailing) {
    this.padding = [top, leading, bottom, trailing];
  }

  layoutHorizontally() {
    this.layout = 'horizontal';
  }

  layoutVertically() {
    this.layout = 'vertical';
  }

  topAlignContent() {
    this.alignment = 'start';
  }

  centerAlignContent() {
    this.alignment = 'center';
  }

  bottomAlignContent() {
    this.alignment = 'end';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      layout: this.layout,
      alignment: this.alignment,
      padding: this.padding,
      spacing: this.spacing,
      children: this.children,
    };
  }
}

export class ListWidget extends WidgetContainer {
  constructor(diagnostics = []) {
    super('list-widget', diagnostics);
    this.refreshAfterDate = null;
  }
}

export class WidgetStack extends WidgetContainer {
  constructor(diagnostics = []) {
    super('stack', diagnostics);
  }
}

export class WidgetText extends WidgetNode {
  constructor(text) {
    super('text');
    this.text = text;
    this.font = Font.systemFont(12);
    this.textColor = Color.black();
    this.lineLimit = 0;
    this.minimumScaleFactor = 1;
    this.alignment = 'natural';
    this.opacity = 1;
  }

  leftAlignText() {
    this.alignment = 'left';
  }

  centerAlignText() {
    this.alignment = 'center';
  }

  rightAlignText() {
    this.alignment = 'right';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      text: this.text,
      lineLimit: this.lineLimit,
      minimumScaleFactor: this.minimumScaleFactor,
      alignment: this.alignment,
    };
  }
}

export class WidgetDate extends WidgetText {
  constructor(date) {
    super('');
    this.type = 'date';
    this.date = new Date(date);
    this.dateStyle = 'date';
  }

  applyDateStyle() {
    this.dateStyle = 'date';
  }

  applyTimeStyle() {
    this.dateStyle = 'time';
  }

  applyRelativeStyle() {
    this.dateStyle = 'relative';
  }

  applyOffsetStyle() {
    this.dateStyle = 'offset';
  }

  applyTimerStyle() {
    this.dateStyle = 'timer';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      date: this.date.toISOString(),
      dateStyle: this.dateStyle,
    };
  }
}

export class WidgetImage extends WidgetNode {
  constructor(image, diagnostics = []) {
    super('image');
    this.image = image;
    this.diagnostics = diagnostics;
    this.imageSize = null;
    this.tintColor = null;
    this.opacity = 1;
    this.cornerRadius = 0;
    this.contentMode = 'fit';
    this.alignment = 'center';
  }

  set imageColor(color) {
    this.tintColor = color;
    this.diagnostics.push({
      level: 'warning',
      message: 'WidgetImage.imageColor is a compatibility alias for tintColor.',
    });
  }

  get imageColor() {
    return this.tintColor;
  }

  applyFittingContentMode() {
    this.contentMode = 'fit';
  }

  applyFillingContentMode() {
    this.contentMode = 'fill';
  }

  leftAlignImage() {
    this.alignment = 'start';
  }

  centerAlignImage() {
    this.alignment = 'center';
  }

  rightAlignImage() {
    this.alignment = 'end';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      image: this.image?.kind || 'unknown',
      imageSize: this.imageSize,
      contentMode: this.contentMode,
    };
  }
}

export class WidgetSpacer extends WidgetNode {
  constructor(length) {
    super('spacer');
    this.length = length;
  }

  toJSON() {
    return { ...super.toJSON(), length: this.length };
  }
}

export class Path {
  constructor() {
    this.commands = [];
  }

  addRect(rect) {
    this.commands.push({ type: 'rect', rect });
  }

  addRoundedRect(rect, cornerWidth, cornerHeight) {
    this.commands.push({ type: 'rounded-rect', rect, cornerWidth, cornerHeight });
  }

  addEllipse(rect) {
    this.commands.push({ type: 'ellipse', rect });
  }

  move(point) {
    this.commands.push({ type: 'move', point });
  }

  addLine(point) {
    this.commands.push({ type: 'line', point });
  }

  addQuadCurve(point, controlPoint) {
    this.commands.push({ type: 'quad', point, controlPoint });
  }

  addCurve(point, controlPoint1, controlPoint2) {
    this.commands.push({ type: 'curve', point, controlPoint1, controlPoint2 });
  }

  closeSubpath() {
    this.commands.push({ type: 'close' });
  }
}

export class CanvasImage {
  constructor(size, commands, respectScreenScale) {
    this.kind = 'canvas';
    this.size = size;
    this.commands = commands;
    this.respectScreenScale = respectScreenScale;
  }
}

export class DrawContext {
  constructor() {
    this.size = new Size(0, 0);
    this.opaque = false;
    this.respectScreenScale = false;
    this.fillColor = Color.black();
    this.strokeColor = Color.black();
    this.textColor = Color.black();
    this.font = Font.systemFont(12);
    this.lineWidth = 1;
    this.textAlignment = 'left';
    this.path = null;
    this.commands = [];
  }

  setFillColor(color) {
    this.fillColor = color;
  }

  setStrokeColor(color) {
    this.strokeColor = color;
  }

  setTextColor(color) {
    this.textColor = color;
  }

  setFont(font) {
    this.font = font;
  }

  setLineWidth(width) {
    this.lineWidth = width;
  }

  setTextAlignedLeft() {
    this.textAlignment = 'left';
  }

  setTextAlignedCenter() {
    this.textAlignment = 'center';
  }

  setTextAlignedRight() {
    this.textAlignment = 'right';
  }

  addPath(path) {
    this.path = path;
  }

  fillPath() {
    if (this.path) this.commands.push({ type: 'fill-path', path: this.path.commands, color: this.fillColor });
  }

  strokePath() {
    if (this.path) {
      this.commands.push({
        type: 'stroke-path',
        path: this.path.commands,
        color: this.strokeColor,
        lineWidth: this.lineWidth,
      });
    }
  }

  fillRect(rect) {
    this.commands.push({ type: 'fill-rect', rect, color: this.fillColor });
  }

  strokeRect(rect) {
    this.commands.push({ type: 'stroke-rect', rect, color: this.strokeColor, lineWidth: this.lineWidth });
  }

  drawText(text, point) {
    this.commands.push({
      type: 'text',
      text: String(text),
      point,
      color: this.textColor,
      font: this.font,
      alignment: this.textAlignment,
    });
  }

  drawTextInRect(text, rect) {
    this.commands.push({
      type: 'text-rect',
      text: String(text),
      rect,
      color: this.textColor,
      font: this.font,
      alignment: this.textAlignment,
    });
  }

  getImage() {
    return new CanvasImage(this.size, this.commands.slice(), this.respectScreenScale);
  }
}

export class SFSymbol {
  constructor(name) {
    this.name = name;
    this.font = Font.systemFont(14);
  }

  static named(name) {
    return new SFSymbol(name);
  }

  applyFont(font) {
    this.font = font;
  }

  get image() {
    return { kind: 'sf-symbol', name: this.name, font: this.font };
  }
}

export const createRuntime = ({ family = 'small', scheme = 'light', now = new Date() } = {}) => {
  const diagnostics = [];
  let widget = null;

  const api = {
    Color,
    DrawContext,
    Font,
    LinearGradient,
    ListWidget: class extends ListWidget {
      constructor() {
        super(diagnostics);
      }
    },
    Path,
    Point,
    Rect,
    SFSymbol,
    Size,
    WidgetStack: class extends WidgetStack {
      constructor() {
        super(diagnostics);
      }
    },
    config: { widgetFamily: family },
    args: { widgetParameter: null },
    now: new Date(now),
    Script: {
      setWidget(value) {
        widget = value;
      },
      complete() {},
    },
  };

  return {
    api,
    diagnostics,
    family,
    scheme,
    getWidget: () => widget,
    warn: (message) => diagnostics.push({ level: 'warning', message }),
  };
};

export const runPreview = async (buildWidget, options) => {
  const runtime = createRuntime(options);
  try {
    const result = await buildWidget(runtime.api);
    const widget = runtime.getWidget() || result;
    if (!(widget instanceof ListWidget)) {
      throw new TypeError('Preview fixture must return a ListWidget or call Script.setWidget().');
    }
    return { widget, diagnostics: runtime.diagnostics, runtime };
  } catch (error) {
    runtime.diagnostics.push({ level: 'error', message: error.message || String(error) });
    return { widget: null, diagnostics: runtime.diagnostics, runtime };
  }
};
