/**
 * 文本测量与多行断行模块（M1+）。
 *
 * 为二维提议-应答布局引擎（preview/layout.js）与 DrawContext 多行绘制提供统一文本度量：
 * - 浏览器：离屏 canvas 的 measureText，使用与渲染器一致的字族回退链；
 * - Node/无 DOM：按字符宽度表近似（CJK ≈ 1em、ASCII ≈ 0.55em），供测试与 SSR 兜底；
 * - 支持显式换行（\n）、CJK 逐字 / 拉丁按词断行、lineLimit 与 minimumScaleFactor 联合求解。
 */
(function initializeScriptablePreviewMeasure(global) {
  'use strict';

  // 与渲染器共用的字族回退链（SF Pro 系 → Web 可用字体）。
  // 修改时须与 runtime.js 的 fontStyles 保持一致（runtime 直接复用此函数）。
  const fontCSSFamily = (font) => {
    if (!font) return "-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
    if (font.name) return `'${String(font.name).replaceAll("'", '')}',-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif`;
    if (font.family === 'monospace') return "ui-monospace,'SFMono-Regular',Menlo,Monaco,Consolas,monospace";
    if (font.family === 'rounded') return "ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
    return "-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif";
  };

  // 与 .sp-text 的继承字号、行高比一致
  const DEFAULT_FONT_SIZE = 15;
  const LINE_HEIGHT_RATIO = 1.16;
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

  const lineHeight = (font) => normalizeFont(font).size * LINE_HEIGHT_RATIO;

  // 无 DOM 环境的近似测量：CJK/全角按 1em，其余按 0.55em（SF Pro 平均），
  // 粗体加 3% 宽度系数。
  const approximateWidth = (text, font) => {
    const normalized = normalizeFont(font);
    let width = 0;
    for (const char of String(text)) {
      width += (char.codePointAt(0) > 0x2e7f ? 1 : 0.55) * normalized.size;
    }
    if (normalized.weight >= 600) width *= 1.03;
    return width;
  };

  const isWideCodePoint = (cp) => cp > 0x2e7f;

  // 将单段不含 \n 的文本切分为断行原子：拉丁连续词、空白段、以及逐个 CJK/全角字符。
  const tokenizeParagraph = (paragraph) => {
    const tokens = [];
    let buffer = '';
    let bufferKind = null;
    const flush = () => {
      if (buffer) {
        tokens.push(buffer);
        buffer = '';
        bufferKind = null;
      }
    };
    for (const char of Array.from(paragraph)) {
      const cp = char.codePointAt(0);
      const isSpace = /\s/.test(char);
      if (isWideCodePoint(cp)) {
        flush();
        tokens.push(char);
      } else if (isSpace) {
        if (bufferKind !== 'space') flush();
        buffer += char;
        bufferKind = 'space';
      } else {
        if (bufferKind !== 'word') flush();
        buffer += char;
        bufferKind = 'word';
        if (char === '-' || char === '/' || char === '·') flush();
      }
    }
    flush();
    return tokens;
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

    const wrapText = (text, font, maxWidth = Infinity, { lineLimit = Infinity, singleLine = false } = {}) => {
      const raw = String(text ?? '');
      const normalized = normalizeFont(font);
      const lh = normalized.size * LINE_HEIGHT_RATIO;
      const limit = Number(lineLimit) > 0 ? Number(lineLimit) : Infinity;

      if (singleLine) {
        const single = raw.replace(/\r?\n/g, ' ');
        const width = Math.max(0, measure(single, normalized));
        const truncated = Number.isFinite(maxWidth) && width > maxWidth + 0.01;
        return {
          lines: [single],
          width: Number.isFinite(maxWidth) ? Math.min(width, maxWidth) : width,
          idealWidth: width,
          height: lh,
          truncated,
        };
      }

      const paragraphs = raw.split(/\r?\n/);
      const allLines = [];

      for (const paragraph of paragraphs) {
        if (!paragraph) {
          allLines.push('');
          continue;
        }
        if (!Number.isFinite(maxWidth)) {
          allLines.push(paragraph);
          continue;
        }
        const tokens = tokenizeParagraph(paragraph);
        let current = '';
        let currentWidth = 0;

        for (const token of tokens) {
          const isSpaceToken = /^\s+$/.test(token);
          if (!current && isSpaceToken) continue;

          const candidate = current + token;
          const candidateWidth = measure(candidate, normalized);
          if (candidateWidth <= maxWidth + 0.01) {
            current = candidate;
            currentWidth = candidateWidth;
            continue;
          }

          if (current) {
            allLines.push(current.trimEnd());
            current = '';
            currentWidth = 0;
            if (isSpaceToken) continue;
          }

          const tokenWidth = measure(token, normalized);
          if (tokenWidth <= maxWidth + 0.01) {
            current = token;
            currentWidth = tokenWidth;
          } else {
            // 单个超长词按字素硬折
            let piece = '';
            for (const ch of Array.from(token)) {
              const nextPiece = piece + ch;
              if (piece && measure(nextPiece, normalized) > maxWidth + 0.01) {
                allLines.push(piece);
                piece = ch;
              } else {
                piece = nextPiece;
              }
            }
            current = piece;
            currentWidth = measure(piece, normalized);
          }
        }
        if (current || tokens.length === 0) {
          allLines.push(current.trimEnd());
        }
      }

      if (allLines.length === 0) allLines.push('');
      const truncated = allLines.length > limit;
      const lines = truncated ? allLines.slice(0, limit) : allLines;
      let maxLineWidth = 0;
      for (const line of lines) {
        const w = Math.max(0, measure(line, normalized));
        if (w > maxLineWidth) maxLineWidth = w;
      }
      const clampedWidth = Number.isFinite(maxWidth) ? Math.min(maxLineWidth, maxWidth) : maxLineWidth;
      return {
        lines,
        width: clampedWidth,
        idealWidth: maxLineWidth,
        height: lines.length * lh,
        truncated: truncated || (Number.isFinite(maxWidth) && maxLineWidth > maxWidth + 0.01),
      };
    };

    const measureTextBlock = (
      text,
      font,
      { maxWidth = Infinity, lineLimit = Infinity, minimumScaleFactor = null, singleLine = false } = {}
    ) => {
      const normalized = normalizeFont(font);
      const baseResult = wrapText(text, normalized, maxWidth, { lineLimit, singleLine });
      const factor = Number(minimumScaleFactor);
      const canScale = Number.isFinite(factor) && factor > 0 && factor < 1 && Number.isFinite(maxWidth);

      if (!canScale || !baseResult.truncated) {
        return { ...baseResult, fontSize: normalized.size, scaled: false };
      }

      const minSize = normalized.size * factor;
      const evalAt = (size) =>
        wrapText(text, { ...normalized, size }, maxWidth, { lineLimit, singleLine });

      const minResult = evalAt(minSize);
      if (minResult.truncated) {
        return { ...minResult, fontSize: minSize, scaled: true };
      }

      let low = minSize;
      let high = normalized.size;
      let best = minResult;
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const mid = (low + high) / 2;
        const result = evalAt(mid);
        if (!result.truncated) {
          low = mid;
          best = result;
        } else {
          high = mid;
        }
      }
      return { ...best, fontSize: low, scaled: true };
    };

    return Object.freeze({
      measure,
      wrapText,
      measureTextBlock,
      lineHeight,
      isApproximate: !context,
      clearCache: () => cache.clear(),
    });
  };

  global.ScriptablePreviewMeasure = Object.freeze({
    createMeasurer,
    fontCSSFamily,
    lineHeight,
    DEFAULT_FONT_SIZE,
    LINE_HEIGHT_RATIO,
  });
})(globalThis);
