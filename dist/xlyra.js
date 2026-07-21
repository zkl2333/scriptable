// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tachometer-alt;
// @script-id xlyra
// @version 1.6.0

// src/lib/updater.js
var DEFAULT_CHECK_INTERVAL = 24 * 3600;
var UPDATE_KEY_PREFIX = "scriptable.updater";
var compareVersions = (left, right) => {
  const leftParts = String(left).split(".").map((part) => Number(part) || 0);
  const rightParts = String(right).split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let i = 0; i < length; i++) {
    const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
};
var readMetadata = (source) => ({
  scriptId: source.match(/@script-id\s+([a-z0-9-]+)/i)?.[1],
  version: source.match(/@version\s+([0-9]+(?:\.[0-9]+){1,2})/)?.[1]
});
var getTargetFileManager = (filePath) => {
  try {
    const iCloud = FileManager.iCloud();
    if (iCloud.isFileStoredIniCloud(filePath)) return iCloud;
  } catch {
  }
  return FileManager.local();
};
var saveBackup = (scriptId, source) => {
  const local = FileManager.local();
  const backupDir = local.joinPath(local.libraryDirectory(), "widget-update-backups");
  if (!local.fileExists(backupDir)) local.createDirectory(backupDir, true);
  local.writeString(local.joinPath(backupDir, `${scriptId}.js.bak`), source);
};
var createUpdater = ({
  scriptId,
  version,
  updateURL,
  checkInterval = DEFAULT_CHECK_INTERVAL
}) => {
  const checkedAtKey = `${UPDATE_KEY_PREFIX}.${scriptId}.checkedAt`;
  const checkForUpdate = async ({ force = false } = {}) => {
    const lastCheckedAt = Keychain.contains(checkedAtKey) ? Number(Keychain.get(checkedAtKey)) : 0;
    const now = Math.floor(Date.now() / 1e3);
    if (!force && now - lastCheckedAt < checkInterval) return null;
    Keychain.set(checkedAtKey, String(now));
    const request = new Request(`${updateURL}?t=${Date.now()}`);
    request.timeoutInterval = 10;
    const source = await request.loadString();
    const metadata = readMetadata(source);
    if (metadata.scriptId !== scriptId) {
      throw new Error(`更新文件标识不匹配：${metadata.scriptId || "missing"}`);
    }
    if (!metadata.version) throw new Error("更新文件缺少版本号");
    if (source.length < 200) throw new Error("更新文件内容不完整");
    if (compareVersions(metadata.version, version) <= 0) return null;
    return { source, version: metadata.version };
  };
  const applyUpdateIfAny = async ({ interactive = false } = {}) => {
    const update = await checkForUpdate({ force: interactive });
    if (!update) return false;
    if (interactive) {
      const alert = new Alert();
      alert.title = `发现新版本 v${update.version}`;
      alert.message = `是否更新 ${Script.name()}？`;
      alert.addAction("更新");
      alert.addCancelAction("取消");
      if (await alert.presentAlert() !== 0) return false;
    }
    const targetPath = module.filename;
    if (!targetPath) throw new Error("无法定位当前脚本文件");
    const fileManager = getTargetFileManager(targetPath);
    saveBackup(scriptId, fileManager.readString(targetPath));
    fileManager.writeString(targetPath, update.source);
    return true;
  };
  const autoUpdate = async () => {
    if (config.runsInApp && config.runsInActionExtension) return false;
    try {
      return await applyUpdateIfAny();
    } catch {
      return false;
    }
  };
  return { applyUpdateIfAny, autoUpdate, checkForUpdate };
};

