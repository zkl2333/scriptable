// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: terminal;
// @script-id cyber-clock
// @version 1.0.0

// src/lib/updater.js
var DEFAULT_CHECK_INTERVAL = 24 * 3600;
var UPDATE_KEY_PREFIX = "zkl2333.widgetUpdater";
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
  const checkForUpdate2 = async ({ force = false } = {}) => {
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
  const applyUpdateIfAny = async ({ interactive = false, force = interactive } = {}) => {
    const update = await checkForUpdate2({ force });
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
  return { applyUpdateIfAny, autoUpdate, checkForUpdate: checkForUpdate2 };
};

// src/lib/widget-menu.js
var showMessage = async (title, message) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("好");
  await alert.presentAlert();
};
var checkForUpdate = async ({ updater: updater2, version }) => {
  try {
    const update = await updater2.checkForUpdate({ force: true });
    if (!update) {
      await showMessage("已是最新", `当前 v${version}`);
      return false;
    }
    const confirm = new Alert();
    confirm.title = `发现新版本 v${update.version}`;
    confirm.message = `是否更新 ${Script.name()}？`;
    confirm.addAction("更新");
    confirm.addCancelAction("取消");
    if (await confirm.presentAlert() !== 0) return false;
    const updated = await updater2.applyUpdateIfAny({ force: true });
    if (!updated) {
      await showMessage("更新未完成", "远端版本已变化，请重新检查。");
      return false;
    }
    await showMessage("更新完成", "脚本已更新，请重新运行。");
    return true;
  } catch (error) {
    await showMessage("检查失败", String(error));
    return false;
  }
};
var shouldShowWidgetMenu = () => config.runsInApp && !config.runsWithSiri && !config.runsInActionExtension;
var attachMenuURL = (widget) => {
  widget.url = URLScheme.forRunningScript();
  return widget;
};
var PREVIEW_DEFINITIONS = {
  small: { label: "小尺寸 Small", method: "presentSmall", group: "home" },
  medium: { label: "中尺寸 Medium", method: "presentMedium", group: "home" },
  large: { label: "大尺寸 Large", method: "presentLarge", group: "home" },
  extraLarge: {
    label: "超大尺寸 Extra Large（iPad）",
    method: "presentExtraLarge",
    group: "home"
  },
  accessoryInline: {
    label: "锁屏单行 Inline",
    method: "presentAccessoryInline",
    group: "accessory"
  },
  accessoryCircular: {
    label: "锁屏圆形 Circular",
    method: "presentAccessoryCircular",
    group: "accessory"
  },
  accessoryRectangular: {
    label: "锁屏矩形 Rectangular",
    method: "presentAccessoryRectangular",
    group: "accessory"
  }
};
var getPreviewDefinition = (family) => {
  const definition = PREVIEW_DEFINITIONS[family];
  if (!definition) throw new RangeError(`不支持的组件尺寸：${family}`);
  return definition;
};
var normalizePreviewFamilies = (families) => {
  if (!Array.isArray(families)) throw new TypeError("预览尺寸必须是数组");
  const uniqueFamilies = [...new Set(families)];
  uniqueFamilies.forEach(getPreviewDefinition);
  return uniqueFamilies;
};
var isPreviewAvailable = (family) => {
  if (family !== "extraLarge") return true;
  return typeof Device !== "undefined" && typeof Device.isPad === "function" && Device.isPad();
};
var presentWidget = async (widget, family = "medium") => {
  const { method } = getPreviewDefinition(family);
  if (typeof widget?.[method] !== "function") {
    throw new TypeError(`当前 Scriptable 不支持 ${family} 预览`);
  }
  return widget[method]();
};
var DEFAULT_PREVIEW_FAMILIES = ["small", "medium", "large", "extraLarge"];
var selectPreviewFamilies = async (families) => {
  const availableFamilies = normalizePreviewFamilies(families).filter(isPreviewAvailable);
  if (availableFamilies.length === 0) {
    await showMessage("无法预览", "当前设备不支持此组件提供的尺寸。");
    return null;
  }
  const choices = availableFamilies.map((family) => ({
    label: getPreviewDefinition(family).label,
    families: [family]
  }));
  const homeFamilies = availableFamilies.filter(
    (family) => getPreviewDefinition(family).group === "home"
  );
  const accessoryFamilies = availableFamilies.filter(
    (family) => getPreviewDefinition(family).group === "accessory"
  );
  if (homeFamilies.length > 0 && accessoryFamilies.length > 0) {
    choices.push(
      { label: "全部主屏 Home Screen", families: homeFamilies },
      { label: "全部锁屏 Lock Screen", families: accessoryFamilies }
    );
  }
  if (availableFamilies.length > 1) {
    choices.push({ label: "全部尺寸 All", families: availableFamilies });
  }
  const alert = new Alert();
  alert.title = "预览组件";
  alert.message = "选择一个尺寸，或按类别连续预览";
  choices.forEach((choice) => alert.addAction(choice.label));
  alert.addCancelAction("取消操作");
  const index = await alert.presentSheet();
  return choices[index]?.families || null;
};
var presentWidgetPreviews = async (createWidget2, families) => {
  const previewFamilies = normalizePreviewFamilies(families);
  const presented = [];
  const failures = [];
  for (const family of previewFamilies) {
    try {
      await presentWidget(await createWidget2(family), family);
      presented.push(family);
    } catch (error) {
      failures.push({ family, error });
    }
  }
  if (failures.length > 0) {
    const message = failures.map(({ family, error }) => `${getPreviewDefinition(family).label}：${String(error)}`).join("\n");
    await showMessage(
      failures.length === previewFamilies.length ? "预览失败" : "部分预览失败",
      message
    );
  }
  return { presented, failures };
};
var runWidgetMenu = async ({
  title,
  message = "",
  version,
  updater: updater2,
  actions = [],
  previewFamilies = DEFAULT_PREVIEW_FAMILIES
}) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message || `当前版本 v${version}`;
  alert.addAction("预览组件");
  actions.forEach((action) => alert.addAction(action.title));
  alert.addAction("检查更新");
  alert.addCancelAction("取消操作");
  const index = await alert.presentSheet();
  if (index === -1) return null;
  if (index === 0) {
    const families = await selectPreviewFamilies(previewFamilies);
    return families ? { action: "preview", families } : null;
  }
  const actionIndex = index - 1;
  if (actionIndex < actions.length) return { action: actions[actionIndex].id };
  await checkForUpdate({ updater: updater2, version });
  return null;
};

