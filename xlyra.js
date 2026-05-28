// ==========================================
// xLyra 监控面板 Scriptable 小组件
// 支持: Small / Medium / Large
// ==========================================

// ---------------- 配置（非敏感）----------------
const CONFIG = {
  refreshMinutes: 5,
  mediumSiteLimit: 4,
  largeSiteLimit: 6,
  largeAttentionLimit: 3,
};

// 敏感配置（baseURL / accessToken）从 Keychain 读取，三种方式录入：
//   1. 长按 Widget → Edit Widget → Parameter 填  http://192.168.1.10:5800@xlyra-admin-xxxx
//   2. 在 Scriptable App 内直接运行脚本，会弹 Alert 输入
//   3. 在脚本 App 内运行并传 Run Script Arg，参数同上格式
//
// Keychain 是 iOS 安全存储，不会随 iCloud Drive 的 .js 文件同步出去，可放心 git push。
const KC = {
  baseURL: "xlyra_base_url",
  token: "xlyra_access_token",
};

// ---------------- 主题 ----------------
const now = new Date();
const WIDGET_SIZE = config.widgetFamily || "medium";
const isDark = Device.isUsingDarkAppearance();

const C = {
  bgStart: isDark ? new Color("#0b1120") : new Color("#f8fafc"),
  bgEnd:   isDark ? new Color("#1e293b") : new Color("#eef2ff"),
  primary:   isDark ? new Color("#f1f5f9") : new Color("#0f172a"),
  secondary: isDark ? new Color("#94a3b8") : new Color("#64748b"),
  muted:     isDark ? new Color("#64748b") : new Color("#94a3b8"),
  accent:  new Color("#3b82f6"),
  online:  new Color("#10b981"),
  warning: new Color("#f59e0b"),
  offline: new Color("#ef4444"),
  unknown: new Color("#6b7280"),
  card: isDark ? new Color("#1e293b", 0.6) : new Color("#ffffff", 0.85),
  cardBorder: isDark ? new Color("#334155") : new Color("#e2e8f0"),
  badgeBg: isDark ? new Color("#334155", 0.7) : new Color("#f1f5f9"),
};

