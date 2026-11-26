(function initializeScriptablePreviewRuntime(global) {
  'use strict';

  const sourceCache = new Map();
  const symbols = global.ScriptablePreviewSymbols;
  const ir = global.ScriptablePreviewIR;
  const measure = global.ScriptablePreviewMeasure;
  const layout = global.ScriptablePreviewLayout;

  if (!symbols) throw new Error('请先加载 preview/symbols.js');
  if (!ir) throw new Error('请先加载 preview/ir.js');
  if (!measure) throw new Error('请先加载 preview/measure.js');
  if (!layout) throw new Error('请先加载 preview/layout.js');

  const textMeasurer = measure.createMeasurer();
  const layoutEngine = layout.createLayoutEngine({
    measure: textMeasurer.measure,
    wrapText: textMeasurer.wrapText,
    measureTextBlock: textMeasurer.measureTextBlock,
    defaultFontSize: measure.DEFAULT_FONT_SIZE,
  });
  let tintFilterSequence = 0;

  const escapeHTML = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const escapeAttribute = (value) => escapeHTML(value).replaceAll('`', '&#096;');

  const toKebabCase = (value) =>
    value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);

  const styleText = (entries) =>
    Object.entries(entries)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([property, value]) => `${toKebabCase(property)}:${value}`)
      .join(';');

  const colorToCSS = (color) => {
    if (!color) return null;
    if (typeof color === 'string') return color;
    const hex = String(color.hex || '#000000');
    const alpha = Math.min(1, Math.max(0, Number(color.alpha ?? 1)));
    if (alpha >= 0.999) return hex;
    const normalized = hex.replace('#', '');
    const expanded = normalized.length === 3
      ? [...normalized].map((part) => part + part).join('')
      : normalized.padEnd(6, '0').slice(0, 6);
    const value = Number.parseInt(expanded, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red},${green},${blue},${alpha})`;
  };

  const renderSymbol = (name, attributes = '') =>
    symbols.render(name, attributes) ||
    `<span class="sp-symbol-fallback" title="未映射的 SF Symbol：${escapeAttribute(name)}">?</span>`;

  const createFont = (size, weight = 400, family = 'system', style = 'normal', name = null) => ({
    __kind: 'font',
    family,
    size: Number(size) || 12,
    weight,
    style,
    name,
  });

  const fontStyles = (font) => {
    if (!font) return {};
    return {
      fontFamily: measure.fontCSSFamily(font),
      fontSize: `${font.size}px`,
      fontWeight: font.weight,
      fontStyle: font.style === 'italic' ? 'italic' : null,
    };
  };

  const formatDuration = (milliseconds, { includeSign = false, timer = false } = {}) => {
    const absoluteSeconds = Math.max(0, Math.floor(Math.abs(milliseconds) / 1000));
    const days = Math.floor(absoluteSeconds / 86400);
    const hours = Math.floor(absoluteSeconds % 86400 / 3600);
    const minutes = Math.floor(absoluteSeconds % 3600 / 60);
    const seconds = absoluteSeconds % 60;
    if (timer) {
      const totalHours = hours + days * 24;
      // Scriptable uses the compact ClockFormatter form: MM:SS below an hour,
      // then H:MM:SS. In particular, it does not pad the hour component.
      const base = totalHours
        ? `${totalHours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      return includeSign && milliseconds < 0 ? `-${base}` : base;
    }
    const parts = days ? [`${days}天`] : [];
    if (hours || days) parts.push(`${hours}小时`);
    if (!days) parts.push(`${minutes}分钟`);
    const value = parts.join('') || '0分钟';
    // Date.applyOffsetStyle() reports elapsed time with a positive sign and
    // remaining time with a negative sign (the opposite of a raw timestamp
    // difference).
    return includeSign ? `${milliseconds <= 0 ? '+' : '-'}${value}` : value;
  };

  const formatRelativeDate = (value, now) => {
    const milliseconds = value.getTime() - now.getTime();
    return milliseconds < 0
      ? `${formatDuration(milliseconds)}前`
      : formatDuration(milliseconds);
  };

  const formatDate = (value, now, style) => {
    if (style === 'relative') return formatRelativeDate(value, now);
    if (style === 'offset') return formatDuration(value.getTime() - now.getTime(), { includeSign: true });
    if (style === 'timer') return formatDuration(value.getTime() - now.getTime(), { timer: true });
    if (style === 'time') {
      return value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  };

  const renderSymbolSVG = (image, rect, color, font) => {
    const body = symbols.icons[image.name];
    if (!body) return '';
    return `<svg x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"` +
      ` viewBox="0 0 256 256" fill="${escapeAttribute(color || '#111111')}"` +
      ` preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  };

  const renderDrawOps = (image, pick = colorToCSS) =>
    (image.ops || []).map((operation) => {
      const fill = escapeAttribute(pick(operation.color) || 'transparent');
      const rect = operation.rect || {};
      if (operation.type === 'fillRect') {
        return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${fill}"/>`;
      }
      if (operation.type === 'strokeRect') {
        return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${fill}" stroke-width="${operation.lineWidth}"/>`;
      }
      if (operation.type === 'fillEllipse') {
        return `<ellipse cx="${rect.x + rect.width / 2}" cy="${rect.y + rect.height / 2}" rx="${rect.width / 2}" ry="${rect.height / 2}" fill="${fill}"/>`;
      }
      if (operation.type === 'strokeEllipse') {
        return `<ellipse cx="${rect.x + rect.width / 2}" cy="${rect.y + rect.height / 2}" rx="${Math.max(0, rect.width / 2 - operation.lineWidth / 2)}" ry="${Math.max(0, rect.height / 2 - operation.lineWidth / 2)}" fill="none" stroke="${fill}" stroke-width="${operation.lineWidth}"/>`;
      }
      if (operation.type === 'roundedRect') {
        return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${operation.radius}" ry="${operation.radius}" fill="${fill}"/>`;
      }
      if (operation.type === 'strokeRoundedRect') {
        return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${operation.radius}" ry="${operation.radius}" fill="none" stroke="${fill}" stroke-width="${operation.lineWidth}"/>`;
      }
      if (operation.type === 'path') {
        const commands = operation.commands.map((command) => {
          if (command.type === 'move') return `M ${command.point.x} ${command.point.y}`;
          if (command.type === 'line') return `L ${command.point.x} ${command.point.y}`;
          if (command.type === 'curve') return `C ${command.control1.x} ${command.control1.y}, ${command.control2.x} ${command.control2.y}, ${command.point.x} ${command.point.y}`;
          if (command.type === 'quad') return `Q ${command.control.x} ${command.control.y}, ${command.point.x} ${command.point.y}`;
          if (command.type === 'close') return 'Z';
          return '';
        }).join(' ');
        return `<path d="${commands}" fill="${operation.mode === 'fill' ? fill : 'none'}"${operation.mode === 'stroke' ? ` stroke="${fill}" stroke-width="${operation.lineWidth}"` : ''}/>`;
      }
      if (operation.type === 'text') {
        const font = operation.font || createFont(12);
        const x = operation.alignment === 'center'
          ? rect.x + rect.width / 2
          : operation.alignment === 'right'
            ? rect.x + rect.width
            : rect.x;
        const anchor = operation.alignment === 'center' ? 'middle' : operation.alignment === 'right' ? 'end' : 'start';
        const wrapped = rect.width > 0
          ? textMeasurer.wrapText(operation.text, font, rect.width)
          : { lines: [String(operation.text ?? '')] };
        const lh = textMeasurer.lineHeight(font);
        const firstY = rect.y + Math.min(rect.height || font.size, font.size) * 0.86;
        return wrapped.lines.map((line, index) =>
          `<text x="${x}" y="${firstY + index * lh}" fill="${fill}" font-size="${font.size}"` +
          ` font-family="${font.family === 'monospace' ? 'monospace' : 'sans-serif'}"` +
          ` font-weight="${font.weight}" text-anchor="${anchor}">${escapeHTML(line)}</text>`
        ).join('');
      }
      if (operation.type === 'image') {
        let inner = '';
        if (operation.image?.kind === 'symbol' || operation.image?.__kind === 'symbol') {
          inner = renderSymbolSVG(operation.image, rect, fill, operation.image.font);
        } else if (operation.image?.kind === 'draw') {
          const childWidth = Math.max(1, Number(operation.image.size?.width) || 1);
          const childHeight = Math.max(1, Number(operation.image.size?.height) || 1);
          inner = `<svg x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" viewBox="0 0 ${childWidth} ${childHeight}" preserveAspectRatio="none">${renderDrawOps(operation.image, pick)}</svg>`;
        }
        if (!inner) return '';
        const rotation = Number(operation.rotation) || 0;
        if (rotation) {
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          return `<g transform="rotate(${rotation} ${cx} ${cy})">${inner}</g>`;
        }
        return inner;
      }
      return '';
    }).join('');

  const renderDrawImage = (image, extraClass = '', pick = colorToCSS, tintColor = null) => {
    const width = Math.max(1, Number(image.size?.width) || 1);
    const height = Math.max(1, Number(image.size?.height) || 1);
    const body = renderDrawOps(image, pick);
    if (tintColor) {
      const filterId = `sp_tint_${++tintFilterSequence}`;
      const tint = escapeAttribute(tintColor);
      return `<svg class="sp-drawn-image ${extraClass}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" data-tinted="true"><defs><filter id="${filterId}" color-interpolation-filters="sRGB"><feFlood flood-color="${tint}" result="flood"/><feComposite in="flood" in2="SourceAlpha" operator="in"/></filter></defs><g filter="url(#${filterId})">${body}</g></svg>`;
    }
    return `<svg class="sp-drawn-image ${extraClass}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
  };

  const gradientToCSS = (gradient, pick = colorToCSS) => {
    if (!gradient?.colors?.length) return null;
    const start = gradient.startPoint || { x: 0, y: 0 };
    const end = gradient.endPoint || { x: 0, y: 1 };
    const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI + 90);
    const stops = gradient.colors.map((color, index) => {
      const location = gradient.locations?.[index];
      return `${pick(color)}${Number.isFinite(location) ? ` ${location * 100}%` : ''}`;
    });
    return `linear-gradient(${angle}deg,${stops.join(',')})`;
  };

  const STACK_ALIGNMENT_TO_CSS = { top: 'flex-start', center: 'center', bottom: 'flex-end' };

  const renderImageNode = (node, pick = colorToCSS) => {
    const image = node.codableImage || {};
    const extent = layout.imageExtent(node);
    const width = extent.width;
    const height = extent.height;
    const resolvedTint = pick(node.tintColor);
    const color = resolvedTint || 'currentColor';
    const radius = node.containerRelativeShape
      ? (Number.isFinite(node._effectiveCornerRadius) ? node._effectiveCornerRadius : null)
      : (node.cornerRadius || null);
    const style = styleText({
      width: `${width}px`,
      height: `${height}px`,
      // 固定尺寸视图不接受主轴压缩（SwiftUI frame 语义）
      flexShrink: 0,
      color,
      opacity: node.imageOpacity === 1 ? null : node.imageOpacity,
      borderRadius: radius ? `${radius}px` : null,
      border: node.borderWidth ? `${node.borderWidth}px solid ${pick(node.borderColor) || '#000000'}` : null,
      alignSelf: node.imageAlignment === 'center' ? 'center' : node.imageAlignment === 'right' ? 'flex-end' : null,
    });
    let content;
    if (image.kind === 'symbol') {
      content = renderSymbol(
        image.name,
        `class="sp-symbol-svg" role="img" aria-label="${escapeAttribute(image.name)}"`
      );
    } else if (image.kind === 'draw') {
      content = renderDrawImage(image, '', pick, resolvedTint);
    } else if (image.kind === 'remote') {
      content = `<img src="${escapeAttribute(image.url)}" alt="">`;
    } else {
      content = '<span class="sp-symbol" aria-hidden="true">◆</span>';
    }
    const classes = ['sp-node', 'sp-image'];
    if (node.contentMode === 'fill') classes.push('sp-image--fill');
    if (node.containerRelativeShape) classes.push('sp-image--container-shape');
    if (node.resizable === false) classes.push('sp-image--fixed');
    return `<span class="${classes.join(' ')}" style="${style}"${node.rawOpenURL ? ` data-url="${escapeAttribute(node.rawOpenURL)}"` : ''}>${content}</span>`;
  };

  const renderTextNode = (node, now, pick = colorToCSS) => {
    const styling = node.styling || {};
    const value = node.type === 'date' ? formatDate(new Date(node.date), now, node.dateStyle) : node.text;
    const minimumScaleFactor = Number.isFinite(styling.minimumScaleFactor)
      ? Math.min(1, Math.max(0.01, Number(styling.minimumScaleFactor)))
      : null;
    // 官方文档：lineLimit ≤ 0 时禁用（默认 0）。
    const lineLimit = Number(styling.lineLimit) > 0 ? Number(styling.lineLimit) : null;
    const style = styleText({
      ...fontStyles(styling.font),
      // 布局引擎 minimumScaleFactor 计算出的实际字号（覆盖原始 font 字号）
      ...(node._fontScale ? { fontSize: `${node._fontScale}px` } : null),
      // 布局引擎的显式尺寸（主轴分配结果）
      width: node._size ? `${node._size.width}px` : null,
      height: node._size ? `${node._size.height}px` : null,
      color: pick(styling.textColor),
      opacity: styling.textOpacity,
      textAlign: node.horizontalTextAlignment,
      WebkitLineClamp: lineLimit,
      textShadow: styling.shadowRadius
        ? `${Number(styling.shadowOffset?.x) || 0}px ${Number(styling.shadowOffset?.y) || 0}px ${styling.shadowRadius}px ${pick(styling.shadowColor) || '#000000'}`
        : null,
    });
    const classes = ['sp-node', 'sp-text'];
    if (lineLimit) classes.push('sp-text--clamped');
    if (lineLimit === 1) classes.push('sp-text--single-line');
    // 布局引擎已完成缩放计算时不再输出 DOM 级缩放属性，避免二次缩放
    const scaleAttributes = minimumScaleFactor && styling.font && !node._fontScale
      ? ` data-font-size="${styling.font.size}" data-minimum-scale-factor="${minimumScaleFactor}"`
      : '';
    // relative/offset/timer 是系统级自动刷新文本：输出数据属性供挂载后 tick 更新。
    const dateAttributes = node.type === 'date'
      ? ` data-date-iso="${escapeAttribute(new Date(node.date).toISOString())}" data-date-style="${escapeAttribute(node.dateStyle || 'time')}"`
      : '';
    return `<span class="${classes.join(' ')}" style="${style}"${scaleAttributes}${dateAttributes}>${escapeHTML(value)}</span>`;
  };

  const renderSpacer = (node, direction) => {
    // 布局引擎已给出显式尺寸时，Spacer 退化为固定占位
    if (node._size) {
      const style = styleText({
        flex: 'none',
        width: node._size.width > 0 ? `${node._size.width}px` : null,
        height: node._size.height > 0 ? `${node._size.height}px` : null,
      });
      return `<span class="sp-node sp-spacer" style="${style}"></span>`;
    }
    // 官方文档：null 长度 = 弹性（SwiftUI Spacer，最小长度 ≈ 系统默认间距）；
    // 有限长度 = 固定间隔，不参与伸展分配。
    if (Number.isFinite(node.length)) {
      const style = direction === 'vertical'
        ? `height:${node.length}px;min-height:${node.length}px`
        : `width:${node.length}px;min-width:${node.length}px`;
      return `<span class="sp-node sp-spacer" style="${style}"></span>`;
    }
    return `<span class="sp-node sp-spacer" style="flex:1 0 8px"></span>`;
  };

  const containsFlexibleSpacer = (node, direction) => (node.elements || []).some((child) => {
    if (child.type === 'spacer') {
      return node.contentDirection === direction && !Number.isFinite(child.length);
    }
    return child.type === 'stack' && containsFlexibleSpacer(child, direction);
  });

  const renderProgressLayer = (node, pick = colorToCSS) => {
    const progress = node.progress;
    if (!progress) return '';
    const value = Math.min(100, Math.max(0, Number(progress.value) || 0));
    const progressColor = escapeAttribute(pick(progress.progressColor) || '#007aff');
    const trackColor = escapeAttribute(pick(progress.trackColor) || 'rgba(128,128,128,0.22)');
    if (progress.style === 'linear') {
      return `<span class="sp-progress-layer sp-progress-layer--linear" data-progress-style="linear" data-progress-value="${value}" style="background:${trackColor}"><span class="sp-progress-fill" style="width:${value}%;background:${progressColor}"></span></span>`;
    }
    const width = Number(node._size?.width) || Number(node.size?.width) || 40;
    const height = Number(node._size?.height) || Number(node.size?.height) || 40;
    const side = Math.max(8, Math.min(width, height));
    const strokeWidth = Math.min(side / 2, Math.max(1, Number(progress.thickness) || 5));
    const radius = Math.max(1, (side - strokeWidth) / 2);
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - value / 100);
    const center = side / 2;
    return `<span class="sp-progress-layer sp-progress-layer--circular" data-progress-style="circular" data-progress-value="${value}"><svg class="sp-progress-svg" viewBox="0 0 ${side} ${side}" aria-hidden="true"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}"/><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${progressColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 ${center} ${center})"/></svg></span>`;
  };

  const renderControlNode = (node) => {
    if (node.type === 'button') {
      return `<button type="button" class="sp-node sp-control sp-button" data-widget-action-id="${escapeAttribute(node.actionId)}">${escapeHTML(node.title)}</button>`;
    }
    if (node.type === 'refreshButton') {
      return `<button type="button" class="sp-node sp-control sp-button sp-refresh-button" data-widget-refresh="true"><span class="sp-refresh-glyph" aria-hidden="true">↻</span><span>${escapeHTML(node.title)}</span></button>`;
    }
    if (node.type === 'toggle') {
      const checked = Boolean(node.isOn);
      return `<button type="button" class="sp-node sp-control sp-toggle${checked ? ' is-on' : ''}" role="switch" aria-checked="${checked}" data-widget-action-id="${escapeAttribute(node.actionId)}" data-widget-toggle-next="${!checked}"><span class="sp-toggle-label">${escapeHTML(node.title)}</span><span class="sp-toggle-track" aria-hidden="true"><i></i></span></button>`;
    }
    return '';
  };

  const renderContainer = (node, now, pick, root = false, parentDirection = null) => {
    const direction = node.contentDirection || (root ? 'vertical' : 'horizontal');
    const isTransparent = root && node.backgroundStyle === 'transparent';
    const isCircularProgress = node.progress?.style === 'circular';
    const width = Number(node.size?.width) > 0 ? `${node.size.width}px` : null;
    const height = Number(node.size?.height) > 0 ? `${node.size.height}px` : null;
    const background = isTransparent
      ? null
      : (gradientToCSS(node.backgroundGradient, pick) || pick(node.backgroundColor));
    const mainSize = parentDirection === 'horizontal' ? width : height;
    const flexChild = !root && node.type === 'stack' && !mainSize &&
      containsFlexibleSpacer(node, parentDirection);
    const style = styleText({
      flexDirection: direction === 'vertical' ? 'column' : 'row',
      // 官方文档：topAlignContent 是默认对齐。horizontal stack 映射交叉轴；
      // vertical stack 的 top/center/bottom 是主轴概念，映射 justify-content，
      // 交叉轴保持 stretch 铺满（Scriptable 未暴露水平内容对齐）。
      alignItems: isCircularProgress
        ? 'center'
        : direction === 'horizontal'
          ? (STACK_ALIGNMENT_TO_CSS[node.alignment] || 'flex-start')
          : 'stretch',
      justifyContent: isCircularProgress
        ? 'center'
        : direction === 'vertical'
          ? STACK_ALIGNMENT_TO_CSS[node.alignment] || null
          : null,
      padding: node.padding ? `${node.padding.top}px ${node.padding.right}px ${node.padding.bottom}px ${node.padding.left}px` : null,
      width: root ? '100%' : node._size ? `${node._size.width}px` : width,
      height: root ? '100%' : node._size ? `${node._size.height}px` : height,
      // 布局引擎已显式分配尺寸的节点不再使用 flex 启发式
      flex: !node._size && (flexChild || (!root && node.size && !width && !height)) ? '1 1 0' : null,
      flexShrink: !node._size && mainSize ? 0 : null,
      gap: Number.isFinite(node.spacing) && node.spacing > 0 ? `${node.spacing}px` : null,
      background,
      border: node.borderWidth ? `${node.borderWidth}px solid ${pick(node.borderColor) || '#000000'}` : null,
      borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : null,
      overflow: node.cornerRadius ? 'hidden' : null,
    });
    const backgroundImage = !isTransparent && node.backgroundImage?.kind === 'draw'
      ? `<span class="sp-widget-background">${renderDrawImage(node.backgroundImage, 'sp-drawn-background', pick)}</span>`
      : '';
    const progressLayer = node.progress ? renderProgressLayer(node, pick) : '';
    const children = node.elements.map((child) => {
      if (child.type === 'stack') return renderContainer(child, now, pick, false, direction);
      if (child.type === 'text' || child.type === 'date') return renderTextNode(child, now, pick);
      if (child.type === 'image') return renderImageNode(child, pick);
      if (child.type === 'spacer') return renderSpacer(child, direction);
      if (child.type === 'button' || child.type === 'refreshButton' || child.type === 'toggle') {
        return renderControlNode(child);
      }
      return '';
    }).join('');
    const classes = ['sp-node', root ? 'sp-runtime-root' : 'sp-stack', `sp-${direction}`];
    if (root && node.addAccessoryWidgetBackground) classes.push('sp-accessory-background');
    if (isTransparent) classes.push('sp-transparent-background');
    if (node.progress) {
      classes.push('sp-progress-stack', `sp-progress-stack--${node.progress.style}`);
    }
    if (node.action) classes.push('sp-stack--action');
    const openURL = node.rawOpenURL || node.openURL;
    const actionAttrs = node.action
      ? ` role="button" tabindex="0" data-widget-action-id="${escapeAttribute(node.action.id)}"${node.action.title ? ` aria-label="${escapeAttribute(node.action.title)}" title="${escapeAttribute(node.action.title)}"` : ''}`
      : '';
    const backgroundAttr = isTransparent ? ' data-background-style="transparent"' : '';
    return `<div class="${classes.join(' ')}" style="${style}"${openURL ? ` data-url="${escapeAttribute(openURL)}"` : ''}${actionAttrs}${backgroundAttr}>${backgroundImage}${progressLayer}${children}</div>`;
  };

  const annotateLayoutTree = (tree, { now = new Date(), size = null, family = null } = {}) => {
    const resolvedNow = now instanceof Date ? now : new Date(now);
    return layoutEngine.annotate(
      tree,
      size,
      (node) => (node.type === 'date' ? formatDate(new Date(node.date), resolvedNow, node.dateStyle) : node.text),
      { family }
    );
  };

  const renderWidgetTree = (tree, { now = new Date(), appearance = 'light', size = null, family = null } = {}) => {
    // Color.dynamic 在渲染期按外观取色：IR 中 light 为基准值、dark 为备用值。
    const pick = (color) => colorToCSS(appearance === 'dark' && color?.dark ? color.dark : color);
    const resolvedNow = now instanceof Date ? now : new Date(now);
    // 宿主注入容器尺寸时启用布局引擎（二维提议-应答分配 + 绝对坐标输出）；
    // 缺省保持 flex 近似路径（测试钉板与无尺寸场景）。
    const target = Number(size?.width) > 0 && Number(size?.height) > 0
      ? annotateLayoutTree(tree, { now: resolvedNow, size, family })
      : tree;
    return renderContainer(target, resolvedNow, pick, true);
  };

  // 挂载后自动刷新 relative/offset/timer 日期文本（系统级行为，无需重跑脚本）。
  // 返回停止函数；非浏览器环境（无 DOM）时为 no-op。
  const mountDateTicker = (root, { intervalMs = 1000 } = {}) => {
    if (!root || typeof root.querySelectorAll !== 'function') return () => {};
    const tick = () => {
      const now = new Date();
      root.querySelectorAll('[data-date-iso]').forEach((element) => {
        const style = element.getAttribute('data-date-style') || 'time';
        if (style !== 'relative' && style !== 'offset' && style !== 'timer') return;
        const date = new Date(element.getAttribute('data-date-iso'));
        if (Number.isNaN(date.getTime())) return;
        element.textContent = formatDate(date, now, style);
      });
    };
    const handle = setInterval(tick, intervalMs);
    tick();
    return () => clearInterval(handle);
  };

  // 组件假数据由各自的 src/widgets/<id>.mock.js 注册到全局 ScriptablePreviewMocks，
  // 运行时只负责按 scriptId 查找并调用；未匹配的请求直接抛错，提示缺少 mock。
  const createFixtureResponse = (scriptId, url, request, now) => {
    const mock = (global.ScriptablePreviewMocks || {})[scriptId];
    const response = mock && typeof mock.respond === 'function'
      ? mock.respond(url, request, now)
      : undefined;
    if (response === undefined) {
      throw new Error(`预览运行时缺少请求数据：${scriptId} ${url}（请在 src/widgets/${scriptId}.mock.js 中补充）`);
    }
    return response;
  };

  const createSandbox = ({
    scriptId,
    family,
    appearance,
    now,
    widgetAction = null,
    widgetParameter = '',
    storage = null,
  }) => {
    const executionNow = now instanceof Date ? new Date(now) : new Date(now || Date.now());
    const nowMilliseconds = executionNow.getTime();
    let capturedWidget = null;

    class PreviewDate extends Date {
      constructor(...values) {
        super(...(values.length ? values : [nowMilliseconds]));
      }

      static now() {
        return nowMilliseconds;
      }
    }

    class Color {
      constructor(hex, alpha = 1) {
        this.__kind = 'color';
        this.hex = hex instanceof Color ? hex.hex : String(hex);
        this.alpha = Number(alpha);
        this.dark = null;
      }

      static dynamic(light, dark) {
        // IR 约定：基准值固定为 light，dark 为备用值，渲染期按外观取色。
        const resolved = new Color(light instanceof Color ? light.hex : '#000000', light instanceof Color ? light.alpha : 1);
        resolved.dark = dark instanceof Color ? dark : null;
        return resolved;
      }

      static black() { return new Color('#000000'); }
      static darkGray() { return new Color('#555555'); }
      static lightGray() { return new Color('#aaaaaa'); }
      static white() { return new Color('#ffffff'); }
      static gray() { return new Color('#8e8e93'); }
      static red() { return new Color('#ff3b30'); }
      static green() { return new Color('#34c759'); }
      static blue() { return new Color('#007aff'); }
      static cyan() { return new Color('#32ade6'); }
      static yellow() { return new Color('#ffcc00'); }
      static magenta() { return new Color('#ff2d55'); }
      static orange() { return new Color('#ff9500'); }
      static purple() { return new Color('#af52de'); }
      static brown() { return new Color('#a2845e'); }
      static clear() { return new Color('#000000', 0); }
    }

    class Font {
      constructor(name, size) {
        const family = /menlo|mono/i.test(name) ? 'monospace' : /rounded/i.test(name) ? 'rounded' : 'system';
        return createFont(size, /black|heavy|bold/i.test(name) ? 700 : /semibold|medium/i.test(name) ? 600 : 400, family, /italic|oblique/i.test(name) ? 'italic' : 'normal', family === 'system' ? name : null);
      }

      static largeTitle() { return createFont(34, 400); }
      static title1() { return createFont(28, 400); }
      static title2() { return createFont(22, 400); }
      static title3() { return createFont(20, 400); }
      static headline() { return createFont(17, 600); }
      static body() { return createFont(17, 400); }
      static callout() { return createFont(16, 400); }
      static subheadline() { return createFont(15, 400); }
      static footnote() { return createFont(13, 400); }
      static caption1() { return createFont(12, 400); }
      static caption2() { return createFont(11, 400); }
      static systemFont(size) { return createFont(size); }
      static regularSystemFont(size) { return createFont(size); }
      static mediumSystemFont(size) { return createFont(size, 500); }
      static semiboldSystemFont(size) { return createFont(size, 600); }
      static boldSystemFont(size) { return createFont(size, 700); }
      static ultraLightSystemFont(size) { return createFont(size, 200); }
      static thinSystemFont(size) { return createFont(size, 300); }
      static lightSystemFont(size) { return createFont(size, 300); }
      static heavySystemFont(size) { return createFont(size, 800); }
      static blackSystemFont(size) { return createFont(size, 900); }
      static italicSystemFont(size) { return createFont(size, 400, 'system', 'italic'); }
      static ultraLightRoundedSystemFont(size) { return createFont(size, 200, 'rounded'); }
      static thinRoundedSystemFont(size) { return createFont(size, 300, 'rounded'); }
      static lightRoundedSystemFont(size) { return createFont(size, 300, 'rounded'); }
      static semiboldRoundedSystemFont(size) { return createFont(size, 600, 'rounded'); }
      static boldRoundedSystemFont(size) { return createFont(size, 700, 'rounded'); }
      static regularRoundedSystemFont(size) { return createFont(size, 400, 'rounded'); }
      static mediumRoundedSystemFont(size) { return createFont(size, 500, 'rounded'); }
      static heavyRoundedSystemFont(size) { return createFont(size, 800, 'rounded'); }
      static blackRoundedSystemFont(size) { return createFont(size, 900, 'rounded'); }
      static ultraLightMonospacedSystemFont(size) { return createFont(size, 200, 'monospace'); }
      static thinMonospacedSystemFont(size) { return createFont(size, 300, 'monospace'); }
      static lightMonospacedSystemFont(size) { return createFont(size, 300, 'monospace'); }
      static regularMonospacedSystemFont(size) { return createFont(size, 400, 'monospace'); }
      static mediumMonospacedSystemFont(size) { return createFont(size, 500, 'monospace'); }
      static semiboldMonospacedSystemFont(size) { return createFont(size, 600, 'monospace'); }
      static boldMonospacedSystemFont(size) { return createFont(size, 700, 'monospace'); }
      static heavyMonospacedSystemFont(size) { return createFont(size, 800, 'monospace'); }
      static blackMonospacedSystemFont(size) { return createFont(size, 900, 'monospace'); }
    }

    class Size {
      constructor(width, height) { this.width = Number(width); this.height = Number(height); }
    }

    class Point {
      constructor(x, y) { this.x = Number(x); this.y = Number(y); }
    }

    class Rect {
      constructor(x, y, width, height) {
        this.x = Number(x); this.y = Number(y); this.width = Number(width); this.height = Number(height);
      }
    }

    class LinearGradient {
      constructor() {
        this.colors = [];
        this.locations = [];
        this.startPoint = new Point(0, 0);
        this.endPoint = new Point(0, 1);
      }
    }

    class Path {
      constructor() { this.entries = []; }
      move(point) { this.entries.push({ kind: 'cmd', type: 'move', point }); }
      addLine(point) { this.entries.push({ kind: 'cmd', type: 'line', point }); }
      addRect(rect) { this.entries.push({ kind: 'shape', type: 'rect', rect }); }
      addEllipse(rect) { this.entries.push({ kind: 'shape', type: 'ellipse', rect }); }
      addRoundedRect(rect, cornerWidth, cornerHeight = cornerWidth) {
        this.entries.push({ kind: 'shape', type: 'roundedRect', rect, radius: Math.min(cornerWidth, cornerHeight) });
      }
      addCurve(point, control1, control2) { this.entries.push({ kind: 'cmd', type: 'curve', point, control1, control2 }); }
      addQuadCurve(point, control) { this.entries.push({ kind: 'cmd', type: 'quad', point, control }); }
      addLines(points) { points.forEach((point, index) => index === 0 ? this.move(point) : this.addLine(point)); }
      addRects(rects) { rects.forEach((rect) => this.addRect(rect)); }
      closeSubpath() { this.entries.push({ kind: 'cmd', type: 'close' }); }
    }

    class DrawContext {
      constructor() {
        this.size = new Size(1, 1);
        this.ops = [];
        this.fillColor = new Color('#000000');
        this.strokeColor = new Color('#000000');
        this.lineWidth = 1;
        this.font = Font.systemFont(12);
        this.textColor = new Color('#000000');
        this.textAlignment = 'left';
        this.currentPath = null;
      }

      setFillColor(color) { this.fillColor = color; }
      setStrokeColor(color) { this.strokeColor = color; }
      setLineWidth(width) { this.lineWidth = Number(width); }
      setFont(font) { this.font = font; }
      setFontSize(size) {
        const current = this.font || createFont(12);
        this.font = createFont(size, current.weight, current.family, current.style, current.name);
      }
      setTextColor(color) { this.textColor = color; }
      setTextAlignedLeft() { this.textAlignment = 'left'; }
      setTextAlignedCenter() { this.textAlignment = 'center'; }
      setTextAlignedRight() { this.textAlignment = 'right'; }
      fill(rect) { this.fillRect(rect); }
      fillRect(rect) { this.ops.push({ type: 'fillRect', rect, color: this.fillColor }); }
      stroke(rect) { this.strokeRect(rect); }
      strokeRect(rect) { this.ops.push({ type: 'strokeRect', rect, color: this.strokeColor, lineWidth: this.lineWidth }); }
      fillEllipse(rect) { this.ops.push({ type: 'fillEllipse', rect, color: this.fillColor }); }
      strokeEllipse(rect) { this.ops.push({ type: 'strokeEllipse', rect, color: this.strokeColor, lineWidth: this.lineWidth }); }
      addPath(path) { this.currentPath = path; }
      emitPathOps(mode) {
        const entries = this.currentPath?.entries || [];
        const color = mode === 'fill' ? this.fillColor : this.strokeColor;
        const strokeExtra = mode === 'stroke' ? { lineWidth: this.lineWidth } : {};
        let commandBatch = [];
        const flushCommands = () => {
          if (commandBatch.length > 0) {
            this.ops.push({ type: 'path', commands: commandBatch, color, mode, ...strokeExtra });
            commandBatch = [];
          }
        };
        for (const entry of entries) {
          if (entry.kind === 'cmd') {
            commandBatch.push(entry);
          } else {
            flushCommands();
            const opType = mode === 'fill'
              ? (entry.type === 'roundedRect' ? 'roundedRect' : entry.type === 'ellipse' ? 'fillEllipse' : 'fillRect')
              : (entry.type === 'roundedRect' ? 'strokeRoundedRect' : entry.type === 'ellipse' ? 'strokeEllipse' : 'strokeRect');
            this.ops.push({ ...entry, type: opType, color, ...strokeExtra });
          }
        }
        flushCommands();
      }
      fillPath() { this.emitPathOps('fill'); }
      strokePath() { this.emitPathOps('stroke'); }
      drawText(text, point) { this.drawTextInRect(text, new Rect(point.x, point.y, this.size.width - point.x, this.size.height - point.y)); }
      drawTextInRect(text, rect) {
        this.ops.push({ type: 'text', text, rect, color: this.textColor, font: this.font, alignment: this.textAlignment });
      }
      drawImageInRect(image, rect, rotation = 0) {
        this.ops.push({ type: 'image', image, rect, color: this.textColor, rotation: Number(rotation) || 0 });
      }
      drawImageAtPoint(image, point) {
        const size = image?.size || new Size(16, 16);
        this.drawImageInRect(image, new Rect(point.x, point.y, size.width, size.height));
      }
      getImage() { return { __kind: 'draw', size: this.size, ops: [...this.ops] }; }
    }

    // ------------------------------------------------------------------
    // JS API 层：组件元素构建器。
    // 脚本通过属性赋值与方法调用描述组件；toIR() 时物化为纯数据 IR
    // （字段对齐 preview/ir.js 定义的序列化 Schema）。
    // ------------------------------------------------------------------

    const normalizeShadowOffset = (value) => ir.pointToIR(value) || { x: 0, y: 1 };

    const textStylingToIR = (element) => ({
      textColor: ir.colorToIR(element.textColor),
      font: ir.fontToIR(element.font),
      textOpacity: element.textOpacity ?? null,
      lineLimit: Number.isFinite(element.lineLimit) && element.lineLimit > 0 ? element.lineLimit : null,
      minimumScaleFactor: Number.isFinite(element.minimumScaleFactor) ? element.minimumScaleFactor : null,
      shadowColor: ir.colorToIR(element.shadowColor),
      shadowRadius: Number.isFinite(element.shadowRadius) ? element.shadowRadius : null,
      shadowOffset: element.shadowOffset ? normalizeShadowOffset(element.shadowOffset) : null,
    });

    class TextElement {
      constructor(value) {
        this.text = String(value);
        this.horizontalTextAlignment = 'left';
        this.rawOpenURL = null;
        this.textColor = null;
        this.font = null;
        this.textOpacity = null;
        this.lineLimit = null;
        this.minimumScaleFactor = null;
        this.shadowColor = null;
        this.shadowRadius = null;
        this.shadowOffset = null;
      }

      leftAlignText() { this.horizontalTextAlignment = 'left'; }
      centerAlignText() { this.horizontalTextAlignment = 'center'; }
      rightAlignText() { this.horizontalTextAlignment = 'right'; }

      get url() { return this.rawOpenURL; }
      set url(value) { this.rawOpenURL = value ? String(value) : null; }

      toIR() {
        const node = ir.irText();
        node.text = this.text;
        node.horizontalTextAlignment = this.horizontalTextAlignment;
        node.rawOpenURL = this.rawOpenURL;
        node.styling = textStylingToIR(this);
        return node;
      }
    }

    class DateElement extends TextElement {
      constructor(value) {
        super('');
        this.date = value instanceof Date ? value : new PreviewDate(value);
        this.dateStyle = 'date';
      }

      applyTimeStyle() { this.dateStyle = 'time'; }
      applyDateStyle() { this.dateStyle = 'date'; }
      applyRelativeStyle() { this.dateStyle = 'relative'; }
      applyOffsetStyle() { this.dateStyle = 'offset'; }
      applyTimerStyle() { this.dateStyle = 'timer'; }

      toIR() {
        const node = ir.irDate(this.date);
        node.horizontalTextAlignment = this.horizontalTextAlignment;
        node.rawOpenURL = this.rawOpenURL;
        node.dateStyle = this.dateStyle;
        node.styling = textStylingToIR(this);
        return node;
      }
    }

    class ImageElement {
      constructor(image) {
        this.image = image;
        this.imageAlignment = 'left';
        this.rawOpenURL = null;
        this.resizable = true;
        this.contentMode = 'fit';
        this.imageOpacity = null;
        this.imageSize = null;
        this.cornerRadius = 0;
        this.containerRelativeShape = false;
        this.borderWidth = 0;
        this.borderColor = null;
        this.tintColor = null;
      }

      leftAlignImage() { this.imageAlignment = 'left'; }
      centerAlignImage() { this.imageAlignment = 'center'; }
      rightAlignImage() { this.imageAlignment = 'right'; }
      applyFittingContentMode() { this.contentMode = 'fit'; }
      applyFillingContentMode() { this.contentMode = 'fill'; }

      get url() { return this.rawOpenURL; }
      set url(value) { this.rawOpenURL = value ? String(value) : null; }

      toIR() {
        const node = ir.irImage(this.image);
        node.resizable = this.resizable !== false;
        node.contentMode = this.contentMode;
        node.imageAlignment = this.imageAlignment;
        node.imageOpacity = this.imageOpacity ?? 1;
        node.imageSize = ir.sizeToIR(this.imageSize);
        // 官方文档：containerRelativeShape 为 true 时忽略 cornerRadius
        node.cornerRadius = this.containerRelativeShape ? 0 : Number(this.cornerRadius) || 0;
        node.containerRelativeShape = Boolean(this.containerRelativeShape);
        node.borderWidth = Number(this.borderWidth) || 0;
        node.borderColor = ir.colorToIR(this.borderColor);
        node.tintColor = ir.colorToIR(this.tintColor);
        node.rawOpenURL = this.rawOpenURL;
        return node;
      }
    }

    class SpacerElement {
      constructor(length) {
        this.length = Number.isFinite(length) ? Number(length) : null;
      }

      toIR() {
        return ir.irSpacer(this.length);
      }
    }

    class ButtonElement {
      constructor(title, options) {
        const actionId = typeof options?.id === 'string' ? options.id.trim() : '';
        if (!actionId) throw new TypeError('addButton 需要非空字符串 options.id');
        this.title = String(title ?? '');
        this.actionId = actionId;
      }

      toIR() {
        return ir.irButton(this.title, this.actionId);
      }
    }

    class RefreshButtonElement {
      constructor(title) {
        this.title = String(title ?? '');
      }

      toIR() {
        return ir.irRefreshButton(this.title);
      }
    }

    class ToggleElement {
      constructor(title, isOn, options) {
        const actionId = typeof options?.id === 'string' ? options.id.trim() : '';
        if (!actionId) throw new TypeError('addToggle 需要非空字符串 options.id');
        this.title = String(title ?? '');
        this.isOn = Boolean(isOn);
        this.actionId = actionId;
      }

      toIR() {
        return ir.irToggle(this.title, this.isOn, this.actionId);
      }
    }

    class StackContainer {
      constructor() {
        this.contentDirection = 'horizontal';
        this.alignment = null;
        this.elements = [];
        this.backgroundColor = null;
        this.backgroundImage = null;
        this.backgroundGradient = null;
        this.spacing = null;
        this.size = null;
        this.cornerRadius = 0;
        this.borderWidth = 0;
        this.borderColor = null;
        this.padding = null;
        this.rawOpenURL = null;
        this.progress = null;
        this.action = null;
      }

      addStack() {
        const child = new StackContainer();
        this.elements.push(child);
        return child;
      }

      addText(value) {
        const child = new TextElement(value);
        this.elements.push(child);
        return child;
      }

      addDate(value) {
        const child = new DateElement(value);
        this.elements.push(child);
        return child;
      }

      addImage(image) {
        const child = new ImageElement(image);
        this.elements.push(child);
        return child;
      }

      addSpacer(length) {
        const child = new SpacerElement(length);
        this.elements.push(child);
        return child;
      }

      addProgress(value, options = {}) {
        const style = options?.style === 'linear' ? 'linear' : 'circular';
        const thickness = Number(options?.thickness) > 0
          ? Number(options.thickness)
          : (style === 'linear' ? 6 : 5);
        const child = new StackContainer();
        child.layoutVertically();
        child.centerAlignContent();
        child.size = style === 'linear' ? new Size(120, thickness) : new Size(40, 40);
        child.progress = {
          value: Math.min(100, Math.max(0, Number(value) || 0)),
          style,
          progressColor: options?.progressColor || null,
          trackColor: options?.trackColor || null,
          thickness,
        };
        this.elements.push(child);
        return child;
      }

      addButton(title, options) {
        const child = new ButtonElement(title, options);
        this.elements.push(child);
      }

      addRefreshButton(title) {
        const child = new RefreshButtonElement(title);
        this.elements.push(child);
      }

      addToggle(title, isOn, options) {
        const child = new ToggleElement(title, isOn, options);
        this.elements.push(child);
      }

      setAction(title, options) {
        if (title === null || title === undefined || !options?.id) {
          this.action = null;
          return;
        }
        const id = String(options.id).trim();
        this.action = id ? { title: String(title), id } : null;
      }

      setPadding(top, leading, bottom, trailing) {
        this.padding = { top: Number(top), left: Number(leading), bottom: Number(bottom), right: Number(trailing) };
      }

      useDefaultPadding() { this.padding = null; }

      layoutHorizontally() { this.contentDirection = 'horizontal'; }
      layoutVertically() { this.contentDirection = 'vertical'; }
      topAlignContent() { this.alignment = 'top'; }
      centerAlignContent() { this.alignment = 'center'; }
      bottomAlignContent() { this.alignment = 'bottom'; }

      get url() { return this.rawOpenURL; }
      set url(value) { this.rawOpenURL = value ? String(value) : null; }

      containerIR(node) {
        node.contentDirection = this.contentDirection;
        node.alignment = this.alignment;
        node.backgroundColor = ir.colorToIR(this.backgroundColor);
        node.backgroundGradient = ir.gradientToIR(this.backgroundGradient);
        node.backgroundImage = this.backgroundImage ? ir.imageToIR(this.backgroundImage) : null;
        node.spacing = Number.isFinite(this.spacing) ? this.spacing : 0;
        node.size = ir.sizeToIR(this.size);
        node.cornerRadius = Number(this.cornerRadius) || 0;
        node.borderWidth = Number(this.borderWidth) || 0;
        node.borderColor = ir.colorToIR(this.borderColor);
        node.padding = this.padding;
        node.rawOpenURL = this.rawOpenURL;
        if ('progress' in node) node.progress = ir.progressToIR(this.progress);
        if ('action' in node) node.action = ir.actionToIR(this.action);
        node.elements = this.elements.map((child) => child.toIR());
        return node;
      }

      toIR() {
        return this.containerIR(ir.irStack());
      }
    }

    class ListWidget extends StackContainer {
      constructor() {
        super();
        this.contentDirection = 'vertical';
        this.backgroundStyle = 'default';
        this.refreshAfterDate = null;
        this.addAccessoryWidgetBackground = false;
      }

      async presentSmall() {}
      async presentMedium() {}
      async presentLarge() {}
      async presentExtraLarge() {}
      async presentExtraLargePortrait() {}
      async presentAccessoryInline() {}
      async presentAccessoryCircular() {}
      async presentAccessoryRectangular() {}

      toIR() {
        const node = this.containerIR(ir.irList());
        node.openURL = node.rawOpenURL;
        delete node.rawOpenURL;
        node.backgroundStyle = this.backgroundStyle === 'transparent' ? 'transparent' : 'default';
        node.refreshAfterDate = this.refreshAfterDate
          ? new Date(this.refreshAfterDate).toISOString()
          : null;
        node.addAccessoryWidgetBackground = Boolean(this.addAccessoryWidgetBackground);
        return node;
      }
    }

    class Request {
      constructor(url) {
        this.url = String(url);
        this.response = { cookies: [] };
      }

      async loadJSON() {
        const response = createFixtureResponse(scriptId, this.url, this, executionNow);
        return typeof response === 'string' ? JSON.parse(response) : response;
      }

      async loadString() {
        const response = createFixtureResponse(scriptId, this.url, this, executionNow);
        return typeof response === 'string' ? response : JSON.stringify(response);
      }

      async loadImage() {
        return createFixtureResponse(scriptId, this.url, this, executionNow);
      }
    }

    // 通用项由运行时预置；组件专属凭据由各自 mock 模块的 keychain 字段注入。
    const keychainValues = storage?.keychain instanceof Map ? storage.keychain : new Map();
    const updaterKey = `zkl2333.widgetUpdater.${scriptId}.checkedAt`;
    if (!keychainValues.has(updaterKey)) {
      keychainValues.set(updaterKey, String(Math.floor(nowMilliseconds / 1000)));
    }
    const mockKeychain = ((global.ScriptablePreviewMocks || {})[scriptId] || {}).keychain || {};
    for (const [key, value] of Object.entries(mockKeychain)) {
      if (!keychainValues.has(key)) keychainValues.set(key, String(value));
    }
    const fileValues = storage?.files instanceof Map ? storage.files : new Map();
    const FileManager = {
      local: () => ({
        documentsDirectory: () => '/preview/documents',
        libraryDirectory: () => '/preview/library',
        joinPath: (left, right) => `${left}/${right}`.replaceAll('//', '/'),
        fileExists: (path) => fileValues.has(path),
        createDirectory: () => {},
        listContents: (path) => [...fileValues.keys()].filter((key) => key.startsWith(`${path}/`)).map((key) => key.slice(path.length + 1)),
        readString: (path) => fileValues.get(path) || '',
        writeString: (path, value) => fileValues.set(path, String(value)),
        remove: (path) => fileValues.delete(path),
        isFileStoredIniCloud: () => false,
      }),
      iCloud: () => FileManager.local(),
    };
    const Keychain = {
      contains: (key) => keychainValues.has(key),
      get: (key) => keychainValues.get(key),
      set: (key, value) => keychainValues.set(key, String(value)),
      remove: (key) => keychainValues.delete(key),
    };
    const SFSymbol = {
      named: (name) => {
        const image = { __kind: 'symbol', name: String(name), weight: 400 };
        const setWeight = (weight) => () => { image.weight = weight; };
        return {
          image,
          applyFont: (font) => { image.font = font; },
          applyUltraLightWeight: setWeight(200),
          applyThinWeight: setWeight(250),
          applyLightWeight: setWeight(300),
          applyRegularWeight: setWeight(400),
          applyMediumWeight: setWeight(500),
          applySemiboldWeight: setWeight(600),
          applyBoldWeight: setWeight(700),
          applyHeavyWeight: setWeight(800),
          applyBlackWeight: setWeight(900),
        };
      },
    };
    class Alert {
      addAction() {}
      addCancelAction() {}
      addTextField() {}
      addSecureTextField() {}
      textFieldValue() { return ''; }
      async presentAlert() { return -1; }
      async presentSheet() { return -1; }
    }
    class Notification {
      addAction() {}
      setTriggerDate() {}
      async schedule() {}
    }
    const atTime = (hour, minute) => {
      const value = new PreviewDate(executionNow);
      value.setHours(hour, minute, 0, 0);
      return value;
    };
    const CalendarEvent = {
      today: async () => [
        {
          title: '产品同步会',
          startDate: atTime(10, 0),
          endDate: atTime(10, 45),
          isAllDay: false,
        },
        {
          title: '整理本周发布清单',
          startDate: atTime(16, 0),
          endDate: atTime(16, 30),
          isAllDay: false,
        },
      ],
    };
    const Reminder = {
      allIncomplete: async () => [
        { title: '确认设计稿反馈', dueDate: atTime(11, 30) },
        { title: '提交周报', dueDate: atTime(18, 0) },
        { title: '归档会议记录', dueDate: null },
      ],
    };
    const Script = {
      name: () => scriptId,
      setWidget: (widget) => { capturedWidget = widget; },
      complete: () => {},
    };

    const sandbox = {
      Alert,
      Color,
      CalendarEvent,
      Date: PreviewDate,
      Device: { isUsingDarkAppearance: () => appearance === 'dark' },
      DrawContext,
      FileManager,
      Font,
      Keychain,
      LinearGradient,
      ListWidget,
      Notification,
      Path,
      Point,
      Rect,
      Reminder,
      Request,
      SFSymbol,
      Script,
      Size,
      URLScheme: { forRunningScript: () => `scriptable:///run/${scriptId}` },
      args: {
        widgetParameter: widgetParameter ? String(widgetParameter) : '',
        widgetAction: widgetAction ? { ...widgetAction } : null,
      },
      config: {
        runsInActionExtension: false,
        runsInApp: false,
        runsInWidget: true,
        runsInAccessoryWidget: String(family || '').startsWith('accessory'),
        widgetFamily: family,
      },
      console,
      module: { filename: `/preview/${scriptId}.js` },
    };

    return { sandbox, getWidget: () => capturedWidget };
  };

  const executeSource = async ({
    source,
    scriptId,
    family,
    appearance = 'light',
    now = new Date(),
    widgetAction = null,
    widgetParameter = '',
    storage = null,
  }) => {
    if (!source || typeof source !== 'string') throw new TypeError('dist 源码不能为空');
    ir.resetIdentifiers();
    const { sandbox, getWidget } = createSandbox({
      scriptId,
      family,
      appearance,
      now,
      widgetAction,
      widgetParameter,
      storage,
    });
    const run = new Function(
      'sandbox',
      'source',
      "return (async function () { with (sandbox) { return await eval('(async () => {\\n' + source + '\\n})()'); } }).call(sandbox);"
    );
    await run(sandbox, source);
    const widget = getWidget();
    if (!widget) throw new Error(`${scriptId} 没有调用 Script.setWidget`);
    if (typeof widget.toIR !== 'function') throw new TypeError(`${scriptId} 传给 Script.setWidget 的不是 ListWidget`);
    return ir.validateIR(widget.toIR());
  };

  const loadSource = async (sourcePath) => {
    if (!sourceCache.has(sourcePath)) {
      sourceCache.set(sourcePath, fetch(sourcePath, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error(`无法加载 ${sourcePath}：HTTP ${response.status}`);
        return response.text();
      }));
    }
    return sourceCache.get(sourcePath);
  };

  const renderDistWidget = async (widget, context) => {
    const source = await loadSource(widget.sourcePath);
    const tree = await executeSource({
      source,
      scriptId: widget.id,
      family: context.family.id,
      appearance: context.appearance,
      now: context.now,
      widgetAction: context.widgetAction ?? null,
      widgetParameter: context.widgetParameter ?? '',
      storage: context.storage ?? null,
    });
    return renderWidgetTree(tree, {
      now: context.now,
      appearance: context.appearance,
      size: { width: context.family.width, height: context.family.height },
      family: context.family.id,
    });
  };

  global.ScriptablePreviewRuntime = Object.freeze({
    annotateLayoutTree,
    executeSource,
    mountDateTicker,
    renderDistWidget,
    renderWidgetTree,
    clearSourceCache: () => sourceCache.clear(),
  });
})(globalThis);
