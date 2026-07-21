const DEFAULT_CHECK_INTERVAL = 24 * 3600;
const UPDATE_KEY_PREFIX = 'zkl2333.widgetUpdater';

const compareVersions = (left, right) => {
  const leftParts = String(left).split('.').map((part) => Number(part) || 0);
  const rightParts = String(right).split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);

  for (let i = 0; i < length; i++) {
    const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
};

const readMetadata = (source) => ({
  scriptId: source.match(/@script-id\s+([a-z0-9-]+)/i)?.[1],
  version: source.match(/@version\s+([0-9]+(?:\.[0-9]+){1,2})/)?.[1],
});

const getTargetFileManager = (filePath) => {
  try {
    const iCloud = FileManager.iCloud();
    if (iCloud.isFileStoredIniCloud(filePath)) return iCloud;
  } catch {
    // 未启用 iCloud 时继续使用本地文件管理器
  }
  return FileManager.local();
};

const saveBackup = (scriptId, source) => {
  const local = FileManager.local();
  const backupDir = local.joinPath(local.libraryDirectory(), 'widget-update-backups');
  if (!local.fileExists(backupDir)) local.createDirectory(backupDir, true);
  local.writeString(local.joinPath(backupDir, `${scriptId}.js.bak`), source);
};

export const createUpdater = ({
  scriptId,
  version,
  updateURL,
  checkInterval = DEFAULT_CHECK_INTERVAL,
}) => {
  const checkedAtKey = `${UPDATE_KEY_PREFIX}.${scriptId}.checkedAt`;

  const checkForUpdate = async ({ force = false } = {}) => {
    const lastCheckedAt = Keychain.contains(checkedAtKey)
      ? Number(Keychain.get(checkedAtKey))
      : 0;
    const now = Math.floor(Date.now() / 1000);

    if (!force && now - lastCheckedAt < checkInterval) return null;
    Keychain.set(checkedAtKey, String(now));

    const request = new Request(`${updateURL}?t=${Date.now()}`);
    request.timeoutInterval = 10;
    const source = await request.loadString();
    const metadata = readMetadata(source);

    if (metadata.scriptId !== scriptId) {
      throw new Error(`更新文件标识不匹配：${metadata.scriptId || 'missing'}`);
    }
    if (!metadata.version) throw new Error('更新文件缺少版本号');
    if (source.length < 200) throw new Error('更新文件内容不完整');
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
      alert.addAction('更新');
      alert.addCancelAction('取消');
      if ((await alert.presentAlert()) !== 0) return false;
    }

    const targetPath = module.filename;
    if (!targetPath) throw new Error('无法定位当前脚本文件');
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
