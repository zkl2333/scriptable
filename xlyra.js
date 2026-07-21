// ==========================================
// XLYRA · 控制台看板
// 数据源: xLyra Admin API (/api/v1/dashboard/epaper-summary)
// 风格: 彭博终端 × 点阵 LED × 粗野主义
// 作者: zkl2333
// @version 1.4.8
// ==========================================
//
// 【首次配置】在 Scriptable 里运行一次脚本:
//   依次输入 后端地址 + Admin Access Token, 自动存入 Keychain,
//   并发起一次真实请求验证, 验证失败会提示且不会保存。
//   想换凭证? 运行脚本 → 菜单里选「重新配置凭证」即可覆盖。
//
// 【App 内运行 = 菜单】在 Scriptable 里点运行会弹出菜单 sheet:
//   刷新预览 / 重新配置凭证 / 检查更新。
//   桌面组件后台刷新时不会弹菜单, 只渲染。
//
// 【自动更新】脚本内置自更新: 添加到桌面组件后,
//   每次刷新都会比对 GitHub 上的 @version, 有新版本会在
//   后台静默更新自己并重新渲染, 无需任何操作。
//   不想自动更新? 把下面 CONFIG.autoUpdate 改成 false。
//
// ==========================================

// ==========================================
// 配置
// ==========================================
const CONFIG = {
  baseURL: "",
  adminToken: "",
  timeoutMs: 8000, // 单次请求超时(毫秒)
  autoUpdate: true, // 自动更新开关
  version: "1.4.8", // 当前版本(与 @version 保持一致)
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/xlyra.js", //  Raw 地址
  updateCheckInterval: 6 * 3600, // 更新检查节流(秒), 默认 6 小时
};

const KC_URL = "xlyra.baseURL";
const KC_URL_LEGACY = "xlyra.consoleURL"; // 旧版组件(xlyra-widget)的地址键名
const KC_TOKEN = "xlyra.adminToken";
const KC_UPDATE_AT = "xlyra.updateCheckedAt";

// 自更新尽早执行: 即使后面的渲染 API 在这台设备上崩了,
// 组件也能靠后台刷新自愈(函数声明会提升, 这里调用没问题)
if (CONFIG.autoUpdate && !(config.runsInApp && config.runsInActionExtension)) {
  try {
    await applyUpdateIfAny({ interactive: false });
  } catch (e) {}
}

// ==========================================
// 终端主题
// ==========================================
const DARK = {
  bg: new Color("#0b0b0b"),
  panel: new Color("#131310"),
  grid: new Color("#ffffff", 0.05),
  tick: new Color("#3a3a3a"),
  line: new Color("#3a3a3a"),
  fg: new Color("#e8e6e1"),
  dim: new Color("#8a877e"),
  amber: new Color("#ffb224"),
  led: new Color("#ffb224"),
  ledDim: new Color("#ffb224", 0.12),
  green: new Color("#3dd68c"),
  red: new Color("#f2555a"),
  yellow: new Color("#ffd60a"),
};
const LIGHT = {
  bg: new Color("#efece4"),
  panel: new Color("#f8f6f0"),
  grid: new Color("#000000", 0.07),
  tick: new Color("#14100e"),
  line: new Color("#14100e"),
  fg: new Color("#16130f"),
  dim: new Color("#6f6a5e"),
  amber: new Color("#b45309"),
  led: new Color("#c2410c"),
  ledDim: new Color("#c2410c", 0.14),
  green: new Color("#0a7d4e"),
  red: new Color("#c2242a"),
  yellow: new Color("#8a6d00"),
};
const C = Device.isUsingDarkAppearance() ? DARK : LIGHT;
// 等宽字体三级降级(已核对官方文档):
//   regularMonospacedSystemFont/boldMonospacedSystemFont(文档 API)
//   → new Font("Menlo")(iOS 系统自带等宽)
//   → 系统字体兜底
const _monoFont =
  typeof Font.regularMonospacedSystemFont === "function"
    ? (s, w) => (w === "bold" ? Font.boldMonospacedSystemFont(s) : Font.regularMonospacedSystemFont(s))
    : (s, w) => {
        try {
          return new Font(w === "bold" ? "Menlo-Bold" : "Menlo", s);
        } catch (e) {
          return w === "bold" ? Font.boldSystemFont(s) : Font.regularSystemFont(s);
        }
      };
