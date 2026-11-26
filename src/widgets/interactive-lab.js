import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';
import {
  ALL_PREVIEW_FAMILIES,
  addCircularProgress,
  addLinearProgress,
  applyTransparentBackground,
  attachStackAction,
  getWidgetAction,
  isAccessoryFamily,
  isLargeFamily,
  isTransparentEnabled,
  readWidgetState,
  setTransparentEnabled,
  supportsInteractiveControls,
  writeWidgetState,
} from '../lib/widget-v18.js';

const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
await updater.autoUpdate();

const GOAL_ML = 2000;
const STEP_ML = 250;

const COLORS = {
  ink: Color.dynamic(new Color('#0E2439'), new Color('#F2F7FC')),
  muted: Color.dynamic(new Color('#4E6D8A'), new Color('#9BC0DF')),
  accent: Color.dynamic(new Color('#0A7AFF'), new Color('#4EA8FF')),
  track: Color.dynamic(new Color('#CBE1F5'), new Color('#1D4468')),
  chip: Color.dynamic(new Color('#E6F1FC'), new Color('#163350')),
  accessory: Color.dynamic(new Color('#111111'), new Color('#FFFFFF')),
};

const todayKey = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const loadState = (now = new Date()) => {
  const day = todayKey(now);
  const stored = readWidgetState(__SCRIPT_ID__, { day, ml: 750, goal: GOAL_ML });
  if (stored.day !== day) {
    return { day, ml: 0, goal: stored.goal || GOAL_ML };
  }
  return {
    day,
    ml: Math.max(0, Math.min(5000, Number(stored.ml) || 0)),
    goal: Math.max(500, Number(stored.goal) || GOAL_ML),
  };
};

const handleWidgetAction = () => {
  const action = getWidgetAction();
  const state = loadState();
  if (!action?.id) return state;

  if (action.id === 'add') {
    state.ml = Math.min(5000, state.ml + STEP_ML);
  } else if (action.id === 'remove') {
    state.ml = Math.max(0, state.ml - STEP_ML);
  } else if (action.id === 'reset') {
    state.ml = 0;
  } else if (action.id === 'transparent') {
    setTransparentEnabled(__SCRIPT_ID__, Boolean(action.isOn));
    return state;
  }
  return writeWidgetState(__SCRIPT_ID__, state);
};

const addActionCircle = (parent, symbolName, title, actionId, size = 26) => {
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

const addRingCenter = (ring, state, compact = false) => {
  const amount = ring.addText(String(state.ml));
  amount.font = Font.boldRoundedSystemFont(compact ? 17 : 22);
  amount.textColor = COLORS.ink;
  amount.centerAlignText();
  amount.lineLimit = 1;
  amount.minimumScaleFactor = 0.6;
  const unit = ring.addText('ML');
  unit.font = Font.semiboldMonospacedSystemFont(compact ? 8 : 9);
  unit.textColor = COLORS.muted;
  unit.centerAlignText();
};

const addAccessory = (widget, family, state, percent) => {
  widget.setPadding(0, 0, 0, 0);
  if (family === 'accessoryInline') {
    const text = widget.addText(`饮水 ${state.ml}/${state.goal}ml · ${percent}%`);
    text.font = Font.semiboldSystemFont(12);
    text.textColor = COLORS.accessory;
    text.lineLimit = 1;
    text.minimumScaleFactor = 0.72;
    return;
  }
  if (family === 'accessoryCircular') {
    widget.addSpacer();
    const row = widget.addStack();
    row.addSpacer();
    addCircularProgress(row, percent, {
      size: 56,
      thickness: 5,
      progressColor: COLORS.accessory,
      trackColor: Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.25)),
      buildCenter: (ring) => {
        const value = ring.addText(`${percent}%`);
        value.font = Font.boldRoundedSystemFont(13);
        value.textColor = COLORS.accessory;
        value.centerAlignText();
      },
      fallback: () => {
        const value = row.addText(`${percent}%`);
        value.font = Font.boldRoundedSystemFont(15);
        value.textColor = COLORS.accessory;
      },
    });
    row.addSpacer();
    widget.addSpacer();
    return;
  }
  widget.setPadding(5, 7, 5, 7);
  const title = widget.addText('每日饮水 · v1.8');
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
    trackColor: Color.dynamic(new Color('#111111', 0.2), new Color('#FFFFFF', 0.25)),
  });
};

