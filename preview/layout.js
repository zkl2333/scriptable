/**
 * 二维提议-应答布局引擎（M2+）：SwiftUI Layout 协议的精确 Web/离线统一实现。
 *
 * 核心能力：
 * 1. 二维 sizeThatFits(node, proposal)：支持横向 Stack 嵌套纵向折行文本的交叉轴联动回流；
 * 2. 真实多行断行与全场景 minimumScaleFactor（单行 + 多行 lineLimit 联合二分缩字号）；
 * 3. ZStack 进度容器（v1.8 addProgress）：外框与内层居中叠加内容独立求解；
 * 4. WidgetImage 完整尺寸模型（resizable=false、单边纵横比推导、fit/fill）；
 * 5. WidgetKit accessoryInline 过滤规则（最多保留 1 图 + 1 文）；
 * 6. 绝对坐标几何输出：每个节点附加 `_size`、`_frame { x, y, width, height }`、
 *    `_lines`、`_fontScale`、`_effectiveCornerRadius`（真实同心 containerRelativeShape）。
 */
(function initializeScriptablePreviewLayout(global) {
  'use strict';

  const SPACER_DEFAULT_MIN = 8; // iOS 27.2 SwiftUI Spacer() 实测最小长度 8pt
  const LINE_HEIGHT_RATIO = 1.1934; // iOS 27.2 CoreText/UIFont 实测 1222/1024 ≈ 1.1934
  const IMAGE_FALLBACK_SIZE = 16;
  const WIDGET_CORNER_RADIUS = 22;
  const DEFAULT_HOME_PADDING = Object.freeze({ top: 16, right: 16, bottom: 16, left: 16 });
  const ZERO_PADDING = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

  const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);
  const round = (value) => Math.round(value * 100) / 100;
  const box = (width, height) => ({
    width: round(Math.max(0, width)),
    height: round(Math.max(0, height)),
  });
  const frameBox = (x, y, width, height) => ({
    x: round(x),
    y: round(y),
    width: round(Math.max(0, width)),
    height: round(Math.max(0, height)),
  });

  // 图片布局尺寸（R7）：
  // - resizable === false 时锁定固有尺寸，不接受外部 imageSize 缩放；
  // - imageSize 只设一边时按固有纵横比推导另一边；
  // - 都未设时用固有尺寸，未知则回退 16×16。
  const imageExtent = (node) => {
    const image = node.codableImage || {};
    const natural = {
      width: Number(image.size?.width) > 0 ? Number(image.size.width) : null,
      height: Number(image.size?.height) > 0 ? Number(image.size.height) : null,
    };
    if (node.resizable === false && (natural.width || natural.height)) {
      return {
        width: round(natural.width ?? natural.height ?? IMAGE_FALLBACK_SIZE),
        height: round(natural.height ?? natural.width ?? IMAGE_FALLBACK_SIZE),
      };
    }
    const ratio = natural.width && natural.height ? natural.height / natural.width : 1;
    let width = Number(node.imageSize?.width) > 0 ? Number(node.imageSize.width) : null;
    let height = Number(node.imageSize?.height) > 0 ? Number(node.imageSize.height) : null;
    if (width != null && height == null) height = width * ratio;
    if (height != null && width == null) width = height / ratio;
    return {
      width: round(width ?? natural.width ?? IMAGE_FALLBACK_SIZE),
      height: round(height ?? natural.height ?? IMAGE_FALLBACK_SIZE),
    };
  };

  // WidgetKit 官方规则：accessoryInline 仅展示最多 1 张图与 1 段文本，其余元素过滤。
  const filterAccessoryInline = (root) => {
    let firstImage = null;
    let firstText = null;
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'image' && !firstImage) {
        firstImage = node;
        return;
      }
      if ((node.type === 'text' || node.type === 'date') && !firstText) {
        firstText = node;
        return;
      }
      if (Array.isArray(node.elements)) {
        for (const child of node.elements) {
          walk(child);
          if (firstImage && firstText) return;
        }
      }
    };
    walk(root);
    const elements = [];
    if (firstImage) elements.push(firstImage);
    if (firstText) elements.push(firstText);
    return {
      ...root,
      contentDirection: 'horizontal',
      alignment: 'center',
      spacing: firstImage && firstText ? 4 : 0,
      elements,
    };
  };

  const createLayoutEngine = ({
    measure,
    truncateText = null,
    wrapText = null,
    measureTextBlock = null,
    defaultFontSize = 15,
  }) => {
    const fontSizeOf = (font) => (Number(font?.size) > 0 ? Number(font.size) : defaultFontSize);
    const lineHeightOf = (font) => fontSizeOf(font) * LINE_HEIGHT_RATIO;

    const resolveTruncate = (text, font, maxWidth) => {
      if (typeof truncateText === 'function') {
        return truncateText(text, font, maxWidth);
      }
      const raw = String(text ?? '');
      const fullWidth = Math.max(0, measure(raw, font));
      if (!Number.isFinite(maxWidth) || fullWidth <= maxWidth + 0.01) {
        return { text: raw, width: fullWidth, truncated: false };
      }
      return { text: raw, width: Math.max(0, maxWidth), truncated: true };
    };

    // 兜底文本块测量（若调用方仅注入了旧版 measure 函数）
    const resolveTextBlock = (text, font, options = {}) => {
      if (typeof measureTextBlock === 'function') {
        return measureTextBlock(text, font, options);
      }
      const raw = String(text ?? '');
      const baseSize = fontSizeOf(font);
      const lh = baseSize * LINE_HEIGHT_RATIO;
      const limit = Number(options.lineLimit) > 0 ? Number(options.lineLimit) : Infinity;
      const maxWidth = Number.isFinite(options.maxWidth) ? options.maxWidth : Infinity;
      if (options.singleLine) {
        const ideal = Math.max(0, measure(raw, font));
        const trunc = resolveTruncate(raw, font, maxWidth);
        return {
          lines: [trunc.text],
          width: trunc.width,
          idealWidth: ideal,
          height: lh,
          fontSize: baseSize,
          scaled: false,
          truncated: trunc.truncated,
        };
      }
      const paragraphs = raw.split(/\r?\n/);
      let totalLines = 0;
      let widest = 0;
      for (const p of paragraphs) {
        const pw = Math.max(0, measure(p, font));
        const usable = Number.isFinite(maxWidth) ? Math.max(1, Math.min(pw, maxWidth)) : Math.max(1, pw);
        totalLines += Math.max(1, Math.ceil(pw / usable));
        widest = Math.max(widest, Math.min(pw, maxWidth));
      }
      const linesCount = Math.min(limit, Math.max(1, totalLines));
      return {
        lines: paragraphs.slice(0, limit),
        width: widest,
        idealWidth: widest,
        height: linesCount * lh,
        fontSize: baseSize,
        scaled: false,
        truncated: totalLines > limit,
      };
    };

    const stackPadding = (node, family = null) => {
      if (node.padding) return node.padding;
      if (node.type === 'list') {
        return String(family || '').startsWith('accessory') ? ZERO_PADDING : DEFAULT_HOME_PADDING;
      }
      return ZERO_PADDING;
    };
    const stackGap = (node) => (Number(node.spacing) > 0 ? Number(node.spacing) : 0);
    // border-box：边框与内边距一样侵占内容空间，两轴各 2×borderWidth
    const stackBorder = (node) => (Number(node.borderWidth) > 0 ? Number(node.borderWidth) : 0);
    const horizChrome = (node, pad) => pad.left + pad.right + 2 * stackBorder(node);
    const vertChrome = (node, pad) => pad.top + pad.bottom + 2 * stackBorder(node);
    const mainPad = (node, pad) =>
      (node.contentDirection === 'vertical' ? vertChrome(node, pad) : horizChrome(node, pad));
    const crossPad = (node, pad) =>
      (node.contentDirection === 'vertical' ? horizChrome(node, pad) : vertChrome(node, pad));

    const fixedWidth = (node) => (Number(node.size?.width) > 0 ? Number(node.size.width) : null);
    const fixedHeight = (node) => (Number(node.size?.height) > 0 ? Number(node.size.height) : null);
    const fixedMain = (node) =>
      (node.contentDirection === 'vertical' ? fixedHeight(node) : fixedWidth(node));
    const fixedCross = (node) =>
      (node.contentDirection === 'vertical' ? fixedWidth(node) : fixedHeight(node));

    const controlSize = (node) => {
      if (node.type === 'toggle') {
        const titleWidth = Math.max(0, measure(node.title || '', { size: 11, weight: 500, family: 'system' }));
        return { width: round(titleWidth + 51), height: 24 };
      }
      const titleWidth = Math.max(0, measure(node.title || '', { size: 11, weight: 600, family: 'system' }));
      const extra = node.type === 'refreshButton' ? 33 : 20;
      return { width: round(titleWidth + extra), height: 24 };
    };

    // ------------------------------------------------------------------
    // 二维 sizeThatFits(node, proposal)：返回在给定二维提议下节点实际占用的 { width, height }。
    // 用于横向 Stack 压缩子纵向 Stack 宽度后，重新反求子项因折行引起的真实高度变化。
    // ------------------------------------------------------------------
    const sizeThatFits = (node, proposal, parentDirection, formatText) => {
      const pw = finiteOrNull(proposal?.width);
      const ph = finiteOrNull(proposal?.height);

      switch (node.type) {
        case 'spacer': {
          const len = Number.isFinite(node.length) ? node.length : SPACER_DEFAULT_MIN;
          return parentDirection === 'horizontal'
            ? { width: pw != null ? Math.max(len, pw) : len, height: 0 }
            : { width: 0, height: ph != null ? Math.max(len, ph) : len };
        }
        case 'image':
          return imageExtent(node);
        case 'button':
        case 'refreshButton':
        case 'toggle':
          return controlSize(node);
        case 'text':
        case 'date': {
          const font = node.styling?.font || null;
          const text = formatText(node);
          const lineLimit = Number(node.styling?.lineLimit) > 0 ? Number(node.styling.lineLimit) : Infinity;
          const singleLine = parentDirection === 'horizontal' || lineLimit === 1;
          const block = resolveTextBlock(text, font, {
            maxWidth: pw ?? Infinity,
            maxHeight: ph ?? Infinity,
            lineLimit,
            minimumScaleFactor: node.styling?.minimumScaleFactor,
            singleLine,
          });
          return { width: block.width, height: block.height };
        }
        case 'stack': {
          const fw = fixedWidth(node);
          const fh = fixedHeight(node);
          if (node.progress) {
            const defaultW = node.progress.style === 'linear' ? 120 : 40;
            const defaultH = node.progress.style === 'linear' ? (node.progress.thickness || 6) : 40;
            return { width: fw ?? defaultW, height: fh ?? defaultH };
          }
          const direction = node.contentDirection || 'horizontal';
          const pad = stackPadding(node);
          const gap = stackGap(node);
          const children = node.elements || [];
          const targetW = fw ?? pw;
          const targetH = fh ?? ph;
          const innerW = targetW != null ? Math.max(0, targetW - horizChrome(node, pad)) : null;
          const innerH = targetH != null ? Math.max(0, targetH - vertChrome(node, pad)) : null;

          if (direction === 'vertical') {
            if (innerH != null) {
              const items = children.map((child) => probe(child, 'vertical', 'vertical', innerW, formatText));
              const availMain = Math.max(0, innerH - gap * Math.max(0, children.length - 1));
              const allocated = allocateMain(items, availMain, true);
              let totalH = vertChrome(node, pad) + gap * Math.max(0, children.length - 1);
              let maxW = 0;
              children.forEach((child, idx) => {
                const childSize = sizeThatFits(child, { width: innerW, height: allocated[idx] }, 'vertical', formatText);
                totalH += childSize.height;
                if (childSize.width > maxW) maxW = childSize.width;
              });
              return {
                width: targetW ?? (maxW + horizChrome(node, pad)),
                height: fh ?? totalH,
              };
            }
            let totalH = vertChrome(node, pad) + gap * Math.max(0, children.length - 1);
            let maxW = 0;
            for (const child of children) {
              const childSize = sizeThatFits(child, { width: innerW, height: null }, 'vertical', formatText);
              totalH += childSize.height;
              if (childSize.width > maxW) maxW = childSize.width;
            }
            return {
              width: targetW ?? (maxW + horizChrome(node, pad)),
              height: fh ?? totalH,
            };
          }

          const items = children.map((child) => probe(child, 'horizontal', 'horizontal', innerH, formatText));
          const availMain = innerW != null ? Math.max(0, innerW - gap * Math.max(0, children.length - 1)) : Infinity;
          const allocated = allocateMain(items, availMain, true);
          let maxH = 0;
          children.forEach((child, idx) => {
            const childSize = sizeThatFits(child, { width: allocated[idx], height: innerH }, 'horizontal', formatText);
            if (childSize.height > maxH) maxH = childSize.height;
          });
          const usedW = allocated.reduce((sum, v) => sum + v, 0) + horizChrome(node, pad) + gap * Math.max(0, children.length - 1);
          return {
            width: targetW ?? usedW,
            height: fh ?? (maxH + vertChrome(node, pad)),
          };
        }
        default:
          return { width: 0, height: 0 };
      }
    };

    // ------------------------------------------------------------------
    // probe：节点沿 axis（'horizontal' | 'vertical'）的长度区间 [min, ideal] 与另一轴 extent。
    // ------------------------------------------------------------------
    const probe = (node, axis, parentDirection, crossHint, formatText) => {
      switch (node.type) {
        case 'spacer': {
          if (parentDirection !== axis) return { min: 0, ideal: 0, cross: 0 };
          if (Number.isFinite(node.length)) {
            return { min: node.length, ideal: node.length, cross: 0 };
          }
          return { min: SPACER_DEFAULT_MIN, ideal: Infinity, cross: 0, spacer: true };
        }
        case 'image': {
          const extent = imageExtent(node);
          const main = axis === 'horizontal' ? extent.width : extent.height;
          return { min: main, ideal: main, cross: axis === 'horizontal' ? extent.height : extent.width };
        }
        case 'button':
        case 'refreshButton':
        case 'toggle': {
          const size = controlSize(node);
          const main = axis === 'horizontal' ? size.width : size.height;
          return { min: main, ideal: main, cross: axis === 'horizontal' ? size.height : size.width };
        }
        case 'text':
        case 'date': {
          const font = node.styling?.font || null;
          const text = formatText(node);
          const lh = lineHeightOf(font);
          const lineLimit = Number(node.styling?.lineLimit) > 0 ? Number(node.styling.lineLimit) : Infinity;
          const factor = Number(node.styling?.minimumScaleFactor);
          const hasScale = Number.isFinite(factor) && factor > 0 && factor < 1;

          if (axis === 'horizontal') {
            const idealWidth = Math.max(0, measure(text, font));
            // iOS 27.2 SwiftUI Text.sizeThatFits(.zero) = 0
            const item = { min: 0, ideal: idealWidth, cross: lh };
            const baseSize = fontSizeOf(font);
            const widthAt = (size) => Math.max(0, measure(text, font ? { ...font, size } : { size }));
            item.take = (proposal) => {
              if (idealWidth <= proposal + 0.01) return idealWidth;
              if (hasScale) {
                const minSize = baseSize * factor;
                if (widthAt(minSize) <= proposal + 0.01) {
                  let low = minSize;
                  let high = baseSize;
                  for (let iteration = 0; iteration < 16; iteration += 1) {
                    const mid = (low + high) / 2;
                    if (widthAt(mid) <= proposal + 0.01) low = mid;
                    else high = mid;
                  }
                  item.pendingScale = low;
                  item.pendingLines = [text];
                  return Math.min(widthAt(low), proposal);
                }
                const scaledFont = font ? { ...font, size: minSize } : { size: minSize };
                const trunc = resolveTruncate(text, scaledFont, proposal);
                item.pendingScale = minSize;
                item.pendingLines = [trunc.text];
                return trunc.width;
              }
              const trunc = resolveTruncate(text, font, proposal);
              item.pendingLines = [trunc.text];
              return trunc.width;
            };
            item.finalize = () => {
              if (item.pendingScale) node._fontScale = round(item.pendingScale);
              if (item.pendingLines) node._lines = item.pendingLines;
            };
            return item;
          }

          // 纵向 stack：基于真实断行 + minimumScaleFactor 联合求解高度与折行
          const wrapWidth = finiteOrNull(crossHint);
          const block = resolveTextBlock(text, font, {
            maxWidth: wrapWidth ?? Infinity,
            lineLimit,
            minimumScaleFactor: node.styling?.minimumScaleFactor,
            singleLine: lineLimit === 1,
          });
          const minHeight = hasScale ? Math.min(lh * factor, block.height) : Math.min(lh, block.height);
          return {
            min: minHeight,
            ideal: block.height,
            cross: block.width,
            textBlock: block,
          };
        }
        case 'stack':
          return probeStack(node, axis, crossHint, formatText);
        default:
          return { min: 0, ideal: 0, cross: 0 };
      }
    };

    const probeStack = (node, axis, crossHint, formatText) => {
      if (node.progress) {
        const defaultW = node.progress.style === 'linear' ? 120 : 40;
        const defaultH = node.progress.style === 'linear' ? (node.progress.thickness || 6) : 40;
        const w = fixedWidth(node) ?? defaultW;
        const h = fixedHeight(node) ?? defaultH;
        const main = axis === 'horizontal' ? w : h;
        const cross = axis === 'horizontal' ? h : w;
        return { min: main, ideal: main, cross };
      }

      const direction = node.contentDirection || 'horizontal';
      const pad = stackPadding(node);
      const gap = stackGap(node);
      const children = node.elements || [];
      const fixedMainLength = fixedMain(node);

      if (direction === axis) {
        const innerCross = crossHint != null ? Math.max(0, crossHint - crossPad(node, pad)) : null;
        let min = mainPad(node, pad) + gap * Math.max(0, children.length - 1);
        let ideal = min;
        let cross = 0;
        for (const child of children) {
          const childProbe = probe(child, axis, direction, direction === 'vertical' ? innerCross : null, formatText);
          min += childProbe.min;
          ideal += childProbe.ideal;
          cross = Math.max(cross, childProbe.cross);
        }
        const resolvedCross = fixedCross(node) ?? (cross + crossPad(node, pad));
        if (fixedMainLength != null) {
          return { min: fixedMainLength, ideal: fixedMainLength, cross: resolvedCross };
        }
        return { min, ideal, cross: resolvedCross };
      }

      // 与父级垂直：
      // 1) 若本节点设置了固定尺寸，直接按二维 sizeThatFits 求耦合交叉轴；
      // 2) 若父级纵向、本节点横向且已知父级可用宽度 crossHint，先按该宽度做二维
      //    sizeThatFits，精准反求出子纵向 Stack 自动折行后的真实高度！
      const fixed = fixedCross(node);
      if (fixed != null) {
        const coupled = sizeThatFits(
          node,
          axis === 'horizontal' ? { width: fixed, height: crossHint } : { width: crossHint, height: fixed },
          axis,
          formatText
        );
        return {
          min: fixed,
          ideal: fixed,
          cross: axis === 'horizontal' ? coupled.height : coupled.width,
        };
      }

      if (axis === 'vertical' && finiteOrNull(crossHint) != null) {
        const fitted = sizeThatFits(node, { width: crossHint, height: null }, 'vertical', formatText);
        const fittedMin = sizeThatFits(node, { width: crossHint, height: 0 }, 'vertical', formatText);
        const minH = Math.min(fitted.height, fittedMin.height);
        const item = {
          min: minH,
          ideal: fitted.height,
          cross: fitted.width,
        };
        if (fitted.height - minH > 0.01) {
          item.take = (proposal) => {
            if (fitted.height <= proposal + 0.01) return fitted.height;
            const atProposal = sizeThatFits(node, { width: crossHint, height: proposal }, 'vertical', formatText);
            return Math.max(minH, Math.min(fitted.height, atProposal.height));
          };
        }
        return item;
      }

      let minExtent = 0;
      let idealExtent = 0;
      let crossExtent = 0;
      for (const child of children) {
        const childProbe = probe(child, axis, direction, null, formatText);
        minExtent = Math.max(minExtent, childProbe.min);
        idealExtent = Math.max(idealExtent, childProbe.ideal);
        crossExtent += childProbe.cross;
      }
      const chrome = crossPad(node, pad);
      const minVal = minExtent + chrome;
      const idealVal = idealExtent + chrome;
      const crossVal = fixedMainLength ?? (crossExtent + mainPad(node, pad) + gap * Math.max(0, children.length - 1));
      return { min: minVal, ideal: idealVal, cross: crossVal };
    };

    // ------------------------------------------------------------------
    // allocateMain：SwiftUI StackLayout 主轴分配（灵活性升序 + Spacer 垫底）
    // ------------------------------------------------------------------
    const allocateMain = (items, L, dryRun = false) => {
      if (!Number.isFinite(L)) {
        return items.map((item) => (item.ideal === Infinity ? item.min : item.ideal));
      }
      const result = new Array(items.length).fill(0);
      const nonSpacers = [];
      const spacers = [];
      items.forEach((item, index) => (item.spacer ? spacers : nonSpacers).push({ item, index }));
      nonSpacers.sort((a, b) => (a.item.ideal - a.item.min) - (b.item.ideal - b.item.min));
      const spacerMinTotal = spacers.reduce((sum, { item }) => sum + item.min, 0);
      let remaining = Math.max(0, L);
      let groupSpace = Math.max(0, remaining - spacerMinTotal);
      let takenTotal = 0;
      nonSpacers.forEach(({ item, index }, order) => {
        const proposal = groupSpace / (nonSpacers.length - order);
        const taken = item.take
          ? item.take(proposal)
          : Math.min(item.ideal, Math.max(proposal, item.min));
        result[index] = taken;
        groupSpace -= taken;
        takenTotal += taken;
      });
      remaining -= takenTotal;
      spacers.forEach(({ item, index }, order) => {
        const proposal = remaining / (spacers.length - order);
        const taken = Math.min(item.ideal, Math.max(item.min, proposal));
        result[index] = taken;
        remaining -= taken;
      });
      if (!dryRun) {
        items.forEach((item) => item.finalize?.());
      }
      return result;
    };

    // ------------------------------------------------------------------
    // layoutNode / layoutStack：自顶向下分配尺寸，并计算绝对坐标 `_frame` 与同心圆角。
    // ------------------------------------------------------------------
    const layoutNode = (node, parentDirection, mainLength, crossHint, origin, rootSize, formatText) => {
      if (node.type === 'spacer') {
        const sz = parentDirection === 'horizontal'
          ? box(mainLength, 0)
          : box(0, mainLength);
        node._size = sz;
        node._frame = frameBox(origin.x, origin.y, sz.width, sz.height);
        return sz;
      }

      if (node.type === 'image') {
        const extent = imageExtent(node);
        node._size = box(extent.width, extent.height);
        let x = origin.x;
        if (parentDirection === 'vertical' && finiteOrNull(crossHint) != null) {
          if (node.imageAlignment === 'center') x = origin.x + Math.max(0, (crossHint - extent.width) / 2);
          else if (node.imageAlignment === 'right') x = origin.x + Math.max(0, crossHint - extent.width);
        }
        node._frame = frameBox(x, origin.y, extent.width, extent.height);
        if (node.containerRelativeShape && rootSize) {
          const insetLeft = Math.max(0, node._frame.x);
          const insetTop = Math.max(0, node._frame.y);
          const insetRight = Math.max(0, rootSize.width - (node._frame.x + node._frame.width));
          const insetBottom = Math.max(0, rootSize.height - (node._frame.y + node._frame.height));
          const minInset = Math.min(insetLeft, insetTop, insetRight, insetBottom);
          node._effectiveCornerRadius = round(Math.max(4, WIDGET_CORNER_RADIUS - minInset));
        }
        return node._size;
      }

      if (node.type === 'button' || node.type === 'refreshButton' || node.type === 'toggle') {
        const sz = controlSize(node);
        node._size = box(sz.width, sz.height);
        node._frame = frameBox(origin.x, origin.y, sz.width, sz.height);
        return node._size;
      }

      if (node.type === 'text' || node.type === 'date') {
        const font = node.styling?.font || null;
        const text = formatText(node);
        const lineLimit = Number(node.styling?.lineLimit) > 0 ? Number(node.styling.lineLimit) : Infinity;

        if (parentDirection === 'horizontal') {
          const idealWidth = Math.max(0, measure(text, font));
          const effectiveFont = node._fontScale
            ? (font ? { ...font, size: node._fontScale } : { size: node._fontScale })
            : font;
          const finalHeight = lineHeightOf(effectiveFont);
          const usedWidth = Math.min(idealWidth, mainLength);
          if (!Array.isArray(node._lines) || node._lines.length === 0) {
            node._lines = [text];
          }
          if (node._fontScale || mainLength < idealWidth - 0.01) {
            node._size = box(mainLength, finalHeight);
            node._frame = frameBox(origin.x, origin.y, mainLength, finalHeight);
            return node._size;
          }
          node._frame = frameBox(origin.x, origin.y, usedWidth, finalHeight);
          return box(usedWidth, finalHeight);
        }

        // 纵向文本：真实断行 + 宽高双轴 minimumScaleFactor 缩放
        const availW = finiteOrNull(crossHint) ?? Infinity;
        const availH = Number.isFinite(mainLength) && mainLength > 0 ? mainLength : Infinity;
        const block = resolveTextBlock(text, font, {
          maxWidth: availW,
          maxHeight: availH,
          lineLimit,
          minimumScaleFactor: node.styling?.minimumScaleFactor,
          singleLine: lineLimit === 1,
        });
        node._lines = block.lines;
        if (block.scaled) {
          node._fontScale = round(block.fontSize);
        }
        const frameWidth = finiteOrNull(crossHint) ?? block.width;
        const frameHeight = Math.min(mainLength, block.height) || block.height;
        node._frame = frameBox(origin.x, origin.y, frameWidth, frameHeight);
        return box(frameWidth, frameHeight);
      }

      if (node.type === 'stack') {
        return layoutStack(node, parentDirection, mainLength, crossHint, origin, rootSize, formatText);
      }

      return box(0, 0);
    };

    const alignOffset = (alignment, containerSpan, childSpan) => {
      const diff = Math.max(0, containerSpan - childSpan);
      if (alignment === 'center') return diff / 2;
      if (alignment === 'bottom') return diff;
      return 0;
    };

    const layoutStack = (node, parentDirection, mainLength, crossHint, origin, rootSize, formatText) => {
      // v1.8 ZStack 进度指示器：外框固定尺寸 + 子内容在内部独立居中叠加
      if (node.progress) {
        const defaultW = node.progress.style === 'linear' ? 120 : 40;
        const defaultH = node.progress.style === 'linear' ? (node.progress.thickness || 6) : 40;
        const w = fixedWidth(node) ?? defaultW;
        const h = fixedHeight(node) ?? defaultH;
        node._size = box(w, h);
        node._frame = frameBox(origin.x, origin.y, w, h);

        const children = node.elements || [];
        if (children.length > 0) {
          const thickness = Number(node.progress.thickness) || 5;
          const inset = node.progress.style === 'circular' ? thickness + 2 : 0;
          const innerW = Math.max(0, w - inset * 2);
          const innerH = Math.max(0, h - inset * 2);
          const gap = stackGap(node);
          const items = children.map((child) => probe(child, 'vertical', 'vertical', innerW, formatText));
          const avail = Math.max(0, innerH - gap * Math.max(0, children.length - 1));
          const allocated = allocateMain(items, avail);
          const contentH = allocated.reduce((sum, v) => sum + v, 0) + gap * Math.max(0, children.length - 1);
          let cursorY = origin.y + inset + Math.max(0, (innerH - contentH) / 2);
          children.forEach((child, idx) => {
            layoutNode(child, 'vertical', allocated[idx], innerW, { x: origin.x + inset, y: cursorY }, rootSize, formatText);
            cursorY += allocated[idx] + gap;
          });
        }
        return node._size;
      }

      const direction = node.contentDirection || 'horizontal';
      const aligned = direction === parentDirection;
      const pad = stackPadding(node);
      const border = stackBorder(node);
      const gap = stackGap(node);
      const children = node.elements || [];

      const ownMainProposal = aligned ? mainLength : finiteOrNull(crossHint);
      const ownCrossProposal = aligned ? finiteOrNull(crossHint) : mainLength;
      const main = fixedMain(node) ?? ownMainProposal;
      const outerCross = fixedCross(node) ?? ownCrossProposal;

      const innerMain = Number.isFinite(main)
        ? Math.max(0, main - mainPad(node, pad) - gap * Math.max(0, children.length - 1))
        : null;
      const innerCross = outerCross != null
        ? Math.max(0, outerCross - crossPad(node, pad))
        : null;

      const items = children.map((child) => probe(child, direction, direction, direction === 'vertical' ? innerCross : null, formatText));
      const allocated = allocateMain(items, innerMain);

      const innerOriginX = origin.x + pad.left + border;
      const innerOriginY = origin.y + pad.top + border;

      // 第一遍按分配结果放置子项，同时收集二维回流后的真实交叉轴高度（特别是横向容器内嵌折行纵向 Stack）
      let cursor = direction === 'horizontal' ? innerOriginX : innerOriginY;
      const childSizes = [];
      children.forEach((child, index) => {
        const childOrigin = direction === 'horizontal'
          ? { x: cursor, y: innerOriginY }
          : { x: innerOriginX, y: cursor };
        const sz = layoutNode(
          child,
          direction,
          allocated[index],
          innerCross,
          childOrigin,
          rootSize,
          formatText
        );
        childSizes.push(sz);
        cursor += allocated[index] + gap;
      });

      const hasFlexSpacer = children.some((child) => child.type === 'spacer' && !Number.isFinite(child.length));
      const measuredMain = childSizes.reduce(
        (sum, sz) => sum + (direction === 'horizontal' ? sz.width : sz.height),
        0
      ) + mainPad(node, pad) + gap * Math.max(0, children.length - 1);
      const computedMain = fixedMain(node) != null
        ? fixedMain(node)
        : (Number.isFinite(main) && (aligned || hasFlexSpacer))
          ? main
          : measuredMain;

      // 交叉轴：优先取二维回流后子项的最大实际交叉尺寸
      const measuredCross = childSizes.reduce((max, sz) => {
        const span = direction === 'horizontal' ? sz.height : sz.width;
        return Math.max(max, span);
      }, 0);
      const computedCross = fixedCross(node) != null
        ? fixedCross(node)
        : (outerCross != null && direction === 'vertical')
          ? outerCross
          : measuredCross + crossPad(node, pad);

      const finalSize = direction === 'horizontal'
        ? box(computedMain, computedCross)
        : box(computedCross, computedMain);
      node._size = finalSize;
      node._frame = frameBox(origin.x, origin.y, finalSize.width, finalSize.height);

      // 根据 alignment 微调子项 `_frame` 坐标（不影响 `_size`）
      const contentBoxCross = Math.max(0, (direction === 'horizontal' ? finalSize.height : finalSize.width) - crossPad(node, pad));
      if (direction === 'horizontal' && (node.alignment === 'center' || node.alignment === 'bottom')) {
        children.forEach((child, idx) => {
          if (!child._frame) return;
          const dy = alignOffset(node.alignment, contentBoxCross, childSizes[idx].height);
          if (dy > 0) shiftSubtree(child, 0, dy);
        });
      } else if (direction === 'vertical' && (node.alignment === 'center' || node.alignment === 'bottom')) {
        const contentBoxMain = Math.max(0, finalSize.height - mainPad(node, pad));
        const usedMain = allocated.reduce((sum, v) => sum + v, 0) + gap * Math.max(0, children.length - 1);
        const dy = alignOffset(node.alignment, contentBoxMain, usedMain);
        if (dy > 0) {
          children.forEach((child) => shiftSubtree(child, 0, dy));
        }
      }

      return finalSize;
    };

    const shiftSubtree = (node, dx, dy) => {
      if (!node || typeof node !== 'object') return;
      if (node._frame) {
        node._frame = frameBox(node._frame.x + dx, node._frame.y + dy, node._frame.width, node._frame.height);
      }
      if (Array.isArray(node.elements)) {
        node.elements.forEach((child) => shiftSubtree(child, dx, dy));
      }
    };

    // 入口：root 是纵向 list，宿主注入固定容器尺寸与可选 family
    const annotate = (tree, size, formatText, { family = null } = {}) => {
      const cloned = JSON.parse(JSON.stringify(tree));
      const width = Number(size?.width);
      const height = Number(size?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return cloned;
      }

      const prepared = family === 'accessoryInline'
        ? filterAccessoryInline(cloned)
        : { ...cloned, contentDirection: 'vertical' };

      const rootSize = { width, height };
      const pad = stackPadding(prepared, family);
      const border = stackBorder(prepared);
      const gap = stackGap(prepared);
      const direction = prepared.contentDirection || 'vertical';
      const children = prepared.elements || [];
      const innerMain = Math.max(
        0,
        (direction === 'vertical' ? height : width) - mainPad(prepared, pad) - gap * Math.max(0, children.length - 1)
      );
      const innerCross = Math.max(
        0,
        (direction === 'vertical' ? width : height) - crossPad(prepared, pad)
      );

      const items = children.map((child) => probe(child, direction, direction, innerCross, formatText));
      const allocated = allocateMain(items, innerMain);

      const originX = pad.left + border;
      const originY = pad.top + border;
      let cursor = direction === 'horizontal' ? originX : originY;
      children.forEach((child, index) => {
        const childOrigin = direction === 'horizontal'
          ? { x: cursor, y: originY }
          : { x: originX, y: cursor };
        layoutNode(child, direction, allocated[index], innerCross, childOrigin, rootSize, formatText);
        cursor += allocated[index] + gap;
      });

      const hasRootFlexSpacer = children.some((child) => child.type === 'spacer' && !Number.isFinite(child.length));
      if (family === 'accessoryCircular' && direction === 'vertical' && !hasRootFlexSpacer && !prepared.alignment) {
        const usedMain = allocated.reduce((sum, v) => sum + v, 0) + gap * Math.max(0, children.length - 1);
        const dy = Math.max(0, (innerMain - usedMain) / 2);
        if (dy > 0) {
          children.forEach((child) => shiftSubtree(child, 0, dy));
        }
      }

      prepared._size = box(width, height);
      prepared._frame = frameBox(0, 0, width, height);
      return prepared;
    };

    return Object.freeze({ annotate, sizeThatFits });
  };

  global.ScriptablePreviewLayout = Object.freeze({
    createLayoutEngine,
    imageExtent,
    filterAccessoryInline,
  });
})(globalThis);
