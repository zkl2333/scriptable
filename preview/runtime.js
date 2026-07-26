(function initializeScriptablePreviewRuntime(global) {
  'use strict';

  const sourceCache = new Map();
  const symbols = global.ScriptablePreviewSymbols;
  const ir = global.ScriptablePreviewIR;

  if (!symbols) throw new Error('请先加载 preview/symbols.js');
  if (!ir) throw new Error('请先加载 preview/ir.js');

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
    const family = font.name
      ? `'${String(font.name).replaceAll("'", '')}',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`
      : font.family === 'monospace'
      ? "ui-monospace,'SFMono-Regular',Menlo,Monaco,Consolas,monospace"
      : font.family === 'rounded'
        ? "ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
        : "-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
    return {
      fontFamily: family,
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

  const renderDrawImage = (image, extraClass = '') => {
    const width = Math.max(1, Number(image.size?.width) || 1);
    const height = Math.max(1, Number(image.size?.height) || 1);
    const body = image.ops.map((operation) => {
      const fill = escapeAttribute(colorToCSS(operation.color) || 'transparent');
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
        const y = rect.y + Math.min(rect.height, font.size) * 0.86;
        return `<text x="${x}" y="${y}" fill="${fill}" font-size="${font.size}"` +
          ` font-family="${font.family === 'monospace' ? 'monospace' : 'sans-serif'}"` +
          ` font-weight="${font.weight}" text-anchor="${anchor}">${escapeHTML(operation.text)}</text>`;
      }
      if (operation.type === 'image' && operation.image?.kind === 'symbol') {
        return renderSymbolSVG(operation.image, rect, fill, operation.image.font);
      }
      if (operation.type === 'image' && operation.image?.__kind === 'symbol') {
        return renderSymbolSVG(operation.image, rect, fill, operation.image.font);
      }
      return '';
    }).join('');
    return `<svg class="sp-drawn-image ${extraClass}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
  };

  const gradientToCSS = (gradient) => {
    if (!gradient?.colors?.length) return null;
    const start = gradient.startPoint || { x: 0, y: 0 };
    const end = gradient.endPoint || { x: 0, y: 1 };
    const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI + 90);
    const stops = gradient.colors.map((color, index) => {
      const location = gradient.locations?.[index];
      return `${colorToCSS(color)}${Number.isFinite(location) ? ` ${location * 100}%` : ''}`;
    });
    return `linear-gradient(${angle}deg,${stops.join(',')})`;
  };

  const STACK_ALIGNMENT_TO_CSS = { top: 'flex-start', center: 'center', bottom: 'flex-end' };

  const renderImageNode = (node) => {
    const image = node.codableImage || {};
    const naturalSize = image.size || { width: 16, height: 16 };
    const width = Number(node.imageSize?.width) || Number(naturalSize.width) || 16;
    const height = Number(node.imageSize?.height) || Number(naturalSize.height) || 16;
    const color = colorToCSS(node.tintColor) || 'currentColor';
    const style = styleText({
      width: `${width}px`,
      height: `${height}px`,
      // 固定尺寸视图不接受主轴压缩（SwiftUI frame 语义）
      flexShrink: 0,
      color,
      opacity: node.imageOpacity === 1 ? null : node.imageOpacity,
      borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : null,
      border: node.borderWidth ? `${node.borderWidth}px solid ${colorToCSS(node.borderColor) || '#000000'}` : null,
      alignSelf: node.imageAlignment === 'center' ? 'center' : node.imageAlignment === 'right' ? 'flex-end' : null,
    });
    let content;
    if (image.kind === 'symbol') {
      content = renderSymbol(
        image.name,
        `class="sp-symbol-svg" role="img" aria-label="${escapeAttribute(image.name)}"`
      );
    } else if (image.kind === 'draw') {
      content = renderDrawImage(image);
    } else if (image.kind === 'remote') {
      const source = image.url.includes('ikuai64.ico') ? '../image/ikuai64.ico' : image.url;
      content = `<img src="${escapeAttribute(source)}" alt="">`;
    } else {
      content = '<span class="sp-symbol" aria-hidden="true">◆</span>';
    }
    const classes = ['sp-node', 'sp-image'];
    if (node.contentMode === 'fill') classes.push('sp-image--fill');
    if (node.containerRelativeShape) classes.push('sp-image--container-shape');
    return `<span class="${classes.join(' ')}" style="${style}"${node.rawOpenURL ? ` data-url="${escapeAttribute(node.rawOpenURL)}"` : ''}>${content}</span>`;
  };

  const renderTextNode = (node, now) => {
    const styling = node.styling || {};
    const value = node.type === 'date' ? formatDate(new Date(node.date), now, node.dateStyle) : node.text;
    const minimumScaleFactor = Number.isFinite(styling.minimumScaleFactor)
      ? Math.min(1, Math.max(0.01, Number(styling.minimumScaleFactor)))
      : null;
    // 官方文档：lineLimit ≤ 0 时禁用（默认 0）。
    const lineLimit = Number(styling.lineLimit) > 0 ? Number(styling.lineLimit) : null;
    const style = styleText({
      ...fontStyles(styling.font),
      color: colorToCSS(styling.textColor),
      opacity: styling.textOpacity,
      textAlign: node.horizontalTextAlignment,
      WebkitLineClamp: lineLimit,
      textShadow: styling.shadowRadius
        ? `${Number(styling.shadowOffset?.x) || 0}px ${Number(styling.shadowOffset?.y) || 0}px ${styling.shadowRadius}px ${colorToCSS(styling.shadowColor) || '#000000'}`
        : null,
    });
    const classes = ['sp-node', 'sp-text'];
    if (lineLimit) classes.push('sp-text--clamped');
    if (lineLimit === 1) classes.push('sp-text--single-line');
    const scaleAttributes = minimumScaleFactor && styling.font
      ? ` data-font-size="${styling.font.size}" data-minimum-scale-factor="${minimumScaleFactor}"`
      : '';
    return `<span class="${classes.join(' ')}" style="${style}"${scaleAttributes}>${escapeHTML(value)}</span>`;
  };

  const renderSpacer = (node) => {
    // SwiftUI Spacer(minLength:)：始终可以伸展，最小长度 = length ?? 系统默认间距（≈8pt）。
    const basis = Number.isFinite(node.length) ? node.length : 8;
    return `<span class="sp-node sp-spacer" style="flex:1 0 ${basis}px"></span>`;
  };

  const containsFlexibleSpacer = (node, direction) => (node.elements || []).some((child) => {
    if (child.type === 'spacer') {
      return node.contentDirection === direction && !Number.isFinite(child.length);
    }
    return child.type === 'stack' && containsFlexibleSpacer(child, direction);
  });

  const renderContainer = (node, now, root = false, parentDirection = null) => {
    const direction = node.contentDirection || (root ? 'vertical' : 'horizontal');
    const width = Number(node.size?.width) > 0 ? `${node.size.width}px` : null;
    const height = Number(node.size?.height) > 0 ? `${node.size.height}px` : null;
    const background = gradientToCSS(node.backgroundGradient) || colorToCSS(node.backgroundColor);
    const mainSize = parentDirection === 'horizontal' ? width : height;
    const flexChild = !root && node.type === 'stack' && !mainSize &&
      containsFlexibleSpacer(node, parentDirection);
    const style = styleText({
      flexDirection: direction === 'vertical' ? 'column' : 'row',
      // 官方文档：topAlignContent 是默认对齐。horizontal stack 映射交叉轴；
      // vertical stack 的 top/center/bottom 是主轴概念，映射 justify-content，
      // 交叉轴保持 stretch 铺满（Scriptable 未暴露水平内容对齐）。
      alignItems: direction === 'horizontal' ? (STACK_ALIGNMENT_TO_CSS[node.alignment] || 'flex-start') : 'stretch',
      justifyContent: direction === 'vertical' ? STACK_ALIGNMENT_TO_CSS[node.alignment] || null : null,
      padding: node.padding ? `${node.padding.top}px ${node.padding.right}px ${node.padding.bottom}px ${node.padding.left}px` : null,
      width: root ? '100%' : width,
      height: root ? '100%' : height,
      flex: flexChild || (!root && node.size && !width && !height) ? '1 1 0' : null,
      flexShrink: mainSize ? 0 : null,
      gap: Number.isFinite(node.spacing) && node.spacing > 0 ? `${node.spacing}px` : null,
      background,
      border: node.borderWidth ? `${node.borderWidth}px solid ${colorToCSS(node.borderColor) || '#000000'}` : null,
      borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : null,
      overflow: node.cornerRadius ? 'hidden' : null,
    });
    const backgroundImage = node.backgroundImage?.kind === 'draw'
      ? `<span class="sp-widget-background">${renderDrawImage(node.backgroundImage, 'sp-drawn-background')}</span>`
      : '';
    const children = node.elements.map((child) => {
      if (child.type === 'stack') return renderContainer(child, now, false, direction);
      if (child.type === 'text' || child.type === 'date') return renderTextNode(child, now);
      if (child.type === 'image') return renderImageNode(child);
      if (child.type === 'spacer') return renderSpacer(child);
      return '';
    }).join('');
    const classes = ['sp-node', root ? 'sp-runtime-root' : 'sp-stack', `sp-${direction}`];
    if (root && node.addAccessoryWidgetBackground) classes.push('sp-accessory-background');
    const openURL = node.rawOpenURL || node.openURL;
    return `<div class="${classes.join(' ')}" style="${style}"${openURL ? ` data-url="${escapeAttribute(openURL)}"` : ''}>${backgroundImage}${children}</div>`;
  };

  const renderWidgetTree = (tree, { now = new Date() } = {}) =>
    renderContainer(tree, now instanceof Date ? now : new Date(now), true);

  const createFixtureResponse = (scriptId, url, request, now) => {
    if (url.includes('hitokoto.cn')) return '慢一点，也是在向前走。';
    if (url.includes('ikuai64.ico')) return { __kind: 'remote', url };

    if (scriptId === 'ikuai') {
      if (url.endsWith('/Action/login')) {
        request.response = { cookies: [{ name: 'sess_key', value: 'preview-session' }] };
        return { Result: 10000 };
      }
      if (url.endsWith('/Action/call')) {
        const body = JSON.parse(request.body || '{}');
        if (body.func_name === 'homepage') {
          return {
            code: 0,
            results: {
              sysstat: {
                cpu: ['17%', '19%', '18%', '18%'],
                memory: { used: '42%' },
                cputemp: ['51°C'],
                online_user: { count: 28 },
                stream: {
                  upload: 9017754,
                  download: 44879053,
                  total_up: 51754355916,
                  total_down: 255980050842,
                  connect_num: 386,
                  uptime: 1572480,
                },
              },
            },
          };
        }
        return {
          code: 0,
          results: {
            snapshoot_wan: [{
              default_route: 1,
              internet: 4,
              ip_addr: '192.0.2.18',
              interface: 'wan1',
              updatetime: 1572480,
            }],
          },
        };
      }
    }

    if (scriptId === 'xlyra') {
      if (url.includes('/dashboard/epaper-summary')) {
        return {
          date: now.toISOString().slice(0, 10),
          kpis: {
            today_cost: 12.84,
            total_cost: 5140.59,
            today_tokens: 224400000,
            today_requests: 2237,
            rpm_used: 1,
            tpm_used: 605000,
          },
          model_top3_today: [
            { model_key: 'gpt-5.6-sol', cost: 430.79 },
            { model_key: 'gpt-5.6-terra', cost: 11.33 },
            { model_key: 'gpt-5.6-luna', cost: 0.6883 },
          ],
          codex_quota: { account_count: 0 },
        };
      }
      if (url.includes('/health/sites')) {
        return {
          items: [
            ['api-prod', 42, 'healthy'],
            ['gateway', 68, 'healthy'],
            ['edge-tokyo', 91, 'healthy'],
            ['codex', 0, 'offline'],
            ['claude', 0, 'offline'],
            ['gemini', 0, 'offline'],
            ['vertex', 0, 'offline'],
          ].map(([name, latency, status], index) => ({
            site: { id: index + 1, name, enabled: true },
            health: { status, recent_avg_latency_ms: latency },
          })),
        };
      }
      if (url.includes('/api-keys')) {
        return { items: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, status: 'active' })) };
      }
      if (url.includes('/requests?')) return { meta: { total: 74 } };
      if (url.includes('/dashboard/usage')) {
        return {
          charts: {
            daily_site_cost: Array.from({ length: 7 }, (_, index) => ({
              date: now.toISOString().slice(0, 10),
              site_id: index + 1,
              cost: [3.12, 2.7, 2.14, 1.92, 1.68, 1.28, 0.96][index],
            })),
          },
        };
      }
    }

    if (scriptId === 'work-helper' && url.includes('timor.tech')) {
      const pad = (value) => String(value).padStart(2, '0');
      const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      if (url.includes('/holiday/info/')) return { type: { name: '工作日', type: 0 } };
      if (url.includes('/workday/next/')) {
        const next = new Date(now);
        next.setDate(next.getDate() + (next.getDay() === 5 ? 3 : 1));
        return { workday: { date: formatDate(next) } };
      }
      if (url.includes('/holiday/next/')) {
        const holiday = new Date(now);
        holiday.setDate(holiday.getDate() + 14);
        return { holiday: { name: '周末', date: formatDate(holiday) } };
      }
      if (url.includes('/holiday/batch')) {
        const types = {};
        for (const value of new URL(url).searchParams.getAll('d')) {
          types[value] = { type: 0, name: '工作日' };
        }
        return { type: types };
      }
    }

    throw new Error(`预览运行时缺少请求数据：${url}`);
  };

  const createSandbox = ({ scriptId, family, appearance, now }) => {
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
        const resolved = appearance === 'dark' ? dark : light;
        const fallback = appearance === 'dark' ? light : dark;
        if (resolved instanceof Color) resolved.dark = fallback instanceof Color ? fallback : null;
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
      static semiboldRoundedSystemFont(size) { return createFont(size, 600, 'rounded'); }
      static boldRoundedSystemFont(size) { return createFont(size, 700, 'rounded'); }
      static regularRoundedSystemFont(size) { return createFont(size, 400, 'rounded'); }
      static mediumRoundedSystemFont(size) { return createFont(size, 500, 'rounded'); }
      static heavyRoundedSystemFont(size) { return createFont(size, 800, 'rounded'); }
      static blackRoundedSystemFont(size) { return createFont(size, 900, 'rounded'); }
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
      constructor() { this.shapes = []; this.commands = []; }
      move(point) { this.commands.push({ type: 'move', point }); }
      addLine(point) { this.commands.push({ type: 'line', point }); }
      addRect(rect) { this.shapes.push({ type: 'rect', rect }); }
      addEllipse(rect) { this.shapes.push({ type: 'ellipse', rect }); }
      addRoundedRect(rect, cornerWidth, cornerHeight = cornerWidth) { this.shapes.push({ type: 'roundedRect', rect, radius: Math.min(cornerWidth, cornerHeight) }); }
      addCurve(point, control1, control2) { this.commands.push({ type: 'curve', point, control1, control2 }); }
      addQuadCurve(point, control) { this.commands.push({ type: 'quad', point, control }); }
      addLines(points) { points.forEach((point, index) => index === 0 ? this.move(point) : this.addLine(point)); }
      addRects(rects) { rects.forEach((rect) => this.addRect(rect)); }
      closeSubpath() { this.commands.push({ type: 'close' }); }
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
      fillPath() {
        for (const shape of this.currentPath?.shapes || []) {
          this.ops.push({ type: shape.type === 'roundedRect' ? 'roundedRect' : shape.type === 'ellipse' ? 'fillEllipse' : 'fillRect', ...shape, color: this.fillColor });
        }
        if (this.currentPath?.commands?.length) this.ops.push({ type: 'path', commands: this.currentPath.commands, color: this.fillColor, mode: 'fill' });
      }
      strokePath() {
        for (const shape of this.currentPath?.shapes || []) {
          this.ops.push({ type: shape.type === 'roundedRect' ? 'strokeRoundedRect' : shape.type === 'ellipse' ? 'strokeEllipse' : 'strokeRect', ...shape, color: this.strokeColor, lineWidth: this.lineWidth });
        }
        if (this.currentPath?.commands?.length) this.ops.push({ type: 'path', commands: this.currentPath.commands, color: this.strokeColor, lineWidth: this.lineWidth, mode: 'stroke' });
      }
      drawText(text, point) { this.drawTextInRect(text, new Rect(point.x, point.y, this.size.width - point.x, this.size.height - point.y)); }
      drawTextInRect(text, rect) {
        this.ops.push({ type: 'text', text, rect, color: this.textColor, font: this.font, alignment: this.textAlignment });
      }
      drawImageInRect(image, rect) { this.ops.push({ type: 'image', image, rect, color: this.textColor }); }
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
        this.refreshAfterDate = null;
        this.addAccessoryWidgetBackground = false;
      }

      async presentSmall() {}
      async presentMedium() {}
      async presentLarge() {}
      async presentExtraLarge() {}

      toIR() {
        const node = this.containerIR(ir.irList());
        node.openURL = node.rawOpenURL;
        delete node.rawOpenURL;
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

    const keychainValues = new Map([
      [`zkl2333.widgetUpdater.${scriptId}.checkedAt`, String(Math.floor(nowMilliseconds / 1000))],
      ['ikuai_username', 'preview'],
      ['ikuai_password', 'preview'],
      ['ikuai_host', '127.0.0.1'],
      ['ikuai_port', '80'],
      ['xlyra.baseURL', 'http://preview.local'],
      ['xlyra.adminToken', 'preview-token'],
    ]);
    const fileValues = new Map();
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
        const image = { __kind: 'symbol', name: String(name) };
        return {
          image,
          applyFont: (font) => { image.font = font; },
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
      args: { widgetParameter: '' },
      config: {
        runsInActionExtension: false,
        runsInApp: false,
        runsInWidget: true,
        widgetFamily: family,
      },
      console,
      module: { filename: `/preview/${scriptId}.js` },
    };

    return { sandbox, getWidget: () => capturedWidget };
  };

  const executeSource = async ({ source, scriptId, family, appearance = 'light', now = new Date() }) => {
    if (!source || typeof source !== 'string') throw new TypeError('dist 源码不能为空');
    ir.resetIdentifiers();
    const { sandbox, getWidget } = createSandbox({ scriptId, family, appearance, now });
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
    });
    return renderWidgetTree(tree, { now: context.now });
  };

  global.ScriptablePreviewRuntime = Object.freeze({
    executeSource,
    renderDistWidget,
    renderWidgetTree,
    clearSourceCache: () => sourceCache.clear(),
  });
})(globalThis);