const MONO = _monoFont(9, "regular");
const MONO_B = _monoFont(9, "bold");
const MONO_SM = _monoFont(8, "regular");

// ==========================================
// 5×7 点阵 LED 字库
// ==========================================
const LED_FONT = {
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
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

// 把文本渲染成 LED 点阵图(灭灯位保留暗点, 像真数码管)
function ledImage(text, { dot = 2, gap = 1, pad = 2 } = {}) {
  const glyphs = [...String(text)].map((ch) => LED_FONT[ch] || LED_FONT[" "]);
  const cw = 5 * (dot + gap);
  const w = Math.ceil(glyphs.length * cw - gap + pad * 2);
  const h = Math.ceil(7 * (dot + gap) - gap + pad * 2);
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true; // 文档确认: 这是布尔属性, 不是方法
  glyphs.forEach((glyph, i) => {
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        const on = glyph[r][col] === "#";
        ctx.setFillColor(on ? C.led : C.ledDim);
        ctx.fillRect(new Rect(pad + i * cw + col * (dot + gap), pad + r * (dot + gap), dot, dot));
      }
    }
  });
  return ctx.getImage();
}

// 点阵网格底纹 + 四角刻度线(彭博终端背景)
function dotGrid(family) {
  const [w, h] =
    family === "small" ? [180, 180] : family === "medium" ? [380, 180] : [380, 400];
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(C.bg);
  ctx.fillRect(new Rect(0, 0, w, h));
  ctx.setFillColor(C.grid);
  for (let y = 5; y < h; y += 9) {
    for (let x = 5; x < w; x += 9) ctx.fillRect(new Rect(x, y, 1.3, 1.3));
  }
  ctx.setFillColor(C.tick);
  const t = 2, L = 10, m = 6;
  ctx.fillRect(new Rect(m, m, L, t));
  ctx.fillRect(new Rect(m, m, t, L));
  ctx.fillRect(new Rect(w - m - L, m, L, t));
  ctx.fillRect(new Rect(w - m - t, m, t, L));
  ctx.fillRect(new Rect(m, h - m - t, L, t));
  ctx.fillRect(new Rect(m, h - m - L, t, L));
  ctx.fillRect(new Rect(w - m - L, h - m - t, L, t));
  ctx.fillRect(new Rect(w - m - t, h - m - L, t, L));
  return ctx.getImage();
}

// ==========================================
// 组件绘制
// ==========================================
function brandRow(w, time) {
  const s = w.addStack();
  s.centerAlignContent();
  const sq = s.addText("▪");
  sq.font = MONO_B;
  sq.textColor = C.amber;
  s.addSpacer(5);
  const brand = s.addText("XLYRA // 控制台");
  brand.font = MONO_B;
  brand.textColor = C.fg;
  s.addSpacer();
  const t = s.addText(time);
  t.font = MONO_SM;
  t.textColor = C.dim;
}

function sectionTitle(w, text) {
  const t = w.addText("▸ " + text);
  t.font = MONO_B;
  t.textColor = C.amber;
}

function dash(w) {
  const t = w.addText("-".repeat(30));
  t.font = MONO_SM;
  t.textColor = C.line;
  t.lineLimit = 1;
}

function chip(parent, { label, value, dot }) {
  const st = parent.addStack();
  st.borderWidth = 1;
  st.borderColor = C.line;
  st.cornerRadius = 0;
  st.backgroundColor = C.panel;
  st.setPadding(3, 6, 3, 6);
  st.centerAlignContent();
  const d = st.addText("●");
  d.font = _monoFont(7, "regular");
  d.textColor = dot;
  st.addSpacer(4);
  const l = st.addText(label + " ");
  l.font = MONO_SM;
  l.textColor = C.dim;
  const v = st.addText(value);
  v.font = MONO_B;
  v.textColor = C.fg;
  return st;
}

