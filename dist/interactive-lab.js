// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: tint;
// @script-id interactive-lab
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

// src/lib/widget-v18.js
var STYLE_KEY_PREFIX = "zkl2333.widgetStyle";
var STATE_DIR_NAME = "widgetState";
var ACCESSORY_FAMILIES = [
  "accessoryInline",
  "accessoryCircular",
  "accessoryRectangular"
];
var ALL_PREVIEW_FAMILIES = [
  "small",
  "medium",
  "large",
  "extraLarge",
  "extraLargePortrait",
  ...ACCESSORY_FAMILIES
];
var isAccessoryFamily = (family) => ACCESSORY_FAMILIES.includes(family);
var isLargeFamily = (family) => family === "large" || family === "extraLarge" || family === "extraLargePortrait";
var clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));
var getWidgetAction = () => typeof args !== "undefined" && args?.widgetAction ? args.widgetAction : null;
var supportsInteractiveControls = (target) => typeof target?.setAction === "function" || typeof target?.addButton === "function";
var supportsProgress = (target) => typeof target?.addProgress === "function";
var transparentKey = (scriptId) => `${STYLE_KEY_PREFIX}.${scriptId}.transparent`;
var parameterRequestsTransparent = () => {
  if (typeof args === "undefined" || !args?.widgetParameter) return false;
  const raw = String(args.widgetParameter).trim().toLowerCase();
  if (!raw) return false;
  return raw.split(/[\s,;|]+/).some((token) => token === "transparent" || token === "透明" || token === "bg=transparent");
};
var isTransparentEnabled = (scriptId) => {
  if (parameterRequestsTransparent()) return true;
  if (!scriptId || typeof Keychain === "undefined") return false;
  try {
    return Keychain.contains(transparentKey(scriptId)) && Keychain.get(transparentKey(scriptId)) === "1";
  } catch {
    return false;
  }
};
var setTransparentEnabled = (scriptId, enabled) => {
  if (!scriptId || typeof Keychain === "undefined") return false;
  const key = transparentKey(scriptId);
  if (enabled) {
    Keychain.set(key, "1");
    return true;
  }
  if (Keychain.contains(key)) Keychain.remove(key);
  return false;
};
var toggleTransparentBackground = (scriptId) => {
  const next = !isTransparentEnabled(scriptId);
  setTransparentEnabled(scriptId, next);
  return next;
};
var applyTransparentBackground = (widget, scriptId, { isAccessory = false, force = null } = {}) => {
  if (!widget || isAccessory) return false;
  const enabled = force === null ? isTransparentEnabled(scriptId) : Boolean(force);
  if (!enabled) return false;
  widget.backgroundStyle = "transparent";
  widget.backgroundColor = null;
  widget.backgroundGradient = null;
  widget.backgroundImage = null;
  return true;
};
var attachStackAction = (stack, title, id) => {
  if (!stack || typeof stack.setAction !== "function" || !id) return false;
  stack.setAction(title || id, { id: String(id) });
  return true;
};
var addLinearProgress = (parent, percent, {
  width = 120,
  thickness = 6,
  progressColor,
  trackColor,
  fallback
} = {}) => {
  const clamped = clampPercent(percent);
  if (supportsProgress(parent)) {
    const bar = parent.addProgress(clamped, {
      style: "linear",
      progressColor,
      trackColor,
      thickness
    });
    if (width > 0) bar.size = new Size(width, thickness);
    return bar;
  }
  return typeof fallback === "function" ? fallback(clamped) : null;
};
var addCircularProgress = (parent, percent, {
  size = 40,
  thickness = 5,
  progressColor,
  trackColor,
  buildCenter,
  fallback
} = {}) => {
  const clamped = clampPercent(percent);
  if (supportsProgress(parent)) {
    const ring = parent.addProgress(clamped, {
      style: "circular",
      progressColor,
      trackColor,
      thickness
    });
    ring.size = new Size(size, size);
    if (typeof buildCenter === "function") buildCenter(ring);
    return ring;
  }
  return typeof fallback === "function" ? fallback(clamped) : null;
};
var getStateFile = (scriptId) => {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.documentsDirectory(), STATE_DIR_NAME);
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return { fm, path: fm.joinPath(dir, `${scriptId}.json`) };
};
var readWidgetState = (scriptId, defaults = {}) => {
  if (!scriptId || typeof FileManager === "undefined") return { ...defaults };
  try {
    const { fm, path } = getStateFile(scriptId);
    if (!fm.fileExists(path)) return { ...defaults };
    const parsed = JSON.parse(fm.readString(path));
    return parsed && typeof parsed === "object" ? { ...defaults, ...parsed } : { ...defaults };
  } catch {
    return { ...defaults };
  }
};
var writeWidgetState = (scriptId, state) => {
  if (!scriptId || typeof FileManager === "undefined") return state;
  try {
    const { fm, path } = getStateFile(scriptId);
    fm.writeString(path, JSON.stringify(state));
  } catch {
  }
  return state;
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
  extraLargePortrait: {
    label: "竖屏超大 Extra Large Portrait",
    method: "presentExtraLargePortrait",
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
  if (family === "extraLarge") {
    return typeof Device !== "undefined" && typeof Device.isPad === "function" && Device.isPad();
  }
  if (family === "extraLargePortrait") {
    return typeof ListWidget !== "undefined" && typeof ListWidget.prototype?.presentExtraLargePortrait === "function";
  }
  return true;
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
  previewFamilies = DEFAULT_PREVIEW_FAMILIES,
  scriptId = null
}) => {
  const hasTransparentToggle = Boolean(scriptId);
  const transparentOn = hasTransparentToggle ? isTransparentEnabled(scriptId) : false;
  const alert = new Alert();
  alert.title = title;
  alert.message = message || `当前版本 v${version}`;
  alert.addAction("预览组件");
  actions.forEach((action) => alert.addAction(action.title));
  if (hasTransparentToggle) {
    alert.addAction(`透明背景：${transparentOn ? "已开启" : "未开启"}`);
  }
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
  if (hasTransparentToggle && actionIndex === actions.length) {
    const enabled = toggleTransparentBackground(scriptId);
    await showMessage(
      enabled ? "已开启透明背景" : "已关闭透明背景",
      enabled ? "需 Scriptable 1.8 与 iOS/iPadOS 27.2+；返回主屏幕刷新后生效。" : "已恢复组件默认背景样式；返回主屏幕刷新后生效。"
    );
    return null;
  }
  await checkForUpdate({ updater: updater2, version });
  return null;
};

