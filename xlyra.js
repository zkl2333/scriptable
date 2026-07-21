// ==========================================
// xLyra 看板 Scriptable 小组件(Admin Token 版)
// @version 1.2.0
// 支持: Small / Medium / Large,深浅色自适应
//
// 数据源(全部使用 X-Access-Token,xlyra-admin-…):
//   dashboard/usage · dashboard/epaper-summary · health/sites
//   api-keys · oauth/connections · dashboard/cooldowns
//
// 自适应展示:
//   · 有 OAuth 账号 → 显示 5h/7d 配额面板、OAuth 账号卡片
//   · 无 OAuth 账号 → 不显示任何 OAuth 区块,空间让给站点健康/模型成本
//   · 无站点 / 无模型成本 → 对应区块同样自动隐藏
//
// 自我更新:
//   把脚本发布到可直链访问的位置(如 GitHub Raw),填入 CONFIG.updateURL,
//   在 App 内运行时会比对 @version,有新版本弹窗确认后覆盖自身。
//
// 凭证录入三选一:
//   1. 长按 Widget → Edit Widget → Parameter 填  https://host[:port][/v1]@xlyra-admin-xxxx
//   2. 在 Scriptable App 内直接运行脚本,弹 Alert 输入
//   3. App 内运行并传 Run Script Arg,格式同上
// baseURL 末尾带不带 /v1 都可以,脚本会自动归一化。
// 凭证存 iOS Keychain,不随 iCloud 同步,可放心 git push。
// ==========================================

// ---------------- 配置（非敏感）----------------
const CONFIG = {
  refreshMinutes: 10,    // 刷新间隔(分钟)
  mediumSiteLimit: 4,    // Medium 站点列表行数上限(无 OAuth 时)
  largeSiteLimit: 5,     // Large 站点列表行数上限
  largeOAuthLimit: 2,    // Large OAuth 账号卡片上限
  version: "1.2.0",      // 当前版本(与头部 @version 保持一致)
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/xlyra.js",
  widgetAutoUpdate: true, // 桌面组件后台刷新时也静默自更新(false 则仅 App 内手动运行时检查)
  updateCheckHours: 6,   // 更新检查节流间隔(小时),避免每次刷新都请求
};

const KC = {
  baseURL: "xlyra_base_url",
  token: "xlyra_access_token",
};

// ---------------- 主题（深浅色自适应）----------------
const isDark = Device.isUsingDarkAppearance();
const C = isDark ? {
  bg: new Color("#0d0f14"),
  bgTop: new Color("#181b22"),
  panel: new Color("#171a20"),
  panel3: new Color("#101216"),
  stroke: new Color("#2b303a"),
  track: new Color("#353944"),
  text: Color.white(),
  sub: new Color("#a4a9b6"),
  dim: new Color("#6f7684"),
  green: new Color("#18d49a"),
  greenBg: new Color("#0c342b"),
  yellow: new Color("#ffba31"),
  yellowBg: new Color("#3b2b11"),
  red: new Color("#ff4d57"),
  redBg: new Color("#39171b"),
  blue: new Color("#2878ff"),
  blueBg: new Color("#10284f"),
  pink: new Color("#ff4fa3"),
  pinkBg: new Color("#3a1830"),
  cyan: new Color("#29c7ff"),
} : {
  bg: new Color("#f2f3f7"),
  bgTop: new Color("#ffffff"),
  panel: new Color("#ffffff"),
  panel3: new Color("#eef0f4"),
  stroke: new Color("#e2e4ea"),
  track: new Color("#d9dce3"),
  text: new Color("#16181d"),
  sub: new Color("#5b6270"),
  dim: new Color("#9aa0ad"),
  green: new Color("#0da678"),
  greenBg: new Color("#d9f5ea"),
  yellow: new Color("#d99600"),
  yellowBg: new Color("#fbeecd"),
  red: new Color("#e03540"),
  redBg: new Color("#fddfe1"),
  blue: new Color("#1f6bff"),
  blueBg: new Color("#dce9ff"),
  pink: new Color("#e53d90"),
  pinkBg: new Color("#fbdff0"),
  cyan: new Color("#0fa8d8"),
};

const WIDGET_SIZE = config.widgetFamily || "medium";

// ---------------- 格式化 ----------------
const pad2 = (n) => String(n).padStart(2, "0");
const time = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const monthDayTime = (d) => `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time(d)}`;
const pct = (n) => `${Math.round(n * 100)}%`;