function cell(parent, label, value, valueColor) {
  const c = parent.addStack();
  c.layoutVertically();
  c.borderWidth = 1;
  c.borderColor = C.line;
  c.cornerRadius = 0;
  c.backgroundColor = C.panel;
  c.setPadding(5, 7, 5, 7);
  const l = c.addText(label);
  l.font = MONO_SM;
  l.textColor = C.dim;
  c.addSpacer(3);
  const v = c.addText(value);
  v.font = _monoFont(15, "bold");
  v.textColor = valueColor || C.fg;
  v.minimumScaleFactor = 0.6;
}

// ==========================================
// 小组件
// ==========================================
function renderSmall(w, data, time) {
  brandRow(w, time);
  w.addSpacer(8);

  const lab = w.addText("TODAY // 今日费用");
  lab.font = MONO_SM;
  lab.textColor = C.dim;
  w.addSpacer(4);
  const led = ledImage("$" + money(data.today_cost), { dot: 2.2, gap: 0.9 });
  w.addImage(led);
  w.addSpacer(4);
  const sub = w.addText(`总 $${money(data.total_cost)} · ${compact(data.today_tokens)} TOK`);
  sub.font = MONO_SM;
  sub.textColor = C.dim;
  w.addSpacer(7);
  dash(w);
  w.addSpacer(6);

  const r1 = w.addStack();
  const a1 = r1.addText("请求 ");
  a1.font = MONO_SM;
  a1.textColor = C.dim;
  const v1 = r1.addText(String(data.today_success_requests ?? 0));
  v1.font = MONO_B;
  v1.textColor = C.fg;
  r1.addSpacer();
  const a2 = r1.addText("成功率 ");
  a2.font = MONO_SM;
  a2.textColor = C.dim;
  const v2 = r1.addText(data.success_rate + "%");
  v2.font = MONO_B;
  v2.textColor = data.success_rate >= 99 ? C.green : data.success_rate >= 95 ? C.yellow : C.red;

  w.addSpacer(5);

  const r2 = w.addStack();
  const b1 = r2.addText("站点 ");
  b1.font = MONO_SM;
  b1.textColor = C.dim;
  const u1 = r2.addText(data.sites_online + "/" + data.sites_total);
  u1.font = MONO_B;
  u1.textColor = data.sites_online === data.sites_total ? C.green : C.yellow;
  r2.addSpacer();
  const b2 = r2.addText("KEY ");
  b2.font = MONO_SM;
  b2.textColor = C.dim;
  const u2 = r2.addText(data.keys_active + "/" + data.keys_total);
  u2.font = MONO_B;
  u2.textColor = data.keys_active === data.keys_total ? C.fg : C.yellow;

  if (data.top_models && data.top_models.length) {
    w.addSpacer(7);
    dash(w);
    w.addSpacer(6);
    const r3 = w.addStack();
    const n = r3.addText("▸ " + trunc(data.top_models[0].model, 14));
    n.font = MONO_SM;
    n.textColor = C.fg;
    n.lineLimit = 1;
    r3.addSpacer();
    const c1 = r3.addText("$" + money(data.top_models[0].cost));
    c1.font = MONO_B;
    c1.textColor = C.amber;
  }
}

// ==========================================
// 中组件
// ==========================================
function renderMedium(w, data, time) {
  const root = w.addStack();
  root.centerAlignContent();

  // 左列: 品牌 + LED 费用
  const left = root.addStack();
  left.layoutVertically();
  left.size = new Size(150, 0);
  brandRow(left, time);
  left.addSpacer(10);
  const lab = left.addText("TODAY // 今日费用");
  lab.font = MONO_SM;
  lab.textColor = C.dim;
  left.addSpacer(5);
  left.addImage(ledImage("$" + money(data.today_cost), { dot: 2.3, gap: 1 }));
  left.addSpacer(5);
  const sub = left.addText(`总 $${money(data.total_cost)}`);
  sub.font = MONO_SM;
  sub.textColor = C.dim;
  const sub2 = left.addText(`今日 ${compact(data.today_tokens)} TOKENS`);
  sub2.font = MONO_SM;
  sub2.textColor = C.dim;

  root.addSpacer();

  // 右列: 2×2 指标格
  const col1 = root.addStack();
  col1.layoutVertically();
  col1.size = new Size(82, 0);
  cell(col1, "请求", String(data.today_success_requests ?? 0));
  col1.addSpacer(6);
  cell(col1, "站点", data.sites_online + "/" + data.sites_total, data.sites_online === data.sites_total ? C.green : C.yellow);

  root.addSpacer(6);

  const col2 = root.addStack();
  col2.layoutVertically();
  col2.size = new Size(82, 0);
  cell(
    col2,
    "成功率",
    data.success_rate + "%",
    data.success_rate >= 99 ? C.green : data.success_rate >= 95 ? C.yellow : C.red
  );
  col2.addSpacer(6);
  cell(col2, "KEY", data.keys_active + "/" + data.keys_total, data.keys_active === data.keys_total ? C.fg : C.yellow);
}