// src/widgets/interactive-lab.js
var updater = createUpdater({
  scriptId: "interactive-lab",
  version: "1.0.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/interactive-lab.js"
});
await updater.autoUpdate();
var GOAL_ML = 2e3;
var STEP_ML = 250;
var COLORS = {
  ink: Color.dynamic(new Color("#0E2439"), new Color("#F2F7FC")),
  muted: Color.dynamic(new Color("#4E6D8A"), new Color("#9BC0DF")),
  accent: Color.dynamic(new Color("#0A7AFF"), new Color("#4EA8FF")),
  track: Color.dynamic(new Color("#CBE1F5"), new Color("#1D4468")),
  chip: Color.dynamic(new Color("#E6F1FC"), new Color("#163350")),
  accessory: Color.dynamic(new Color("#111111"), new Color("#FFFFFF"))
};
var todayKey = (now = /* @__PURE__ */ new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
var loadState = (now = /* @__PURE__ */ new Date()) => {
  const day = todayKey(now);
  const stored = readWidgetState("interactive-lab", { day, ml: 750, goal: GOAL_ML });
  if (stored.day !== day) {
    return { day, ml: 0, goal: stored.goal || GOAL_ML };
  }
  return {
    day,
    ml: Math.max(0, Math.min(5e3, Number(stored.ml) || 0)),
    goal: Math.max(500, Number(stored.goal) || GOAL_ML)
  };
};
var handleWidgetAction = () => {
  const action = getWidgetAction();
  const state = loadState();
  if (!action?.id) return state;
  if (action.id === "add") {
    state.ml = Math.min(5e3, state.ml + STEP_ML);
  } else if (action.id === "remove") {
    state.ml = Math.max(0, state.ml - STEP_ML);
  } else if (action.id === "reset") {
    state.ml = 0;
  } else if (action.id === "transparent") {
    setTransparentEnabled("interactive-lab", Boolean(action.isOn));
    return state;
  }
  return writeWidgetState("interactive-lab", state);
};
var addActionCircle = (parent, symbolName, title, actionId, size = 26) => {
  const chip = parent.addStack();
  chip.size = new Size(size, size);
  chip.cornerRadius = size / 2;
  chip.backgroundColor = COLORS.chip;
  chip.centerAlignContent();
  chip.addSpacer();
  const icon = chip.addImage(SFSymbol.named(symbolName).image);
  icon.imageSize = new Size(Math.round(size * 0.46), Math.round(size * 0.46));
  icon.tintColor = COLORS.accent;
  chip.addSpacer();
  attachStackAction(chip, title, actionId);
  return chip;
};
var addRingCenter = (ring, state, compact = false) => {
  const amount = ring.addText(String(state.ml));
  amount.font = Font.boldRoundedSystemFont(compact ? 17 : 22);
  amount.textColor = COLORS.ink;
  amount.centerAlignText();
  amount.lineLimit = 1;
  amount.minimumScaleFactor = 0.6;
  const unit = ring.addText("ML");
  unit.font = Font.semiboldMonospacedSystemFont(compact ? 8 : 9);
  unit.textColor = COLORS.muted;
  unit.centerAlignText();
};
var addAccessory = (widget, family, state, percent) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(`饮水 ${state.ml}/${state.goal}ml · ${percent}%`);
    text.font = Font.semiboldSystemFont(12);
    text.textColor = COLORS.accessory;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.72;
    return;
  }
  if (family === "accessoryCircular") {
    widget.addSpacer();
    const row = widget.addStack();
    row.addSpacer();
    addCircularProgress(row, percent, {
      size: 56,
      thickness: 5,
      progressColor: COLORS.accessory,
      trackColor: Color.dynamic(new Color("#111111", 0.2), new Color("#FFFFFF", 0.25)),
      buildCenter: (ring) => {
        const value2 = ring.addText(`${percent}%`);
        value2.font = Font.boldRoundedSystemFont(13);
        value2.textColor = COLORS.accessory;
        value2.centerAlignText();
      },
      fallback: () => {
        const value2 = row.addText(`${percent}%`);
        value2.font = Font.boldRoundedSystemFont(15);
        value2.textColor = COLORS.accessory;
      }
    });
    row.addSpacer();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 7, 5, 7);
  const title = widget.addText("每日饮水 · v1.8");
  title.font = Font.semiboldSystemFont(10);
  title.textColor = COLORS.accessory;
  widget.addSpacer(3);
  const value = widget.addText(`${state.ml} / ${state.goal} ml (${percent}%)`);
  value.font = Font.boldRoundedSystemFont(13);
  value.textColor = COLORS.accessory;
  value.lineLimit = 1;
  value.minimumScaleFactor = 0.75;
  widget.addSpacer(5);
  addLinearProgress(widget, percent, {
    width: 146,
    thickness: 5,
    progressColor: COLORS.accessory,
    trackColor: Color.dynamic(new Color("#111111", 0.2), new Color("#FFFFFF", 0.25))
  });
};
var addHome = (widget, family, state, percent, transparentOn) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#F4FAFF"), new Color("#0A2038")),
    Color.dynamic(new Color("#DCEEFF"), new Color("#133D66"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  applyTransparentBackground(widget, "interactive-lab");
  const isSmall = family === "small";
  const isLarge = isLargeFamily(family);
  widget.setPadding(isSmall ? 12 : 16, isSmall ? 12 : 18, isSmall ? 12 : 16, isSmall ? 12 : 18);
  const header = widget.addStack();
  header.centerAlignContent();
  const drop = header.addImage(SFSymbol.named("drop.fill").image);
  drop.imageSize = new Size(13, 13);
  drop.tintColor = COLORS.accent;
  header.addSpacer(5);
  const title = header.addText(isSmall ? "饮水进度" : "v1.8 交互实验室");
  title.font = Font.boldSystemFont(isSmall ? 11 : 13);
  title.textColor = COLORS.ink;
  title.lineLimit = 1;
  header.addSpacer();
  addActionCircle(header, "arrow.clockwise", "归零今日饮水", "reset", isSmall ? 20 : 22);
  if (isSmall) {
    widget.addSpacer();
    const ringRow = widget.addStack();
    ringRow.addSpacer();
    addCircularProgress(ringRow, percent, {
      size: 74,
      thickness: 8,
      progressColor: COLORS.accent,
      trackColor: COLORS.track,
      buildCenter: (ring) => addRingCenter(ring, state, true),
      fallback: () => {
        const text = ringRow.addText(`${state.ml}ml`);
        text.font = Font.boldRoundedSystemFont(18);
        text.textColor = COLORS.ink;
      }
    });
    ringRow.addSpacer();
    widget.addSpacer();
    const controls = widget.addStack();
    controls.centerAlignContent();
    addActionCircle(controls, "minus", "减少 250ml", "remove", 24);
    controls.addSpacer();
    const pct = controls.addText(`${percent}%`);
    pct.font = Font.semiboldMonospacedSystemFont(11);
    pct.textColor = COLORS.muted;
    controls.addSpacer();
    addActionCircle(controls, "plus", "增加 250ml", "add", 24);
    return;
  }
  widget.addSpacer(isLarge ? 16 : 10);
  const main = widget.addStack();
  main.centerAlignContent();
  addCircularProgress(main, percent, {
    size: isLarge ? 104 : 82,
    thickness: isLarge ? 10 : 8,
    progressColor: COLORS.accent,
    trackColor: COLORS.track,
    buildCenter: (ring) => addRingCenter(ring, state, !isLarge),
    fallback: () => {
      const text = main.addText(`${state.ml}ml`);
      text.font = Font.boldRoundedSystemFont(22);
      text.textColor = COLORS.ink;
    }
  });
  main.addSpacer(isLarge ? 20 : 14);
  const right = main.addStack();
  right.layoutVertically();
  const goalText = right.addText(`今日目标 ${state.goal} ml`);
  goalText.font = Font.semiboldSystemFont(isLarge ? 15 : 13);
  goalText.textColor = COLORS.ink;
  right.addSpacer(3);
  const remain = Math.max(0, state.goal - state.ml);
  const sub = right.addText(remain === 0 ? "已完成今日饮水目标" : `还差 ${remain} ml · 已完成 ${percent}%`);
  sub.font = Font.mediumSystemFont(isLarge ? 11 : 10);
  sub.textColor = COLORS.muted;
  sub.lineLimit = 1;
  sub.minimumScaleFactor = 0.72;
  right.addSpacer(8);
  addLinearProgress(right, percent, {
    width: isLarge ? 176 : 168,
    thickness: 7,
    progressColor: COLORS.accent,
    trackColor: COLORS.track
  });
  right.addSpacer(10);
  const buttonRow = right.addStack();
  buttonRow.centerAlignContent();
  buttonRow.spacing = 6;
  if (supportsInteractiveControls(buttonRow)) {
    buttonRow.addButton(`-${STEP_ML}`, { id: "remove" });
    buttonRow.addButton(`+${STEP_ML}`, { id: "add" });
    if (isLarge) buttonRow.addRefreshButton("刷新");
  } else {
    addActionCircle(buttonRow, "minus", "减少 250ml", "remove", 24);
    addActionCircle(buttonRow, "plus", "增加 250ml", "add", 24);
  }
  if (isLarge) {
    widget.addSpacer(18);
    const panel = widget.addStack();
    panel.layoutVertically();
    panel.setPadding(10, 12, 10, 12);
    panel.cornerRadius = 12;
    panel.backgroundColor = COLORS.chip;
    panel.spacing = 8;
    const panelTitle = panel.addText("原生交互控件（iOS 17+ / 27.2+）");
    panelTitle.font = Font.semiboldSystemFont(11);
    panelTitle.textColor = COLORS.ink;
    const toggleRow = panel.addStack();
    toggleRow.centerAlignContent();
    if (typeof toggleRow.addToggle === "function") {
      toggleRow.addToggle("透明背景", transparentOn, { id: "transparent" });
    }
    toggleRow.addSpacer();
    if (typeof toggleRow.addButton === "function") {
      toggleRow.addButton("归零", { id: "reset" });
    }
    widget.addSpacer();
    const note = widget.addText("addProgress · addButton · addToggle · addRefreshButton · setAction · backgroundStyle");
    note.font = Font.regularMonospacedSystemFont(9);
    note.textColor = COLORS.muted;
    note.lineLimit = 2;
  }
};
var createWidget = (family = config.widgetFamily || "medium") => {
  const state = handleWidgetAction();
  const percent = Math.min(100, Math.round(state.ml / state.goal * 100));
  const transparentOn = isTransparentEnabled("interactive-lab");
  const widget = new ListWidget();
  if (isAccessoryFamily(family)) {
    addAccessory(widget, family, state, percent);
  } else {
    addHome(widget, family, state, percent, transparentOn);
  }
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1e3);
  return attachMenuURL(widget);
};
if (shouldShowWidgetMenu()) {
  for (; ; ) {
    const menu = await runWidgetMenu({
      title: "v1.8 交互实验室",
      message: "演示原生进度环/条、交互按钮、开关与透明背景",
      version: "1.0.0",
      updater,
      scriptId: "interactive-lab",
      previewFamilies: ALL_PREVIEW_FAMILIES,
      actions: [{ id: "reset", title: "重置今日饮水计数" }]
    });
    if (!menu) break;
    if (menu.action === "reset") {
      writeWidgetState("interactive-lab", { day: todayKey(), ml: 0, goal: GOAL_ML });
      continue;
    }
    if (menu.action === "preview") {
      await presentWidgetPreviews(createWidget, menu.families);
    }
  }
} else {
  Script.setWidget(createWidget());
}
Script.complete();