const addHome = (widget, family, state, percent, transparentOn) => {
  const gradient = new LinearGradient();
  gradient.colors = [
    Color.dynamic(new Color('#F4FAFF'), new Color('#0A2038')),
    Color.dynamic(new Color('#DCEEFF'), new Color('#133D66')),
  ];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;
  applyTransparentBackground(widget, __SCRIPT_ID__);

  const isSmall = family === 'small';
  const isLarge = isLargeFamily(family);
  widget.setPadding(isSmall ? 12 : 16, isSmall ? 12 : 18, isSmall ? 12 : 16, isSmall ? 12 : 18);

  const header = widget.addStack();
  header.centerAlignContent();
  const drop = header.addImage(SFSymbol.named('drop.fill').image);
  drop.imageSize = new Size(13, 13);
  drop.tintColor = COLORS.accent;
  header.addSpacer(5);
  const title = header.addText(isSmall ? '饮水进度' : 'v1.8 交互实验室');
  title.font = Font.boldSystemFont(isSmall ? 11 : 13);
  title.textColor = COLORS.ink;
  title.lineLimit = 1;
  header.addSpacer();
  addActionCircle(header, 'arrow.clockwise', '归零今日饮水', 'reset', isSmall ? 20 : 22);

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
      },
    });
    ringRow.addSpacer();
    widget.addSpacer();

    const controls = widget.addStack();
    controls.centerAlignContent();
    addActionCircle(controls, 'minus', '减少 250ml', 'remove', 24);
    controls.addSpacer();
    const pct = controls.addText(`${percent}%`);
    pct.font = Font.semiboldMonospacedSystemFont(11);
    pct.textColor = COLORS.muted;
    controls.addSpacer();
    addActionCircle(controls, 'plus', '增加 250ml', 'add', 24);
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
    },
  });
  main.addSpacer(isLarge ? 20 : 14);

  const right = main.addStack();
  right.layoutVertically();
  const goalText = right.addText(`今日目标 ${state.goal} ml`);
  goalText.font = Font.semiboldSystemFont(isLarge ? 15 : 13);
  goalText.textColor = COLORS.ink;
  right.addSpacer(3);
  const remain = Math.max(0, state.goal - state.ml);
  const sub = right.addText(remain === 0 ? '已完成今日饮水目标' : `还差 ${remain} ml · 已完成 ${percent}%`);
  sub.font = Font.mediumSystemFont(isLarge ? 11 : 10);
  sub.textColor = COLORS.muted;
  sub.lineLimit = 1;
  sub.minimumScaleFactor = 0.72;
  right.addSpacer(8);
  addLinearProgress(right, percent, {
    width: isLarge ? 176 : 168,
    thickness: 7,
    progressColor: COLORS.accent,
    trackColor: COLORS.track,
  });
  right.addSpacer(10);

  const buttonRow = right.addStack();
  buttonRow.centerAlignContent();
  buttonRow.spacing = 6;
  if (supportsInteractiveControls(buttonRow)) {
    buttonRow.addButton(`-${STEP_ML}`, { id: 'remove' });
    buttonRow.addButton(`+${STEP_ML}`, { id: 'add' });
    if (isLarge) buttonRow.addRefreshButton('刷新');
  } else {
    addActionCircle(buttonRow, 'minus', '减少 250ml', 'remove', 24);
    addActionCircle(buttonRow, 'plus', '增加 250ml', 'add', 24);
  }

  if (isLarge) {
    widget.addSpacer(18);
    const panel = widget.addStack();
    panel.layoutVertically();
    panel.setPadding(10, 12, 10, 12);
    panel.cornerRadius = 12;
    panel.backgroundColor = COLORS.chip;
    panel.spacing = 8;

    const panelTitle = panel.addText('原生交互控件（iOS 17+ / 27.2+）');
    panelTitle.font = Font.semiboldSystemFont(11);
    panelTitle.textColor = COLORS.ink;

    const toggleRow = panel.addStack();
    toggleRow.centerAlignContent();
    if (typeof toggleRow.addToggle === 'function') {
      toggleRow.addToggle('透明背景', transparentOn, { id: 'transparent' });
    }
    toggleRow.addSpacer();
    if (typeof toggleRow.addButton === 'function') {
      toggleRow.addButton('归零', { id: 'reset' });
    }

    widget.addSpacer();
    const note = widget.addText('addProgress · addButton · addToggle · addRefreshButton · setAction · backgroundStyle');
    note.font = Font.regularMonospacedSystemFont(9);
    note.textColor = COLORS.muted;
    note.lineLimit = 2;
  }
};

const createWidget = (family = config.widgetFamily || 'medium') => {
  const state = handleWidgetAction();
  const percent = Math.min(100, Math.round((state.ml / state.goal) * 100));
  const transparentOn = isTransparentEnabled(__SCRIPT_ID__);
  const widget = new ListWidget();
  if (isAccessoryFamily(family)) {
    addAccessory(widget, family, state, percent);
  } else {
    addHome(widget, family, state, percent, transparentOn);
  }
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return attachMenuURL(widget);
};

if (shouldShowWidgetMenu()) {
  for (;;) {
    const menu = await runWidgetMenu({
      title: 'v1.8 交互实验室',
      message: '演示原生进度环/条、交互按钮、开关与透明背景',
      version: __SCRIPT_VERSION__,
      updater,
      scriptId: __SCRIPT_ID__,
      previewFamilies: ALL_PREVIEW_FAMILIES,
      actions: [{ id: 'reset', title: '重置今日饮水计数' }],
    });
    if (!menu) break;
    if (menu.action === 'reset') {
      writeWidgetState(__SCRIPT_ID__, { day: todayKey(), ml: 0, goal: GOAL_ML });
      continue;
    }
    if (menu.action === 'preview') {
      await presentWidgetPreviews(createWidget, menu.families);
    }
  }
} else {
  Script.setWidget(createWidget());
}

Script.complete();