// ==========================================
// 大组件
// ==========================================
function renderLarge(w, data, time) {
  brandRow(w, time);
  w.addSpacer(6);
  const chips = w.addStack();
  chip(chips, { label: "站点", value: data.sites_online + "/" + data.sites_total, dot: data.sites_online === data.sites_total ? C.green : C.yellow });
  chips.addSpacer(6);
  chip(chips, { label: "KEY", value: data.keys_active + "/" + data.keys_total, dot: data.keys_active === data.keys_total ? C.green : C.yellow });
  chips.addSpacer(6);
  chip(chips, { label: "RPM", value: String(data.rpm_60s ?? 0), dot: C.amber });
  w.addSpacer(10);

  const lab = w.addText("TODAY // 今日费用");
  lab.font = MONO_SM;
  lab.textColor = C.dim;
  w.addSpacer(5);
  w.addImage(ledImage("$" + money(data.today_cost), { dot: 2.9, gap: 1.2 }));
  w.addSpacer(5);
  const sub = w.addText(`TOTAL $${money(data.total_cost)} · 今日 ${compact(data.today_tokens)} TOKENS`);
  sub.font = MONO_SM;
  sub.textColor = C.dim;
  w.addSpacer(10);

  const cellsRow = w.addStack();
  cell(cellsRow, "请求", String(data.today_success_requests ?? 0));
  cellsRow.addSpacer(6);
  cell(
    cellsRow,
    "成功率",
    data.success_rate + "%",
    data.success_rate >= 99 ? C.green : data.success_rate >= 95 ? C.yellow : C.red
  );
  cellsRow.addSpacer(6);
  cell(cellsRow, "RPM", String(data.rpm_60s ?? 0));
  cellsRow.addSpacer(6);
  cell(cellsRow, "TPM", compact(data.tpm_60s ?? 0));
  w.addSpacer(10);

  // 站点健康
  sectionTitle(w, "SITES // 站点健康");
  w.addSpacer(5);
  for (const s of data.sites.slice(0, 4)) {
    const row = w.addStack();
    row.centerAlignContent();
    const d = row.addText(s.online ? "●" : s.enabled === false ? "◌" : "○");
    d.font = MONO;
    d.textColor = s.online ? C.green : s.enabled === false ? C.dim : C.red;
    row.addSpacer(6);
    const n = row.addText(trunc(s.name, 12));
    n.font = MONO;
    n.textColor = s.enabled === false ? C.dim : C.fg;
    n.lineLimit = 1;
    row.addSpacer();
    const lat = row.addText(s.online && s.latency_ms ? s.latency_ms + "ms" : s.enabled === false ? "停用" : "--");
    lat.font = MONO_SM;
    lat.textColor = C.dim;
    row.addSpacer(6);
    const cost = row.addText("$" + money(s.today_cost));
    cost.font = MONO_B;
    cost.textColor = C.amber;
    w.addSpacer(4);
  }

  // 模型 TOP3
  if (data.top_models && data.top_models.length) {
    w.addSpacer(6);
    sectionTitle(w, "COST TOP3 // 今日模型");
    w.addSpacer(5);
    data.top_models.slice(0, 3).forEach((m, i) => {
      const row = w.addStack();
      row.centerAlignContent();
      const rk = row.addText(i + 1 + " ");
      rk.font = MONO_B;
      rk.textColor = i === 0 ? C.amber : C.dim;
      row.addSpacer(2);
      const n = row.addText(trunc(m.model, 18));
      n.font = MONO;
      n.textColor = C.fg;
      n.lineLimit = 1;
      row.addSpacer();
      const cost = row.addText("$" + money(m.cost));
      cost.font = MONO_B;
      cost.textColor = C.amber;
      if (i < 2) w.addSpacer(4);
    });
  }

  // OAuth 额度(有数据才显示)
  if (data.oauth) {
    w.addSpacer(8);
    dash(w);
    w.addSpacer(6);
    sectionTitle(w, "OAUTH // 账号");
    w.addSpacer(5);
    for (const a of data.oauth.accounts.slice(0, 2)) {
      const row = w.addStack();
      row.centerAlignContent();
      const d = row.addText("●");
      d.font = MONO;
      d.textColor = a.status === "error" ? C.red : a.status === "warning" ? C.yellow : C.green;
      row.addSpacer(6);
      const n = row.addText(trunc(a.name, 12));
      n.font = MONO;
      n.textColor = C.fg;
      n.lineLimit = 1;
      row.addSpacer();
      if (a.weekly_remaining_percent != null) {
        const wk = row.addText("周 " + a.weekly_remaining_percent + "%");
        wk.font = MONO_SM;
        wk.textColor = a.weekly_remaining_percent > 30 ? C.fg : C.yellow;
        row.addSpacer(6);
      }
      const h5 = row.addText("5h " + (a.five_hour_remaining_percent == null ? "--" : a.five_hour_remaining_percent + "%"));
      h5.font = MONO_B;
      h5.textColor = C.amber;
      w.addSpacer(4);
    }
    if (data.oauth.next_reset_at) {
      const rs = w.addText("↻ 额度重置 " + fmtTime(data.oauth.next_reset_at));
      rs.font = MONO_SM;
      rs.textColor = C.dim;
    }
  }
}

