const showMessage = async (title, message) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction('好');
  await alert.presentAlert();
};

const checkForUpdate = async ({ updater, version }) => {
  try {
    const update = await updater.checkForUpdate({ force: true });
    if (!update) {
      await showMessage('已是最新', `当前 v${version}`);
      return false;
    }

    const confirm = new Alert();
    confirm.title = `发现新版本 v${update.version}`;
    confirm.message = `是否更新 ${Script.name()}？`;
    confirm.addAction('更新');
    confirm.addCancelAction('取消');
    if ((await confirm.presentAlert()) !== 0) return false;

    const updated = await updater.applyUpdateIfAny({ force: true });
    if (!updated) {
      await showMessage('更新未完成', '远端版本已变化，请重新检查。');
      return false;
    }
    await showMessage('更新完成', '脚本已更新，请重新运行。');
    return true;
  } catch (error) {
    await showMessage('检查失败', String(error));
    return false;
  }
};

export const shouldShowWidgetMenu = () =>
  config.runsInApp && !config.runsWithSiri && !config.runsInActionExtension;

export const attachMenuURL = (widget) => {
  widget.url = URLScheme.forRunningScript();
  return widget;
};

const PREVIEW_DEFINITIONS = {
  small: { label: '小尺寸 Small', method: 'presentSmall', group: 'home' },
  medium: { label: '中尺寸 Medium', method: 'presentMedium', group: 'home' },
  large: { label: '大尺寸 Large', method: 'presentLarge', group: 'home' },
  extraLarge: {
    label: '超大尺寸 Extra Large（iPad）',
    method: 'presentExtraLarge',
    group: 'home',
  },
  accessoryInline: {
    label: '锁屏单行 Inline',
    method: 'presentAccessoryInline',
    group: 'accessory',
  },
  accessoryCircular: {
    label: '锁屏圆形 Circular',
    method: 'presentAccessoryCircular',
    group: 'accessory',
  },
  accessoryRectangular: {
    label: '锁屏矩形 Rectangular',
    method: 'presentAccessoryRectangular',
    group: 'accessory',
  },
};

const getPreviewDefinition = (family) => {
  const definition = PREVIEW_DEFINITIONS[family];
  if (!definition) throw new RangeError(`不支持的组件尺寸：${family}`);
  return definition;
};

const normalizePreviewFamilies = (families) => {
  if (!Array.isArray(families)) throw new TypeError('预览尺寸必须是数组');
  const uniqueFamilies = [...new Set(families)];
  uniqueFamilies.forEach(getPreviewDefinition);
  return uniqueFamilies;
};

const isPreviewAvailable = (family) => {
  if (family !== 'extraLarge') return true;
  return (
    typeof Device !== 'undefined' &&
    typeof Device.isPad === 'function' &&
    Device.isPad()
  );
};

export const presentWidget = async (widget, family = 'medium') => {
  const { method } = getPreviewDefinition(family);
  if (typeof widget?.[method] !== 'function') {
    throw new TypeError(`当前 Scriptable 不支持 ${family} 预览`);
  }
  return widget[method]();
};

const DEFAULT_PREVIEW_FAMILIES = ['small', 'medium', 'large', 'extraLarge'];

const selectPreviewFamilies = async (families) => {
  const availableFamilies = normalizePreviewFamilies(families).filter(isPreviewAvailable);
  if (availableFamilies.length === 0) {
    await showMessage('无法预览', '当前设备不支持此组件提供的尺寸。');
    return null;
  }

  const choices = availableFamilies.map((family) => ({
    label: getPreviewDefinition(family).label,
    families: [family],
  }));
  const homeFamilies = availableFamilies.filter(
    (family) => getPreviewDefinition(family).group === 'home'
  );
  const accessoryFamilies = availableFamilies.filter(
    (family) => getPreviewDefinition(family).group === 'accessory'
  );
  if (homeFamilies.length > 0 && accessoryFamilies.length > 0) {
    choices.push(
      { label: '全部主屏 Home Screen', families: homeFamilies },
      { label: '全部锁屏 Lock Screen', families: accessoryFamilies }
    );
  }
  if (availableFamilies.length > 1) {
    choices.push({ label: '全部尺寸 All', families: availableFamilies });
  }

  const alert = new Alert();
  alert.title = '预览组件';
  alert.message = '选择一个尺寸，或按类别连续预览';
  choices.forEach((choice) => alert.addAction(choice.label));
  alert.addCancelAction('取消操作');

  const index = await alert.presentSheet();
  return choices[index]?.families || null;
};

export const presentWidgetPreviews = async (createWidget, families) => {
  const previewFamilies = normalizePreviewFamilies(families);
  const presented = [];
  const failures = [];

  for (const family of previewFamilies) {
    try {
      await presentWidget(await createWidget(family), family);
      presented.push(family);
    } catch (error) {
      failures.push({ family, error });
    }
  }

  if (failures.length > 0) {
    const message = failures
      .map(({ family, error }) => `${getPreviewDefinition(family).label}：${String(error)}`)
      .join('\n');
    await showMessage(
      failures.length === previewFamilies.length ? '预览失败' : '部分预览失败',
      message
    );
  }

  return { presented, failures };
};

export const runWidgetMenu = async ({
  title,
  message = '',
  version,
  updater,
  actions = [],
  previewFamilies = DEFAULT_PREVIEW_FAMILIES,
}) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message || `当前版本 v${version}`;
  alert.addAction('预览组件');
  actions.forEach((action) => alert.addAction(action.title));
  alert.addAction('检查更新');
  alert.addCancelAction('取消操作');

  const index = await alert.presentSheet();
  if (index === -1) return null;
  if (index === 0) {
    const families = await selectPreviewFamilies(previewFamilies);
    return families ? { action: 'preview', families } : null;
  }

  const actionIndex = index - 1;
  if (actionIndex < actions.length) return { action: actions[actionIndex].id };
  await checkForUpdate({ updater, version });
  return null;
};
