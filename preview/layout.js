/**
 * 布局引擎（M2）：SwiftUI 提议-应答模型的 Web 实现。
 *
 * 不再把空间分配交给 flexbox，而是两趟协商：
 *   1. probe：自底向上计算每个节点沿某轴的 [最小, 理想] 长度区间
 *      （文本靠 measure 模块测量，Spacer 区间 [minLength, ∞) 且优先级垫底）；
 *   2. allocate：自顶向下按 StackLayout 规则分配主轴——
 *      灵活性升序、组内均分提议、按需取用、余量下传、Spacer 最后均分。
 *
 * 输出：原 IR 的深拷贝，每个节点附加 `_size { width, height }`（px，两位小数）。
 * 渲染器见到 `_size` 时输出显式尺寸，flexbox 退化为纯排版工具。
 *
 * 未提供容器尺寸时不启用（renderWidgetTree 的 size 选项缺省），
 * 此时渲染器保持原有的 flex 近似行为——测试钉板路径不受影响。
 */
(function initializeScriptablePreviewLayout(global) {
  'use strict';

  const SPACER_DEFAULT_MIN = 8; // 系统默认间距（待真机复核，见规划 M6）
  const LINE_HEIGHT_RATIO = 1.16; // 与 .sp-text 的 line-height 一致
  const IMAGE_FALLBACK_SIZE = 16;

  const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);
  const round = (value) => Math.round(value * 100) / 100;
  const box = (width, height) => ({ width: round(Math.max(0, width)), height: round(Math.max(0, height)) });

  // 图片布局尺寸（R7）：imageSize 只设一边时按固有纵横比推导另一边；
  // 都未设时用固有尺寸，未知则回退 16×16。
  const imageExtent = (node) => {
    const image = node.codableImage || {};
    const natural = {
      width: Number(image.size?.width) > 0 ? Number(image.size.width) : null,
      height: Number(image.size?.height) > 0 ? Number(image.size.height) : null,
    };
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

  const createLayoutEngine = ({ measure, defaultFontSize }) => {
    const fontSizeOf = (font) => (Number(font?.size) > 0 ? Number(font.size) : defaultFontSize);
    const lineHeightOf = (font) => fontSizeOf(font) * LINE_HEIGHT_RATIO;

    // ------------------------------------------------------------------
    // probe：节点沿 axis（'horizontal' | 'vertical'）的长度区间。
    // parentDirection：父 stack 的主轴方向（决定 Spacer 沿哪条轴伸展）。
    // crossHint：父级提供的交叉轴可用长度（文本换行高度依赖它）。
    // 返回 { min, ideal, cross, spacer? }；cross 为节点在另一轴上的理想 extent。
    // ------------------------------------------------------------------
    const probe = (node, axis, parentDirection, crossHint, formatText) => {
      switch (node.type) {
        case 'spacer': {
          // Spacer 只沿父 stack 的主轴伸展，另一轴 extent 为 0
          if (parentDirection !== axis) return { min: 0, ideal: 0, cross: 0 };
          // 官方文档：null 长度 = 弹性；有限长度 = 固定间隔（不参伸展分配）
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
        case 'text':
        case 'date': {
          const font = node.styling?.font || null;
          const text = formatText(node);
          const idealWidth = Math.max(0, measure(text, font));
          const minWidth = Math.max(0, measure('…', font));
          const lineHeight = lineHeightOf(font);
          if (axis === 'horizontal') {
            // 横向 stack 中的文本不换行（CSS white-space: pre），高度恒为一行
            const item = { min: minWidth, ideal: idealWidth, cross: lineHeight };
            // minimumScaleFactor：空间不足时先按比例缩字号（二分最大可用字号），
            // 缩到下限仍不足再截断——SwiftUI Text 的 sizeThatFits 语义。
            const factor = Number(node.styling?.minimumScaleFactor);
            if (Number.isFinite(factor) && factor > 0 && factor < 1) {
              const baseSize = fontSizeOf(font);
              const minSize = baseSize * factor;
              const widthAt = (size) => Math.max(0, measure(text, font ? { ...font, size } : { size }));
              item.take = (proposal) => {
                if (idealWidth <= proposal) return idealWidth;
                if (widthAt(minSize) >= proposal) {
                  item.pendingScale = minSize;
                  return proposal;
                }
                let low = minSize;
                let high = baseSize;
                for (let iteration = 0; iteration < 16; iteration += 1) {
                  const mid = (low + high) / 2;
                  if (widthAt(mid) <= proposal) low = mid;
                  else high = mid;
                }
                item.pendingScale = low;
                return Math.min(widthAt(low), proposal);
              };
              item.finalize = () => {
                if (item.pendingScale) node._fontScale = round(item.pendingScale);
              };
            }
            return item;
          }
          // 纵向 stack：宽度被交叉轴约束后可换行，行数决定高度
          const wrapWidth = finiteOrNull(crossHint);
          const usableWidth = wrapWidth != null ? Math.max(1, Math.min(idealWidth, wrapWidth)) : idealWidth;
          const lineLimit = Number(node.styling?.lineLimit) > 0 ? Number(node.styling.lineLimit) : Infinity;
          const lines = Math.max(1, Math.min(lineLimit, Math.ceil(idealWidth / usableWidth)));
          return {
            min: lineHeight,
            ideal: lines * lineHeight,
            cross: Math.min(idealWidth, usableWidth),
          };
        }
        case 'stack':
          return probeStack(node, axis, crossHint, formatText);
        default:
          return { min: 0, ideal: 0, cross: 0 };
      }
    };

    const stackPadding = (node) => node.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const stackGap = (node) => (Number(node.spacing) > 0 ? Number(node.spacing) : 0);
    const mainPad = (node, pad) =>
      (node.contentDirection === 'vertical' ? pad.top + pad.bottom : pad.left + pad.right);
    const crossPad = (node, pad) =>
      (node.contentDirection === 'vertical' ? pad.left + pad.right : pad.top + pad.bottom);

    const fixedMain = (node) => {
      const size = node.size || {};
      const value = node.contentDirection === 'vertical' ? size.height : size.width;
      return Number(value) > 0 ? Number(value) : null;
    };
    const fixedCross = (node) => {
      const size = node.size || {};
      const value = node.contentDirection === 'vertical' ? size.width : size.height;
      return Number(value) > 0 ? Number(value) : null;
    };

    const probeStack = (node, axis, crossHint, formatText) => {
      const direction = node.contentDirection || 'horizontal';
      const pad = stackPadding(node);
      const gap = stackGap(node);
      const children = node.elements || [];
      if (direction === axis) {
        // 与父级同轴：区间 = 子元素区间之和 + 间距 + 内边距
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
        return { min, ideal, cross: cross + crossPad(node, pad) };
      }
      // 与父级垂直：extent = 子元素在 axis 上的最大 extent + 该轴上的内边距
      let extent = 0;
      for (const child of children) {
        extent = Math.max(extent, probe(child, axis, direction, null, formatText).ideal);
      }
      extent += direction === 'vertical' ? pad.left + pad.right : pad.top + pad.bottom;
      const fixed = fixedCross(node);
      const value = fixed ?? extent;
      return { min: value, ideal: value, cross: 0 };
    };

    // ------------------------------------------------------------------
    // allocate：StackLayout 主轴分配（Scriptable 简化版：只有两组优先级）
    // items: probe 结果数组；L：主轴可用长度（间距已在调用处扣除）
    // ------------------------------------------------------------------
    const allocateMain = (items, L) => {
      if (!Number.isFinite(L)) {
        return items.map((item) => (item.ideal === Infinity ? item.min : item.ideal));
      }
      const result = new Array(items.length).fill(0);
      const nonSpacers = [];
      const spacers = [];
      items.forEach((item, index) => (item.spacer ? spacers : nonSpacers).push({ item, index }));
      // 灵活性升序：区间越窄越不灵活，越先分到空间
      nonSpacers.sort((a, b) => (a.item.ideal - a.item.min) - (b.item.ideal - b.item.min));
      const spacerMinTotal = spacers.reduce((sum, { item }) => sum + item.min, 0);
      let remaining = Math.max(0, L);
      let groupSpace = Math.max(0, remaining - spacerMinTotal);
      let takenTotal = 0;
      nonSpacers.forEach(({ item, index }, order) => {
        const proposal = groupSpace / (nonSpacers.length - order);
        // 按需取用：clamp 到 [最小, 理想]（固定尺寸项 min===ideal 绝不收缩）；
        // 带 take 的节点（如 minimumScaleFactor 文本）自行决定取用多少
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
        // 弹性 Spacer 均分剩余；固定间隔（min===ideal）不参伸展
        const taken = Math.min(item.ideal, Math.max(item.min, proposal));
        result[index] = taken;
        remaining -= taken;
      });
      items.forEach((item) => item.finalize?.());
      return result;
    };

    // ------------------------------------------------------------------
    // layout：自顶向下，把分配结果写成 node._size { width, height }
    // mainLength：父级分配沿其主轴的长度；crossHint：父级交叉轴可用长度。
    // 父级主轴与本节点方向垂直时，mainLength 实为节点的交叉 extent、
    // crossHint 实为节点的主轴可用长度（纵向根容器把横向子 stack stretch 到内宽）。
    // ------------------------------------------------------------------
    const layoutNode = (node, parentDirection, mainLength, crossHint, formatText) => {
      if (node.type === 'spacer') {
        node._size = parentDirection === 'horizontal'
          ? box(mainLength, 0)
          : box(0, mainLength);
        return;
      }
      if (node.type === 'image') {
        const extent = imageExtent(node);
        node._size = box(extent.width, extent.height);
        return;
      }
      if (node.type === 'text' || node.type === 'date') {
        const info = probe(node, parentDirection, parentDirection, crossHint, formatText);
        // 仅在被截断时输出显式宽度：恰好等于理想宽度时，显式宽度 + overflow
        // 会因亚像素/字体差异裁剪字形；不截断时交给自然宽度最贴近真机。
        // 纵向文本不输出显式尺寸（CSS max-width + pre-wrap 天然处理换行）。
        if (parentDirection === 'horizontal' && mainLength < info.ideal - 0.01) {
          node._size = box(mainLength, info.cross);
        }
        return;
      }
      if (node.type === 'stack') {
        layoutStack(node, parentDirection, mainLength, crossHint, formatText);
      }
    };

    const layoutStack = (node, parentDirection, mainLength, crossHint, formatText) => {
      const direction = node.contentDirection || 'horizontal';
      const aligned = direction === parentDirection;
      const pad = stackPadding(node);
      const gap = stackGap(node);
      const children = node.elements || [];

      // 节点自身两轴的可用长度（父级视角：aligned 时主轴=分配长度；垂直时互换）
      const ownMainProposal = aligned ? mainLength : finiteOrNull(crossHint);
      const ownCrossProposal = aligned ? finiteOrNull(crossHint) : mainLength;
      const main = fixedMain(node) ?? ownMainProposal;
      const outerCross = fixedCross(node) ?? ownCrossProposal;

      const innerMain = Number.isFinite(main)
        ? Math.max(0, main - mainPad(node, pad) - gap * Math.max(0, children.length - 1))
        : null;
      // 交叉轴：纵向 stack 的子元素 stretch 到内宽；横向 stack 的子元素自报
      const innerCross = outerCross != null && direction === 'vertical'
        ? Math.max(0, outerCross - crossPad(node, pad))
        : null;

      const items = children.map((child) => probe(child, direction, direction, innerCross, formatText));
      const allocated = allocateMain(items, innerMain);
      children.forEach((child, index) => {
        layoutNode(child, direction, allocated[index], direction === 'vertical' ? innerCross : null, formatText);
      });

      const mainSize = Number.isFinite(main)
        ? main
        : allocated.reduce((sum, value) => sum + value, 0) + mainPad(node, pad) + gap * Math.max(0, children.length - 1);
      const crossSize = outerCross != null
        ? outerCross
        : items.reduce((max, item) => Math.max(max, item.cross), 0) + crossPad(node, pad);
      node._size = direction === 'horizontal'
        ? box(mainSize, crossSize)
        : box(crossSize, mainSize);
    };

    // 入口：root 是纵向 list，宿主注入固定容器尺寸
    const annotate = (tree, size, formatText) => {
      const annotated = JSON.parse(JSON.stringify(tree));
      const width = Number(size?.width);
      const height = Number(size?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return annotated;
      }
      const root = { ...annotated, contentDirection: 'vertical' };
      const pad = stackPadding(root);
      const gap = stackGap(root);
      const children = root.elements || [];
      const innerMain = Math.max(0, height - mainPad(root, pad) - gap * Math.max(0, children.length - 1));
      const innerCross = Math.max(0, width - crossPad(root, pad));
      const items = children.map((child) => probe(child, 'vertical', 'vertical', innerCross, formatText));
      const allocated = allocateMain(items, innerMain);
      children.forEach((child, index) => {
        layoutNode(child, 'vertical', allocated[index], innerCross, formatText);
      });
      root._size = box(width, height);
      return root;
    };

    return Object.freeze({ annotate });
  };

  global.ScriptablePreviewLayout = Object.freeze({ createLayoutEngine, imageExtent });
})(globalThis);