// ==========================================
// 数据
// ==========================================
function loadAuth() {
  if (CONFIG.baseURL && CONFIG.adminToken) return { baseURL: CONFIG.baseURL, adminToken: CONFIG.adminToken };
  let baseURL = Keychain.contains(KC_URL) ? Keychain.get(KC_URL) : "";
  // 兼容旧版键名: 命中则迁移到新键名, 一次到位
  if (!baseURL && Keychain.contains(KC_URL_LEGACY)) {
    baseURL = Keychain.get(KC_URL_LEGACY);
    if (baseURL) Keychain.set(KC_URL, baseURL);
  }
  let adminToken = Keychain.contains(KC_TOKEN) ? Keychain.get(KC_TOKEN) : "";
  // 兼容早期版本的组件 Parameter 配置: <baseURL>@<token> 或 <baseURL>|<token>
  if ((!baseURL || !adminToken) && args.widgetParameter) {
    const p = String(args.widgetParameter).trim();
    const i = p.indexOf("|") > 0 ? p.indexOf("|") : p.indexOf("@");
    if (i > 0) {
      const u = p
        .slice(0, i)
        .trim()
        .replace(/\/v1\/?$/i, "") // 网关 /v1 后缀对 Admin API 是错的, 归一化掉
        .replace(/\/+$/, "");
      const t = p.slice(i + 1).trim();
      if (u && t) {
        baseURL = u;
        adminToken = t;
        Keychain.set(KC_URL, u);
        Keychain.set(KC_TOKEN, t);
      }
    }
  }
  return { baseURL, adminToken };
}

async function fetchAdmin(baseURL, token, path) {
  const req = new Request(baseURL.replace(/\/+$/, "") + path);
  req.method = "GET";
  req.headers = { Accept: "application/json", "X-Access-Token": token };
  req.timeoutInterval = CONFIG.timeoutMs / 1000;
  return req.loadJSON();
}

