const STYLE_KEY_PREFIX = 'zkl2333.widgetStyle';
const STATE_DIR_NAME = 'widgetState';

export const ACCESSORY_FAMILIES = [
  'accessoryInline',
  'accessoryCircular',
  'accessoryRectangular',
];

export const ALL_PREVIEW_FAMILIES = [
  'small',
  'medium',
  'large',
  'extraLarge',
  'extraLargePortrait',
  ...ACCESSORY_FAMILIES,
];

export const isAccessoryFamily = (family) => ACCESSORY_FAMILIES.includes(family);

export const isLargeFamily = (family) =>
  family === 'large' || family === 'extraLarge' || family === 'extraLargePortrait';

export const isExtraLargeFamily = (family) =>
  family === 'extraLarge' || family === 'extraLargePortrait';

export const clampPercent = (value) =>
  Math.min(100, Math.max(0, Number(value) || 0));

export const getWidgetAction = () =>
  typeof args !== 'undefined' && args?.widgetAction ? args.widgetAction : null;

export const supportsInteractiveControls = (target) =>
  typeof target?.setAction === 'function' || typeof target?.addButton === 'function';

export const supportsProgress = (target) =>
  typeof target?.addProgress === 'function';

const transparentKey = (scriptId) => `${STYLE_KEY_PREFIX}.${scriptId}.transparent`;

const parameterRequestsTransparent = () => {
  if (typeof args === 'undefined' || !args?.widgetParameter) return false;
  const raw = String(args.widgetParameter).trim().toLowerCase();
  if (!raw) return false;
  return raw
    .split(/[\s,;|]+/)
    .some((token) => token === 'transparent' || token === '透明' || token === 'bg=transparent');
};

export const isTransparentEnabled = (scriptId) => {
  if (parameterRequestsTransparent()) return true;
  if (!scriptId || typeof Keychain === 'undefined') return false;
  try {
    return Keychain.contains(transparentKey(scriptId)) && Keychain.get(transparentKey(scriptId)) === '1';
  } catch {
    return false;
  }
};

export const setTransparentEnabled = (scriptId, enabled) => {
  if (!scriptId || typeof Keychain === 'undefined') return false;
  const key = transparentKey(scriptId);
  if (enabled) {
    Keychain.set(key, '1');
    return true;
  }
  if (Keychain.contains(key)) Keychain.remove(key);
  return false;
};

export const toggleTransparentBackground = (scriptId) => {
  const next = !isTransparentEnabled(scriptId);
  setTransparentEnabled(scriptId, next);
  return next;
};

export const applyTransparentBackground = (
  widget,
  scriptId,
  { isAccessory = false, force = null } = {}
) => {
  if (!widget || isAccessory) return false;
  const enabled = force === null ? isTransparentEnabled(scriptId) : Boolean(force);
  if (!enabled) return false;
  widget.backgroundStyle = 'transparent';
  widget.backgroundColor = null;
  widget.backgroundGradient = null;
  widget.backgroundImage = null;
  return true;
};

export const attachStackAction = (stack, title, id) => {
  if (!stack || typeof stack.setAction !== 'function' || !id) return false;
  stack.setAction(title || id, { id: String(id) });
  return true;
};

export const addRefreshAction = (
  parent,
  {
    title = '刷新组件',
    id = 'refresh',
    text = '',
    font = null,
    textColor = null,
    iconColor = null,
    iconSize = 10,
    backgroundColor = null,
    cornerRadius = 0,
    padding = null,
  } = {}
) => {
  const stack = parent.addStack();
  stack.centerAlignContent();
  if (backgroundColor) stack.backgroundColor = backgroundColor;
  if (cornerRadius) stack.cornerRadius = cornerRadius;
  if (padding) stack.setPadding(padding[0], padding[1], padding[2], padding[3]);

  if (text) {
    const label = stack.addText(text);
    if (font) label.font = font;
    if (textColor) label.textColor = textColor;
    label.lineLimit = 1;
    label.minimumScaleFactor = 0.72;
  }

  if (typeof stack.setAction === 'function') {
    if (text) stack.addSpacer(4);
    const symbol = SFSymbol.named('arrow.clockwise');
    if (symbol?.image) {
      const icon = stack.addImage(symbol.image);
      icon.imageSize = new Size(iconSize, iconSize);
      if (iconColor || textColor) icon.tintColor = iconColor || textColor;
    }
    stack.setAction(title, { id });
  }
  return stack;
};

export const addLinearProgress = (
  parent,
  percent,
  {
    width = 120,
    thickness = 6,
    progressColor,
    trackColor,
    fallback,
  } = {}
) => {
  const clamped = clampPercent(percent);
  if (supportsProgress(parent)) {
    const bar = parent.addProgress(clamped, {
      style: 'linear',
      progressColor,
      trackColor,
      thickness,
    });
    if (width > 0) bar.size = new Size(width, thickness);
    return bar;
  }
  return typeof fallback === 'function' ? fallback(clamped) : null;
};

export const addCircularProgress = (
  parent,
  percent,
  {
    size = 40,
    thickness = 5,
    progressColor,
    trackColor,
    buildCenter,
    fallback,
  } = {}
) => {
  const clamped = clampPercent(percent);
  if (supportsProgress(parent)) {
    const ring = parent.addProgress(clamped, {
      style: 'circular',
      progressColor,
      trackColor,
      thickness,
    });
    ring.size = new Size(size, size);
    if (typeof buildCenter === 'function') buildCenter(ring);
    return ring;
  }
  return typeof fallback === 'function' ? fallback(clamped) : null;
};

const getStateFile = (scriptId) => {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), STATE_DIR_NAME);
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return { fm, path: fm.joinPath(dir, `${scriptId}.json`) };
};

export const readWidgetState = (scriptId, defaults = {}) => {
  if (!scriptId || typeof FileManager === 'undefined') return { ...defaults };
  try {
    const { fm, path } = getStateFile(scriptId);
    if (!fm.fileExists(path)) return { ...defaults };
    const parsed = JSON.parse(fm.readString(path));
    return parsed && typeof parsed === 'object' ? { ...defaults, ...parsed } : { ...defaults };
  } catch {
    return { ...defaults };
  }
};

export const writeWidgetState = (scriptId, state) => {
  if (!scriptId || typeof FileManager === 'undefined') return state;
  try {
    const { fm, path } = getStateFile(scriptId);
    fm.writeString(path, JSON.stringify(state));
  } catch {
    // 忽略只读或沙箱异常，避免阻断渲染
  }
  return state;
};
