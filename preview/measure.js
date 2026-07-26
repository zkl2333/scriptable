/**
 * 文本测量模块（M1）。
 *
 * 为布局算法（提议-应答，见 docs/web-renderer-plan.md M2）提供文本宽度测量：
 * - 浏览器：离屏 canvas 的 measureText，使用与渲染器一致的字族回退链；
 * - Node/无 DOM：按字符宽度表近似（CJK ≈ 1em、ASCII ≈ 0.55em），
 *   仅供测试与 SSR 场景兜底，isApproximate 会标记。
 *
 * 测量结果按 (字体, 文本) 缓存，重复布局计算不产生重复测量。
 */
(function initializeScriptablePreviewMeasure(global) {
  'use strict';

  // 与渲染器共用的字族回退链（SF Pro 系 → Web 可用字体）。
  // 修改时须与 runtime.js 的 fontStyles 保持一致（runtime 直接复用此函数）。
  const fontCSSFamily = (font) => {
    if (!font) return "-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
    if (font.name) return `'${String(font.name).replaceAll("'", '')}',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`;
    if (font.family === 'monospace') return "ui-monospace,'SFMono-Regular',Menlo,Monaco,Consolas,monospace";
    if (font.family === 'rounded') return "ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    return "-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
  };

  // 与 .sp-text 的继承字号一致（styles.css body 15px）
  const DEFAULT_FONT_SIZE = 15;
  const DEFAULT_FONT = Object.freeze({
    family: 'system',
    size: DEFAULT_FONT_SIZE,
    weight: 400,
    style: 'normal',
    name: null,
  });

  const normalizeFont = (font) => ({
    family: font?.family || DEFAULT_FONT.family,
    size: Number(font?.size) > 0 ? Number(font.size) : DEFAULT_FONT_SIZE,
    weight: Number(font?.weight) > 0 ? Number(font.weight) : 400,
    style: font?.style === 'italic' ? 'italic' : 'normal',
    name: font?.name || null,
  });

  const fontKey = (font) => {
    const normalized = normalizeFont(font);
    return `${normalized.family}|${normalized.name || ''}|${normalized.size}|${normalized.weight}|${normalized.style}`;
  };

  // 无 DOM 环境的近似测量：CJK/全角按 1em，其余按 0.55em（SF Pro 平均），
  // 粗体加 3% 宽度系数。明显偏粗，仅用于测试兜底。
  const approximateWidth = (text, font) => {
    const normalized = normalizeFont(font);
    let width = 0;
    for (const char of String(text)) {
      width += (char.codePointAt(0) > 0x2e7f ? 1 : 0.55) * normalized.size;
    }
    if (normalized.weight >= 600) width *= 1.03;
    return width;
  };

  const createMeasurer = () => {
    const cache = new Map();
    let context = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        context = document.createElement('canvas').getContext('2d');
      } catch {
        context = null;
      }
    }

    const canvasWidth = (text, font) => {
      const normalized = normalizeFont(font);
      context.font = `${normalized.style === 'italic' ? 'italic ' : ''}${normalized.weight} ${normalized.size}px ${fontCSSFamily(normalized)}`;
      return context.measureText(String(text)).width;
    };

    const measure = (text, font) => {
      const key = `${fontKey(font)}::${String(text)}`;
      if (!cache.has(key)) {
        cache.set(key, context ? canvasWidth(text, font) : approximateWidth(text, font));
      }
      return cache.get(key);
    };

    return Object.freeze({
      measure,
      isApproximate: !context,
      clearCache: () => cache.clear(),
    });
  };

  global.ScriptablePreviewMeasure = Object.freeze({
    createMeasurer,
    fontCSSFamily,
    DEFAULT_FONT_SIZE,
  });
})(globalThis);