// ---------------- 格式化 ----------------
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
function k(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
function money(v, currency = "USD") {
  const sym = currency === "USD" ? "$" : "";
  if (v == null || v === 0) return `${sym}0`;
  if (v < 0.01) return `${sym}<0.01`;
  if (v < 1) return `${sym}${v.toFixed(3)}`;
  if (v < 100) return `${sym}${v.toFixed(2)}`;
  return `${sym}${Math.round(v)}`;
}
function shortName(s, max = 9) {
  if (!s) return "-";
  // 中文按 1.7,英文按 1
  let len = 0, out = "";
  for (const ch of s) {
    const w = /[一-龥]/.test(ch) ? 1.7 : 1;
    if (len + w > max) return out + "…";
    out += ch;
    len += w;
  }
  return out;
}

// ---------------- 配置加载 ----------------
// 优先级：widgetParameter / args.queryParameters > Keychain > 弹 Alert（仅 App 模式）
function parseConnStr(str) {
  // 支持  http(s)://host:port@token  或  http(s)://host:port|token
  if (!str) return null;
  const m = String(str).trim().match(/^(https?:\/\/[^@|\s]+)[@|]\s*(\S+)$/);
  if (!m) return null;
  return { baseURL: m[1].replace(/\/+$/, ""), token: m[2] };
}

async function promptForConfig(prefill) {
  const a = new Alert();
  a.title = "xLyra 配置";
  a.message = "首次使用请填写后端地址和 Access Token";
  a.addTextField("baseURL  例: http://192.168.1.10:5800", prefill?.baseURL || "");
  a.addSecureTextField("Access Token", prefill?.token || "");
  a.addAction("保存");
  a.addCancelAction("取消");
  const idx = await a.presentAlert();
  if (idx === -1) return null;
  const baseURL = a.textFieldValue(0).trim().replace(/\/+$/, "");
  const token = a.textFieldValue(1).trim();
  if (!baseURL || !token) return null;
  return { baseURL, token };
}

async function loadConfig() {
  // 1. widgetParameter（长按 widget → Edit Widget → Parameter）
  const wp = parseConnStr(args.widgetParameter);
  if (wp) {
    Keychain.set(KC.baseURL, wp.baseURL);
    Keychain.set(KC.token, wp.token);
    return wp;
  }

  // 2. Keychain
  if (Keychain.contains(KC.baseURL) && Keychain.contains(KC.token)) {
    return { baseURL: Keychain.get(KC.baseURL), token: Keychain.get(KC.token) };
  }

  // 3. App 模式弹 Alert；Widget 模式直接返回 null（渲染时给提示）
  if (!config.runsInWidget) {
    const cfg = await promptForConfig();
    if (cfg) {
      Keychain.set(KC.baseURL, cfg.baseURL);
      Keychain.set(KC.token, cfg.token);
      return cfg;
    }
  }
  return null;
}

let RUNTIME = { baseURL: "", token: "" };

// ---------------- API ----------------
async function xlyraFetch(path) {
  const req = new Request(`${RUNTIME.baseURL}${path}`);
  req.headers = {
    "X-Access-Token": RUNTIME.token,
    "Accept": "application/json",
  };
  req.timeoutInterval = 10;
  try {
    return { ok: true, data: await req.loadJSON() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchOverview() {
  const r = await xlyraFetch("/api/v1/dashboard/overview");
  return r.ok ? r.data : null;
}
async function fetchHealth() {
  const r = await xlyraFetch("/api/v1/health/sites");
  return r.ok ? r.data : null;
}

// ---------------- 解析 ----------------
function parseOverview(raw) {
  if (!raw) return null;
  const kpis = raw.kpis || {};
  const req = kpis.requests || {};
  const cost = kpis.cost || {};
  const rl = kpis.rate_limit || {};
  return {
    todayRequests: req.today ?? 0,
    todayTokens: req.today_tokens ?? 0,
    successRate: req.success_rate == null ? null : req.success_rate,
    todayCost: cost.today ?? 0,
    totalCost: cost.total ?? 0,
    currency: cost.currency || "USD",
    rpm: rl.rpm?.used ?? 0,
    tpm: rl.tpm?.actual ?? 0,
    attention: (raw.attention?.items || []).map(a => ({
      id: a.id,
      severity: a.severity || "info",
      type: a.type,
      modelKey: a.subject?.model_key || "-",
      siteName: a.subject?.site_name || "-",
      avgLatency: a.metrics?.avg_latency_ms ?? 0,
      p95Latency: a.metrics?.p95_latency_ms ?? 0,
      requestCount: a.metrics?.request_count ?? 0,
    })),
  };
}

function parseHealth(raw) {
  if (!raw || !Array.isArray(raw.items)) return [];
  return raw.items
    .map(it => {
      const h = it.health || {};
      const s = it.site || {};
      return {
        id: s.id || h.site_id,
        name: s.name || "Unknown",
        status: h.status || "unknown",
        latency: Math.round(h.recent_avg_latency_ms ?? 0),
        successRate: h.recent_success_rate ?? 1,
        enabled: s.enabled !== false,
      };
    })
    .sort((a, b) => {
      // 异常优先 → 高延迟靠后但在线优先
      const sev = (st) => {
        const k = (st || "").toLowerCase();
        if (k === "down" || k === "offline" || k === "unhealthy") return 0;
        if (k === "degraded") return 1;
        if (k === "healthy") return 2;
        return 3;
      };
      return sev(a.status) - sev(b.status) || a.latency - b.latency;
    });
}

function computeAvgLatency(health) {
  const valid = health.filter(s => s.latency > 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, s) => a + s.latency, 0) / valid.length);
}

// ---------------- 颜色映射 ----------------
function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "healthy" || s === "up" || s === "online") return C.online;
  if (s === "degraded" || s === "warning") return C.warning;
  if (s === "down" || s === "offline" || s === "error" || s === "unhealthy") return C.offline;
  return C.unknown;
}
function statusText(status) {
  const s = (status || "").toLowerCase();
  if (s === "healthy") return "正常";
  if (s === "degraded") return "降级";
  if (s === "down" || s === "unhealthy") return "离线";
  return "未知";
}
function severityColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "error") return C.offline;
  if (s === "warning") return C.warning;
  return C.accent;
}
function latencyColor(ms) {
  if (ms <= 0) return C.muted;
  if (ms < 500) return C.online;
  if (ms < 1500) return C.warning;
  return C.offline;
}
function rateColor(pct) {
  if (pct >= 99) return C.online;
  if (pct >= 90) return C.warning;
  return C.offline;
}

