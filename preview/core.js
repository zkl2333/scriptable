(function initializePreviewCore(global) {
  'use strict';

  const families = [
    { id: 'small', label: '小号', shortLabel: 'S', width: 158, height: 158, group: 'home' },
    { id: 'medium', label: '中号', shortLabel: 'M', width: 338, height: 158, group: 'home' },
    { id: 'large', label: '大号', shortLabel: 'L', width: 338, height: 354, group: 'home' },
    {
      id: 'extraLarge',
      label: '超大号',
      shortLabel: 'XL',
      width: 720,
      height: 338,
      group: 'home',
    },
    {
      id: 'accessoryInline',
      label: '锁屏单行',
      shortLabel: 'IN',
      width: 160,
      height: 26,
      group: 'accessory',
    },
    {
      id: 'accessoryCircular',
      label: '锁屏圆形',
      shortLabel: '○',
      width: 76,
      height: 76,
      group: 'accessory',
    },
    {
      id: 'accessoryRectangular',
      label: '锁屏矩形',
      shortLabel: '▭',
      width: 172,
      height: 76,
      group: 'accessory',
    },
  ].map(Object.freeze);

  const familyMap = new Map(families.map((family) => [family.id, family]));
  const validModes = new Set(['overview', 'focus']);
  const validAppearances = new Set(['light', 'dark']);

  const escapeHTML = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, Number(value) || 0));

  const formatCompactNumber = (value) =>
    new Intl.NumberFormat('zh-CN', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Number(value) || 0);

  const getFamily = (familyId) => {
    const family = familyMap.get(familyId);
    if (!family) throw new RangeError(`未知预览尺寸：${familyId}`);
    return family;
  };

  const calculatePreviewScale = (
    familyId,
    availableWidth,
    availableHeight,
    maximumScale = 1
  ) => {
    const family = getFamily(familyId);
    const width = Math.max(1, Number(availableWidth) || 1);
    const height = Math.max(1, Number(availableHeight) || 1);
    return Math.max(
      0.1,
      Math.min(maximumScale, width / family.width, height / family.height)
    );
  };

  const normalizeWidget = (widget) => {
    if (!widget || typeof widget !== 'object') {
      throw new TypeError('组件定义必须是对象');
    }
    if (!/^[a-z0-9-]+$/.test(widget.id || '')) {
      throw new TypeError(`组件 ID 无效：${widget.id}`);
    }
    if (!widget.name || typeof widget.render !== 'function') {
      throw new TypeError(`组件 ${widget.id} 缺少名称或 render 方法`);
    }
    return Object.freeze({
      icon: '◆',
      category: 'Widget',
      ...widget,
    });
  };

  const createPreviewEngine = ({ widgets, initialState = {} }) => {
    if (!Array.isArray(widgets) || widgets.length === 0) {
      throw new TypeError('至少需要注册一个预览组件');
    }

    const normalizedWidgets = widgets.map(normalizeWidget);
    const widgetMap = new Map();
    normalizedWidgets.forEach((widget) => {
      if (widgetMap.has(widget.id)) throw new TypeError(`组件 ID 重复：${widget.id}`);
      widgetMap.set(widget.id, widget);
    });

    const defaultWidgetId = normalizedWidgets[0].id;
    let state = Object.freeze({
      mode: validModes.has(initialState.mode) ? initialState.mode : 'overview',
      widgetId: widgetMap.has(initialState.widgetId)
        ? initialState.widgetId
        : defaultWidgetId,
      family: familyMap.has(initialState.family) ? initialState.family : 'medium',
      appearance: validAppearances.has(initialState.appearance)
        ? initialState.appearance
        : 'light',
      revision: 0,
    });
    const listeners = new Set();

    const getState = () => ({ ...state });

    const update = (patch = {}) => {
      const next = { ...state };
      if ('mode' in patch) {
        if (!validModes.has(patch.mode)) throw new RangeError(`未知预览模式：${patch.mode}`);
        next.mode = patch.mode;
      }
      if ('widgetId' in patch) {
        if (!widgetMap.has(patch.widgetId)) throw new RangeError(`未知组件：${patch.widgetId}`);
        next.widgetId = patch.widgetId;
      }
      if ('family' in patch) {
        getFamily(patch.family);
        next.family = patch.family;
      }
      if ('appearance' in patch) {
        if (!validAppearances.has(patch.appearance)) {
          throw new RangeError(`未知外观：${patch.appearance}`);
        }
        next.appearance = patch.appearance;
      }
      next.revision = state.revision + 1;
      state = Object.freeze(next);
      listeners.forEach((listener) => listener(getState()));
      return getState();
    };

    const subscribe = (listener) => {
      if (typeof listener !== 'function') throw new TypeError('订阅者必须是函数');
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    const render = async (widgetId = state.widgetId, overrides = {}) => {
      const widget = widgetMap.get(widgetId);
      if (!widget) throw new RangeError(`未知组件：${widgetId}`);
      const family = getFamily(overrides.family || state.family);
      const appearance = overrides.appearance || state.appearance;
      if (!validAppearances.has(appearance)) throw new RangeError(`未知外观：${appearance}`);

      const body = await widget.render({
        family,
        appearance,
        now: overrides.now instanceof Date ? overrides.now : new Date(),
        utils: Object.freeze({ escapeHTML, clamp, formatCompactNumber }),
      });
      if (typeof body !== 'string') throw new TypeError(`组件 ${widgetId} 必须返回 HTML 字符串`);

      const familyClass = family.group === 'accessory' ? ' is-accessory' : '';
      return [
        `<article class="sp-widget is-${appearance}${familyClass}"`,
        ` data-widget-id="${widget.id}" data-family="${family.id}"`,
        ` aria-label="${escapeHTML(widget.name)} ${escapeHTML(family.label)}"`,
        ` style="--widget-width:${family.width}px;--widget-height:${family.height}px">`,
        body,
        '</article>',
      ].join('');
    };

    return Object.freeze({
      getState,
      update,
      subscribe,
      render,
      getWidgets: () => [...normalizedWidgets],
      getWidget: (widgetId) => widgetMap.get(widgetId) || null,
    });
  };

  global.ScriptablePreviewCore = Object.freeze({
    families: Object.freeze(families),
    getFamily,
    calculatePreviewScale,
    createPreviewEngine,
    utils: Object.freeze({ escapeHTML, clamp, formatCompactNumber }),
  });
})(globalThis);