// src/lib/pixel.js
var createSeededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};
var GLYPH_ADVANCE = 6;
var PIXEL_GLYPHS = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "####.", "#...#", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  ">": ["#....", ".#...", "..#..", "...#.", "..#..", ".#...", "#...."],
  "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "%": ["##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."]
};
var measurePixelText = (text, scale) => text.length === 0 ? 0 : text.length * GLYPH_ADVANCE * scale - scale;
var drawPixelText = (context, text, x, y, scale, color) => {
  context.setFillColor(color);
  const startX = Math.round(x);
  const startY = Math.round(y);
  let cursor = startX;
  for (const char of String(text).toUpperCase()) {
    const glyph = PIXEL_GLYPHS[char] || PIXEL_GLYPHS[" "];
    glyph.forEach((row, rowIndex) => {
      for (const [columnIndex, cell] of [...row].entries()) {
        if (cell !== "#") continue;
        context.fillRect(new Rect(
          cursor + columnIndex * scale,
          startY + rowIndex * scale,
          scale,
          scale
        ));
      }
    });
    cursor += GLYPH_ADVANCE * scale;
  }
  return cursor - startX - scale;
};

// src/widgets/cyber-clock.js
var updater = createUpdater({
  scriptId: "cyber-clock",
  version: "1.0.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/cyber-clock.js"
});
await updater.autoUpdate();
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
var FAMILY_CANVAS = {
  small: { width: 158, height: 158, clockScale: 4, labelScale: 2 },
  medium: { width: 338, height: 158, clockScale: 7, labelScale: 2 },
  large: { width: 338, height: 354, clockScale: 10, labelScale: 2 },
  extraLarge: { width: 720, height: 338, clockScale: 12, labelScale: 3 }
};
var COLORS = {
  background: new Color("#070B08"),
  grid: new Color("#0E2114"),
  primary: new Color("#35FF6D"),
  dim: new Color("#1C7A3A"),
  faint: new Color("#134021"),
  cyan: new Color("#3AE0FF"),
  magenta: new Color("#FF4D9D"),
  scanline: new Color("#000000", 0.12)
};
var WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
var pad = (value) => String(value).padStart(2, "0");
var getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 864e5);
};
var drawGrid = (context, width, height) => {
  context.setFillColor(COLORS.grid);
  for (let x = 6; x < width; x += 14) {
    for (let y = 6; y < height; y += 14) {
      context.fillRect(new Rect(x, y, 1, 1));
    }
  }
};
var drawScanlines = (context, width, height) => {
  context.setFillColor(COLORS.scanline);
  for (let y = 2; y < height; y += 5) {
    context.fillRect(new Rect(0, y, width, 1));
  }
};
var drawCorners = (context, width, height) => {
  const arm = 10;
  const inset = 6;
  context.setFillColor(COLORS.dim);
  const corners = [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1]
  ];
  for (const [x, y, directionX, directionY] of corners) {
    context.fillRect(new Rect(
      directionX > 0 ? x : x - arm,
      y,
      arm,
      2
    ));
    context.fillRect(new Rect(
      directionX > 0 ? x : x - 2,
      directionY > 0 ? y : y - arm,
      2,
      arm
    ));
  }
};
var drawGlitch = (context, random, timeText, timeX, timeY, scale, width) => {
  drawPixelText(context, timeText, timeX - scale, timeY, scale, new Color("#FF4D9D66"));
  drawPixelText(context, timeText, timeX + scale, timeY, scale, new Color("#3AE0FF66"));
  drawPixelText(context, timeText, timeX, timeY, scale, COLORS.primary);
  const slices = 2 + Math.floor(random() * 3);
  for (let index = 0; index < slices; index += 1) {
    const sliceY = Math.round(timeY - 4 + random() * (7 * scale + 8));
    const sliceWidth = Math.round(20 + random() * 90);
    const sliceX = Math.round(random() * (width - sliceWidth));
    context.setFillColor(random() > 0.5 ? new Color("#35FF6D4D") : new Color("#3AE0FF4D"));
    context.fillRect(new Rect(sliceX, sliceY, sliceWidth, 2 + Math.floor(random() * 4)));
  }
};
var drawNoise = (context, random, width, height) => {
  for (let index = 0; index < 42; index += 1) {
    context.setFillColor(random() > 0.8 ? COLORS.cyan : COLORS.faint);
    context.fillRect(new Rect(
      Math.round(random() * (width - 2)),
      Math.round(random() * (height - 2)),
      2,
      2
    ));
  }
};
var drawTerminal = (family, now) => {
  const { width, height, clockScale, labelScale } = FAMILY_CANVAS[family];
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = true;
  context.respectScreenScale = true;
  context.setFillColor(COLORS.background);
  context.fillRect(new Rect(0, 0, width, height));
  drawGrid(context, width, height);
  const minuteSeed = Math.floor(now.getTime() / 6e4);
  const random = createSeededRandom(minuteSeed);
  const hourRandom = createSeededRandom(Math.floor(now.getTime() / 36e5));
  const showColon = now.getSeconds() % 2 === 0;
  const timeText = `${pad(now.getHours())}${showColon ? ":" : " "}${pad(now.getMinutes())}`;
  const timeWidth = measurePixelText(timeText, clockScale);
  const hasStatus = family === "large" || family === "extraLarge";
  const timeZoneWidth = family === "extraLarge" ? width * 0.56 : width;
  const timeX = (timeZoneWidth - timeWidth) / 2;
  const dateGap = Math.round(clockScale * 2.2);
  const blockHeight = 7 * clockScale + dateGap + 7 * labelScale;
  const timeY = hasStatus ? Math.round(height * 0.28 - 7 * clockScale / 2) : Math.round((height - blockHeight) / 2);
  if (random() < 0.45) {
    drawGlitch(context, random, timeText, timeX, timeY, clockScale, width);
  } else {
    drawPixelText(context, timeText, timeX, timeY, clockScale, COLORS.primary);
  }
  const dateText = `${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${WEEKDAYS[now.getDay()]}`;
  const dateWidth = measurePixelText(dateText, labelScale);
  drawPixelText(
    context,
    dateText,
    (timeZoneWidth - dateWidth) / 2,
    timeY + 7 * clockScale + dateGap,
    labelScale,
    COLORS.dim
  );
  const uptime = 96 + Math.floor(hourRandom() * 4);
  const dayOfYear = getDayOfYear(now);
  if (family === "medium" || family === "small") {
    const statusScale = 1;
    const statusY = height - 7 * statusScale - 8;
    drawPixelText(context, `> DAY ${dayOfYear}`, 10, statusY, statusScale, COLORS.faint);
    const rightText = `UP ${uptime}%`;
    const rightWidth = measurePixelText(rightText, statusScale);
    drawPixelText(context, rightText, width - rightWidth - 10, statusY, statusScale, COLORS.faint);
  }
  if (hasStatus) {
    const memory = 38 + Math.floor(hourRandom() * 47);
    const lines = [
      "> SYS.ONLINE",
      `> UPLINK ${uptime}%`,
      `> MEM ${memory}%`,
      `> DAY ${dayOfYear}/365`
    ];
    const lineHeight = 7 * labelScale + Math.round(labelScale * 2.5);
    const statusHeight = lines.length * lineHeight;
    let cursorY = height - statusHeight - 18;
    if (family === "extraLarge") cursorY = height * 0.28 - 7 * clockScale / 2;
    const cursorX = family === "extraLarge" ? width * 0.62 : 22;
    lines.forEach((line, index) => {
      const suffix = index === lines.length - 1 && showColon ? "_" : "";
      drawPixelText(context, line + suffix, cursorX, cursorY + index * lineHeight, labelScale, COLORS.dim);
    });
    if (family === "extraLarge") {
      const decoWidth = measurePixelText("SYS", labelScale);
      drawPixelText(context, "SYS", width - decoWidth - 18, height - 7 * labelScale - 16, labelScale, COLORS.faint);
    }
  }
  drawNoise(context, random, width, height);
  drawScanlines(context, width, height);
  drawCorners(context, width, height);
  return context.getImage();
};
var addAccessory = (widget, family, now) => {
  const color = Color.dynamic(new Color("#111111"), new Color("#EEEEEE"));
  const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const weekday = WEEKDAYS[now.getDay()];
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(`${timeText} · ${weekday}`);
    text.font = Font.semiboldMonospacedSystemFont(12);
    text.textColor = color;
    text.lineLimit = 1;
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const time2 = widget.addText(timeText);
    time2.font = Font.boldMonospacedSystemFont(15);
    time2.textColor = color;
    time2.centerAlignText();
    const label = widget.addText(weekday);
    label.font = Font.mediumMonospacedSystemFont(9);
    label.textColor = color;
    label.centerAlignText();
    widget.addSpacer();
    return;
  }
  widget.setPadding(4, 8, 4, 8);
  const time = widget.addText(timeText);
  time.font = Font.boldMonospacedSystemFont(22);
  time.textColor = color;
  widget.addSpacer(2);
  const detail = widget.addText(`${weekday} ${pad(now.getMonth() + 1)}.${pad(now.getDate())} · DAY ${getDayOfYear(now)}`);
  detail.font = Font.mediumMonospacedSystemFont(10);
  detail.textColor = color;
  detail.lineLimit = 1;
};
var createWidget = (family = config.widgetFamily || "medium") => {
  const widget = new ListWidget();
  const now = /* @__PURE__ */ new Date();
  if (ACCESSORY_FAMILIES.includes(family)) {
    addAccessory(widget, family, now);
  } else {
    widget.setPadding(0, 0, 0, 0);
    widget.backgroundImage = drawTerminal(family, now);
  }
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  widget.refreshAfterDate = nextMinute;
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "赛博时钟",
    version: "1.0.0",
    updater,
    previewFamilies: PREVIEW_FAMILIES
  });
  if (menu?.action === "preview") {
    await presentWidgetPreviews(createWidget, menu.families);
  }
} else {
  Script.setWidget(createWidget());
}
Script.complete();