// ---------------- 绘制 ----------------
function drawDot(color, size = 8) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(color);
  ctx.fillEllipse(new Rect(0, 0, size, size));
  return ctx.getImage();
}

// ---------------- 入口 ----------------
const widget = new ListWidget();
const grad = new LinearGradient();
grad.colors = [C.bgStart, C.bgEnd];
grad.locations = [0, 1];
widget.backgroundGradient = grad;

const cfg = await loadConfig();
const notConfigured = !cfg;
if (cfg) RUNTIME = cfg;

const overview = notConfigured ? null : parseOverview(await fetchOverview());
const health = notConfigured ? [] : parseHealth(await fetchHealth());
const avgLatency = computeAvgLatency(health);
const onlineCount = health.filter(s =>
  ["healthy", "up", "online"].includes((s.status || "").toLowerCase())
).length;
const hasError = notConfigured || (!overview && health.length === 0);
const allOnline = health.length > 0 && onlineCount === health.length;

// 在 App 模式下显示已配置的 baseURL（脱敏 token），便于检查
if (!config.runsInWidget && cfg) {
  console.log(`[xLyra] baseURL = ${cfg.baseURL}`);
  console.log(`[xLyra] token = ${cfg.token.slice(0, 12)}...${cfg.token.slice(-4)}`);
}

if (WIDGET_SIZE === "small") {
  widget.setPadding(12, 12, 12, 12);
  renderSmall(widget, { overview, health, onlineCount, allOnline, hasError });
} else if (WIDGET_SIZE === "large") {
  widget.setPadding(14, 14, 14, 14);
  renderLarge(widget, { overview, health, onlineCount, avgLatency, allOnline, hasError });
} else {
  widget.setPadding(12, 12, 12, 12);
  renderMedium(widget, { overview, health, onlineCount, avgLatency, allOnline, hasError });
}

widget.refreshAfterDate = new Date(Date.now() + 1000 * 60 * CONFIG.refreshMinutes);
Script.setWidget(widget);
Script.complete();

// ==========================================
// Small (155x155)
// ==========================================
function renderSmall(w, { overview, health, onlineCount, allOnline, hasError }) {
  // 顶部：xLyra + 在线
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();

  const dot = head.addImage(drawDot(hasError ? C.offline : allOnline ? C.online : C.warning, 8));
  dot.imageSize = new Size(8, 8);
  head.addSpacer(5);
  const brand = head.addText("xLyra");
  brand.font = Font.semiboldSystemFont(12);
  brand.textColor = C.accent;
  head.addSpacer();
  const online = head.addText(`${onlineCount}/${health.length}`);
  online.font = Font.mediumSystemFont(11);
  online.textColor = C.secondary;

  if (hasError) {
    w.addSpacer();
    const err = w.addText(notConfigured ? "未配置" : "连接失败");
    err.font = Font.mediumSystemFont(15);
    err.textColor = C.offline;
    err.centerAlignText();
    w.addSpacer(2);
    const hint = w.addText(notConfigured ? "长按编辑 Parameter" : "检查 Token / 网络");
    hint.font = Font.systemFont(10);
    hint.textColor = C.secondary;
    hint.centerAlignText();
    w.addSpacer();
    return;
  }

  w.addSpacer(6);

  // 主指标：今日请求
  const big = w.addText(k(overview?.todayRequests ?? 0));
  big.font = Font.lightSystemFont(34);
  big.textColor = C.primary;
  big.centerAlignText();
  big.minimumScaleFactor = 0.7;
  big.lineLimit = 1;

  const lbl = w.addText("今日请求");
  lbl.font = Font.systemFont(10);
  lbl.textColor = C.secondary;
  lbl.centerAlignText();

  w.addSpacer();

  // 副指标：成本 / 成功率
  const sub = w.addStack();
  sub.layoutHorizontally();
  sub.centerAlignContent();

  const cost = sub.addText(money(overview?.todayCost ?? 0, overview?.currency));
  cost.font = Font.mediumSystemFont(11);
  cost.textColor = C.primary;

  sub.addSpacer();

  const rate = overview?.successRate;
  const rateStr = rate == null ? "—" : `${Math.round(rate * 100)}%`;
  const rateText = sub.addText(rateStr);
  rateText.font = Font.mediumSystemFont(11);
  rateText.textColor = rate == null ? C.muted : rateColor(rate * 100);
}

