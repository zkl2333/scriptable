(function initializeScriptablePreviewRuntime(global) {
  'use strict';

  const sourceCache = new Map();

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

  const symbolGlyphs = Object.freeze({
    'airplane': '✈',
    'arrow.down': '↓',
    'arrow.up': '↑',
    'briefcase.fill': '▣',
    'cup.and.saucer.fill': '☕',
    'exclamationmark.triangle.fill': '⚠',
    'leaf.fill': '❧',
    'moon.stars.fill': '☾',
    'quote.bubble.fill': '❝',
    'quote.opening': '❝',
    'sun.max.fill': '☀',
    'sunrise.fill': '☀',
    'sunset.fill': '◒',
  });

  const symbolGlyph = (name) => symbolGlyphs[name] || '◆';

  const createFont = (size, weight = 400, family = 'system') => ({
    __kind: 'font',
    family,
    size: Number(size) || 12,
    weight,
  });

  const fontStyles = (font) => {
    if (!font) return {};
    const family = font.family === 'monospace'
      ? "'Cascadia Mono','SFMono-Regular',Consolas,monospace"
      : font.family === 'rounded'
        ? "'Arial Rounded MT Bold','Segoe UI Variable',sans-serif"
        : "-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
    return {
      fontFamily: family,
      fontSize: `${font.size}px`,
      fontWeight: font.weight,
    };
  };

  const formatRelativeDate = (value, now) => {
    const milliseconds = Math.max(0, value.getTime() - now.getTime());
    const minutes = Math.max(1, Math.ceil(milliseconds / 60000));
    if (minutes < 60) return `${minutes}分钟`;
    if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return `${hours}小时${rest ? `${rest}分钟` : ''}`;
    }
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return `${days}天${hours ? `${hours}小时` : ''}`;
  };

  const renderSymbolSVG = (image, rect, color, font) => {
    const size = font?.size || Math.min(rect.width, rect.height);
    return `<text x="${rect.x + rect.width / 2}" y="${rect.y + rect.height / 2}"` +
      ` fill="${escapeAttribute(color || '#111111')}" font-size="${size}"` +
      ` font-family="-apple-system,'Segoe UI Symbol',sans-serif" text-anchor="middle"` +
      ` dominant-baseline="central">${escapeHTML(symbolGlyph(image.name))}</text>`;
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
      if (operation.type === 'fillEllipse') {
        return `<ellipse cx="${rect.x + rect.width / 2}" cy="${rect.y + rect.height / 2}" rx="${rect.width / 2}" ry="${rect.height / 2}" fill="${fill}"/>`;
      }
      if (operation.type === 'strokeEllipse') {
        return `<ellipse cx="${rect.x + rect.width / 2}" cy="${rect.y + rect.height / 2}" rx="${Math.max(0, rect.width / 2 - operation.lineWidth / 2)}" ry="${Math.max(0, rect.height / 2 - operation.lineWidth / 2)}" fill="none" stroke="${fill}" stroke-width="${operation.lineWidth}"/>`;
      }
      if (operation.type === 'roundedRect') {
        return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${operation.radius}" ry="${operation.radius}" fill="${fill}"/>`;
      }
      if (operation.type === 'text') {
        const font = operation.font || createFont(12);
        const x = operation.alignment === 'center' ? rect.x + rect.width / 2 : rect.x;
        const anchor = operation.alignment === 'center' ? 'middle' : 'start';
        const y = rect.y + Math.min(rect.height, font.size) * 0.86;
        return `<text x="${x}" y="${y}" fill="${fill}" font-size="${font.size}"` +
          ` font-family="${font.family === 'monospace' ? 'monospace' : 'sans-serif'}"` +
          ` font-weight="${font.weight}" text-anchor="${anchor}">${escapeHTML(operation.text)}</text>`;
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

  const renderImageNode = (node) => {
    const image = node.image || {};
    const naturalSize = image.size || { width: 16, height: 16 };
    const width = Number(node.imageSize?.width) || Number(naturalSize.width) || 16;
    const height = Number(node.imageSize?.height) || Number(naturalSize.height) || 16;
    const color = colorToCSS(node.tintColor || node.imageColor) || 'currentColor';
    const style = styleText({
      width: `${width}px`,
      height: `${height}px`,
      color,
      opacity: node.imageOpacity,
      borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : null,
      alignSelf: node.alignment === 'center' ? 'center' : node.alignment === 'right' ? 'flex-end' : null,
    });
    let content;
    if (image.__kind === 'symbol') {
      content = `<span class="sp-symbol" aria-hidden="true">${escapeHTML(symbolGlyph(image.name))}</span>`;
    } else if (image.__kind === 'draw') {
      content = renderDrawImage(image);
    } else if (image.__kind === 'remote') {
      const source = image.url.includes('ikuai64.ico') ? '../image/ikuai64.ico' : image.url;
      content = `<img src="${escapeAttribute(source)}" alt="">`;
    } else {
      content = '<span class="sp-symbol" aria-hidden="true">◆</span>';
    }
    return `<span class="sp-node sp-image" style="${style}">${content}</span>`;
  };

  const renderTextNode = (node, now) => {
    const value = node.kind === 'date'
      ? node.dateStyle === 'relative'
        ? formatRelativeDate(node.value, now)
        : node.value.toLocaleString('zh-CN')
      : node.value;
    const style = styleText({
      ...fontStyles(node.font),
      color: colorToCSS(node.textColor),
      opacity: node.textOpacity,
      textAlign: node.alignment,
      WebkitLineClamp: node.lineLimit || null,
    });
    const classes = ['sp-node', 'sp-text'];
    if (node.lineLimit) classes.push('sp-text--clamped');
    return `<span class="${classes.join(' ')}" style="${style}">${escapeHTML(value)}</span>`;
  };

  const renderSpacer = (node, direction) => {
    const fixed = Number.isFinite(node.length);
    const style = fixed
      ? direction === 'vertical'
        ? `height:${node.length}px;min-height:${node.length}px`
        : `width:${node.length}px;min-width:${node.length}px`
      : 'flex:1 1 0';
    return `<span class="sp-node sp-spacer" style="${style}"></span>`;
  };

  const renderContainer = (node, now, root = false) => {
    const direction = node.direction || (root ? 'vertical' : 'horizontal');
    const width = Number(node.size?.width) > 0 ? `${node.size.width}px` : null;
    const height = Number(node.size?.height) > 0 ? `${node.size.height}px` : null;
    const background = gradientToCSS(node.backgroundGradient) || colorToCSS(node.backgroundColor);
    const style = styleText({
      flexDirection: direction === 'vertical' ? 'column' : 'row',
      alignItems: node.contentAlignment || 'stretch',
      padding: node.padding ? `${node.padding.top}px ${node.padding.right}px ${node.padding.bottom}px ${node.padding.left}px` : null,
      width: root ? '100%' : width,
      height: root ? '100%' : height,
      flex: !root && node.size && !width && !height ? '1 1 0' : null,
      flexShrink: width || height ? 0 : null,
      gap: Number.isFinite(node.spacing) ? `${node.spacing}px` : null,
      background,
      border: node.borderWidth ? `${node.borderWidth}px solid ${colorToCSS(node.borderColor)}` : null,
      borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : null,
      overflow: node.cornerRadius ? 'hidden' : null,
    });
    const backgroundImage = root && node.backgroundImage?.__kind === 'draw'
      ? `<span class="sp-widget-background">${renderDrawImage(node.backgroundImage, 'sp-drawn-background')}</span>`
      : '';
    const children = node.children.map((child) => {
      if (child.kind === 'stack') return renderContainer(child, now);
      if (child.kind === 'text' || child.kind === 'date') return renderTextNode(child, now);
      if (child.kind === 'image') return renderImageNode(child);
      if (child.kind === 'spacer') return renderSpacer(child, direction);
      return '';
    }).join('');
    return `<div class="sp-node ${root ? 'sp-runtime-root' : 'sp-stack'} sp-${direction}" style="${style}">${backgroundImage}${children}</div>`;
  };

  const renderWidgetTree = (widget, { now = new Date() } = {}) =>
    renderContainer(widget, now instanceof Date ? now : new Date(now), true);

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
            total_cost: 284.17,
            today_tokens: 3820000,
            today_requests: 1286,
            rpm_used: 26,
            tpm_used: 4800,
          },
          model_top3_today: [
            { model_key: 'claude-sonnet-4', cost: 6.28 },
            { model_key: 'gpt-5', cost: 4.91 },
            { model_key: 'gemini-2.5-pro', cost: 1.65 },
          ],
          codex_quota: { account_count: 0 },
        };
      }
      if (url.includes('/health/sites')) {
        return {
          items: [
            ['api-prod', 42],
            ['gateway', 68],
            ['edge-tokyo', 91],
            ['codex', 56],
            ['claude', 73],
            ['gemini', 88],
          ].map(([name, latency], index) => ({
            site: { id: index + 1, name, enabled: true },
            health: { status: 'healthy', recent_avg_latency_ms: latency },
          })),
        };
      }
      if (url.includes('/api-keys')) {
        return { items: Array.from({ length: 4 }, (_, index) => ({ id: index + 1, status: 'active' })) };
      }
      if (url.includes('/requests?')) return { meta: { total: 3 } };
      if (url.includes('/dashboard/usage')) {
        return {
          charts: {
            daily_site_cost: Array.from({ length: 6 }, (_, index) => ({
              date: now.toISOString().slice(0, 10),
              site_id: index + 1,
              cost: [3.12, 2.7, 2.14, 1.92, 1.68, 1.28][index],
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
      }

      static dynamic(light, dark) {
        return appearance === 'dark' ? dark : light;
      }
    }

    class Font {
      constructor(name, size) {
        return createFont(size, /bold/i.test(name) ? 700 : 400, /menlo|mono/i.test(name) ? 'monospace' : 'system');
      }

      static systemFont(size) { return createFont(size); }
      static regularSystemFont(size) { return createFont(size); }
      static mediumSystemFont(size) { return createFont(size, 500); }
      static semiboldSystemFont(size) { return createFont(size, 600); }
      static boldSystemFont(size) { return createFont(size, 700); }
      static semiboldRoundedSystemFont(size) { return createFont(size, 600, 'rounded'); }
      static boldRoundedSystemFont(size) { return createFont(size, 700, 'rounded'); }
      static regularMonospacedSystemFont(size) { return createFont(size, 400, 'monospace'); }
      static boldMonospacedSystemFont(size) { return createFont(size, 700, 'monospace'); }
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
      constructor() { this.shapes = []; }
      addRoundedRect(rect, radius) { this.shapes.push({ rect, radius }); }
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
      setTextAlignedCenter() { this.textAlignment = 'center'; }
      fillRect(rect) { this.ops.push({ type: 'fillRect', rect, color: this.fillColor }); }
      fillEllipse(rect) { this.ops.push({ type: 'fillEllipse', rect, color: this.fillColor }); }
      strokeEllipse(rect) { this.ops.push({ type: 'strokeEllipse', rect, color: this.strokeColor, lineWidth: this.lineWidth }); }
      addPath(path) { this.currentPath = path; }
      fillPath() {
        for (const shape of this.currentPath?.shapes || []) {
          this.ops.push({ type: 'roundedRect', ...shape, color: this.fillColor });
        }
      }
      drawTextInRect(text, rect) {
        this.ops.push({ type: 'text', text, rect, color: this.textColor, font: this.font, alignment: this.textAlignment });
      }
      drawImageInRect(image, rect) { this.ops.push({ type: 'image', image, rect, color: this.textColor }); }
      getImage() { return { __kind: 'draw', size: this.size, ops: [...this.ops] }; }
    }

    class ContainerNode {
      constructor(kind, direction) {
        this.kind = kind;
        this.direction = direction;
        this.children = [];
      }

      addStack() {
        const child = new ContainerNode('stack', 'horizontal');
        this.children.push(child);
        return child;
      }

      addText(value) {
        const child = { kind: 'text', value: String(value), alignment: 'left' };
        child.leftAlignText = () => { child.alignment = 'left'; };
        child.centerAlignText = () => { child.alignment = 'center'; };
        child.rightAlignText = () => { child.alignment = 'right'; };
        this.children.push(child);
        return child;
      }

      addDate(value) {
        const child = { kind: 'date', value: new PreviewDate(value), alignment: 'left', dateStyle: 'date' };
        child.leftAlignText = () => { child.alignment = 'left'; };
        child.centerAlignText = () => { child.alignment = 'center'; };
        child.rightAlignText = () => { child.alignment = 'right'; };
        child.applyRelativeStyle = () => { child.dateStyle = 'relative'; };
        child.applyDateStyle = () => { child.dateStyle = 'date'; };
        child.applyTimeStyle = () => { child.dateStyle = 'time'; };
        child.applyTimerStyle = () => { child.dateStyle = 'relative'; };
        this.children.push(child);
        return child;
      }

      addImage(image) {
        const child = { kind: 'image', image, alignment: 'left' };
        child.leftAlignImage = () => { child.alignment = 'left'; };
        child.centerAlignImage = () => { child.alignment = 'center'; };
        child.rightAlignImage = () => { child.alignment = 'right'; };
        this.children.push(child);
        return child;
      }

      addSpacer(length) {
        const child = { kind: 'spacer', length: Number.isFinite(length) ? Number(length) : null };
        this.children.push(child);
        return child;
      }

      setPadding(top, left, bottom, right) {
        this.padding = { top: Number(top), left: Number(left), bottom: Number(bottom), right: Number(right) };
      }

      layoutHorizontally() { this.direction = 'horizontal'; }
      layoutVertically() { this.direction = 'vertical'; }
      centerAlignContent() { this.contentAlignment = 'center'; }
      topAlignContent() { this.contentAlignment = 'flex-start'; }
      bottomAlignContent() { this.contentAlignment = 'flex-end'; }
    }

    class ListWidget extends ContainerNode {
      constructor() { super('widget', 'vertical'); }
      async presentSmall() {}
      async presentMedium() {}
      async presentLarge() {}
      async presentExtraLarge() {}
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
    const Script = {
      name: () => scriptId,
      setWidget: (widget) => { capturedWidget = widget; },
      complete: () => {},
    };

    const sandbox = {
      Alert,
      Color,
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
    const { sandbox, getWidget } = createSandbox({ scriptId, family, appearance, now });
    const run = new Function(
      'sandbox',
      'source',
      "return (async function () { with (sandbox) { return await eval('(async () => {\\n' + source + '\\n})()'); } }).call(sandbox);"
    );
    await run(sandbox, source);
    const widget = getWidget();
    if (!widget) throw new Error(`${scriptId} 没有调用 Script.setWidget`);
    return widget;
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
