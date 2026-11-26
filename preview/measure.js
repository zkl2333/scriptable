/**
 * 文本测量与多行断行模块（M1+ / M6 iOS 27.2 真机度量定标）。
 *
 * 为二维提议-应答布局引擎（preview/layout.js）与 DrawContext 多行绘制提供统一文本度量：
 * - 浏览器：离屏 canvas 的 measureText，使用与渲染器一致的字族回退链；
 * - Node/无 DOM：使用由 iOS 27.2 模拟器 CoreText/SwiftUI 实测提取的 SF Pro / SF Rounded / SF Mono / PingFang SC
 *   精确字符宽度表（与 preview/font-metrics.json 同源），含 20pt 光学字号切换与 CJK-拉丁自动间距；
 * - 支持显式换行（\n）、CJK 逐字 / 拉丁按词断行、lineLimit 与 minimumScaleFactor（宽高双轴）联合求解。
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

  // 由 iOS 27.2 Simulator CoreText/UIFont 实测定标（1222/1024 ≈ 1.1934，全字重全字族一致）
  const DEFAULT_FONT_SIZE = 15;
  const LINE_HEIGHT_RATIO = 1.1934;
  const DEFAULT_FONT = Object.freeze({
    family: 'system',
    size: DEFAULT_FONT_SIZE,
    weight: 400,
    style: 'normal',
    name: null,
  });

  // 同步自 preview/font-metrics.json（单位：0.0001 em）
  const FONT_METRICS = {"asciiStart":32,"displayThreshold":20,"cjkWideEm":{"text":0.9922,"display":0.9577},"cjkLatinGapEm":0.125,"monospaceAsciiEm":0.6182,"ascii":{"system_text_400":[2656,2954,4619,6143,6143,9097,6958,2813,3662,3662,4561,6143,2813,4561,2813,2891,6143,4482,5879,6113,6279,6025,6211,5713,6230,6211,2813,2813,6143,6143,6143,4971,9023,6582,6416,7002,7109,5801,5566,7310,7266,2520,5225,6431,5522,8584,7266,7559,6196,7559,6377,6216,6182,7217,6582,9521,6631,6396,6460,3327,2891,3327,6143,5327,4844,5361,5986,5439,5986,5557,3462,5938,5728,2314,2310,5273,2373,8545,5679,5752,5947,5938,3740,4990,3477,5679,5264,7588,5088,5273,5234,3662,2432,3662,6143],"system_text_600":[2508,3240,5197,6405,6405,9796,7167,3134,3959,3959,4641,6405,3134,4641,3134,3079,6489,4785,6129,6379,6555,6311,6508,5936,6580,6508,3134,3134,6405,6405,6405,5252,9081,6953,6645,7163,7241,5966,5726,7396,7525,2841,5624,6751,5693,8790,7430,7653,6439,7653,6637,6455,6349,7362,6882,9784,6952,6730,6548,3488,3079,3488,6405,5604,4844,5601,6221,5616,6221,5744,3782,6165,6004,2568,2565,5643,2639,8938,5955,5934,6179,6179,4056,5262,3817,5955,5522,8049,5444,5617,5408,3959,2688,3959,6405],"system_text_700":[2422,3406,5532,6558,6558,10200,7288,3320,4131,4131,4688,6558,3320,4688,3320,3188,6689,4961,6274,6533,6714,6477,6680,6064,6782,6680,3320,3320,6558,6558,6558,5415,9114,7168,6777,7256,7317,6062,5818,7446,7676,3027,5854,6936,5791,8909,7524,7708,6580,7708,6787,6594,6445,7446,7056,9937,7139,6924,6599,3595,3188,3595,6558,5764,4844,5740,6357,5718,6357,5852,3967,6296,6165,2715,2712,5857,2793,9165,6116,6040,6313,6318,4238,5420,4014,6116,5671,8315,5649,5815,5508,4131,2837,4131,6558],"system_display_400":[2219,2776,4197,6120,6120,8323,6796,2646,3360,3360,4163,6120,2327,4395,2327,2868,6136,4500,5757,6011,6145,5939,6237,5571,6096,6237,2327,2327,6120,6120,6120,4964,8853,6452,6170,6944,6903,5631,5388,7168,7100,2354,5059,6141,5352,8418,7100,7417,5910,7417,6119,6042,5936,7067,6416,9347,6457,6230,6278,3295,2868,3295,6120,5229,5029,5139,5676,5146,5676,5259,3172,5628,5510,2164,2156,4988,2159,8183,5401,5446,5633,5628,3259,4772,3155,5401,4966,7290,4814,4996,4837,3360,2266,3360,6120],"system_display_600":[2154,3085,4607,6344,6388,8876,7003,2823,3723,3723,4499,6388,2519,4472,2519,3024,6455,4745,5995,6256,6418,6199,6472,5742,6415,6472,2519,2519,6388,6388,6388,5246,8931,6814,6394,7108,7037,5768,5522,7288,7304,2619,5456,6471,5480,8611,7208,7542,6161,7541,6379,6281,6072,7151,6716,9610,6777,6564,6367,3456,3024,3456,6457,5534,5029,5417,5942,5404,5936,5514,3500,5898,5794,2390,2384,5327,2405,8566,5705,5697,5903,5898,3604,5077,3496,5705,5281,7761,5186,5364,5062,3723,2446,3723,6388],"system_display_700":[2116,3264,4845,6474,6543,9195,7124,2925,3933,3933,4693,6543,2631,4517,2631,3114,6639,4887,6132,6397,6576,6349,6608,5841,6600,6608,2631,2631,6543,6543,6543,5409,8976,7024,6523,7204,7115,5848,5600,7358,7422,2773,5686,6662,5553,8723,7271,7615,6306,7613,6529,6420,6151,7200,6890,9763,6963,6758,6419,3563,3114,3563,6651,5710,5029,5578,6096,5554,6086,5662,3689,6054,5959,2521,2516,5523,2547,8787,5882,5842,6060,6054,3805,5254,3694,5882,5463,8034,5402,5578,5192,3933,2551,3933,6543],"rounded_text_400":[2344,2959,4233,6338,6338,8096,6982,2393,3516,3516,4297,6338,2832,4580,2832,3516,6357,4727,5952,6211,6338,6143,6279,5762,6284,6279,2832,2832,6338,6338,6338,5186,9038,6602,6338,7153,7075,5815,5571,7358,7285,2539,5244,6445,5537,8604,7285,7607,6069,7607,6284,6230,6104,7256,6602,9531,6641,6416,6460,3516,3516,3516,4297,4336,5200,5313,5835,5303,5830,5415,3330,5786,5684,2334,2334,5146,2334,8325,5562,5601,5786,5786,3374,4946,3306,5562,5122,7446,4985,5151,4971,3516,3516,3516,6338],"rounded_text_600":[2297,3274,4653,6554,6608,8752,7190,2546,3894,3894,4691,6608,2984,4662,2984,3894,6670,4959,6188,6452,6611,6397,6560,5922,6623,6573,2984,2984,6608,6608,6608,5468,9096,6977,6561,7321,7212,5947,5700,7487,7478,2794,5643,6733,5655,8807,7381,7741,6322,7739,6545,6470,6234,7327,6903,9795,6962,6751,6550,3894,3894,3894,4691,4426,5216,5600,6107,5581,6096,5687,3661,6066,5971,2561,2561,5480,2576,8707,5874,5868,6066,6066,3728,5261,3649,5874,5448,7921,5356,5557,5208,3894,3894,3894,6608],"rounded_display_400":[2197,2813,4087,6191,6191,7949,6836,2246,3369,3369,4150,6191,2686,4434,2686,3369,6211,4580,5806,6064,6191,5996,6133,5615,6138,6133,2686,2686,6191,6191,6191,5039,8892,6455,6191,7007,6929,5669,5425,7212,7139,2393,5098,6299,5391,8457,7139,7461,5923,7461,6138,6084,5957,7109,6455,9385,6494,6270,6313,3369,3369,3369,4150,4189,5054,5166,5688,5156,5684,5269,3184,5640,5537,2188,2188,5000,2188,8179,5415,5454,5640,5640,3228,4800,3159,5415,4976,7300,4839,5005,4824,3369,3369,3369,6191],"rounded_display_600":[2151,3128,4506,6407,6462,8606,7044,2400,3748,3748,4545,6462,2838,4516,2838,3748,6523,4813,6042,6305,6465,6251,6414,5775,6476,6426,2838,2838,6462,6462,6462,5322,8949,6831,6415,7175,7065,5801,5554,7341,7331,2647,5497,6586,5509,8660,7235,7594,6176,7593,6399,6323,6087,7181,6756,9649,6816,6605,6404,3748,3748,3748,4545,4280,5069,5453,5960,5434,5949,5540,3514,5919,5824,2414,2414,5334,2430,8561,5727,5721,5919,5919,3582,5115,3502,5727,5302,7775,5210,5410,5062,3748,3748,3748,6462]},"extra":{"system_text_400":{"…":7891,"·":4791,"—":8678,"–":5679,"•":4561,"°":4561,"×":6143,"，":6284,"。":6538,"、":6503,"：":5680,"；":5732,"！":5680,"？":7054,"（":7282,"）":7264,"【":7322,"】":7303,"「":7331,"」":7312,"“":7048,"”":6940,"‘":5151,"’":5063},"system_text_600":{"…":8837,"·":4791,"—":8883,"–":5955,"•":4641,"°":4641,"×":6405,"，":6337,"。":6608,"、":6590,"：":5794,"；":5829,"！":5794,"？":7107,"（":7307,"）":7288,"【":7333,"】":7314,"「":7340,"」":7320,"“":7457,"”":7349,"‘":5470,"’":5384},"system_text_700":{"…":9385,"·":4791,"—":9002,"–":6116,"•":4688,"°":4688,"×":6558,"，":6398,"。":6652,"、":6625,"：":5864,"；":5890,"！":5864,"？":7142,"（":7323,"）":7305,"【":7340,"】":7320,"「":7345,"」":7326,"“":7729,"”":7621,"‘":5655,"’":5570},"system_display_400":{"…":6334,"·":4759,"—":8400,"–":5401,"•":4395,"°":4163,"×":6120,"，":6082,"。":6336,"、":6302,"：":5515,"；":5549,"！":5515,"？":6826,"（":7055,"）":7044,"【":7091,"】":7079,"「":7100,"」":7089,"“":7016,"”":6908,"‘":4480,"’":4361},"system_display_600":{"…":6966,"·":4759,"—":8593,"–":5705,"•":4472,"°":4499,"×":6388,"，":6141,"。":6403,"、":6386,"：":5617,"；":5650,"！":5625,"？":6885,"（":7079,"）":7068,"【":7102,"】":7090,"「":7108,"」":7096,"“":7425,"”":7317,"‘":4743,"’":4622},"system_display_700":{"…":7331,"·":4759,"—":8705,"–":5882,"•":4517,"°":4693,"×":6543,"，":6209,"。":6445,"、":6420,"：":5693,"；":5710,"！":5693,"？":6919,"（":7095,"）":7084,"【":7109,"】":7097,"「":7114,"」":7102,"“":7697,"”":7588,"‘":4896,"’":4773},"rounded_text_400":{"…":7686,"·":2832,"—":10293,"–":5293,"•":4297,"°":4297,"×":6338,"，":6284,"。":6538,"、":6503,"：":5680,"；":5732,"！":5680,"？":7054,"（":7282,"）":7264,"【":7322,"】":7303,"「":7331,"」":7312,"“":6893,"”":6801,"‘":4999,"’":4906},"rounded_text_600":{"…":8154,"·":3180,"—":10293,"–":5293,"•":4607,"°":4691,"×":6608,"，":6337,"。":6608,"、":6590,"：":5794,"；":5829,"！":5794,"？":7107,"（":7307,"）":7288,"【":7333,"】":7314,"「":7340,"」":7320,"“":7397,"”":7307,"‘":5257,"’":5162},"rounded_display_400":{"…":7539,"·":2686,"—":10146,"–":5146,"•":4150,"°":4150,"×":6191,"，":6082,"。":6336,"、":6302,"：":5515,"；":5549,"！":5515,"？":6826,"（":7055,"）":7044,"【":7091,"】":7079,"「":7100,"」":7089,"“":6747,"”":6654,"‘":4852,"’":4760},"rounded_display_600":{"…":8008,"·":3033,"—":10146,"–":5146,"•":4461,"°":4545,"×":6462,"，":6141,"。":6403,"、":6386,"：":5617,"；":5650,"！":5625,"？":6885,"（":7079,"）":7068,"【":7102,"】":7090,"「":7108,"」":7096,"“":7251,"”":7160,"‘":5110,"’":5016}}};

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
  const isEmojiOrPictograph = (cp) => cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf);
  const SYMBOL_EM_FALLBACK = {
    '●': 0.95,
    '▸': 0.65,
    '↑': 0.62,
    '↓': 0.62,
    '→': 0.85,
    '←': 0.85,
  };
  const isWideCodePoint = (cp) => cp > 0x2e7f;
  const isAsciiAlnum = (ch) => /[A-Za-z0-9+]/.test(ch);

  const selectMetricsBucket = (normalized) => {
    const isDisplay = normalized.size >= FONT_METRICS.displayThreshold;
    const scaleName = isDisplay ? 'display' : 'text';
    if (normalized.family === 'rounded') {
      return normalized.weight >= 600 ? `rounded_${scaleName}_600` : `rounded_${scaleName}_400`;
    }
    if (normalized.family === 'monospace') {
      return `system_${scaleName}_400`;
    }
    if (normalized.weight >= 700) return `system_${scaleName}_700`;
    if (normalized.weight >= 600) return `system_${scaleName}_600`;
    return `system_${scaleName}_400`;
  };

  // 无 DOM 环境的精确测量：基于 iOS 27.2 CoreText 实测 em 宽表 + 20pt 光学字号切换 + CJK-拉丁自动间距
  const approximateWidth = (text, font) => {
    const normalized = normalizeFont(font);
    const isDisplay = normalized.size >= FONT_METRICS.displayThreshold;
    const isMono = normalized.family === 'monospace';
    const bucket = selectMetricsBucket(normalized);
    const asciiTable = FONT_METRICS.ascii[bucket];
    const extraTable = FONT_METRICS.extra[bucket];
    const fallbackWide = isDisplay ? FONT_METRICS.cjkWideEm.display : FONT_METRICS.cjkWideEm.text;
    const fallbackAscii = isMono ? FONT_METRICS.monospaceAsciiEm : (normalized.weight >= 600 ? 0.56 : 0.54);
    const mediumBoost = (!isMono && normalized.weight >= 500 && normalized.weight < 600) ? 1.015 : 1;
    const chars = Array.from(String(text ?? ''));
    let width = 0;

    for (let i = 0; i < chars.length; i += 1) {
      const char = chars[i];
      const cp = char.codePointAt(0);
      if (isMono && cp >= 32 && cp <= 126) {
        width += FONT_METRICS.monospaceAsciiEm * normalized.size;
      } else if (cp >= 32 && cp <= 126) {
        width += (asciiTable[cp - FONT_METRICS.asciiStart] / 10000) * normalized.size * mediumBoost;
      } else if (extraTable[char] != null) {
        const w = (extraTable[char] / 10000) * normalized.size;
        width += isWideCodePoint(cp) ? w : w * mediumBoost;
      } else if (SYMBOL_EM_FALLBACK[char] != null) {
        width += SYMBOL_EM_FALLBACK[char] * normalized.size;
      } else if (isEmojiOrPictograph(cp)) {
        width += 1.25 * normalized.size;
      } else if (isWideCodePoint(cp)) {
        width += fallbackWide * normalized.size;
      } else {
        width += fallbackAscii * normalized.size * mediumBoost;
      }

      if (i > 0) {
        const prev = chars[i - 1];
        const prevWide = isWideCodePoint(prev.codePointAt(0));
        const currWide = isWideCodePoint(cp);
        if ((prevWide && isAsciiAlnum(char)) || (currWide && isAsciiAlnum(prev))) {
          width += FONT_METRICS.cjkLatinGapEm * normalized.size;
        }
      }
    }
    return width;
  };

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

    const truncateText = (text, font, maxWidth) => {
      const raw = String(text ?? '').replace(/\r?\n/g, ' ');
      const normalized = normalizeFont(font);
      const fullWidth = Math.max(0, measure(raw, normalized));
      if (!Number.isFinite(maxWidth) || fullWidth <= maxWidth + 0.01) {
        return { text: raw, width: fullWidth, truncated: false };
      }
      const ellipsisWidth = Math.max(0, measure('…', normalized));
      if (maxWidth < ellipsisWidth - 0.01) {
        return { text: '…', width: Math.max(0, maxWidth), truncated: true };
      }
      const chars = Array.from(raw);
      let low = 0;
      let high = chars.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = chars.slice(0, mid).join('').trimEnd() + '…';
        if (measure(candidate, normalized) <= maxWidth + 0.01) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      const bestText = chars.slice(0, low).join('').trimEnd() + '…';
      return {
        text: bestText,
        width: Math.min(maxWidth, Math.max(0, measure(bestText, normalized))),
        truncated: true,
      };
    };

    const wrapText = (text, font, maxWidth = Infinity, { lineLimit = Infinity, singleLine = false } = {}) => {
      const raw = String(text ?? '');
      const normalized = normalizeFont(font);
      const lh = normalized.size * LINE_HEIGHT_RATIO;
      const limit = Number(lineLimit) > 0 ? Number(lineLimit) : Infinity;

      if (singleLine) {
        const single = raw.replace(/\r?\n/g, ' ');
        const idealWidth = Math.max(0, measure(single, normalized));
        const truncatedInfo = truncateText(single, normalized, maxWidth);
        return {
          lines: [truncatedInfo.truncated ? truncatedInfo.text : single],
          width: truncatedInfo.width,
          idealWidth,
          height: lh,
          truncated: truncatedInfo.truncated,
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

        for (const token of tokens) {
          const isSpaceToken = /^\s+$/.test(token);
          if (!current && isSpaceToken) continue;

          const candidate = current + token;
          const candidateWidth = measure(candidate, normalized);
          if (candidateWidth <= maxWidth + 0.01) {
            current = candidate;
            continue;
          }

          if (current) {
            allLines.push(current.trimEnd());
            current = '';
            if (isSpaceToken) continue;
          }

          const tokenWidth = measure(token, normalized);
          if (tokenWidth <= maxWidth + 0.01) {
            current = token;
          } else {
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
      { maxWidth = Infinity, maxHeight = Infinity, lineLimit = Infinity, minimumScaleFactor = null, singleLine = false } = {}
    ) => {
      const normalized = normalizeFont(font);
      const baseResult = wrapText(text, normalized, maxWidth, { lineLimit, singleLine });
      const factor = Number(minimumScaleFactor);
      const fits = (res) => !res.truncated && (!Number.isFinite(maxHeight) || res.height <= maxHeight + 0.01);
      const canScale = Number.isFinite(factor) && factor > 0 && factor < 1
        && (Number.isFinite(maxWidth) || Number.isFinite(maxHeight));

      if (!canScale || fits(baseResult)) {
        return { ...baseResult, fontSize: normalized.size, scaled: false };
      }

      const minSize = normalized.size * factor;
      const evalAt = (size) =>
        wrapText(text, { ...normalized, size }, maxWidth, { lineLimit, singleLine });

      const minResult = evalAt(minSize);
      if (!fits(minResult)) {
        return { ...minResult, fontSize: minSize, scaled: true };
      }

      let low = minSize;
      let high = normalized.size;
      let best = minResult;
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const mid = (low + high) / 2;
        const result = evalAt(mid);
        if (fits(result)) {
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
      truncateText,
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
    FONT_METRICS,
  });
})(globalThis);