function compact(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}K`;
  return `${n}`;
}
function money(n) {
  if (n == null) return "—";
  return n >= 1 ? n.toFixed(2) : n.toFixed(4).replace(/0+$/, "0");
}
function short(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function resetLabel(reset) {
  if (!reset || reset === "--") return "待同步";
  const d = reset instanceof Date ? reset : new Date(reset);
  if (Number.isNaN(d.getTime())) return String(reset);
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "待重置";
  const minutes = Math.ceil(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
function resetDateLabel(reset) {
  if (!reset || reset === "--") return "待同步";
  const d = reset instanceof Date ? reset : new Date(reset);
  if (Number.isNaN(d.getTime())) return String(reset);
  return `${monthDayTime(d)} 重置`;
}

// ---------------- 宽容取值 ----------------
function val(obj, path) {
  let cur = obj;
  for (const p of String(path).split(".")) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return cur ?? null;
}
function str(obj, ...keys) {
  for (const k of keys) {
    const v = val(obj, k);
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return null;
}
function num(obj, ...keys) {
  for (const k of keys) {
    const v = val(obj, k);
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}
function int(obj, ...keys) {
  const n = num(obj, ...keys);
  return n === null ? null : Math.round(n);
}
function bool(obj, ...keys) {
  for (const k of keys) {
    const v = val(obj, k);
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
  }
  return null;
}
function rows(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== "object") return [];
  for (const k of ["items", "data", "rows", "connections", "sites", "api_keys"]) {
    if (Array.isArray(v[k])) return v[k];
    const nested = rows(v[k]);
    if (nested.length) return nested;
  }
  return [];
}
function percentValue(n) {
  return n === null || n === undefined ? null : Math.round(Math.max(0, Math.min(100, n <= 1 && n > 0 ? n * 100 : n)));
}

// ---------------- 配置加载 ----------------
function parseConnStr(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(https?:\/\/[^@|\s]+)[@|]\s*(\S+)$/);
  if (!m) return null;
  return { baseURL: normalizeBase(m[1]), token: m[2] };
}
function normalizeBase(u) {
  return String(u).replace(/\/+$/, "").replace(/\/(api\/v1|v1)$/i, "");
}
async function promptForConfig() {
  const a = new Alert();
  a.title = "xLyra 配置";
  a.message = "填写后端地址和 Admin Token(xlyra-admin-…)";
  a.addTextField("baseURL  例: https://ai-api.example.com", "");
  a.addSecureTextField("Admin Token", "");
  a.addAction("保存");
  a.addCancelAction("取消");
  const idx = await a.presentAlert();
  if (idx === -1) return null;
  const baseURL = normalizeBase(a.textFieldValue(0).trim());
  const token = a.textFieldValue(1).trim();
  if (!baseURL || !token) return null;
  return { baseURL, token };
}
async function loadConfig() {
  const wp = parseConnStr(args.widgetParameter);
  if (wp) {
    Keychain.set(KC.baseURL, wp.baseURL);
    Keychain.set(KC.token, wp.token);
    return wp;
  }
  if (Keychain.contains(KC.baseURL) && Keychain.contains(KC.token)) {
    return { baseURL: Keychain.get(KC.baseURL), token: Keychain.get(KC.token) };
  }
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

// ---------------- 自我更新 ----------------
// 原理(Honye/scriptable-scripts 的 updateCode):脚本本体就是文件,
// 用 FileManager 把远程源码写回 module.filename 即完成更新,下次运行生效。
// App 内运行:弹窗确认;Widget 后台刷新:静默覆盖(widgetAutoUpdate=true 时)。
function compareVersion(v1, v2) {
  const a = String(v1).split("."), b = String(v2).split(".");
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const n1 = parseInt(a[i] || 0, 10), n2 = parseInt(b[i] || 0, 10);
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function selfFM() {
  let fm = FileManager.local();
  if (fm.isFileStoredIniCloud(module.filename)) fm = FileManager.iCloud();
  return fm;
}

// 节流状态存在 documents 下的独立目录(Widget 可写 documents,不可写 cache/temp)
function updateStatePath(fm) {
  const dir = fm.joinPath(fm.documentsDirectory(), "xlyra-widget-state");
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return fm.joinPath(dir, "last-update-check.json");
}

async function checkUpdate() {
  if (!CONFIG.updateURL) return;
  const inWidget = config.runsInWidget;
  if (inWidget && !CONFIG.widgetAutoUpdate) return;

  const fm = selfFM();
  const stateFile = updateStatePath(fm);
  const nowMs = Date.now();
  if (fm.fileExists(stateFile)) {
    try {
      const st = JSON.parse(fm.readString(stateFile));
      if (st.lastCheck && nowMs - st.lastCheck < CONFIG.updateCheckHours * 3600 * 1000) return;
    } catch (_) { /* 状态损坏就当没检查过 */ }
  }
  fm.writeString(stateFile, JSON.stringify({ lastCheck: nowMs }));

  try {
    const req = new Request(CONFIG.updateURL);
    req.timeoutInterval = 10;
    const code = await req.loadString();
    const m = code.match(/@version\s+([\d.]+)/);
    if (!m || compareVersion(m[1], CONFIG.version) <= 0) {
      if (!inWidget) console.log(`[xLyra] 已是最新 (${CONFIG.version})`);
      return;
    }

    if (inWidget) {
      // Widget 后台:静默覆盖,下次刷新生效(本次仍用旧代码渲染,无影响)
      fm.writeString(module.filename, code);
      console.log(`[xLyra] 已静默更新 ${CONFIG.version} → ${m[1]},下次刷新生效`);
      return;
    }

    const a = new Alert();
    a.title = "发现新版本";
    a.message = `${CONFIG.version} → ${m[1]}\n更新会覆盖整个脚本(Keychain 凭证不受影响)。`;
    a.addAction("更新");
    a.addCancelAction("取消");
    if ((await a.presentAlert()) !== 0) return;

    fm.writeString(module.filename, code);

    const done = new Alert();
    done.title = "更新完成";
    done.message = "若脚本正在编辑页打开,请关闭后重新运行生效。";
    done.addAction("好");
    await done.presentAlert();
  } catch (e) {
    console.warn(`[xLyra] 更新检查失败: ${e}`);
  }
}

// ---------------- API ----------------
async function xlyraFetch(path) {
  const req = new Request(`${RUNTIME.baseURL}${path}`);
  req.headers = { "X-Access-Token": RUNTIME.token, "Accept": "application/json" };
  req.timeoutInterval = 12;
  try {
    const body = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 200;
    if (status === 401 || status === 403) return { ok: false, error: "Admin Token 无效或权限不足" };
    if (status < 200 || status >= 300) return { ok: false, error: `HTTP ${status}` };
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// ---------------- 数据解析 ----------------
function parseHealthSites(raw) {
  return rows(raw)
    .map(it => {
      const enabled = bool(it, "site.enabled") !== false;
      const status = (str(it, "health.status") || "unknown").toLowerCase();
      return {
        name: str(it, "site.name") || "站点",
        enabled,
        status,
        ok: enabled && ["healthy", "up", "online"].includes(status),
        latency: int(it, "health.recent_avg_latency_ms") ?? 0,
      };
    })
    .sort((a, b) => {
      const sev = (x) => (!x.enabled ? 3 : !x.ok ? (x.status === "degraded" ? 1 : 0) : 2);
      return sev(a) - sev(b) || a.latency - b.latency;
    });
}
function parseKeys(raw) {
  const list = rows(raw).map(r => {
    const status = (str(r, "status") || "active").toLowerCase();
    const limit = num(r, "quota_limit");
    const used = num(r, "quota_used") ?? 0;
    return {
      active: ["active", "enabled", "ok"].includes(status),
      exhausted: limit !== null && used >= limit,
    };
  });
  return {
    total: list.length,
    active: list.filter(x => x.active).length,
    exhausted: list.filter(x => x.exhausted).length,
  };
}
function resetTimeValue(obj, ...keys) {
  for (const k of keys) {
    const v = val(obj, k);
    if (typeof v === "number") return new Date(v * 1000);
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (!Number.isNaN(n)) return new Date(n * 1000);
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return "--";
}
function parseOAuth(raw) {
  return rows(raw).map(r => {
    const status = (str(r, "status") || "connected").toLowerCase();
    const limited = bool(r, "limit_reached", "quota.limit_reached", "meta.quota.limit_reached") === true;
    const ok = ["connected", "active", "ok", "healthy", "available", "ready"].includes(status) && !limited;
    const fiveRemain = percentValue(num(r, "five_hour_remaining_percent", "quota.five_hour.remaining_percent", "meta.quota.five_hour.remaining_percent"));
    const weekRemain = percentValue(num(r, "weekly_remaining_percent", "quota.weekly.remaining_percent", "meta.quota.weekly.remaining_percent"));
    return {
      name: str(r, "email", "account.email", "site_name", "site.name", "account_id") || "OAuth",
      plan: (str(r, "plan_type", "account.plan_type", "provider") || "OAUTH").toUpperCase(),
      site: short(str(r, "site_name", "site.name", "provider") || "site", 16),
      ok, limited,
      fiveRemain,
      weekRemain,
      fiveReset: resetTimeValue(r, "five_hour_reset_at", "quota.five_hour.reset_at", "meta.quota.five_hour.reset_at"),
      weekReset: resetTimeValue(r, "weekly_reset_at", "quota.weekly.reset_at", "meta.quota.weekly.reset_at"),
      priority: num(r, "priority", "routing_priority", "site.routing_priority") ?? 0,
    };
  }).sort((a, b) => b.priority - a.priority || (a.ok === b.ok ? 0 : a.ok ? -1 : 1));
}
function healthLevel({ sitesTotal, sitesHealthy, oauthTotal, oauthHealthy, keysExhausted, successRate, cooldowns }) {
  if (sitesTotal === 0 || sitesHealthy === 0 || successRate < 0.8) return "critical";
  if (sitesHealthy < sitesTotal || oauthHealthy < oauthTotal || keysExhausted > 0 || cooldowns > 0 || successRate < 0.95) return "warning";
  return "healthy";
}
const healthColor = (h) => (h === "healthy" ? C.green : h === "warning" ? C.yellow : C.red);
const healthBg = (h) => (h === "healthy" ? C.greenBg : h === "warning" ? C.yellowBg : C.redBg);
const healthLabel = (h) => (h === "healthy" ? "正常" : h === "warning" ? "注意" : "故障");
const quotaColor = (n) => (n == null ? C.dim : n < 30 ? C.red : n < 60 ? C.yellow : C.green);

async function fetchAdmin() {
  const [usage, epaper, health, keys, oauth, cooldowns] = await Promise.all([
    xlyraFetch("/api/v1/dashboard/usage"),
    xlyraFetch("/api/v1/dashboard/epaper-summary"),
    xlyraFetch("/api/v1/health/sites"),
    xlyraFetch("/api/v1/api-keys"),
    xlyraFetch("/api/v1/oauth/connections"),
    xlyraFetch("/api/v1/dashboard/cooldowns"),
  ]);
  if (!usage.ok && !epaper.ok && !health.ok) return { error: usage.error || epaper.error || health.error };

  const kpis = val(usage.ok ? usage.data : {}, "kpis") || {};
  const ep = epaper.ok ? (val(epaper.data, "data") || epaper.data) : {};
  const epKpis = val(ep, "kpis") || {};

  const sites = parseHealthSites(health.ok ? health.data : null);
  const keyStats = parseKeys(keys.ok ? keys.data : null);
  const oauthRows = parseOAuth(oauth.ok ? oauth.data : null);
  const cooldownCount = rows(cooldowns.ok ? cooldowns.data : null).length;

  const todayRequests = int(kpis, "requests.today") ?? int(epKpis, "today_requests") ?? 0;
  const todayTokens = int(kpis, "requests.today_tokens") ?? int(epKpis, "today_tokens") ?? 0;
  const todayCost = num(kpis, "cost.today") ?? num(epKpis, "today_cost") ?? 0;
  const totalCost = num(kpis, "cost.total") ?? num(epKpis, "total_cost") ?? 0;
  const totalTokens = int(kpis, "requests.total_tokens") ?? int(epKpis, "total_tokens") ?? 0;
  const successRate = num(kpis, "requests.success_rate") ?? 1;
  const rpm = int(kpis, "rate_limit.rpm.used") ?? int(epKpis, "rpm_used") ?? 0;

  const topRaw = val(ep, "model_top3_today") || [];
  const topModels = (Array.isArray(topRaw) ? topRaw : []).map(t => ({
    name: str(t, "model_key", "model", "name") || "-",
    cost: num(t, "cost") ?? 0,
  })).slice(0, 3);

  const sitesHealthy = sites.filter(x => x.ok).length;
  const oauthHealthy = oauthRows.filter(x => x.ok).length;
  const hl = healthLevel({
    sitesTotal: sites.length,
    sitesHealthy,
    oauthTotal: oauthRows.length,
    oauthHealthy,
    keysExhausted: keyStats.exhausted,
    successRate,
    cooldowns: cooldownCount,
  });

  return {
    checkedAt: new Date(),
    health: hl,
    today: { requests: todayRequests, tokens: todayTokens, cost: todayCost, successRate, failed: Math.round(todayRequests * (1 - successRate)) },
    totals: { cost: totalCost, tokens: totalTokens },
    rpm,
    sites, sitesTotal: sites.length, sitesHealthy,
    keys: keyStats,
    oauthRows, oauthTotal: oauthRows.length, oauthHealthy,
    cooldowns: cooldownCount,
    topModels,
  };
}

// ==========================================
// UI 零件
// ==========================================
function base() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bg];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  return w;
}
function txt(parent, s, size, weight, color) {
  const t = parent.addText(String(s));
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}
function dot(parent, color, size = 6, gap = 5) {
  const s = parent.addStack();
  s.size = new Size(size, size);
  s.backgroundColor = color;
  s.cornerRadius = size / 2;
  parent.addSpacer(gap);
}
function statusPill(parent, label, h, width = 52) {
  const p = parent.addStack();
  p.centerAlignContent();
  p.size = new Size(width, 20);
  p.backgroundColor = healthBg(h);
  p.cornerRadius = 10;
  p.borderColor = healthColor(h);
  p.borderWidth = 1;
  p.addSpacer();
  dot(p, healthColor(h), 5, 3);
  txt(p, label, 10, "bold", healthColor(h));
  p.addSpacer();
}
function progressBar(parent, percent, width, height = 6) {
  const n = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const track = parent.addStack();
  track.layoutHorizontally();
  track.backgroundColor = C.track;
  track.cornerRadius = height / 2;
  track.size = new Size(width, height);
  const fill = track.addStack();
  fill.backgroundColor = quotaColor(percent);
  fill.cornerRadius = height / 2;
  fill.size = new Size(Math.max(4, Math.round(width * (n / 100))), height);
  track.addSpacer();
}
function segmentedBar(parent, percent, width) {
  const remain = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const count = 7;
  const row = parent.addStack();
  row.layoutHorizontally();
  row.size = new Size(width, 6);
  const segW = Math.floor((width - (count - 1) * 2) / count);
  for (let i = 0; i < count; i++) {
    const segStart = i * (100 / count);
    const fillRatio = Math.max(0, Math.min(1, (remain - segStart) / (100 / count)));
    const s = row.addStack();
    s.layoutHorizontally();
    s.size = new Size(segW, 6);
    s.cornerRadius = 3;
    s.backgroundColor = C.track;
    if (fillRatio >= 0.999) {
      s.backgroundColor = quotaColor(percent);
    } else if (fillRatio > 0) {
      const fill = s.addStack();
      fill.backgroundColor = quotaColor(percent);
      fill.cornerRadius = 3;
      fill.size = new Size(Math.max(2, Math.round(segW * fillRatio)), 6);
      s.addSpacer();
    }
    if (i !== count - 1) row.addSpacer(2);
  }
}
// 配额面板:标题 + 百分比 + 进度条(5h 连续条 / 7d 分段条) + 底部重置信息
function quotaPanel(parent, title, remainPct, reset, width, segmented) {
  const box = parent.addStack();
  box.layoutVertically();
  box.size = new Size(width, 60);
  box.backgroundColor = C.panel;
  box.cornerRadius = 10;
  box.borderColor = C.stroke;
  box.borderWidth = 0.5;
  box.setPadding(8, 11, 7, 11);

  const head = box.addStack();
  head.layoutHorizontally();
  txt(head, title, 14, "bold", C.text);
  head.addSpacer();
  txt(head, remainPct == null ? "--%" : `${remainPct}%`, 12, "regular", quotaColor(remainPct));

  box.addSpacer(7);
  if (segmented) segmentedBar(box, remainPct, width - 22);
  else progressBar(box, remainPct, width - 22, 6);

  box.addSpacer(5);
  const foot = box.addStack();
  foot.layoutHorizontally();
  txt(foot, resetDateLabel(reset), 8, "regular", C.sub);
  foot.addSpacer();
  txt(foot, resetLabel(reset), 8, "regular", C.sub);
}
function miniMetric(parent, value, label, color, width) {
  const box = parent.addStack();
  box.layoutVertically();
  box.size = new Size(width, 36);
  box.backgroundColor = C.panel3;
  box.cornerRadius = 10;
  box.borderColor = C.stroke;
  box.borderWidth = 0.5;
  box.setPadding(7, 10, 6, 10);
  txt(box, value, 12, "bold", color);
  box.addSpacer(2);
  txt(box, label, 8, "regular", C.sub);
}
function summaryCell(parent, value, label, color, width) {
  const box = parent.addStack();
  box.layoutVertically();
  box.size = new Size(width, 52);
  box.backgroundColor = C.panel;
  box.cornerRadius = 10;
  box.borderColor = C.stroke;
  box.borderWidth = 0.5;
  box.setPadding(8, 6, 7, 6);
  box.centerAlignContent();
  const v = txt(box, value, 13, "bold", color);
  v.centerAlignText();
  box.addSpacer(3);
  const l = txt(box, label, 9, "regular", C.sub);
  l.centerAlignText();
}
function badge(parent, label) {
  const v = String(label || "").toUpperCase();
  const fg = v === "FREE" ? C.blue : v === "PRO" ? C.pink : C.green;
  const bg = v === "FREE" ? C.blueBg : v === "PRO" ? C.pinkBg : C.greenBg;
  const b = parent.addStack();
  b.backgroundColor = bg;
  b.cornerRadius = 7;
  b.setPadding(1, 4, 1, 4);
  txt(b, label, 8, "bold", fg);
}
function sectionTitle(parent, title, right) {
  const row = parent.addStack();
  row.layoutHorizontally();
  txt(row, title, 11, "bold", C.text);
  row.addSpacer();
  txt(row, right, 10, "bold", C.sub);
}
function siteRowUI(parent, s, fontSize = 10) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  dot(row, !s.enabled ? C.dim : s.ok ? C.green : s.status === "degraded" ? C.yellow : C.red, 6, 6);
  txt(row, short(s.name, 12), fontSize, "regular", C.text);
  row.addSpacer();
  txt(row, !s.enabled ? "停用" : `${s.latency}ms`, fontSize - 1, "regular",
    !s.enabled ? C.dim : s.latency <= 0 ? C.dim : s.latency < 500 ? C.green : s.latency < 1500 ? C.yellow : C.red);
}
function oauthCard(parent, x, width) {
  const card = parent.addStack();
  card.layoutVertically();
  card.size = new Size(width, 60);
  card.backgroundColor = C.panel;
  card.cornerRadius = 10;
  card.borderColor = C.stroke;
  card.borderWidth = 0.5;
  card.setPadding(7, 12, 9, 12);

  const cw = width - 24;
  const top = card.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  const email = txt(top, short(x.name, 24), 11, "bold", C.text);
  email.minimumScaleFactor = 0.65;
  top.addSpacer(5);
  badge(top, x.plan);
  top.addSpacer();
  txt(top, x.ok ? "可用" : x.limited ? "触顶" : "异常", 9, "bold", x.ok ? C.green : C.yellow);

  card.addSpacer(4);
  const meta = card.addStack();
  meta.layoutHorizontally();
  txt(meta, `${x.site} · 5h ${x.fiveRemain ?? "--"}%`, 9, "regular", C.sub);
  meta.addSpacer();
  txt(meta, `7d ${x.weekRemain ?? "--"}%`, 9, "regular", C.sub);

  card.addSpacer(7);
  progressBar(card, Math.min(x.fiveRemain ?? 0, x.weekRemain ?? 0), cw, 5);
}

// 布局尺寸(按机型估算)
function logicalWidth() {
  try {
    const s = Device.screenSize();
    const raw = Math.min(s.width, s.height);
    const scale = typeof Device.screenScale === "function" ? Device.screenScale() : 1;
    return raw > 500 && scale > 1 ? raw / scale : raw;
  } catch (_) { return 390; }
}
function widgetWidth(family) {
  const big = logicalWidth() >= 414;
  if (family === "small") return big ? 169 : 155;
  return big ? 348 : 329;
}
function columns(totalWidth, count, gap) {
  const available = totalWidth - gap * (count - 1);
  const baseW = Math.floor(available / count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(i === count - 1 ? available - baseW * (count - 1) : baseW);
  return out;
}
// 各尺寸边距
const PAD = { small: 15, medium: 13, large: 15 };

// ==========================================
// 入口
// ==========================================
const cfg = await loadConfig();
const notConfigured = !cfg;
if (cfg) RUNTIME = cfg;

let d = null;
let fetchError = null;
if (!notConfigured) {
  const r = await fetchAdmin();
  if (r && r.error) fetchError = r.error;
  else d = r;
}

if (!config.runsInWidget) {
  console.log(`[xLyra] baseURL = ${RUNTIME.baseURL || "(未配置)"}`);
  if (RUNTIME.token) console.log(`[xLyra] token = ${RUNTIME.token.slice(0, 12)}…${RUNTIME.token.slice(-4)}`);
  if (d) console.log(`[xLyra] health = ${d.health} | sites ${d.sitesHealthy}/${d.sitesTotal} | keys ${d.keys.active}/${d.keys.total} | oauth ${d.oauthHealthy}/${d.oauthTotal} | today ${d.today.requests}req $${money(d.today.cost)}`);
  if (fetchError) console.log(`[xLyra] fetch error = ${fetchError}`);
}

const w = base();
w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

if (notConfigured) {
  renderMessage(w, "xLyra", "未配置:长按 Widget → Edit → Parameter 填  https://host@xlyra-admin-xxxx", C.yellow);
} else if (fetchError) {
  renderMessage(w, "xLyra 刷新失败", fetchError, C.red);
} else if (WIDGET_SIZE === "small") {
  renderSmall(w, d);
} else if (WIDGET_SIZE === "large") {
  renderLarge(w, d);
} else {
  renderMedium(w, d);
}

w.refreshAfterDate = new Date(Date.now() + 1000 * 60 * CONFIG.refreshMinutes);
Script.setWidget(w);

// 更新检查:Widget 后台也执行(受 widgetAutoUpdate 和节流控制)
await checkUpdate();

if (!config.runsInWidget) {
  if (WIDGET_SIZE === "small") await w.presentSmall();
  else if (WIDGET_SIZE === "large") await w.presentLarge();
  else await w.presentMedium();
}
Script.complete();

// ---------------- 错误 / 未配置 ----------------
function renderMessage(w, title, msg, color) {
  w.setPadding(16, 16, 16, 16);
  w.addSpacer();
  const t = txt(w, title, 15, "bold", C.text);
  t.centerAlignText();
  w.addSpacer(6);
  const m = w.addText(msg);
  m.font = Font.systemFont(10);
  m.textColor = color;
  m.centerAlignText();
  w.addSpacer();
}

// ---------------- 有 OAuth 时的配额双面板 ----------------
function addQuotaPanels(w, d, cw, gap = 10) {
  const q = d.oauthRows[0];
  if (!q) return;
  const cols2 = columns(cw, 2, gap);
  const quota = w.addStack();
  quota.layoutHorizontally();
  quotaPanel(quota, "5h", q.fiveRemain, q.fiveReset, cols2[0], false);
  quota.addSpacer(gap);
  quotaPanel(quota, "7d", q.weekRemain, q.weekReset, cols2[1], true);
}

// ==========================================
// Small
// ==========================================
function renderSmall(w, d) {
  const pad = PAD.small;
  const cw = widgetWidth("small") - pad * 2;
  w.setPadding(pad, pad, pad, pad);

  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  dot(head, healthColor(d.health), 8, 6);
  txt(head, "xLyra", 13, "bold", C.text);
  head.addSpacer();
  statusPill(head, healthLabel(d.health), d.health, 46);

  w.addSpacer(10);
  const big = txt(w, `$${money(d.today.cost)}`, 28, "semibold", C.text);
  big.centerAlignText();
  w.addSpacer(2);
  txt(w, `今日费用 · ${d.today.requests} 请求`, 9, "regular", C.sub).centerAlignText();

  w.addSpacer();
  const ratePct = Math.round(d.today.successRate * 100);
  progressBar(w, ratePct, cw, 5);
  w.addSpacer(5);
  const foot = w.addStack();
  foot.layoutHorizontally();
  txt(foot, `成功率 ${ratePct}%`, 9, "regular", quotaColor(ratePct));
  foot.addSpacer();
  txt(foot, `站点 ${d.sitesHealthy}/${d.sitesTotal}`, 9, "regular", C.sub);
}

// ==========================================
// Medium(自适应:无 OAuth → 站点健康列表)
// ==========================================
function renderMedium(w, d) {
  const pad = PAD.medium;
  const cw = widgetWidth("medium") - pad * 2;
  const hasOAuth = d.oauthRows.length > 0;
  w.setPadding(pad, pad, pad, pad);

  // hero 头
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const left = head.addStack();
  left.layoutVertically();
  txt(left, `更新于 ${monthDayTime(d.checkedAt)}`, 12, "bold", C.text);
  left.addSpacer(2);
  txt(left, `请求 ${d.today.requests} · 成功率 ${pct(d.today.successRate)} · 失败 ${d.today.failed}`, 9, "regular", C.sub);
  head.addSpacer();
  statusPill(head, healthLabel(d.health), d.health, 52);

  w.addSpacer(10);

  if (hasOAuth) {
    addQuotaPanels(w, d, cw);
    w.addSpacer(10);
    const cols3 = columns(cw, 3, 10);
    const bottom = w.addStack();
    bottom.layoutHorizontally();
    miniMetric(bottom, compact(d.today.tokens), "今日 Token", C.text, cols3[0]);
    bottom.addSpacer(10);
    miniMetric(bottom, `$${money(d.today.cost)}`, "今日费用", C.text, cols3[1]);
    bottom.addSpacer(10);
    miniMetric(bottom, `${d.rpm}`, "RPM", d.rpm > 0 ? C.cyan : C.sub, cols3[2]);
  } else {
    // 无 OAuth:站点健康 + 底部指标
    sectionTitle(w, "站点健康", `${d.sitesHealthy}/${d.sitesTotal} 在线`);
    w.addSpacer(6);
    if (!d.sites.length) txt(w, "暂无站点", 10, "regular", C.dim);
    d.sites.slice(0, CONFIG.mediumSiteLimit).forEach((s, i) => {
      siteRowUI(w, s, 10);
      if (i < Math.min(d.sites.length, CONFIG.mediumSiteLimit) - 1) w.addSpacer(5);
    });

    w.addSpacer();
    w.addSpacer(8);

    const cols3 = columns(cw, 3, 10);
    const bottom = w.addStack();
    bottom.layoutHorizontally();
    miniMetric(bottom, compact(d.today.tokens), "今日 Token", C.text, cols3[0]);
    bottom.addSpacer(10);
    miniMetric(bottom, `$${money(d.today.cost)}`, "今日费用", C.text, cols3[1]);
    bottom.addSpacer(10);
    miniMetric(bottom, `${d.rpm}`, "RPM", d.rpm > 0 ? C.cyan : C.sub, cols3[2]);
  }
}

// ==========================================
// Large(自适应:OAuth 卡片 / 站点列表 / TOP3 模型)
// ==========================================
function renderLarge(w, d) {
  const pad = PAD.large;
  const cw = widgetWidth("large") - pad * 2;
  const hasOAuth = d.oauthRows.length > 0;
  const hasTop = d.topModels.length > 0;
  w.setPadding(pad, pad, pad, pad);

  // hero 头
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  const left = head.addStack();
  left.layoutVertically();
  txt(left, `更新于 ${monthDayTime(d.checkedAt)}`, 13, "bold", C.text);
  left.addSpacer(2);
  txt(left, `请求 ${d.today.requests} · 成功率 ${pct(d.today.successRate)} · 失败 ${d.today.failed} · 冷却 ${d.cooldowns}`, 9, "regular", C.sub);
  head.addSpacer();
  statusPill(head, healthLabel(d.health), d.health, 52);

  // 4 摘要格(不显示 OAuth 格如果没有账号)
  w.addSpacer(12);
  const cells = [
    [`${d.sitesHealthy}/${d.sitesTotal}`, "站点", d.sitesHealthy === d.sitesTotal ? C.green : C.yellow],
    [`$${money(d.today.cost)}`, "今日费用", C.text],
    [pct(d.today.successRate), "成功率", d.today.successRate >= 0.95 ? C.green : C.yellow],
  ];
  if (hasOAuth) cells.unshift([`${d.oauthHealthy}/${d.oauthTotal}`, "OAuth", d.oauthHealthy === d.oauthTotal ? C.green : C.yellow]);
  else cells.push([`${d.keys.active}/${d.keys.total}`, "API Key", d.keys.exhausted ? C.yellow : C.green]);

  const cols4 = columns(cw, cells.length, 10);
  const sum = w.addStack();
  sum.layoutHorizontally();
  cells.forEach((c, i) => {
    summaryCell(sum, c[0], c[1], c[2], cols4[i]);
    if (i < cells.length - 1) sum.addSpacer(10);
  });

  // 配额面板(仅有 OAuth)
  if (hasOAuth) {
    w.addSpacer(12);
    addQuotaPanels(w, d, cw);
  }

  // OAuth 账号卡片 / 站点健康
  if (hasOAuth) {
    w.addSpacer(12);
    sectionTitle(w, "OAuth 账户", `${d.oauthHealthy}/${d.oauthTotal} 可用`);
    w.addSpacer(7);
    d.oauthRows.slice(0, CONFIG.largeOAuthLimit).forEach((x, i) => {
      oauthCard(w, x, cw);
      if (i < Math.min(d.oauthRows.length, CONFIG.largeOAuthLimit) - 1) w.addSpacer(8);
    });
  } else if (d.sites.length) {
    w.addSpacer(12);
    sectionTitle(w, "站点健康", `${d.sitesHealthy}/${d.sitesTotal} 在线`);
    w.addSpacer(7);
    d.sites.slice(0, CONFIG.largeSiteLimit).forEach((s, i) => {
      siteRowUI(w, s, 10);
      if (i < Math.min(d.sites.length, CONFIG.largeSiteLimit) - 1) w.addSpacer(5);
    });
  }

  // TOP3 模型成本(无 OAuth 且有数据时展示)
  if (!hasOAuth && hasTop) {
    w.addSpacer(12);
    sectionTitle(w, "今日模型成本 TOP3", `$${money(d.today.cost)}`);
    w.addSpacer(7);
    const medal = [C.yellow, C.sub, C.dim];
    d.topModels.forEach((t, i) => {
      const row = w.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      dot(row, medal[i] || C.dim, 6, 6);
      txt(row, short(t.name, 18), 10, "regular", C.text);
      row.addSpacer();
      txt(row, `$${money(t.cost)}`, 10, "bold", C.text);
      if (i < d.topModels.length - 1) w.addSpacer(5);
    });
  }

  w.addSpacer();

  // 底部
  const foot = w.addStack();
  foot.layoutHorizontally();
  foot.centerAlignContent();
  const top1 = d.topModels[0];
  txt(foot, hasOAuth && top1 ? `TOP ${short(top1.name, 14)} $${money(top1.cost)}` : `冷却 ${d.cooldowns} · RPM ${d.rpm}`, 9, "regular", C.sub);
  foot.addSpacer();
  txt(foot, `累计 $${money(d.totals.cost)} · ${compact(d.totals.tokens)}T`, 9, "regular", C.dim);
}