// src/widgets/xlyra.js
var CONFIG = {
  baseURL: "",
  adminToken: "",
  timeoutMs: 8e3,
  // 单次请求超时(毫秒)
  autoUpdate: true,
  // 自动更新开关
  version: "1.6.0"
};
var KC_URL = "xlyra.baseURL";
var KC_URL_LEGACY = "xlyra.consoleURL";
var KC_TOKEN = "xlyra.adminToken";
var updater = createUpdater({
  scriptId: "xlyra",
  version: "1.6.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/xlyra.js"
});
if (CONFIG.autoUpdate && !(config.runsInApp && config.runsInActionExtension)) {
  await updater.autoUpdate();
}
var dyn = (light, dark) => Color.dynamic(light, dark);
var C = {
  bg: dyn(new Color("#efece4"), new Color("#0b0b0b")),
  panel: dyn(new Color("#f8f6f0"), new Color("#131310")),
  grid: new Color("#808080", 0.22),
  // 烘焙进底纹图, 深浅底色下都可读
  line: dyn(new Color("#14100e"), new Color("#3a3a3a")),
  fg: dyn(new Color("#16130f"), new Color("#e8e6e1")),
  dim: dyn(new Color("#6f6a5e"), new Color("#8a877e")),
  amber: dyn(new Color("#b45309"), new Color("#ffb224")),
  green: dyn(new Color("#0a7d4e"), new Color("#3dd68c")),
  red: dyn(new Color("#c2242a"), new Color("#f2555a")),
  yellow: dyn(new Color("#8a6d00"), new Color("#ffd60a")),
  led: new Color("#f59e0b"),
  // 烘焙位图, 深浅底色下都可读的琥珀
  ledDim: new Color("#f59e0b", 0.13)
};
var _monoFont = typeof Font.regularMonospacedSystemFont === "function" ? (s, w) => w === "bold" ? Font.boldMonospacedSystemFont(s) : Font.regularMonospacedSystemFont(s) : (s, w) => {
  try {
    return new Font(w === "bold" ? "Menlo-Bold" : "Menlo", s);
  } catch (e) {
    return w === "bold" ? Font.boldSystemFont(s) : Font.regularSystemFont(s);
  }
};
var MONO = _monoFont(9, "regular");
var MONO_B = _monoFont(9, "bold");
var MONO_SM = _monoFont(8, "regular");
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
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."]
};
function ledImage(text, { dot = 2, gap = 1, pad = 2 } = {}) {
  const glyphs = [...String(text)].map((ch) => LED_FONT[ch] || LED_FONT[" "]);
  const cw = 5 * (dot + gap);
  const w = Math.ceil(glyphs.length * cw - gap + pad * 2);
  const h = Math.ceil(7 * (dot + gap) - gap + pad * 2);
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  glyphs.forEach((glyph, i) => {
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        const on = glyph[r][col] === "#";
        ctx.setFillColor(on ? C.led : C.ledDim);
        ctx.fillRect(new Rect(pad + i * cw + col * (dot + gap), pad + r * (dot + gap), dot, dot));
      }
    }
  });
  return { image: ctx.getImage(), width: w, height: h };
}
function addLed(parent, text, opts) {
  const led = ledImage(text, opts);
  const wi = parent.addImage(led.image);
  wi.imageSize = new Size(led.width, led.height);
  return wi;
}
function dotGrid(family) {
  const [w, h] = family === "small" ? [180, 180] : family === "medium" ? [380, 180] : [380, 400];
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(C.grid);
  for (let y = 5; y < h; y += 9) {
    for (let x = 5; x < w; x += 9) ctx.fillRect(new Rect(x, y, 1.3, 1.3));
  }
  return ctx.getImage();
}
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
function renderSmall(w, data, time) {
  brandRow(w, time);
  w.addSpacer(8);
  const lab = w.addText("TODAY // 今日费用");
  lab.font = MONO_SM;
  lab.textColor = C.dim;
  w.addSpacer(4);
  addLed(w, money(data.today_cost), { dot: 2.2, gap: 0.9 });
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
function renderMedium(w, data, time) {
  brandRow(w, time);
  w.addSpacer(6);
  const mid = w.addStack();
  mid.topAlignContent();
  const left = mid.addStack();
  left.layoutVertically();
  left.size = new Size(150, 0);
  const lab = left.addText("TODAY // 今日费用");
  lab.font = MONO_SM;
  lab.textColor = C.dim;
  left.addSpacer(3);
  addLed(left, money(data.today_cost), { dot: 2.4, gap: 1 });
  left.addSpacer(3);
  const sub = left.addText(`总 $${money(data.total_cost)} · ${compact(data.today_tokens)} TOK`);
  sub.font = MONO_SM;
  sub.textColor = C.dim;
  left.addSpacer(2);
  const sub2 = left.addText(`RPM ${data.rpm_60s ?? 0} · TPM ${compact(data.tpm_60s ?? 0)}`);
  sub2.font = MONO_SM;
  sub2.textColor = C.dim;
  mid.addSpacer(10);
  const right = mid.addStack();
  right.layoutVertically();
  const tops = (data.top_models || []).slice(0, 3);
  if (tops.length) {
    const rt = right.addText("COST TOP3 // 今日模型");
    rt.font = MONO_SM;
    rt.textColor = C.dim;
    right.addSpacer(4);
    tops.forEach((m, i) => {
      const r = right.addStack();
      r.centerAlignContent();
      const nm = r.addText(`${i + 1} ${trunc(m.model, 15)}`);
      nm.font = MONO_SM;
      nm.textColor = C.fg;
      nm.lineLimit = 1;
      r.addSpacer();
      const v = r.addText("$" + money(m.cost));
      v.font = MONO_B;
      v.textColor = C.amber;
      if (i < tops.length - 1) right.addSpacer(3);
    });
  }
  w.addSpacer();
  const row = w.addStack();
  cell(row, "请求", String(data.today_success_requests ?? 0));
  row.addSpacer();
  cell(
    row,
    "成功率",
    data.success_rate + "%",
    data.success_rate >= 99 ? C.green : data.success_rate >= 95 ? C.yellow : C.red
  );
  row.addSpacer();
  cell(row, "失败", String(data.today_failed ?? 0), (data.today_failed ?? 0) > 0 ? C.red : C.green);
  row.addSpacer();
  cell(row, "站点", data.sites_online + "/" + data.sites_total, data.sites_online === data.sites_total ? C.green : C.yellow);
  row.addSpacer();
  cell(row, "KEY", data.keys_active + "/" + data.keys_total, data.keys_active === data.keys_total ? C.fg : C.yellow);
}
function renderLarge(w, data, time) {
  brandRow(w, time);
  w.addSpacer(8);
  const lab = w.addText("TODAY // 今日费用");
  lab.font = MONO_SM;
  lab.textColor = C.dim;
  w.addSpacer(4);
  const ledRow = w.addStack();
  ledRow.centerAlignContent();
  addLed(ledRow, money(data.today_cost), { dot: 4.2, gap: 1.8 });
  ledRow.addSpacer(14);
  const agg = ledRow.addStack();
  agg.layoutVertically();
  const a1 = agg.addText(`TOTAL $${money(data.total_cost)}`);
  a1.font = MONO_B;
  a1.textColor = C.fg;
  a1.lineLimit = 1;
  a1.minimumScaleFactor = 0.7;
  agg.addSpacer(3);
  const a2 = agg.addText(`今日 ${compact(data.today_tokens)} TOKENS`);
  a2.font = MONO_SM;
  a2.textColor = C.dim;
  a2.lineLimit = 1;
  agg.addSpacer(3);
  const a3 = agg.addText(`RPM ${data.rpm_60s ?? 0} · TPM ${compact(data.tpm_60s ?? 0)}`);
  a3.font = MONO_SM;
  a3.textColor = C.dim;
  a3.lineLimit = 1;
  w.addSpacer(10);
  const cellsRow = w.addStack();
  cell(cellsRow, "请求", String(data.today_success_requests ?? 0));
  cellsRow.addSpacer();
  cell(
    cellsRow,
    "成功率",
    data.success_rate + "%",
    data.success_rate >= 99 ? C.green : data.success_rate >= 95 ? C.yellow : C.red
  );
  cellsRow.addSpacer();
  cell(cellsRow, "失败", String(data.today_failed ?? 0), (data.today_failed ?? 0) > 0 ? C.red : C.green);
  cellsRow.addSpacer();
  cell(cellsRow, "站点", data.sites_online + "/" + data.sites_total, data.sites_online === data.sites_total ? C.green : C.yellow);
  cellsRow.addSpacer();
  cell(cellsRow, "KEY", data.keys_active + "/" + data.keys_total, data.keys_active === data.keys_total ? C.fg : C.yellow);
  w.addSpacer(10);
  sectionTitle(w, "SITES // 站点健康");
  w.addSpacer(4);
  const maxSites = data.oauth ? 4 : 7;
  for (const s of data.sites.slice(0, maxSites)) {
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
    w.addSpacer(3);
  }
  if (data.sites.length > maxSites) {
    const more = w.addText(`… +${data.sites.length - maxSites} 个站点`);
    more.font = MONO_SM;
    more.textColor = C.dim;
  }
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
function loadAuth() {
  if (CONFIG.baseURL && CONFIG.adminToken) return { baseURL: CONFIG.baseURL, adminToken: CONFIG.adminToken };
  let baseURL = Keychain.contains(KC_URL) ? Keychain.get(KC_URL) : "";
  if (!baseURL && Keychain.contains(KC_URL_LEGACY)) {
    baseURL = Keychain.get(KC_URL_LEGACY);
    if (baseURL) Keychain.set(KC_URL, baseURL);
  }
  let adminToken = Keychain.contains(KC_TOKEN) ? Keychain.get(KC_TOKEN) : "";
  if ((!baseURL || !adminToken) && args.widgetParameter) {
    const p = String(args.widgetParameter).trim();
    const i = p.indexOf("|") > 0 ? p.indexOf("|") : p.indexOf("@");
    if (i > 0) {
      const u = p.slice(0, i).trim().replace(/\/v1\/?$/i, "").replace(/\/+$/, "");
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
  req.timeoutInterval = CONFIG.timeoutMs / 1e3;
  return req.loadJSON();
}
async function loadData() {
  const { baseURL, adminToken } = loadAuth();
  if (!baseURL || !adminToken) return { configured: false };
  const dayStart = /* @__PURE__ */ new Date();
  dayStart.setHours(0, 0, 0, 0);
  const createdFrom = encodeURIComponent(dayStart.toISOString());
  const opt = (p) => p.catch(() => null);
  const [epaper, health, keys, failedReqs, usage] = await Promise.all([
    fetchAdmin(baseURL, adminToken, "/api/v1/dashboard/epaper-summary"),
    fetchAdmin(baseURL, adminToken, "/api/v1/health/sites"),
    fetchAdmin(baseURL, adminToken, "/api/v1/api-keys?page=1&page_size=200"),
    opt(fetchAdmin(baseURL, adminToken, `/api/v1/requests?success=false&page_size=1&created_from=${createdFrom}`)),
    opt(fetchAdmin(baseURL, adminToken, "/api/v1/dashboard/usage"))
  ]);
  const kpis = epaper.kpis || {};
  const okReqs = kpis.today_requests ?? 0;
  const failed = failedReqs?.meta?.total ?? 0;
  const totalReq = okReqs + failed;
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
      today_cost: siteCostById[it.site?.id] ?? 0
    };
  });
  const sitesOnline = sites.filter((s) => s.online).length;
  const keyItems = Array.isArray(keys?.items) ? keys.items : [];
  const keysActive = keyItems.filter((k) => k.status === "active").length;
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
          weekly_remaining_percent: weekly
        }
      ],
      next_reset_at: quota.five_hour?.reset_at ?? quota.weekly?.reset_at ?? null
    };
  }
  return {
    configured: true,
    today_cost: kpis.today_cost ?? 0,
    total_cost: kpis.total_cost ?? 0,
    today_tokens: kpis.today_tokens ?? 0,
    today_success_requests: okReqs,
    today_failed: failed,
    success_rate: totalReq > 0 ? +(okReqs / totalReq * 100).toFixed(1) : 100,
    sites_total: sites.length,
    sites_online: sitesOnline,
    keys_total: keyItems.length,
    keys_active: keysActive,
    rpm_60s: kpis.rpm_used ?? 0,
    tpm_60s: kpis.tpm_used ?? 0,
    top_models: (Array.isArray(epaper.model_top3_today) ? epaper.model_top3_today : []).map((m) => ({
      model: m.model_key,
      cost: m.cost
    })),
    oauth,
    sites
  };
}
async function runSetup() {
  const alert = new Alert();
  alert.title = "XLYRA // 组件配置";
  alert.message = "依次输入后端地址和 Admin Token, 将发起一次真实请求验证。\n\n已配置过? 继续 = 覆盖旧凭证";
  alert.addAction("开始配置");
  alert.addCancelAction("取消");
  if (await alert.presentAlert() !== 0) return;
  const urlAlert = new Alert();
  urlAlert.title = "后端地址";
  urlAlert.message = "例如 http://192.168.1.10:5801";
  urlAlert.addTextField("http://", Keychain.contains(KC_URL) ? Keychain.get(KC_URL) : "");
  urlAlert.addAction("下一步");
  urlAlert.addCancelAction("取消");
  if (await urlAlert.presentAlert() !== 0) return;
  const baseURL = urlAlert.textFieldValue(0).trim().replace(/\/+$/, "");
  const tokenAlert = new Alert();
  tokenAlert.title = "Admin Access Token";
  tokenAlert.message = "控制台 → 个人设置 → Access Token";
  if (typeof tokenAlert.addSecureTextField === "function") tokenAlert.addSecureTextField("xlyra-admin-...");
  else tokenAlert.addTextField("xlyra-admin-...");
  tokenAlert.addAction("验证并保存");
  tokenAlert.addCancelAction("取消");
  if (await tokenAlert.presentAlert() !== 0) return;
  const token = tokenAlert.textFieldValue(0).trim();
  try {
    await fetchAdmin(baseURL, token, "/api/v1/dashboard/epaper-summary");
  } catch (e) {
    const fail = new Alert();
    fail.title = "验证失败";
    fail.message = "无法连接或 Token 无效, 未保存。\n\n" + e;
    fail.addAction("重试");
    fail.addCancelAction("取消");
    if (await fail.presentAlert() === 0) return runSetup();
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
async function runMenu() {
  for (; ; ) {
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
      const cell2 = r.addText(icon + "  " + title, subtitle);
      cell2.titleFont = _monoFont(13, "bold");
      cell2.subtitleFont = _monoFont(10, "regular");
      cell2.subtitleColor = new Color("#8a877e");
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
      const a = new Alert();
      try {
        const updated = await updater.applyUpdateIfAny({ interactive: true });
        if (updated) {
          a.title = "更新完成";
          a.message = "脚本已更新, 请重新运行。";
          a.addAction("好");
          await a.presentAlert();
          return false;
        }
        a.title = "已是最新";
        a.message = `当前 v${CONFIG.version}`;
      } catch (error) {
        a.title = "检查失败";
        a.message = String(error);
      }
      a.addAction("好");
      await a.presentAlert();
    }
    if (action === null) return false;
  }
}
function money(v) {
  const n = Number(v) || 0;
  if (n >= 1e3) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  let ms = typeof ts === "string" ? Date.parse(ts) : Number(ts);
  if (!Number.isFinite(ms)) return "--:--";
  if (ms < 1e12) ms *= 1e3;
  const d = new Date(ms);
  return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
}
var proceedToRender = true;
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
  w.backgroundColor = C.bg;
  w.backgroundImage = dotGrid(family);
  const now = /* @__PURE__ */ new Date();
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
