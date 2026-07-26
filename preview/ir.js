/**
 * Scriptable 组件中间表示（IR）。
 *
 * 字段命名对齐 Scriptable 组件的序列化 Schema（ListWidgetData /
 * ListWidgetElement）。
 *
 * 设计约束：
 * - IR 必须是纯 JSON（可 JSON.stringify 往返），不允许类实例、闭包、Date；
 * - JS API 层（runtime.js 的沙箱类）负责收集脚本调用，buildIR() 时物化为 IR；
 * - 渲染器只消费 IR，不接触 JS API 对象。
 *
 * 与原生 Schema 的差异（务实取舍）：
 * - Color 在 build 时按外观解析为 { hex, alpha }；Color.dynamic 额外保留
 *   dark 值供将来渲染期解析（原生编码为 lightComponents/darkComponents）；
 * - 图片内容以 codableImage.kind（symbol/draw/remote）区分来源，
 *   原生为数据的 Codable 包装；
 * - date 元素补充 date 字段（ISO 字符串），原生字段描述符中未见独立
 *   date 字段，存储方式待真机产物复核。
 */
(function initializeScriptablePreviewIR(global) {
  'use strict';

  let identifierSequence = 0;
  const nextIdentifier = () => `el_${++identifierSequence}`;

  const finiteOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const colorToIR = (color) => {
    if (!color) return null;
    if (color.__kind !== 'color') throw new TypeError('非法 Color 值');
    return {
      hex: String(color.hex),
      alpha: Math.min(1, Math.max(0, Number(color.alpha ?? 1))),
      ...(color.dark ? { dark: colorToIR(color.dark) } : null),
    };
  };

  const fontToIR = (font) => {
    if (!font) return null;
    if (font.__kind !== 'font') throw new TypeError('非法 Font 值');
    return {
      family: font.family,
      size: Number(font.size),
      weight: Number(font.weight),
      style: font.style || 'normal',
      name: font.name || null,
    };
  };

  const pointToIR = (point) => (point ? { x: Number(point.x), y: Number(point.y) } : null);
  const sizeToIR = (size) => (size ? { width: Number(size.width), height: Number(size.height) } : null);

  const gradientToIR = (gradient) => {
    if (!gradient) return null;
    return {
      colors: (gradient.colors || []).map(colorToIR),
      locations: gradient.locations || [],
      startPoint: pointToIR(gradient.startPoint),
      endPoint: pointToIR(gradient.endPoint),
    };
  };

  const imageToIR = (image) => {
    if (!image) return null;
    switch (image.__kind) {
      case 'symbol':
        return { kind: 'symbol', name: String(image.name), font: fontToIR(image.font) };
      case 'draw':
        return {
          kind: 'draw',
          size: sizeToIR(image.size),
          ops: (image.ops || []).map((op) => ({ ...op, color: op.color ? colorToIR(op.color) : null })),
        };
      case 'remote':
        return { kind: 'remote', url: String(image.url) };
      default:
        throw new TypeError(`不支持的图片类型：${image.__kind}`);
    }
  };

  const ELEMENT_TYPES = ['text', 'date', 'image', 'spacer', 'stack'];

  const baseElement = (type) => ({ type, identifier: nextIdentifier() });

  const irText = () => ({
    ...baseElement('text'),
    text: '',
    styling: {},
    horizontalTextAlignment: 'left',
    verticalTextAlignment: null,
    rawOpenURL: null,
  });

  const irDate = (date) => ({
    ...baseElement('date'),
    date: date instanceof Date ? date.toISOString() : new Date(date).toISOString(),
    styling: {},
    dateStyle: 'date',
    horizontalTextAlignment: 'left',
    rawOpenURL: null,
  });

  const irImage = (image) => ({
    ...baseElement('image'),
    codableImage: imageToIR(image),
    resizable: true,
    contentMode: 'fit',
    imageAlignment: 'left',
    imageOpacity: 1,
    imageSize: null,
    cornerRadius: 0,
    containerRelativeShape: false,
    borderWidth: 0,
    borderColor: null,
    tintColor: null,
    rawOpenURL: null,
  });

  const irSpacer = (length) => ({
    ...baseElement('spacer'),
    length: finiteOrNull(length),
  });

  const irStack = () => ({
    ...baseElement('stack'),
    contentDirection: 'horizontal',
    backgroundColor: null,
    backgroundGradient: null,
    backgroundImage: null,
    spacing: 0,
    alignment: null,
    elements: [],
    size: null,
    cornerRadius: 0,
    borderWidth: 0,
    borderColor: null,
    padding: null,
    rawOpenURL: null,
  });

  const irList = () => ({
    type: 'list',
    backgroundColor: null,
    backgroundGradient: null,
    backgroundImage: null,
    padding: null,
    spacing: 0,
    openURL: null,
    refreshAfterDate: null,
    addAccessoryWidgetBackground: false,
    elements: [],
  });

  /** 校验 IR 为纯 JSON 且结构完整，返回深拷贝（切断与 JS API 层的引用）。 */
  const validateIR = (ir) => {
    const snapshot = JSON.parse(JSON.stringify(ir));
    const visit = (node, path) => {
      if (!node || typeof node !== 'object') throw new TypeError(`${path}：节点必须是对象`);
      if (node.type === 'list' || node.type === 'stack') {
        if (!Array.isArray(node.elements)) throw new TypeError(`${path}：缺少 elements 数组`);
        node.elements.forEach((child, index) => {
          if (!ELEMENT_TYPES.includes(child.type)) {
            throw new TypeError(`${path}.elements[${index}]：未知元素类型 ${child.type}`);
          }
          if (child.type !== 'spacer' && typeof child.identifier !== 'string') {
            throw new TypeError(`${path}.elements[${index}]：缺少 identifier`);
          }
          visit(child, `${path}.elements[${index}]`);
        });
      }
    };
    if (snapshot.type !== 'list') throw new TypeError('IR 根节点必须是 list');
    visit(snapshot, 'root');
    return snapshot;
  };

  global.ScriptablePreviewIR = Object.freeze({
    colorToIR,
    fontToIR,
    pointToIR,
    sizeToIR,
    gradientToIR,
    imageToIR,
    irText,
    irDate,
    irImage,
    irSpacer,
    irStack,
    irList,
    validateIR,
    resetIdentifiers: () => { identifierSequence = 0; },
  });
})(globalThis);