async function loadData() {
  const { baseURL, adminToken } = loadAuth();
  if (!baseURL || !adminToken) return { configured: false };

  // 今日零点(本地时区 → RFC3339), 用于统计今日失败请求数
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const createdFrom = encodeURIComponent(dayStart.toISOString());

  const opt = (p) => p.catch(() => null); // 增强项失败不拖垮核心数据
  const [epaper, health, keys, failedReqs, usage] = await Promise.all([
    fetchAdmin(baseURL, adminToken, "/api/v1/dashboard/epaper-summary"),
    fetchAdmin(baseURL, adminToken, "/api/v1/health/sites"),
    fetchAdmin(baseURL, adminToken, "/api/v1/api-keys?page=1&page_size=200"),
    opt(fetchAdmin(baseURL, adminToken, `/api/v1/requests?success=false&page_size=1&created_from=${createdFrom}`)),
    opt(fetchAdmin(baseURL, adminToken, "/api/v1/dashboard/usage")),
  ]);

  // epaper-summary 是扁平结构: kpis / model_top3_today / codex_quota
  const kpis = epaper.kpis || {};
  const okReqs = kpis.today_requests ?? 0;
  const failed = failedReqs?.meta?.total ?? 0;
  const totalReq = okReqs + failed;

  // 站点健康 + 今日按站点成本(usage 的 daily_site_cost 按 epaper.date 匹配"今日")
  const siteCostById = {};
  for (const row of usage?.charts?.daily_site_cost ?? []) {
    if (row.date === epaper.date) siteCostById[row.site_id] = row.cost;
  }
  const healthItems = Array.isArray(health?.items) ? health.items : [];
  const sites = healthItems.map((it) => {
    const enabled = it.site?.enabled !== false;
    const online = enabled && it.health?.status === "healthy";
    return {
      name: it.site?.name ?? "?",
      enabled,
      online,
      latency_ms: it.health?.recent_avg_latency_ms != null ? Math.round(it.health.recent_avg_latency_ms) : null,
      today_cost: siteCostById[it.site?.id] ?? 0,
    };
  });
  const sitesOnline = sites.filter((s) => s.online).length;

  // 下游 Key
  const keyItems = Array.isArray(keys?.items) ? keys.items : [];
  const keysActive = keyItems.filter((k) => k.status === "active").length;

  // Codex OAuth 额度摘要(account_count 为 0 时整块不展示)
  const quota = epaper.codex_quota || {};
  let oauth = null;
  if ((quota.account_count ?? 0) > 0) {
    const five = quota.five_hour?.remaining_percent ?? null;
    const weekly = quota.weekly?.remaining_percent ?? null;
    const low = (v) => v != null && v <= 20;
    oauth = {
      accounts: [
        {
          name: `Codex ×${quota.account_count}`,
          status: low(five) || low(weekly) ? "warning" : "ok",
          five_hour_remaining_percent: five,
          weekly_remaining_percent: weekly,
        },
      ],
      next_reset_at: quota.five_hour?.reset_at ?? quota.weekly?.reset_at ?? null,
    };
  }

  return {
    configured: true,
    today_cost: kpis.today_cost ?? 0,
    total_cost: kpis.total_cost ?? 0,
    today_tokens: kpis.today_tokens ?? 0,
    today_success_requests: okReqs,
    success_rate: totalReq > 0 ? +((okReqs / totalReq) * 100).toFixed(1) : 100,
    sites_total: sites.length,
    sites_online: sitesOnline,
    keys_total: keyItems.length,
    keys_active: keysActive,
    rpm_60s: kpis.rpm_used ?? 0,
    tpm_60s: kpis.tpm_used ?? 0,
    top_models: (Array.isArray(epaper.model_top3_today) ? epaper.model_top3_today : []).map((m) => ({
      model: m.model_key,
      cost: m.cost,
    })),
    oauth,
    sites,
  };
}

