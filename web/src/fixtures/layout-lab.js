const drawProgress = ({ DrawContext, Path, Rect, Size, Color }, width, progress, color, track) => {
  const context = new DrawContext();
  context.size = new Size(width, 6);
  context.respectScreenScale = true;
  context.setFillColor(track);
  const background = new Path();
  background.addRoundedRect(new Rect(0, 0, width, 6), 3, 3);
  context.addPath(background);
  context.fillPath();
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, 0, Math.max(0, Math.round(width * progress)), 6), 3, 3);
  context.setFillColor(color);
  context.addPath(fill);
  context.fillPath();
  return context.getImage();
};

const addAccessory = (api, widget) => {
  const { Color, Font, SFSymbol, Size, config } = api;
  const foreground = Color.dynamic(new Color('#111111'), new Color('#ffffff'));
  widget.setPadding(0, 0, 0, 0);
  if (config.widgetFamily === 'accessoryInline') {
    const text = widget.addText('今日进度 68% · 下一节点 14:30');
    text.font = Font.semiboldSystemFont(12);
    text.textColor = foreground;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.75;
    return;
  }
  if (config.widgetFamily === 'accessoryCircular') {
    widget.addSpacer();
    const label = widget.addText('TODAY');
    label.font = Font.mediumSystemFont(8);
    label.textColor = foreground;
    label.centerAlignText();
    const progress = widget.addText('68%');
    progress.font = Font.boldRoundedSystemFont(18);
    progress.textColor = foreground;
    progress.centerAlignText();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 5, 5, 5);
  const row = widget.addStack();
  row.centerAlignContent();
  const icon = row.addImage(SFSymbol.named('clock').image);
  icon.imageSize = new Size(14, 14);
  icon.tintColor = foreground;
  row.addSpacer(5);
  const text = row.addText('今日 68%');
  text.font = Font.semiboldSystemFont(12);
  text.textColor = foreground;
  text.lineLimit = 1;
  widget.addSpacer(4);
  const detail = widget.addText('14:30 前保持节奏');
  detail.font = Font.mediumSystemFont(10);
  detail.textColor = foreground;
  detail.lineLimit = 1;
};

export const buildLayoutLab = (api) => {
  const { Color, Font, LinearGradient, ListWidget, Point, SFSymbol, Size, config } = api;
  const widget = new ListWidget();
  const accessory = config.widgetFamily.startsWith('accessory');
  if (accessory) {
    addAccessory(api, widget);
    return widget;
  }

  const colors = {
    text: Color.dynamic(new Color('#15202b'), new Color('#f4f7fa')),
    muted: Color.dynamic(new Color('#68727c'), new Color('#a8b2bd')),
    panel: Color.dynamic(new Color('#ffffff', 0.62), new Color('#1d2935', 0.78)),
    track: Color.dynamic(new Color('#d6e1e8'), new Color('#35424f')),
    cyan: new Color('#208ca5'),
    green: new Color('#31955d'),
    gold: new Color('#c38320'),
  };
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#edf6f7'), new Color('#12212b')),
    Color.dynamic(new Color('#f4f0e7'), new Color('#1e1b28')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  const compact = config.widgetFamily === 'small';
  widget.setPadding(compact ? 14 : 18, compact ? 14 : 20, 14, compact ? 14 : 20);

  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named('quote.bubble.fill').image);
  icon.imageSize = new Size(15, 15);
  icon.tintColor = colors.cyan;
  header.addSpacer(6);
  const title = header.addText('LAYOUT LAB');
  title.font = Font.boldSystemFont(11);
  title.textColor = colors.muted;
  header.addSpacer();
  const status = header.addText('STABLE');
  status.font = Font.semiboldSystemFont(9);
  status.textColor = colors.green;

  widget.addSpacer(compact ? 11 : 15);
  const headlineText = compact
    ? '布局清晰，节奏稳定。'
    : config.widgetFamily === 'large'
      ? '让 Scriptable 布局在浏览器里可见。'
      : '让布局可见。';
  const headline = widget.addText(headlineText);
  headline.font = Font.boldRoundedSystemFont(compact ? 22 : config.widgetFamily === 'large' ? 30 : 25);
  headline.textColor = colors.text;
  headline.lineLimit = compact || config.widgetFamily === 'large' ? 3 : 1;
  headline.minimumScaleFactor = 0.62;

  widget.addSpacer(compact ? 10 : 16);
  const metricRows = compact ? [
    ['今日', 0.68, colors.cyan],
    ['本周', 0.42, colors.green],
  ] : config.widgetFamily === 'large' ? [
    ['今日进度', 0.68, colors.cyan],
    ['本周节奏', 0.42, colors.green],
    ['本月规划', 0.76, colors.gold],
  ] : [
    ['今日进度', 0.68, colors.cyan],
    ['本周节奏', 0.42, colors.green],
  ];
  const width = compact ? 74 : 205;
  for (const [index, [label, progress, color]] of metricRows.entries()) {
    const row = widget.addStack();
    row.centerAlignContent();
    const name = row.addText(label);
    name.font = Font.mediumSystemFont(compact ? 10 : 11);
    name.textColor = colors.muted;
    name.lineLimit = 1;
    row.addSpacer(compact ? 5 : 10);
    const bar = row.addImage(drawProgress(api, width, progress, color, colors.track));
    bar.imageSize = new Size(width, 6);
    row.addSpacer(compact ? 5 : 8);
    const value = row.addText(`${Math.round(progress * 100)}%`);
    value.font = Font.semiboldRoundedSystemFont(compact ? 10 : 11);
    value.textColor = colors.text;
    if (index < metricRows.length - 1) widget.addSpacer(compact ? 8 : 10);
  }

  if (!compact) {
    widget.addSpacer();
    const footer = widget.addStack();
    footer.centerAlignContent();
    footer.backgroundColor = colors.panel;
    footer.cornerRadius = 7;
    footer.setPadding(7, 8, 7, 8);
    const marker = footer.addImage(SFSymbol.named('clock').image);
    marker.imageSize = new Size(12, 12);
    marker.tintColor = colors.cyan;
    footer.addSpacer(6);
    const note = footer.addText('固定数据 · 无网络请求');
    note.font = Font.mediumSystemFont(10);
    note.textColor = colors.muted;
    note.lineLimit = 1;
  }
  return widget;
};
