(function initializePreviewApp(global) {
  'use strict';

  const core = global.ScriptablePreviewCore;
  const widgets = global.ScriptablePreviewWidgets;
  if (!core || !widgets) throw new Error('预览核心或组件定义加载失败');

  const catalogList = document.querySelector('#catalog-list');
  const familySwitcher = document.querySelector('#family-switcher');
  const previewViewport = document.querySelector('#preview-viewport');
  const dimensionReadout = document.querySelector('#dimension-readout');
  const themeButton = document.querySelector('#theme-button');
  const refreshButton = document.querySelector('#refresh-button');
  const viewSwitch = document.querySelector('.view-switch');
  let renderSequence = 0;

  const getStoredAppearance = () => {
    try {
      const stored = localStorage.getItem('scriptable-preview-appearance');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {}
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const search = new URLSearchParams(location.search);
  const engine = core.createPreviewEngine({
    widgets,
    initialState: {
      mode: search.get('mode'),
      widgetId: search.get('widget'),
      family: search.get('family'),
      appearance: search.get('appearance') || getStoredAppearance(),
    },
  });

  const familyGroups = [
    ['主屏', core.families.filter((family) => family.group === 'home')],
    ['锁屏', core.families.filter((family) => family.group === 'accessory')],
  ];

  const renderCatalog = (state) => {
    catalogList.innerHTML = engine
      .getWidgets()
      .map(
        (widget, index) => `
          <button type="button" class="catalog-item${state.widgetId === widget.id ? ' is-active' : ''}"
            data-widget-id="${widget.id}" aria-pressed="${state.widgetId === widget.id}">
            <span class="catalog-index">${String(index + 1).padStart(2, '0')}</span>
            <span class="catalog-icon" aria-hidden="true">${widget.icon}</span>
            <span class="catalog-copy"><b>${widget.name}</b><small>${widget.category}</small></span>
          </button>`
      )
      .join('');
  };

  const renderFamilySwitcher = (state) => {
    familySwitcher.innerHTML = familyGroups
      .map(
        ([label, familyItems]) => `
          <div class="family-group">
            <span>${label}</span>
            <div class="segmented-control">
              ${familyItems
                .map(
                  (family) => `
                    <button type="button" data-family="${family.id}"
                      class="${state.family === family.id ? 'is-active' : ''}"
                      aria-pressed="${state.family === family.id}"
                      title="${family.label}">${family.shortLabel}</button>`
                )
                .join('')}
            </div>
          </div>`
      )
      .join('');
  };

  const previewStage = async (widget, state, focused = false) => `
    <div class="preview-stage${focused ? ' preview-stage--focus' : ''}" data-family="${state.family}">
      <div class="preview-scale-shell">
        ${await engine.render(widget.id, { family: state.family, appearance: state.appearance })}
      </div>
    </div>`;

  const renderOverview = async (state) => {
    const entries = await Promise.all(engine.getWidgets().map(async (widget, index) => {
      try {
        return `
          <article class="preview-entry" data-widget-id="${widget.id}" tabindex="0"
            role="button" aria-label="查看 ${widget.name}">
            <header><span>${String(index + 1).padStart(2, '0')}</span><b>${widget.name}</b><small>${widget.category}</small></header>
            ${await previewStage(widget, state)}
          </article>`;
      } catch (error) {
        console.error(`预览 ${widget.id} 失败`, error);
        return `
          <article class="preview-entry preview-entry--error" data-widget-id="${widget.id}">
            <header><span>${String(index + 1).padStart(2, '0')}</span><b>${widget.name}</b><small>加载失败</small></header>
            <div class="preview-error"><b>组件执行失败</b><span>${core.utils.escapeHTML(error.message || error)}</span></div>
          </article>`;
      }
    }));
    return `
      <div class="overview-heading">
        <div><span>DIST RUNTIME</span><h1>组件总览</h1></div>
        <p>${engine.getWidgets().length} 个组件 · ${core.getFamily(state.family).label}</p>
      </div>
      <div class="preview-gallery">${entries.join('')}</div>`;
  };

  const renderFocus = async (state) => {
    const widget = engine.getWidget(state.widgetId);
    return `
      <div class="focus-heading">
        <div class="focus-identity"><span class="focus-icon" aria-hidden="true">${widget.icon}</span><div><small>${widget.category}</small><h1>${widget.name}</h1></div></div>
        <div class="focus-meta"><span>SOURCE</span><b>dist/${widget.id}.js</b></div>
      </div>
      <div class="focus-canvas">
        <div class="canvas-label canvas-label--top">${core.getFamily(state.family).label}</div>
        ${await previewStage(widget, state, true)}
        <div class="canvas-label canvas-label--bottom">${core.getFamily(state.family).width} × ${core.getFamily(state.family).height} PT</div>
      </div>`;
  };

  const fitPreviews = () => {
    document.querySelectorAll('.preview-stage').forEach((stage) => {
      const familyId = stage.dataset.family;
      const family = core.getFamily(familyId);
      const shell = stage.querySelector('.preview-scale-shell');
      const widget = stage.querySelector('.sp-widget');
      if (!shell || !widget) return;
      const inset = stage.classList.contains('preview-stage--focus') ? 64 : 34;
      const scale = core.calculatePreviewScale(
        familyId,
        stage.clientWidth - inset,
        stage.clientHeight - inset
      );
      shell.style.width = `${family.width * scale}px`;
      shell.style.height = `${family.height * scale}px`;
      widget.style.transform = `scale(${scale})`;
    });
  };

  const render = async (state = engine.getState()) => {
    const sequence = ++renderSequence;
    document.documentElement.dataset.theme = state.appearance;
    document.body.dataset.mode = state.mode;
    renderCatalog(state);
    renderFamilySwitcher(state);
    viewSwitch.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const family = core.getFamily(state.family);
    dimensionReadout.innerHTML = `<b>${family.label}</b><span>${family.width} × ${family.height} PT</span>`;
    previewViewport.innerHTML = '<div class="preview-loading"><i></i><span>正在执行 dist 组件…</span></div>';
    try {
      const content = state.mode === 'overview'
        ? await renderOverview(state)
        : await renderFocus(state);
      if (sequence !== renderSequence) return;
      previewViewport.innerHTML = content;
    } catch (error) {
      if (sequence !== renderSequence) return;
      console.error('预览渲染失败', error);
      previewViewport.innerHTML = `<div class="preview-error preview-error--page"><b>预览运行时错误</b><span>${core.utils.escapeHTML(error.message || error)}</span></div>`;
    }
    requestAnimationFrame(fitPreviews);
  };

  const openWidget = (widgetId) => engine.update({ widgetId, mode: 'focus' });

  catalogList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-widget-id]');
    if (button) openWidget(button.dataset.widgetId);
  });

  familySwitcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-family]');
    if (button) engine.update({ family: button.dataset.family });
  });

  viewSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (button) engine.update({ mode: button.dataset.mode });
  });

  previewViewport.addEventListener('click', (event) => {
    const entry = event.target.closest('.preview-entry');
    if (entry) openWidget(entry.dataset.widgetId);
  });

  previewViewport.addEventListener('keydown', (event) => {
    const entry = event.target.closest('.preview-entry');
    if (entry && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openWidget(entry.dataset.widgetId);
    }
  });

  themeButton.addEventListener('click', () => {
    const appearance = engine.getState().appearance === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem('scriptable-preview-appearance', appearance);
    } catch {}
    engine.update({ appearance });
  });

  refreshButton.addEventListener('click', () => {
    refreshButton.classList.remove('is-spinning');
    void refreshButton.offsetWidth;
    refreshButton.classList.add('is-spinning');
    void render();
  });

  engine.subscribe((state) => void render(state));
  const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fitPreviews));
  resizeObserver.observe(previewViewport);
  void render();
})(globalThis);
