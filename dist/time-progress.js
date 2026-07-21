// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: hourglass-half;
// @script-id time-progress
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
  const checkForUpdate = async ({ force = false } = {}) => {
    const lastCheckedAt = Keychain.contains(checkedAtKey) ? Number(Keychain.get(checkedAtKey)) : 0;
    const now2 = Math.floor(Date.now() / 1e3);
    if (!force && now2 - lastCheckedAt < checkInterval) return null;
    Keychain.set(checkedAtKey, String(now2));
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

// src/widgets/time-progress.js
var updater = createUpdater({
  scriptId: "time-progress",
  version: "1.0.1",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/time-progress.js"
});
await updater.autoUpdate();
var w = new ListWidget();
w.backgroundColor = new Color("#222222");
var width = 300;
var h = 4;
var now = /* @__PURE__ */ new Date();
var weekday = now.getDay() == 0 ? 6 : now.getDay() - 1;
var minutes = now.getMinutes();
if (Device.locale() == "zh_CN") {
  getwidget(24 * 60, (now.getHours() + 1) * 60 + minutes, "今日");
  getwidget(7, weekday + 1, "本周");
  getwidget(30, now.getDate() + 1, "本月");
  getwidget(12, now.getMonth() + 1, "今年");
} else {
  getwidget(24 * 60, (now.getHours() + 1) * 60 + minutes, "Today");
  getwidget(7, weekday + 1, "This week");
  getwidget(30, now.getDate() + 1, "This month");
  getwidget(12, now.getMonth() + 1, "This year");
}
Script.setWidget(w);
Script.complete();
w.presentMedium();
function getwidget(total, haveGone, str) {
  const titlew = w.addText(str);
  titlew.textColor = new Color("#e587ce");
  titlew.font = Font.boldSystemFont(13);
  w.addSpacer(6);
  const imgw = w.addImage(creatProgress(total, haveGone));
  imgw.imageSize = new Size(width, h);
  w.addSpacer(6);
}
function creatProgress(total, havegone) {
  const context = new DrawContext();
  context.size = new Size(width, h);
  context.opaque = false;
  context.respectScreenScale = true;
  context.setFillColor(new Color("#48484b"));
  const path = new Path();
  path.addRoundedRect(new Rect(0, 0, width, h), 3, 2);
  context.addPath(path);
  context.fillPath();
  context.setFillColor(new Color("#ffd60a"));
  const path1 = new Path();
  path1.addRoundedRect(new Rect(0, 0, width * havegone / total, h), 3, 2);
  context.addPath(path1);
  context.fillPath();
  return context.getImage();
}
