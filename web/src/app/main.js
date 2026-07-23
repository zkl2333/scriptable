import { widgetFamilies } from '../device-presets.js';
import { buildLayoutLab } from '../fixtures/layout-lab.js';
import { renderWidget } from '../renderer/index.js';
import { runPreview } from '../runtime/index.js';
import './styles.css';

const familySelect = document.querySelector('#family-select');
const previewSurface = document.querySelector('#preview-surface');
const runtimeState = document.querySelector('#runtime-state');
const diagnosticsElement = document.querySelector('#diagnostics');
const diagnosticCount = document.querySelector('#diagnostic-count');
const nodeTree = document.querySelector('#node-tree');
const zoomRange = document.querySelector('#zoom-range');
const zoomOutput = document.querySelector('#zoom-output');
const schemeButtons = [...document.querySelectorAll('[data-scheme]')];

const initialState = new URLSearchParams(window.location.search);
const allowedZoomLevels = [75, 100, 125, 150, 175];
const requestedZoom = Number(initialState.get('zoom'));
const defaultZoom = window.matchMedia('(max-width: 520px)').matches ? 75 : 125;
const state = {
  family: widgetFamilies[initialState.get('family')] ? initialState.get('family') : 'medium',
  scheme: initialState.get('scheme') === 'dark' ? 'dark' : 'light',
  zoom: allowedZoomLevels.includes(requestedZoom) ? requestedZoom : defaultZoom,
};

const updateLocation = () => {
  const query = new URLSearchParams(state);
  history.replaceState(null, '', `?${query}`);
};

const formatTree = (node, depth = 0) => {
  const indent = '  '.repeat(depth);
  const label = node.type === 'text' ? ` “${node.text}”` : node.type === 'date' ? ` ${node.dateStyle}` : '';
  const lines = [`${indent}${node.type}${label}`];
  if (node.children) node.children.forEach((child) => lines.push(...formatTree(child, depth + 1)));
  return lines;
};

const renderDiagnostics = (diagnostics) => {
  diagnosticsElement.replaceChildren();
  diagnosticCount.textContent = String(diagnostics.length);
  if (diagnostics.length === 0) {
    const item = document.createElement('li');
    item.className = 'diagnostic-ok';
    item.textContent = 'No diagnostics';
    diagnosticsElement.append(item);
    return;
  }
  for (const diagnostic of diagnostics) {
    const item = document.createElement('li');
    item.className = `diagnostic-${diagnostic.level}`;
    item.textContent = diagnostic.message;
    diagnosticsElement.append(item);
  }
};

const updatePreview = async () => {
  familySelect.value = state.family;
  zoomRange.value = String(state.zoom);
  zoomOutput.value = `${state.zoom}%`;
  schemeButtons.forEach((button) => button.classList.toggle('active', button.dataset.scheme === state.scheme));
  const result = await runPreview(buildLayoutLab, {
    family: state.family,
    scheme: state.scheme,
    now: new Date('2026-07-23T06:30:00Z'),
  });
  previewSurface.replaceChildren();
  renderDiagnostics(result.diagnostics);
  if (!result.widget) {
    runtimeState.textContent = 'Runtime error';
    nodeTree.textContent = '';
    return;
  }
  const size = widgetFamilies[state.family];
  const preview = renderWidget(result.widget, {
    family: state.family,
    scheme: state.scheme,
    size,
    now: result.runtime.api.now,
  });
  preview.style.setProperty('--preview-scale', String(state.zoom / 100));
  previewSurface.append(preview);
  runtimeState.textContent = `${size.label} · ${size.width} × ${size.height} pt`;
  nodeTree.textContent = formatTree(result.widget).join('\n');
  updateLocation();
};

familySelect.addEventListener('change', () => {
  state.family = familySelect.value;
  updatePreview();
});

schemeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.scheme = button.dataset.scheme;
    updatePreview();
  });
});

zoomRange.addEventListener('input', () => {
  state.zoom = Number(zoomRange.value);
  updatePreview();
});

updatePreview();