// ==========================================
// Medium (329x155)
// ==========================================
function renderMedium(w, { overview, health, onlineCount, avgLatency, allOnline, hasError }) {
  // 顶部标题栏
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();

  const dot = head.addImage(drawDot(hasError ? C.offline : allOnline ? C.online : C.warning, 8));
  dot.imageSize = new Size(8, 8);
  head.addSpacer(5);
  const brand = head.addText("xLyra");
  brand.font = Font.semiboldSystemFont(12);
  brand.textColor = C.accent;
  head.addSpacer();
  const t = head.addText(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  t.font = Font.systemFont(10);
  t.textColor = C.secondary;

  if (hasError) {
    w.addSpacer();
    const err = w.addText(notConfigured ? "未配置 xLyra" : "数据获取失败");
    err.font = Font.mediumSystemFont(14);
    err.textColor = C.offline;
    err.centerAlignText();
    w.addSpacer(2);
    const hint = w.addText(notConfigured
      ? "长按 Widget → Edit → Parameter 填  http://host:port@token"
      : "检查 baseURL 和 X-Access-Token");
    hint.font = Font.systemFont(10);
    hint.textColor = C.secondary;
    hint.centerAlignText();
    w.addSpacer();
    return;
  }

  w.addSpacer(8);

  // 主体：左 KPI · 右 站点
  const body = w.addStack();
  body.layoutHorizontally();
  body.spacing = 10;

  // 左：4 KPI 紧凑
  const left = body.addStack();
  left.layoutVertically();
  left.spacing = 4;

  addKpiRow(left, k(overview?.todayRequests ?? 0), "请求", C.primary);
  const rate = overview?.successRate;
  addKpiRow(left,
    rate == null ? "—" : `${Math.round(rate * 100)}%`,
    "成功",
    rate == null ? C.muted : rateColor(rate * 100));
  addKpiRow(left, money(overview?.todayCost ?? 0, overview?.currency), "成本", C.primary);
  addKpiRow(left, `${avgLatency}ms`, "延迟", latencyColor(avgLatency));

  body.addSpacer(8);

  // 右：站点列表
  const right = body.addStack();
  right.layoutVertically();
  right.spacing = 5;

  const rh = right.addStack();
  rh.layoutHorizontally();
  rh.centerAlignContent();
  const rht = rh.addText("站点");
  rht.font = Font.semiboldSystemFont(10);
  rht.textColor = C.secondary;
  rh.addSpacer();
  const cnt = rh.addText(`${onlineCount}/${health.length} 在线`);
  cnt.font = Font.systemFont(9);
  cnt.textColor = C.muted;

  if (!health.length) {
    const empty = right.addText("暂无站点");
    empty.font = Font.italicSystemFont(10);
    empty.textColor = C.muted;
  } else {
    const limit = Math.min(health.length, CONFIG.mediumSiteLimit);
    for (let i = 0; i < limit; i++) {
      addSiteRow(right, health[i], 10);
    }
  }
}

function addKpiRow(parent, value, label, color) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.bottomAlignContent();
  const v = row.addText(value);
  v.font = Font.semiboldSystemFont(15);
  v.textColor = color;
  v.lineLimit = 1;
  v.minimumScaleFactor = 0.7;
  row.addSpacer(4);
  const l = row.addText(label);
  l.font = Font.systemFont(10);
  l.textColor = C.secondary;
}

