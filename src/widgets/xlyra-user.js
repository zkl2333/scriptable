import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';

// ==========================================
// XLYRA · 用户组件
// 原始管理员版本：zkl2333
// 用户版二次开发：anlostyle（经授权合入本仓库）
// 数据源：xLyra Portal API (/v1/portal/*)
// ==========================================

var CONFIG = {
  baseURL: "",
  timeoutMs: 8e3,
  autoUpdate: true,
  version: "1.1.1"
};
var KC_URL = "xlyra-user.baseURL";
var KC_KEY = "xlyra-user.apiKey";
const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
if (CONFIG.autoUpdate && !(config.runsInApp && config.runsInActionExtension)) {
  await updater.autoUpdate();
}
var dyn = (light, dark) => Color.dynamic(light, dark);
var C = {
  bg: dyn(new Color("#efece4"), new Color("#0b0b0b")),
  panel: dyn(new Color("#f8f6f0"), new Color("#131310")),
  grid: new Color("#808080", 0.22),
  line: dyn(new Color("#14100e"), new Color("#3a3a3a")),
  fg: dyn(new Color("#16130f"), new Color("#e8e6e1")),
  dim: dyn(new Color("#6f6a5e"), new Color("#8a877e")),
  amber: dyn(new Color("#b45309"), new Color("#ffb224")),
  green: dyn(new Color("#0a7d4e"), new Color("#3dd68c")),
  red: dyn(new Color("#c2242a"), new Color("#f2555a")),
  yellow: dyn(new Color("#8a6d00"), new Color("#ffd60a")),
  led: new Color("#d97706"),
  ledDim: new Color("#d97706", 0.14)
};
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var PREVIEW_FAMILIES = [
  "small",
  "medium",
  "large",
  "extraLarge",
  ...ACCESSORY_FAMILIES
];
var ACCESSORY_COLOR = dyn(new Color("#111111"), new Color("#FFFFFF"));
var ACCESSORY_SECONDARY = dyn(
  new Color("#111111", 0.62),
  new Color("#FFFFFF", 0.68)
);
var monoFont = typeof Font.regularMonospacedSystemFont === "function" ? (size, weight) => weight === "bold" ? Font.boldMonospacedSystemFont(size) : Font.regularMonospacedSystemFont(size) : (size, weight) => {
  try {
    return new Font(weight === "bold" ? "Menlo-Bold" : "Menlo", size);
  } catch {
    return weight === "bold" ? Font.boldSystemFont(size) : Font.regularSystemFont(size);
  }
};
var MONO = monoFont(9, "regular");
var MONO_B = monoFont(9, "bold");
var MONO_SM = monoFont(8, "regular");
var LED_FONT = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."]
};
function ledImage(text, { dot = 2, gap = 1, pad = 2, chr = dot + gap } = {}) {
  const glyphs = [...String(text)].map((char) => LED_FONT[char] || LED_FONT[" "]);
  const cellWidth = 5 * dot + 4 * gap + chr;
  const width = Math.ceil(glyphs.length * cellWidth - chr + pad * 2);
  const height = Math.ceil(7 * (dot + gap) - gap + pad * 2);
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  glyphs.forEach((glyph, index) => {
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 5; column++) {
        ctx.setFillColor(glyph[row][column] === "#" ? C.led : C.ledDim);
        ctx.fillRect(
          new Rect(
            pad + index * cellWidth + column * (dot + gap),
            pad + row * (dot + gap),
            dot,
            dot
          )
        );
      }
    }
  });
  return { image: ctx.getImage(), width, height };
}
function addLed(parent, text, options, maxWidth) {
  const led = ledImage(text, options);
  const image = parent.addImage(led.image);
  const scale = maxWidth && led.width > maxWidth ? maxWidth / led.width : 1;
  image.imageSize = new Size(
    Math.round(led.width * scale),
    Math.round(led.height * scale)
  );
}
function dotGrid(family) {
  const [width, height] = family === "small" ? [180, 180] : family === "medium" ? [380, 180] : [380, 400];
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(C.grid);
  for (let y = 5; y < height; y += 9) {
    for (let x = 5; x < width; x += 9) {
      ctx.fillRect(new Rect(x, y, 1.3, 1.3));
    }
  }
  return ctx.getImage();
}
function brandRow(widget, time) {
  const row = widget.addStack();
  row.centerAlignContent();
  const mark = row.addText("▪");
  mark.font = MONO_B;
  mark.textColor = C.amber;
  row.addSpacer(5);
  const brand = row.addText("XLYRA // 用户");
  brand.font = MONO_B;
  brand.textColor = C.fg;
  row.addSpacer();
  const clock = row.addText(time);
  clock.font = MONO_SM;
  clock.textColor = C.dim;
}
function dash(widget) {
  const text = widget.addText("-".repeat(30));
  text.font = MONO_SM;
  text.textColor = C.line;
  text.lineLimit = 1;
}
function metricCell(parent, label, value, color = C.fg) {
  const cell = parent.addStack();
  cell.layoutVertically();
  cell.borderWidth = 1;
  cell.borderColor = C.line;
  cell.backgroundColor = C.panel;
  cell.setPadding(5, 7, 5, 7);
  const title = cell.addText(label);
  title.font = MONO_SM;
  title.textColor = C.dim;
  cell.addSpacer(3);
  const text = cell.addText(String(value));
  text.font = monoFont(13, "bold");
  text.textColor = color;
  text.minimumScaleFactor = 0.55;
  text.lineLimit = 1;
}
function primaryQuota(data) {
  const quota = data.overview.quota || {};
  const unlimited = quota.unlimited || quota.limit == null || quota.limit <= 0;
  return {
    label: unlimited ? "USED // 累计已用" : "BALANCE // 剩余额度",
    value: unlimited ? number(quota.used) : number(quota.remaining),
    display: compactMoney(unlimited ? quota.used : quota.remaining),
    unlimited
  };
}
function usagePeriods(data) {
  const trend = Array.isArray(data.summary?.trend) ? data.summary.trend : [];
  const today = trend[trend.length - 1] || {};
  const week = trend.slice(-7);
  const sum = (field) => week.reduce((total, item) => total + number(item[field]), 0);
  return {
    available: trend.length > 0,
    weekDays: Math.min(7, trend.length),
    today: {
      requests: number(today.success),
      cost: number(today.cost),
      tokens: number(today.total_tokens)
    },
    week: {
      requests: sum("success"),
      cost: sum("cost"),
      tokens: sum("total_tokens")
    }
  };
}
function primaryUsage(data, usage) {
  const dimensions = data.settings.dimensions || {};
  if (!usage.available) return primaryQuota(data);
  if (dimensions.cost) {
    return {
      label: "TODAY // 今日费用",
      value: usage.today.cost,
      display: compactMoney(usage.today.cost),
      type: "cost"
    };
  }
  if (dimensions.tokens) {
    return {
      label: "TODAY // 今日 TOKENS",
      value: usage.today.tokens,
      display: compact(usage.today.tokens),
      type: "tokens"
    };
  }
  return {
    label: "TODAY // 今日请求",
    value: usage.today.requests,
    display: compact(usage.today.requests),
    type: "requests"
  };
}
function weeklyText(dimensions, usage) {
  if (dimensions.cost) return `$${money(usage.week.cost)}`;
  if (dimensions.tokens) return `${compact(usage.week.tokens)} TOK`;
  return `${compact(usage.week.requests)} 请求`;
}
function primaryText(primary) {
  if (primary.type === "cost") return `$${money(primary.value)}`;
  if (primary.type === "tokens") return `${compact(primary.value)} TOK`;
  if (primary.type === "requests") return `${compact(primary.value)} 请求`;
  return `$${money(primary.value)}`;
}
function renderSmall(widget, data, time) {
  const usage = usagePeriods(data);
  const primary = primaryUsage(data, usage);
  const quota = data.overview.quota || {};
  const active = data.overview.key?.is_active !== false;
  const dimensions = data.settings.dimensions || {};
  brandRow(widget, time);
  widget.addSpacer(8);
  const label = widget.addText(primary.label);
  label.font = MONO_SM;
  label.textColor = C.dim;
  widget.addSpacer(4);
  addLed(widget, primary.display, { dot: 2.2, gap: 0.9 }, 130);
  widget.addSpacer(4);
  const used = widget.addText(
    quota.unlimited ? `本周 ${weeklyText(dimensions, usage)} · 不限额` : `本周 ${weeklyText(dimensions, usage)} · 余额 $${money(quota.remaining)}`
  );
  used.font = MONO_SM;
  used.textColor = C.dim;
  widget.addSpacer(7);
  dash(widget);
  widget.addSpacer(6);
  const row = widget.addStack();
  const statusLabel = row.addText("状态 ");
  statusLabel.font = MONO_SM;
  statusLabel.textColor = C.dim;
  const status = row.addText(active ? "正常" : "停用");
  status.font = MONO_B;
  status.textColor = active ? C.green : C.red;
  row.addSpacer();
  const requestLabel = row.addText("请求 ");
  requestLabel.font = MONO_SM;
  requestLabel.textColor = C.dim;
  const requests = row.addText(compact(usage.today.requests));
  requests.font = MONO_B;
  requests.textColor = C.fg;
  if (usage.available && dimensions.tokens) {
    widget.addSpacer(6);
    const sub = widget.addText(
      `今日 ${compact(usage.today.tokens)} TOK · 本周 ${compact(usage.week.tokens)}`
    );
    sub.font = MONO_SM;
    sub.textColor = C.dim;
    sub.lineLimit = 1;
  }
}
function renderMedium(widget, data, time) {
  const usage = usagePeriods(data);
  const primary = primaryUsage(data, usage);
  const quota = data.overview.quota || {};
  const active = data.overview.key?.is_active !== false;
  const dimensions = data.settings.dimensions || {};
  brandRow(widget, time);
  widget.addSpacer(6);
  const main = widget.addStack();
  main.topAlignContent();
  const left = main.addStack();
  left.layoutVertically();
  left.size = new Size(155, 0);
  const label = left.addText(primary.label);
  label.font = MONO_SM;
  label.textColor = C.dim;
  left.addSpacer(4);
  addLed(left, primary.display, { dot: 2.4, gap: 1 }, 150);
  left.addSpacer(4);
  const note = left.addText(
    dimensions.tokens ? `今日 ${compact(usage.today.tokens)} TOK` : `${compact(usage.today.requests)} 请求`
  );
  note.font = MONO_SM;
  note.textColor = C.dim;
  main.addSpacer(12);
  const right = main.addStack();
  right.layoutVertically();
  const heading = right.addText(
    `WEEK // 最近 ${usage.weekDays} 天`
  );
  heading.font = MONO_SM;
  heading.textColor = C.dim;
  right.addSpacer(5);
  [
    ["请求", compact(usage.week.requests)],
    dimensions.cost ? ["费用", `$${money(usage.week.cost)}`] : null,
    dimensions.tokens ? ["TOKENS", compact(usage.week.tokens)] : null
  ].filter(Boolean).forEach(([labelText, value]) => {
    const row = right.addStack();
    const key = row.addText(labelText);
    key.font = MONO_SM;
    key.textColor = C.dim;
    row.addSpacer();
    const text = row.addText(value);
    text.font = MONO_B;
    text.textColor = C.fg;
    right.addSpacer(4);
  });
  widget.addSpacer();
  const cells = widget.addStack();
  metricCell(
    cells,
    "余额",
    quota.unlimited ? "不限额" : `$${money(quota.remaining)}`,
    quota.unlimited ? C.green : C.fg
  );
  cells.addSpacer();
  metricCell(cells, "已用", `$${money(quota.used)}`);
  cells.addSpacer();
  metricCell(cells, "限额", quota.unlimited ? "∞" : `$${money(quota.limit)}`);
  cells.addSpacer();
  metricCell(cells, "状态", active ? "正常" : "停用", active ? C.green : C.red);
}
function renderLarge(widget, data, time) {
  const usage = usagePeriods(data);
  const primary = primaryUsage(data, usage);
  const quota = data.overview.quota || {};
  const active = data.overview.key?.is_active !== false;
  const dimensions = data.settings.dimensions || {};
  brandRow(widget, time);
  widget.addSpacer(8);
  const label = widget.addText(primary.label);
  label.font = MONO_SM;
  label.textColor = C.dim;
  widget.addSpacer(4);
  const primaryRow = widget.addStack();
  primaryRow.centerAlignContent();
  addLed(primaryRow, primary.display, { dot: 4.2, gap: 1.8 }, 220);
  primaryRow.addSpacer(14);
  const aggregate = primaryRow.addStack();
  aggregate.layoutVertically();
  const limit = aggregate.addText(
    dimensions.cost ? `WEEK $${money(usage.week.cost)}` : `WEEK ${compact(usage.week.requests)} REQUESTS`
  );
  limit.font = MONO_B;
  limit.textColor = C.fg;
  aggregate.addSpacer(4);
  const used = aggregate.addText(
    dimensions.tokens ? `WEEK ${compact(usage.week.tokens)} TOKENS` : `TODAY ${compact(usage.today.requests)} REQUESTS`
  );
  used.font = MONO_SM;
  used.textColor = C.dim;
  aggregate.addSpacer(4);
  const period = aggregate.addText(
    quota.unlimited ? `USED $${money(quota.used)} · UNLIMITED` : `BAL $${money(quota.remaining)} / $${money(quota.limit)}`
  );
  period.font = MONO_SM;
  period.textColor = C.dim;
  widget.addSpacer(10);
  const cells = widget.addStack();
  metricCell(cells, "今日请求", compact(usage.today.requests));
  if (dimensions.tokens) {
    cells.addSpacer();
    metricCell(cells, "今日 TOK", compact(usage.today.tokens));
  }
  cells.addSpacer();
  metricCell(cells, "限额", quota.unlimited ? "∞" : `$${money(quota.limit)}`);
  cells.addSpacer();
  metricCell(cells, "已用", `$${money(quota.used)}`);
  cells.addSpacer();
  metricCell(
    cells,
    "余额",
    quota.unlimited ? "不限额" : `$${money(quota.remaining)}`,
    active ? C.green : C.red
  );
  widget.addSpacer(10);
  const title = widget.addText("▸ REQUESTS // 最近请求");
  title.font = MONO_B;
  title.textColor = C.amber;
  widget.addSpacer(5);
  if (!data.settings.show_requests) {
    const hidden = widget.addText("管理员未开放请求明细");
    hidden.font = MONO_SM;
    hidden.textColor = C.dim;
    return;
  }
  const items = data.requests?.items || [];
  if (!items.length) {
    const empty = widget.addText("暂无请求");
    empty.font = MONO_SM;
    empty.textColor = C.dim;
    return;
  }
  for (const item of items.slice(0, 6)) {
    const row = widget.addStack();
    row.centerAlignContent();
    const dot = row.addText(item.success ? "●" : "○");
    dot.font = MONO_SM;
    dot.textColor = item.success ? C.green : C.red;
    row.addSpacer(6);
    const name = row.addText(requestName(item, dimensions));
    name.font = MONO;
    name.textColor = C.fg;
    name.lineLimit = 1;
    name.minimumScaleFactor = 0.7;
    row.addSpacer();
    const detail = row.addText(requestDetail(item, dimensions));
    detail.font = MONO_SM;
    detail.textColor = item.success ? C.dim : C.red;
    detail.lineLimit = 1;
    widget.addSpacer(4);
  }
}
function renderAccessory(widget, family, data) {
  const usage = usagePeriods(data);
  const primary = primaryUsage(data, usage);
  const quota = data.overview.quota || {};
  const active = data.overview.key?.is_active !== false;
  const dimensions = data.settings.dimensions || {};
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(
      `XLYRA · 今日 ${primaryText(primary)} · 本周 ${weeklyText(dimensions, usage)}`
    );
    text.font = Font.semiboldSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.68;
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const label = widget.addText("今日");
    label.font = Font.mediumSystemFont(9);
    label.textColor = ACCESSORY_SECONDARY;
    label.centerAlignText();
    const amount2 = primary.type === "cost" ? `$${compactMoney(primary.value)}` : compact(primary.value);
    const value = widget.addText(amount2);
    value.font = Font.boldRoundedSystemFont(amount2.length > 6 ? 10 : 14);
    value.textColor = ACCESSORY_COLOR;
    value.centerAlignText();
    value.lineLimit = 1;
    value.minimumScaleFactor = 0.62;
    widget.addSpacer();
    return;
  }
  widget.setPadding(3, 7, 3, 7);
  const header = widget.addStack();
  const brand = header.addText("XLYRA · 用户");
  brand.font = Font.semiboldSystemFont(10);
  brand.textColor = ACCESSORY_SECONDARY;
  header.addSpacer();
  const status = header.addText(active ? "正常" : "停用");
  status.font = Font.mediumSystemFont(9);
  status.textColor = ACCESSORY_SECONDARY;
  widget.addSpacer(3);
  const amount = widget.addText(
    `今日 ${primaryText(primary)} · 本周 ${weeklyText(dimensions, usage)}`
  );
  amount.font = Font.boldRoundedSystemFont(16);
  amount.textColor = ACCESSORY_COLOR;
  amount.lineLimit = 1;
  amount.minimumScaleFactor = 0.68;
  widget.addSpacer(2);
  const summary = widget.addText(
    quota.unlimited ? `已用 $${money(quota.used)} · 不限额` : `余额 $${money(quota.remaining)} / 限额 $${money(quota.limit)}`
  );
  summary.font = Font.mediumSystemFont(8);
  summary.textColor = ACCESSORY_SECONDARY;
}
function normalizeBaseURL(value) {
  return String(value || "").trim().replace(/\/settings\/global\/portal\/?$/i, "").replace(/\/portal\/?$/i, "").replace(/\/v1\/?$/i, "").replace(/\/+$/, "");
}
function loadAuth() {
  const baseURL = Keychain.contains(KC_URL) ? Keychain.get(KC_URL) : CONFIG.baseURL;
  const apiKey = Keychain.contains(KC_KEY) ? Keychain.get(KC_KEY) : "";
  return { baseURL: normalizeBaseURL(baseURL), apiKey };
}
async function fetchPortal(baseURL, apiKey, path) {
  const request = new Request(normalizeBaseURL(baseURL) + path);
  request.method = "GET";
  request.headers = {
    Accept: "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  request.timeoutInterval = CONFIG.timeoutMs / 1e3;
  const payload = await request.loadJSON();
  const status = request.response?.statusCode;
  if (status >= 400) {
    throw new Error(payload?.error?.message || `HTTP ${status}`);
  }
  return payload;
}
async function loadData() {
  const { baseURL, apiKey } = loadAuth();
  if (!baseURL || !apiKey) return { configured: false };
  const [settings, overview] = await Promise.all([
    fetchPortal(baseURL, "", "/v1/portal/settings"),
    fetchPortal(baseURL, apiKey, "/v1/portal/overview")
  ]);
  if (!settings.enabled) {
    return { configured: true, disabled: true };
  }
  const optional = (promise) => promise.catch(() => null);
  const days = Math.max(1, Math.min(90, Number(settings.summary_days) || 14));
  const [summary, requests] = await Promise.all([
    settings.show_summary ? optional(fetchPortal(baseURL, apiKey, `/v1/portal/summary?days=${days}`)) : null,
    settings.show_requests ? optional(fetchPortal(baseURL, apiKey, "/v1/portal/requests?page=1&page_size=6")) : null
  ]);
  return {
    configured: true,
    settings,
    overview,
    summary,
    requests
  };
}
async function runSetup() {
  const current = loadAuth();
  const alert = new Alert();
  alert.title = "配置 xLyra 用户组件";
  alert.message = "地址只填写 xLyra 根地址，例如 https://xlyra.example.com，不要带 /portal。";
  alert.addTextField(
    "xLyra 根地址（不要带 /portal）",
    current.baseURL
  );
  if (typeof alert.addSecureTextField === "function") {
    alert.addSecureTextField("下游 API Key", current.apiKey);
  } else {
    alert.addTextField("下游 API Key", current.apiKey);
  }
  alert.addAction("验证并保存");
  alert.addCancelAction("取消");
  if (await alert.presentAlert() !== 0) return;
  const baseURL = normalizeBaseURL(alert.textFieldValue(0));
  const apiKey = alert.textFieldValue(1).trim();
  if (!baseURL || !apiKey) return runSetup();
  try {
    const settings = await fetchPortal(baseURL, "", "/v1/portal/settings");
    if (!settings.enabled) throw new Error("密钥门户未启用");
    await fetchPortal(baseURL, apiKey, "/v1/portal/overview");
  } catch (error) {
    const failed = new Alert();
    failed.title = "验证失败";
    failed.message = `已验证地址：${baseURL}
请确认未填写 /portal，且密钥属于该实例。

${error}`;
    failed.addAction("重试");
    failed.addCancelAction("取消");
    if (await failed.presentAlert() === 0) return runSetup();
    return;
  }
  Keychain.set(KC_URL, baseURL);
  Keychain.set(KC_KEY, apiKey);
  const done = new Alert();
  done.title = "配置完成 ✓";
  done.message = "下游密钥已保存到 iOS Keychain。";
  done.addAction("完成");
  await done.presentAlert();
}
function number(value) {
  return Number(value) || 0;
}
function money(value) {
  const amount = number(value);
  if (amount >= 1e3) {
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  return amount >= 1 ? amount.toFixed(2) : amount.toFixed(4);
}
function compactMoney(value) {
  const amount = number(value);
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount >= 1 ? amount.toFixed(2) : amount.toFixed(4);
}
function compact(value) {
  const amount = number(value);
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return String(amount);
}
function requestName(item, dimensions) {
  if (dimensions.model) {
    return truncate(
      item.model?.canonical_model || item.model?.upstream_model || "未知模型",
      20
    );
  }
  if (dimensions.endpoint) return truncate(item.endpoint || "请求", 20);
  return formatTime(item.created_at);
}
function requestDetail(item, dimensions) {
  const parts = [String(item.status_code ?? (item.success ? "OK" : "ERR"))];
  if (dimensions.cost && item.cost?.estimated_cost != null) {
    parts.push(`$${money(item.cost.estimated_cost)}`);
  } else if (dimensions.tokens && item.usage?.total_tokens != null) {
    parts.push(`${compact(item.usage.total_tokens)} TOK`);
  } else if (dimensions.latency && item.latency_ms != null) {
    parts.push(`${item.latency_ms}ms`);
  }
  return parts.join(" · ");
}
function truncate(value, length) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function renderState(widget, family, title, message, color) {
  const isAccessory = ACCESSORY_FAMILIES.includes(family);
  if (isAccessory) widget.setPadding(4, 6, 4, 6);
  const heading = widget.addText(
    family === "accessoryCircular" ? title : `XLYRA · ${title}`
  );
  heading.font = MONO_B;
  heading.textColor = isAccessory ? ACCESSORY_COLOR : color;
  heading.lineLimit = 1;
  heading.minimumScaleFactor = 0.65;
  if (family === "accessoryCircular") heading.centerAlignText();
  if (!isAccessory && message) {
    widget.addSpacer(8);
    const text = widget.addText(message);
    text.font = MONO_SM;
    text.textColor = C.dim;
  }
}
async function createWidget(family = config.widgetFamily || "small") {
  let data;
  try {
    data = await loadData();
  } catch (error) {
    data = { configured: true, error: String(error) };
  }
  const widget = new ListWidget();
  const isAccessory = ACCESSORY_FAMILIES.includes(family);
  attachMenuURL(widget);
  if (!isAccessory) {
    widget.setPadding(
      family === "small" ? 14 : 16,
      14,
      family === "small" ? 14 : 16,
      14
    );
    widget.backgroundColor = C.bg;
    widget.backgroundImage = dotGrid(family);
  }
  const now = /* @__PURE__ */ new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!data.configured) {
    renderState(widget, family, "未配置", "在 Scriptable 中运行脚本\n输入下游 API Key", C.amber);
  } else if (data.disabled) {
    renderState(widget, family, "门户关闭", "管理员尚未开放密钥用量门户", C.yellow);
  } else if (data.error) {
    renderState(widget, family, "数据异常", truncate(data.error, 80), C.red);
  } else if (isAccessory) {
    renderAccessory(widget, family, data);
  } else if (family === "medium") {
    renderMedium(widget, data, time);
  } else if (family === "large" || family === "extraLarge") {
    renderLarge(widget, data, time);
  } else {
    renderSmall(widget, data, time);
  }
  widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1e3);
  return widget;
}
if (shouldShowWidgetMenu()) {
  let auth = loadAuth();
  if (!auth.apiKey) {
    await runSetup();
    auth = loadAuth();
  }
  if (auth.apiKey) {
    for (; ; ) {
      const menu = await runWidgetMenu({
        title: "XLYRA 用户",
        message: "下游密钥用量与额度",
        version: CONFIG.version,
        updater,
        previewFamilies: PREVIEW_FAMILIES,
        actions: [{ id: "setup", title: "重新配置密钥" }]
      });
      if (!menu) break;
      if (menu.action === "setup") {
        await runSetup();
        continue;
      }
      if (menu.action === "preview") {
        await presentWidgetPreviews(createWidget, menu.families);
        break;
      }
    }
  }
} else {
  Script.setWidget(await createWidget());
}
Script.complete();
