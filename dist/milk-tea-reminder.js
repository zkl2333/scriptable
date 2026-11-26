// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: coffee;
// @script-id milk-tea-reminder
// @version 1.3.0

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
var isLargeFamily = (family) => family === "large" || family === "extraLarge" || family === "extraLargePortrait";
var clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));
var getWidgetAction = () => typeof args !== "undefined" && args?.widgetAction ? args.widgetAction : null;
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

// src/widgets/milk-tea-reminder.js
var updater = createUpdater({
  scriptId: "milk-tea-reminder",
  version: "1.3.0",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/milk-tea-reminder.js"
});
await updater.autoUpdate();
var PREVIEW_FAMILIES = ALL_PREVIEW_FAMILIES;
var DAILY_LIMIT = 2;
var CHOICE_ITEMS = [
  { id: "opt-low-sugar", label: "低糖" },
  { id: "opt-less-ice", label: "少冰" },
  { id: "opt-boba", label: "加珍珠" }
];
var COLORS = {
  brown: Color.dynamic(new Color("#613C2D"), new Color("#F1D0B8")),
  caramel: Color.dynamic(new Color("#B8612D"), new Color("#F3A66F")),
  muted: Color.dynamic(new Color("#735C50"), new Color("#C8B6A9")),
  card: Color.dynamic(new Color("#FFF8EF"), new Color("#35271F")),
  cardActive: Color.dynamic(new Color("#B8612D"), new Color("#D97A40")),
  cardActiveText: new Color("#FFFFFF"),
  track: Color.dynamic(new Color("#E6CEBA"), new Color("#473125"))
};
var ACCESSORY_COLOR = Color.dynamic(new Color("#111111"), new Color("#FFFFFF"));
var todayKey = (now = /* @__PURE__ */ new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
var loadDrinkState = (now = /* @__PURE__ */ new Date()) => {
  const day = todayKey(now);
  const stored = readWidgetState("milk-tea-reminder", {
    day,
    cups: 0,
    options: ["opt-low-sugar", "opt-less-ice"]
  });
  const options = Array.isArray(stored.options) ? stored.options : ["opt-low-sugar", "opt-less-ice"];
  return {
    day,
    cups: stored.day === day ? Math.max(0, Math.min(6, Number(stored.cups) || 0)) : 0,
    options
  };
};
var resolveDrinkState = () => {
  const state = loadDrinkState();
  const action = getWidgetAction();
  if (!action?.id) return state;
  if (action.id === "cup-add") {
    state.cups = Math.min(6, state.cups + 1);
  } else if (action.id === "cup-reset") {
    state.cups = 0;
  } else if (CHOICE_ITEMS.some((item) => item.id === action.id)) {
    const exists = state.options.includes(action.id);
    state.options = exists ? state.options.filter((id) => id !== action.id) : [...state.options, action.id];
  }
  return writeWidgetState("milk-tea-reminder", state);
};
var getMessage = () => {
  const hour = (/* @__PURE__ */ new Date()).getHours();
  if (hour < 11) return { title: "上午好", detail: "今天的第一杯，慢慢选" };
  if (hour < 15) return { title: "午后续航", detail: "三分糖，也有好心情" };
  if (hour < 20) return { title: "来杯奶茶", detail: "忙里偷闲，奖励一下自己" };
  return { title: "晚间克制", detail: "想喝的话，记得选低糖" };
};
var addAccessory = (widget, family, message) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === "accessoryInline") {
    const text = widget.addText(`🧋 ${message.title} · ${message.detail}`);
    text.font = Font.mediumSystemFont(12);
    text.textColor = ACCESSORY_COLOR;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.72;
  } else if (family === "accessoryCircular") {
    widget.addSpacer();
    const icon = widget.addImage(SFSymbol.named("cup.and.saucer.fill").image);
    icon.imageSize = new Size(23, 20);
    icon.tintColor = ACCESSORY_COLOR;
    icon.centerAlignImage();
    const text = widget.addText("来一杯");
    text.font = Font.semiboldSystemFont(10);
    text.textColor = ACCESSORY_COLOR;
    text.centerAlignText();
    widget.addSpacer();
  } else {
    const title = widget.addText(message.title);
    title.font = Font.boldSystemFont(15);
    title.textColor = ACCESSORY_COLOR;
    const detail = widget.addText(message.detail);
    detail.font = Font.mediumSystemFont(11);
    detail.textColor = ACCESSORY_COLOR;
    detail.lineLimit = 1;
    detail.minimumScaleFactor = 0.75;
  }
};
var addMain = (widget, family, message, state) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color("#FFF5E7"), new Color("#2B201B")),
    Color.dynamic(new Color("#F2D3B1"), new Color("#513426"))
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  applyTransparentBackground(widget, "milk-tea-reminder");
  widget.setPadding(16, 16, 14, 16);
  const header = widget.addStack();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named("cup.and.saucer.fill").image);
  icon.imageSize = new Size(17, 15);
  icon.tintColor = COLORS.caramel;
  header.addSpacer(6);
  const brand = header.addText("奶茶时刻");
  brand.font = Font.semiboldSystemFont(11);
  brand.textColor = COLORS.muted;
  header.addSpacer();
  const cupBadge = header.addStack();
  cupBadge.centerAlignContent();
  cupBadge.setPadding(3, 8, 3, 8);
  cupBadge.cornerRadius = 9;
  cupBadge.backgroundColor = COLORS.card;
  const cupText = cupBadge.addText(`今日 ${state.cups} 杯 +`);
  cupText.font = Font.semiboldSystemFont(9);
  cupText.textColor = COLORS.caramel;
  attachStackAction(cupBadge, "记录喝了一杯奶茶", "cup-add");
  widget.addSpacer();
  const title = widget.addText(message.title);
  const isLarge = isLargeFamily(family);
  title.font = Font.boldRoundedSystemFont(isLarge ? 32 : family === "medium" ? 26 : 24);
  title.textColor = COLORS.brown;
  title.minimumScaleFactor = 0.7;
  const detail = widget.addText(
    state.cups >= DAILY_LIMIT ? `今日已喝 ${state.cups} 杯，记得多喝水` : message.detail
  );
  detail.font = Font.mediumSystemFont(family === "small" ? 11 : 13);
  detail.textColor = COLORS.muted;
  detail.lineLimit = family === "small" ? 2 : 1;
  detail.minimumScaleFactor = 0.75;
  widget.addSpacer();
  if (family !== "small") {
    const choices = widget.addStack();
    choices.centerAlignContent();
    for (const [index, choice] of CHOICE_ITEMS.entries()) {
      const active = state.options.includes(choice.id);
      const chip = choices.addStack();
      chip.centerAlignContent();
      chip.setPadding(5, 9, 5, 9);
      chip.backgroundColor = active ? COLORS.cardActive : COLORS.card;
      chip.cornerRadius = 10;
      const text = chip.addText(choice.label);
      text.font = Font.semiboldSystemFont(10);
      text.textColor = active ? COLORS.cardActiveText : COLORS.brown;
      attachStackAction(chip, `切换${choice.label}`, choice.id);
      if (index < CHOICE_ITEMS.length - 1) choices.addSpacer(7);
    }
    if (state.cups > 0) {
      choices.addSpacer();
      const resetChip = choices.addStack();
      resetChip.setPadding(5, 8, 5, 8);
      resetChip.backgroundColor = COLORS.card;
      resetChip.cornerRadius = 10;
      const resetText = resetChip.addText("清零");
      resetText.font = Font.mediumSystemFont(9);
      resetText.textColor = COLORS.muted;
      attachStackAction(resetChip, "清零今日杯数", "cup-reset");
    }
  }
  if (isLarge) {
    widget.addSpacer(14);
    const barLabel = widget.addText(`今日克制额度 ${state.cups}/${DAILY_LIMIT} 杯`);
    barLabel.font = Font.mediumSystemFont(10);
    barLabel.textColor = COLORS.muted;
    widget.addSpacer(5);
    addLinearProgress(widget, Math.min(100, state.cups / DAILY_LIMIT * 100), {
      width: family === "extraLarge" ? 560 : 280,
      thickness: 6,
      progressColor: COLORS.caramel,
      trackColor: COLORS.track
    });
    widget.addSpacer(12);
    const note = widget.addText("桌面点击口味标签即可切换偏好；点击右上角记录今日杯数。");
    note.font = Font.systemFont(11);
    note.textColor = COLORS.muted;
    note.lineLimit = 2;
  }
};
var createWidget = (family = config.widgetFamily || "small") => {
  const widget = new ListWidget();
  const message = getMessage();
  const state = resolveDrinkState();
  if (ACCESSORY_FAMILIES.includes(family)) addAccessory(widget, family, message);
  else addMain(widget, family, message, state);
  return attachMenuURL(widget);
};
var scheduleReminder = async () => {
  const notification = new Notification();
  notification.title = "提醒喝奶茶小助手";
  notification.body = "提醒你喝奶茶啦！";
  notification.identifier = "naicha";
  notification.addAction("发朋友圈提醒大家喝奶茶", "weixin://");
  notification.addAction("查找附近奶茶店", `http://maps.apple.com/?q=${encodeURI("奶茶")}`);
  notification.addAction("打开饿了吗", "eleme://");
  notification.addAction("打开美团", "imeituan://");
  notification.setTriggerDate(new Date(Date.now() + 3e3));
  await notification.schedule();
};
var showReminderScheduled = async () => {
  const alert = new Alert();
  alert.title = "提醒已安排";
  alert.message = "将在 3 秒后发送通知。";
  alert.addAction("好");
  await alert.presentAlert();
};
if (shouldShowWidgetMenu()) {
  for (; ; ) {
    const action = await runWidgetMenu({
      title: "奶茶提醒",
      version: "1.3.0",
      updater,
      scriptId: "milk-tea-reminder",
      previewFamilies: PREVIEW_FAMILIES,
      actions: [
        {
          id: "remind",
          icon: "🔔",
          title: "发送奶茶提醒",
          subtitle: "3 秒后推送，可从通知打开外卖应用"
        }
      ]
    });
    if (!action) break;
    if (action.action === "preview") {
      await presentWidgetPreviews(createWidget, action.families);
    }
    if (action.action === "remind") {
      await scheduleReminder();
      await showReminderScheduled();
    }
  }
} else {
  Script.setWidget(createWidget());
}
Script.complete();
