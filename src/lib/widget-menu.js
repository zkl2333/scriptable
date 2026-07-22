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

export const presentWidget = async (widget, fallbackFamily = 'medium') => {
  const family = fallbackFamily;
  if (family === 'accessoryInline') return widget.presentAccessoryInline();
  if (family === 'accessoryCircular') return widget.presentAccessoryCircular();
  if (family === 'accessoryRectangular') {
    return widget.presentAccessoryRectangular();
  }
  if (family === 'large') return widget.presentLarge();
  if (family === 'small') return widget.presentSmall();
  return widget.presentMedium();
};

const PREVIEW_LABELS = {
  small: '小尺寸 Small',
  medium: '中尺寸 Medium',
  large: '大尺寸 Large',
  accessoryInline: '锁屏单行 Inline',
  accessoryCircular: '锁屏圆形 Circular',
  accessoryRectangular: '锁屏矩形 Rectangular',
};

const DEFAULT_PREVIEW_FAMILIES = ['small', 'medium', 'large'];

const selectPreviewFamilies = async (families) => {
  const alert = new Alert();
  alert.title = '预览组件';
  alert.message = '测试组件在各种尺寸下的显示效果';
  families.forEach((family) => alert.addAction(PREVIEW_LABELS[family] || family));
  alert.addAction('全部 All');
  alert.addCancelAction('取消操作');

  const index = await alert.presentSheet();
  if (index < 0) return null;
  if (index < families.length) return [families[index]];
  if (index === families.length) return families;
  return null;
};

export const presentWidgetPreviews = async (createWidget, families) => {
  for (const family of families) {
    await presentWidget(await createWidget(family), family);
  }
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