// ==========================================
// 自更新
// ==========================================
function semverCompare(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

async function checkForUpdate({ force = false, interactive = false } = {}) {
  try {
    if (!force) {
      const last = Keychain.contains(KC_UPDATE_AT) ? Number(Keychain.get(KC_UPDATE_AT)) : 0;
      if (Date.now() / 1000 - last < CONFIG.updateCheckInterval) return null;
    }
    Keychain.set(KC_UPDATE_AT, String(Math.floor(Date.now() / 1000)));
    const req = new Request(CONFIG.updateURL + "?t=" + Date.now());
    req.timeoutInterval = 10;
    const source = await req.loadString();
    const m = source.match(/@version\s+([\d.]+)/);
    if (!m || semverCompare(m[1], CONFIG.version) <= 0) return null;
    return { version: m[1], source };
  } catch (e) {
    return null;
  }
}

async function applyUpdateIfAny({ interactive = false } = {}) {
  const found = await checkForUpdate({ force: interactive, interactive });
  if (!found) return false;
  if (interactive) {
    const alert = new Alert();
    alert.title = "发现新版本 v" + found.version;
    alert.message = "是否立即更新 xlyra 组件脚本?";
    alert.addAction("更新");
    alert.addCancelAction("取消");
    if ((await alert.presentAlert()) !== 0) return false;
  }
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), Script.name() + ".js");
  fm.writeString(path, found.source);
  return true;
}

// ==========================================
// 引导配置
// ==========================================
async function runSetup() {
  const alert = new Alert();
  alert.title = "XLYRA // 组件配置";
  alert.message = "依次输入后端地址和 Admin Token, 将发起一次真实请求验证。\n\n已配置过? 继续 = 覆盖旧凭证";
  alert.addAction("开始配置");
  alert.addCancelAction("取消");
  if ((await alert.presentAlert()) !== 0) return;

  const urlAlert = new Alert();
  urlAlert.title = "后端地址";
  urlAlert.message = "例如 http://192.168.1.10:5801";
  urlAlert.addTextField("http://", Keychain.contains(KC_URL) ? Keychain.get(KC_URL) : "");
  urlAlert.addAction("下一步");
  urlAlert.addCancelAction("取消");
  if ((await urlAlert.presentAlert()) !== 0) return;
  const baseURL = urlAlert.textFieldValue(0).trim().replace(/\/+$/, "");

  const tokenAlert = new Alert();
  tokenAlert.title = "Admin Access Token";
  tokenAlert.message = "控制台 → 个人设置 → Access Token";
  if (typeof tokenAlert.addSecureTextField === "function") tokenAlert.addSecureTextField("xlyra-admin-...");
  else tokenAlert.addTextField("xlyra-admin-...");
  tokenAlert.addAction("验证并保存");
  tokenAlert.addCancelAction("取消");
  if ((await tokenAlert.presentAlert()) !== 0) return;
  const token = tokenAlert.textFieldValue(0).trim();

  try {
    await fetchAdmin(baseURL, token, "/api/v1/dashboard/epaper-summary");
  } catch (e) {
    const fail = new Alert();
    fail.title = "验证失败";
    fail.message = "无法连接或 Token 无效, 未保存。\n\n" + e;
    fail.addAction("重试");
    fail.addCancelAction("取消");
    if ((await fail.presentAlert()) === 0) return runSetup();
    return;
  }

  Keychain.set(KC_URL, baseURL);
  Keychain.set(KC_TOKEN, token);
  const done = new Alert();
  done.title = "配置完成 ✓";
  done.message = "凭证已验证并保存到 Keychain。\n现在把组件添加到桌面吧。";
  done.addAction("完成");
  await done.presentAlert();
}