function addSiteRow(parent, s, fontSize = 10) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const d = row.addImage(drawDot(statusColor(s.status), 6));
  d.imageSize = new Size(6, 6);
  row.addSpacer(5);
  const n = row.addText(shortName(s.name, 8));
  n.font = Font.systemFont(fontSize);
  n.textColor = C.primary;
  n.lineLimit = 1;
  row.addSpacer();
  const l = row.addText(`${s.latency}ms`);
  l.font = Font.systemFont(fontSize - 1);
  l.textColor = latencyColor(s.latency);
  l.lineLimit = 1;
}

// ==========================================
// Large (329x345)
// ==========================================
function renderLarge(w, { overview, health, onlineCount, avgLatency, allOnline, hasError }) {
  // 顶部
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();

  const dot = head.addImage(drawDot(hasError ? C.offline : allOnline ? C.online : C.warning, 10));
  dot.imageSize = new Size(10, 10);
  head.addSpacer(6);
  const brand = head.addText("xLyra 监控");
  brand.font = Font.semiboldSystemFont(14);
  brand.textColor = C.accent;
  head.addSpacer();
  const t = head.addText(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  t.font = Font.systemFont(11);
  t.textColor = C.secondary;

  if (hasError) {
    w.addSpacer();
    const err = w.addText(notConfigured ? "未配置 xLyra" : "数据获取失败");
    err.font = Font.mediumSystemFont(16);
    err.textColor = C.offline;
    err.centerAlignText();
    w.addSpacer(4);
    const hint = w.addText(notConfigured
      ? "长按 Widget → Edit Widget\nParameter 填  http://host:port@token"
      : "检查 baseURL / X-Access-Token / 网络");
    hint.font = Font.systemFont(11);
    hint.textColor = C.secondary;
    hint.centerAlignText();
    w.addSpacer();
    return;
  }

  w.addSpacer(10);

  // 4 KPI 卡片
  const cards = w.addStack();
  cards.layoutHorizontally();
  cards.spacing = 6;

  addKpiCard(cards, k(overview?.todayRequests ?? 0), "今日请求", C.accent);

  const rate = overview?.successRate;
  addKpiCard(cards,
    rate == null ? "—" : `${Math.round(rate * 100)}%`,
    "成功率",
    rate == null ? C.muted : rateColor(rate * 100));

  addKpiCard(cards, money(overview?.todayCost ?? 0, overview?.currency), "今日成本", C.primary);

  addKpiCard(cards,
    `${onlineCount}/${health.length}`,
    "在线",
    allOnline ? C.online : C.warning);

  w.addSpacer(10);

  // 双栏：站点健康 / 关注事项
  const body = w.addStack();
  body.layoutHorizontally();
  body.spacing = 10;

  // 左：站点健康
  const left = body.addStack();
  left.layoutVertically();
  left.spacing = 4;

  const lh = left.addText("站点健康");
  lh.font = Font.semiboldSystemFont(11);
  lh.textColor = C.secondary;
  left.addSpacer(2);

  if (!health.length) {
    const e = left.addText("暂无站点");
    e.font = Font.italicSystemFont(10);
    e.textColor = C.muted;
  } else {
    const limit = Math.min(health.length, CONFIG.largeSiteLimit);
    for (let i = 0; i < limit; i++) {
      const s = health[i];
      const row = left.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      const d = row.addImage(drawDot(statusColor(s.status), 7));
      d.imageSize = new Size(7, 7);
      row.addSpacer(5);
      const n = row.addText(shortName(s.name, 7));
      n.font = Font.systemFont(11);
      n.textColor = C.primary;
      n.lineLimit = 1;
      row.addSpacer();
      const l = row.addText(`${s.latency}ms`);
      l.font = Font.systemFont(10);
      l.textColor = latencyColor(s.latency);
    }
  }

  // 右：关注事项
  const right = body.addStack();
  right.layoutVertically();
  right.spacing = 4;

  const rh = right.addText("关注事项");
  rh.font = Font.semiboldSystemFont(11);
  rh.textColor = C.secondary;
  right.addSpacer(2);

  const items = overview?.attention || [];
  if (!items.length) {
    const ok = right.addStack();
    ok.layoutHorizontally();
    ok.centerAlignContent();
    const d = ok.addImage(drawDot(C.online, 6));
    d.imageSize = new Size(6, 6);
    ok.addSpacer(5);
    const t = ok.addText("一切正常");
    t.font = Font.systemFont(11);
    t.textColor = C.secondary;
  } else {
    const limit = Math.min(items.length, CONFIG.largeAttentionLimit);
    for (let i = 0; i < limit; i++) {
      const a = items[i];
      const row = right.addStack();
      row.layoutVertically();
      row.spacing = 1;

      const r1 = row.addStack();
      r1.layoutHorizontally();
      r1.centerAlignContent();
      const d = r1.addImage(drawDot(severityColor(a.severity), 6));
      d.imageSize = new Size(6, 6);
      r1.addSpacer(5);
      const m = r1.addText(shortName(a.modelKey, 11));
      m.font = Font.mediumSystemFont(10);
      m.textColor = C.primary;
      m.lineLimit = 1;

      const detail = a.type === "high_latency"
        ? `延迟 p95 ${Math.round(a.p95Latency / 1000)}s`
        : a.type;
      const r2 = row.addText(`  ${detail}`);
      r2.font = Font.systemFont(9);
      r2.textColor = C.muted;
      r2.lineLimit = 1;
    }
  }

  w.addSpacer();

  // 底部状态行：累计成本 · RPM · TPM
  const foot = w.addStack();
  foot.layoutHorizontally();
  foot.centerAlignContent();

  const total = foot.addText(`累计 ${money(overview?.totalCost ?? 0, overview?.currency)}`);
  total.font = Font.systemFont(10);
  total.textColor = C.secondary;

  foot.addSpacer();

  const sep1 = foot.addText("·");
  sep1.font = Font.systemFont(10);
  sep1.textColor = C.muted;
  foot.addSpacer(6);

  const rpm = foot.addText(`${overview?.rpm ?? 0} RPM`);
  rpm.font = Font.systemFont(10);
  rpm.textColor = C.secondary;

  foot.addSpacer(6);
  const sep2 = foot.addText("·");
  sep2.font = Font.systemFont(10);
  sep2.textColor = C.muted;
  foot.addSpacer(6);

  const tpm = foot.addText(`${k(overview?.tpm ?? 0)} TPM`);
  tpm.font = Font.systemFont(10);
  tpm.textColor = C.secondary;

  foot.addSpacer();

  const lat = foot.addText(`均 ${avgLatency}ms`);
  lat.font = Font.systemFont(10);
  lat.textColor = latencyColor(avgLatency);
}

function addKpiCard(parent, value, label, color) {
  const card = parent.addStack();
  card.layoutVertically();
  card.setPadding(8, 8, 8, 8);
  card.backgroundColor = C.card;
  card.cornerRadius = 8;
  card.centerAlignContent();

  const v = card.addText(value);
  v.font = Font.semiboldSystemFont(17);
  v.textColor = color;
  v.centerAlignText();
  v.lineLimit = 1;
  v.minimumScaleFactor = 0.7;

  card.addSpacer(2);

  const l = card.addText(label);
  l.font = Font.systemFont(9);
  l.textColor = C.secondary;
  l.centerAlignText();
}
