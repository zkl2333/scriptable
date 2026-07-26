// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: paw-print;
// @script-id pixel-pet
// @version 1.0.1

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
var drawBitmap = (context, rows, originX, originY, scale, palette) => {
  const pixel = Math.max(1, Math.round(scale));
  rows.forEach((row, rowIndex) => {
    for (const [columnIndex, cell] of [...row].entries()) {
      const color = palette[cell];
      if (!color) continue;
      context.setFillColor(color);
      context.fillRect(new Rect(
        Math.round(originX + columnIndex * scale),
        Math.round(originY + rowIndex * scale),
        pixel,
        pixel
      ));
    }
  });
};

// src/widgets/pixel-pet.js
var updater = createUpdater({
  scriptId: "pixel-pet",
  version: "1.0.1",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/pixel-pet.js"
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
var SPECIES = [
  {
    id: "slime",
    name: "冻冻",
    kind: "史莱姆",
    accent: new Color("#0D9488"),
    palette: {
      K: new Color("#0F766E"),
      B: new Color("#5EEAD4"),
      E: new Color("#134E4A"),
      W: new Color("#FFFFFF"),
      R: new Color("#FB7185"),
      M: new Color("#134E4A")
    },
    blink: { 6: ".KBBBBBBBBBBBBK." },
    rows: [
      "................",
      "......KK........",
      ".....KBBK.......",
      ".....KBBBK......",
      "....KBBBBBK.....",
      "..KKBBBBBBBKK...",
      ".KBBBBBBBBBBBK..",
      ".KBBWEBBBBWEBBK.",
      ".KBBEEBBBBEEBBK.",
      ".KBRRBBBBBBRRBK.",
      ".KBBBBBMMBBBBBK.",
      ".KBBBBBBBBBBBBK.",
      ".KBBBBBBBBBBBBK.",
      "..KBBBBBBBBBBK..",
      "...KBBBBBBBBK...",
      "....KKKKKKKK...."
    ]
  },
  {
    id: "cat",
    name: "蛋挞",
    kind: "橘猫",
    accent: new Color("#D97706"),
    palette: {
      K: new Color("#44403C"),
      B: new Color("#FCD34D"),
      E: new Color("#44403C"),
      N: new Color("#F472B6"),
      R: new Color("#FB923C")
    },
    blink: { 7: ".KBBBBBBBBBBBBK." },
    rows: [
      "................",
      "..K..........K..",
      "..KK........KK..",
      "..KBK......KBK..",
      "..KBBK....KBBK..",
      ".KBBBBBKKBBBBBK.",
      ".KBBBBBBBBBBBBK.",
      ".KBBEEBBBBEEBBK.",
      ".KBBEEBBBBEEBBK.",
      ".KBBBBBNNBBBBBK.",
      ".KRRBBBBBBBBRRK.",
      "..KBBBBBBBBBBK..",
      "...KKKKKKKKKK...",
      "................",
      "................",
      "................"
    ]
  },
  {
    id: "robo",
    name: "瓦特",
    kind: "机器人",
    accent: new Color("#0284C7"),
    palette: {
      K: new Color("#334155"),
      B: new Color("#CBD5E1"),
      E: new Color("#0284C7"),
      M: new Color("#64748B"),
      A: new Color("#F43F5E")
    },
    blink: { 5: ".KBBBBBBBBBBBBK." },
    rows: [
      "................",
      ".......KAK......",
      "...KKKKKKKKKK...",
      "..KBBBBBBBBBBK..",
      ".KBBBBBBBBBBBBK.",
      ".KBEEEBBBBEEEBK.",
      ".KBEEEBBBBEEEBK.",
      ".KBBMMMMMMBBBBK.",
      ".KBBBBBBBBBBBBK.",
      "..KBBBBBBBBBBK..",
      "...KKKKKKKKKK...",
      "...KBBBBBBBBK...",
      "...KBAABBAABK...",
      "...KBBBBBBBBK...",
      "...KKKKKKKKKK...",
      "................"
    ]
  },
  {
    id: "birb",
    name: "团子",
    kind: "文鸟",
    accent: new Color("#EA580C"),
    palette: {
      K: new Color("#7C2D12"),
      B: new Color("#FDBA74"),
      E: new Color("#431407"),
      O: new Color("#EA580C"),
      W: new Color("#FB923C")
    },
    blink: { 6: ".KBBBBBBBBBBBBK." },
    rows: [
      "................",
      "................",
      ".....KKKKKK.....",
      "...KKBBBBBBKK...",
      "..KBBBBBBBBBBK..",
      ".KBBBBBBBBBBBBK.",
      ".KBBEEBBBBEEBBK.",
      ".KBBBBBOOBBBBBK.",
      ".KBBBBBBOOBBBBK.",
      ".KBBBBBBBBBBBBK.",
      ".KBBWWBBBBWWBBK.",
      ".KBBWWBBBBWWBBK.",
      "..KBBBBBBBBBBK..",
      "...KKBBBBBBKK...",
      "......O..O......",
      "................"
    ]
  }
];
var HEART_ROWS = ["#.#..", "#####", "#####", ".###.", "..#.."];
var ZZZ_ROWS = ["ZZZ", "..Z", ".Z.", "ZZZ"];
var BAR_SEGMENTS = 12;
var COLORS = {
  text: Color.dynamic(new Color("#292524"), new Color("#F5F5F4")),
  muted: Color.dynamic(new Color("#78716C"), new Color("#A8A29E")),
  track: Color.dynamic(new Color("#E7E5E4"), new Color("#44403C")),
  ground: Color.dynamic(new Color("#000000", 0.08), new Color("#000000", 0.35)),
  heart: new Color("#F43F5E"),
  zzz: new Color("#78716C")
};
var getDayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 864e5);
};
var getPetState = (now = /* @__PURE__ */ new Date()) => {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const progress = Math.min(1, Math.max(0, (now - startOfDay) / 864e5));
  const sleeping = now.getHours() >= 23 || now.getHours() < 7;
  const blinking = !sleeping && now.getMinutes() % 4 === 0;
  const species = SPECIES[getDayOfYear(now) % SPECIES.length];
  const mood = sleeping ? "呼呼大睡中，请勿打扰" : progress < 0.25 ? "刚睡醒，迷迷糊糊" : progress < 0.6 ? "精力旺盛，四处蹦跶" : progress < 0.85 ? "有点困，还在坚持" : "进入省电睡眠模式";
  const hearts = 2 + getDayOfYear(now) % 3;
  return { species, progress, sleeping, blinking, mood, hearts };
};
var getSpriteRows = (species, closedEyes) => {
  if (!closedEyes) return species.rows;
  return species.rows.map((row, index) => species.blink[index] || row);
};
var drawGrowthBar = (context, x, y, width, progress, accent) => {
  const gap = 2;
  const segmentWidth = Math.floor((width - gap * (BAR_SEGMENTS - 1)) / BAR_SEGMENTS);
  const filled = Math.round(progress * BAR_SEGMENTS);
  for (let index = 0; index < BAR_SEGMENTS; index += 1) {
    context.setFillColor(index < filled ? accent : COLORS.track);
    context.fillRect(new Rect(x + index * (segmentWidth + gap), y, segmentWidth, 5));
  }
};
var drawHearts = (context, x, y, count) => {
  for (let index = 0; index < count; index += 1) {
    drawBitmap(context, HEART_ROWS, x + index * 13, y, 2, { "#": COLORS.heart });
  }
};
var drawSleepZzz = (context, x, y) => {
  const palette = { Z: COLORS.zzz };
  drawBitmap(context, ZZZ_ROWS, x, y + 14, 2, palette);
  drawBitmap(context, ZZZ_ROWS, x + 12, y + 6, 3, palette);
  drawBitmap(context, ZZZ_ROWS, x + 26, y - 4, 4, palette);
};
var drawPetScene = (state, width, height, scale, minimal = false) => {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;
  const spriteSize = 16 * scale;
  const spriteX = Math.round((width - spriteSize) / 2);
  const spriteY = minimal ? Math.round((height - spriteSize) / 2) : Math.max(2, height - spriteSize - 14);
  if (!minimal) {
    context.setFillColor(COLORS.ground);
    context.fillEllipse(new Rect(spriteX + scale, spriteY + spriteSize - scale, spriteSize - 2 * scale, scale * 2));
  }
  const rows = getSpriteRows(state.species, state.sleeping || state.blinking);
  drawBitmap(context, rows, spriteX, spriteY, scale, state.species.palette);
  if (state.sleeping) {
    drawSleepZzz(context, spriteX + spriteSize - 8 * scale, spriteY + 2);
  }
  if (!minimal) {
    drawHearts(context, width - 8 - state.hearts * 13, 6, state.hearts);
    drawGrowthBar(context, 6, height - 9, width - 12, state.progress, state.species.accent);
  }
  return context.getImage();
};
var addTextLine = (parent, value, font, color, align = "left") => {
  const text = parent.addText(value);
  text.font = font;
  text.textColor = color;
  if (align === "center") text.centerAlignText();
  return text;
};
var buildInfoColumn = (parent, state, compact = false) => {
  parent.layoutVertically();
  addTextLine(parent, "PIXEL PET", Font.boldMonospacedSystemFont(9), state.species.accent);
  parent.addSpacer(4);
  addTextLine(parent, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(compact ? 14 : 17), COLORS.text);
  parent.addSpacer(4);
  addTextLine(parent, state.mood, Font.systemFont(compact ? 10 : 11), COLORS.muted);
  parent.addSpacer(4);
  addTextLine(parent, `今日陪伴 ${Math.round(state.progress * 100)}%`, Font.mediumSystemFont(compact ? 10 : 11), COLORS.muted);
};
var addSceneImage = (parent, state, width, height, scale, centered = false) => {
  const image = parent.addImage(drawPetScene(state, width, height, scale));
  image.imageSize = new Size(width, height);
  if (centered) image.centerAlignImage();
  return image;
};
var applyBackground = (widget) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#FFF7ED"), new Color("#1C1917")),
    Color.dynamic(new Color("#FFEDD5"), new Color("#292524"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(0, 1);
  widget.backgroundGradient = gradient;
};
var addAccessory = (widget, family, state) => {
  const color = Color.dynamic(new Color("#292524"), new Color("#F5F5F4"));
  const percent = Math.round(state.progress * 100);
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(`${state.species.name} · 陪伴 ${percent}%`);
    text.font = Font.semiboldSystemFont(12);
    text.textColor = color;
    text.lineLimit = 1;
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const image2 = widget.addImage(drawPetScene(state, 64, 64, 3, true));
    image2.imageSize = new Size(64, 64);
    image2.centerAlignImage();
    widget.addSpacer();
    return;
  }
  widget.setPadding(6, 10, 6, 10);
  const row = widget.addStack();
  row.centerAlignContent();
  const image = row.addImage(drawPetScene(state, 56, 56, 3, true));
  image.imageSize = new Size(56, 56);
  row.addSpacer(8);
  const column = row.addStack();
  column.layoutVertically();
  addTextLine(column, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(12), color);
  column.addSpacer(2);
  addTextLine(column, state.sleeping ? "睡眠中" : `陪伴 ${percent}%`, Font.systemFont(10), color);
};
var createWidget = (family = config.widgetFamily || "medium") => {
  const widget = new ListWidget();
  const state = getPetState();
  if (ACCESSORY_FAMILIES.includes(family)) {
    addAccessory(widget, family, state);
  } else if (family === "small") {
    applyBackground(widget);
    widget.setPadding(10, 12, 6, 12);
    addSceneImage(widget, state, 134, 96, 5);
    widget.addSpacer(6);
    addTextLine(widget, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(13), COLORS.text);
    addTextLine(widget, state.mood, Font.systemFont(9), COLORS.muted).lineLimit = 1;
  } else if (family === "medium") {
    applyBackground(widget);
    widget.setPadding(10, 14, 10, 14);
    const row = widget.addStack();
    row.centerAlignContent();
    addSceneImage(row, state, 150, 134, 7);
    row.addSpacer(14);
    buildInfoColumn(row.addStack(), state);
    row.addSpacer();
  } else if (family === "extraLarge") {
    applyBackground(widget);
    widget.setPadding(18, 24, 18, 24);
    const row = widget.addStack();
    row.centerAlignContent();
    addSceneImage(row, state, 320, 300, 16);
    row.addSpacer(30);
    const column = row.addStack();
    column.layoutVertically();
    addTextLine(column, "PIXEL PET", Font.boldMonospacedSystemFont(12), state.species.accent);
    column.addSpacer(8);
    addTextLine(column, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(30), COLORS.text);
    column.addSpacer(8);
    addTextLine(column, state.mood, Font.systemFont(16), COLORS.muted);
    column.addSpacer(8);
    addTextLine(column, `今日陪伴 ${Math.round(state.progress * 100)}% · 每日轮换 · 深夜睡眠`, Font.systemFont(13), COLORS.muted);
    row.addSpacer();
  } else {
    applyBackground(widget);
    widget.setPadding(14, 0, 10, 0);
    const column = widget.addStack();
    column.layoutVertically();
    column.centerAlignContent();
    addSceneImage(column, state, 220, 196, 10, true);
    column.addSpacer(8);
    addTextLine(column, `${state.species.name} · ${state.species.kind}`, Font.boldSystemFont(18), COLORS.text, "center");
    column.addSpacer(4);
    addTextLine(column, state.mood, Font.systemFont(11), COLORS.muted, "center");
    widget.addSpacer();
    addTextLine(widget, `每日轮换 · 今日是${state.species.kind} · 深夜进入睡眠`, Font.systemFont(9), COLORS.muted, "center");
  }
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1e3);
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  const menu = await runWidgetMenu({
    title: "像素宠物",
    version: "1.0.1",
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