// 返回值: true = 继续往下渲染预览, false = 直接结束
// 菜单用 UITable 实现(最老的 Scriptable API, 任何版本都是原生表格 sheet 观感)
async function runMenu() {
  for (;;) {
    let action = null;
    const table = new UITable();
    table.showSeparators = true;

    const head = new UITableRow();
    head.isHeader = true;
    head.height = 34;
    const hcell = head.addText(`XLYRA // 控制台   v${CONFIG.version}`);
    hcell.titleFont = _monoFont(12, "bold");
    table.addRow(head);

    const addRow = (icon, title, subtitle, value) => {
      const r = new UITableRow();
      r.height = 48;
      r.dismissOnSelect = true;
      const cell = r.addText(icon + "  " + title, subtitle);
      cell.titleFont = _monoFont(13, "bold");
      cell.subtitleFont = _monoFont(10, "regular");
      cell.subtitleColor = new Color("#8a877e");
      r.onSelect = () => {
        action = value;
      };
      table.addRow(r);
    };
    addRow("▶", "刷新预览", "按当前组件尺寸渲染一次", "preview");
    addRow("⚙", "重新配置凭证", "覆盖 Keychain 里的后端地址和 Admin Token", "setup");
    addRow("↻", "检查更新", "从 GitHub 比对 @version 并更新", "update");
    addRow("✕", "关闭", "什么都不做, 直接退出", null);

    const foot = new UITableRow();
    foot.height = 30;
    const fcell = foot.addText("桌面组件后台刷新不会弹出此菜单");
    fcell.titleFont = _monoFont(9, "regular");
    fcell.titleColor = new Color("#8a877e");
    table.addRow(foot);

    await table.present();

    if (action === "preview") return true;
    if (action === "setup") {
      await runSetup();
      return true;
    }
    if (action === "update") {
      const updated = await applyUpdateIfAny({ interactive: true });
      const a = new Alert();
      if (updated) {
        a.title = "更新完成";
        a.message = "脚本已更新, 请重新运行。";
        a.addAction("好");
        await a.presentAlert();
        return false;
      }
      a.title = "已是最新";
      a.message = `当前 v${CONFIG.version}`;
      a.addAction("好");
      await a.presentAlert();
      // 回到菜单
    }
    if (action === null) return false; // 关闭
  }
}

// ==========================================
// 工具
// ==========================================
function money(v) {
  const n = Number(v) || 0;
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function compact(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function trunc(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtTime(ts) {
  // 兼容 Unix 秒 / 毫秒 / RFC3339 字符串
  let ms = typeof ts === "string" ? Date.parse(ts) : Number(ts);
  if (!Number.isFinite(ms)) return "--:--";
  if (ms < 1e12) ms *= 1000;
  const d = new Date(ms);
  return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
}

// ==========================================
// 入口
// ==========================================
// App 内运行: 未配置 → 配置向导; 已配置 → 弹出菜单 sheet(预览在菜单里)
let proceedToRender = true;
if (config.runsInApp && !config.runsWithSiri && !config.runsInActionExtension) {
  const { baseURL: _u, adminToken: _t } = loadAuth();
  if (!_u || !_t) await runSetup();
  else proceedToRender = await runMenu();
}

if (proceedToRender) {
  let data;
  try {
    data = await loadData();
  } catch (e) {
    data = { configured: true, error: String(e) };
  }

  const family = config.widgetFamily || "small";
  const w = new ListWidget();
  w.setPadding(16, 14, 16, 14);
  w.backgroundImage = dotGrid(family);
  const now = new Date();
  const time = now.getHours() + ":" + ("0" + now.getMinutes()).slice(-2);

  if (!data.configured) {
    const t1 = w.addText("▪ XLYRA");
    t1.font = MONO_B;
    t1.textColor = C.fg;
    w.addSpacer(8);
    const t2 = w.addText("NOT CONFIGURED");
    t2.font = MONO_B;
    t2.textColor = C.amber;
    w.addSpacer(4);
    const t3 = w.addText("在 Scriptable 中运行脚本\n完成凭证配置");
    t3.font = MONO_SM;
    t3.textColor = C.dim;
  } else if (data.error) {
    const t1 = w.addText("▪ XLYRA // ERROR");
    t1.font = MONO_B;
    t1.textColor = C.red;
    w.addSpacer(8);
    const t2 = w.addText(trunc(data.error, 60));
    t2.font = MONO_SM;
    t2.textColor = C.dim;
    w.addSpacer();
    const t3 = w.addText(time);
    t3.font = MONO_SM;
    t3.textColor = C.dim;
  } else {
    if (family === "medium") renderMedium(w, data, time);
    else if (family === "large") renderLarge(w, data, time);
    else renderSmall(w, data, time);
  }

  if (config.runsInApp) {
    if (family === "large") await w.presentLarge();
    else if (family === "medium") await w.presentMedium();
    else await w.presentSmall();
  } else {
    Script.setWidget(w);
  }
}
Script.complete();
