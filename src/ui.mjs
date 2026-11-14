import { cropForPage, updateCrop, dragCrop, validCrop } from './vendor/motero/manual-crop.mjs';
import { rotateReadingBounds } from './vendor/motero/reading-layout.mjs';
import { waive, contentData } from './bridge.mjs';

export function element(doc, tag, text, attrs = {}) {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}
export function flagIcon(doc, outline = false) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M5 2h14v20l-7-4.5-7 4.5z'); path.setAttribute('fill', outline ? 'none' : 'currentColor');
  if (outline) { path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-linejoin', 'round'); }
  svg.append(path); return svg;
}
function button(doc, text, fn) {
  const node = element(doc, 'button', text, { type: 'button' });
  node.addEventListener('click', fn); return node;
}
function dialog(state, title) {
  const doc = state.doc, node = element(doc, 'dialog');
  node.setAttribute('aria-label', title);
  node.className = 'motero-crop-editor';
  if (state.ui?.font) node.style.font = state.ui.font;
  const heading = element(doc, 'h2', title);
  node.append(heading);
  doc.body.append(node); state.dialogs.add(node);
  node.addEventListener('close', () => { state.dialogs.delete(node); node.remove(); });
  return node;
}
function row(doc, ...children) {
  const node = element(doc, 'div');
  node.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:8px 0';
  node.append(...children); return node;
}
function select(doc, values, selected) {
  const node = element(doc, 'select');
  for (const [value, label] of values) node.append(element(doc, 'option', label, { value }));
  node.value = selected; return node;
}
export async function showEditor(state) {
  const t = state.t, doc = state.doc, entry = state.activeView();
  if (!entry) throw new Error(t('PDF-Ansicht ist noch nicht bereit.', 'PDF view is not ready.'));
  const panel = dialog(state, t('Manueller Zuschnitt', 'Manual crop'));
  let index = entry.viewer.currentPageNumber - 1, scope = 'all', rect, page, task, token = 0;
  let closed = false;
  const scopeSelect = select(doc, [['all', t('Alle Seiten', 'All pages')],
    ['odd', t('Ungerade Seiten', 'Odd pages')], ['even', t('Gerade Seiten', 'Even pages')]], scope);
  if (entry.viewer.pagesCount < 2) scopeSelect.options[2].disabled = true;
  const pageLabel = element(doc, 'span');
  const previous = button(doc, '←', () => navigate(-1)); previous.title = t('Vorherige Seite', 'Previous page');
  const next = button(doc, '→', () => navigate(1)); next.title = t('Nächste Seite', 'Next page');
  const canvas = waive(doc.createElement('canvas'));
  canvas.style.cssText = 'display:block;width:100%;height:auto;';
  const preview = element(doc, 'div');
  preview.style.cssText = 'position:relative;width:360px;max-width:72vw;overflow:hidden;touch-action:none;user-select:none';
  const frame = element(doc, 'div');
  frame.style.cssText = 'position:absolute;border:2px solid #3080ff;box-sizing:border-box;'
    + 'box-shadow:0 0 0 600px #0006;cursor:move;touch-action:none';
  frame.dataset.handle = 'move'; frame.tabIndex = 0;
  frame.setAttribute('aria-label', t('Zuschnittrahmen, mit Pfeiltasten verschieben', 'Crop frame, move with arrow keys'));
  preview.append(canvas, frame);
  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const dot = element(doc, 'span'); dot.dataset.handle = handle;
    const x = handle.includes('w') ? 0 : handle.includes('e') ? 100 : 50;
    const y = handle.includes('n') ? 0 : handle.includes('s') ? 100 : 50;
    dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:14px;height:14px;`
      + `transform:translate(-50%,-50%);background:#3080ff;border:1px solid white;cursor:${handle}-resize`;
    frame.append(dot);
  }
  const coordinates = row(doc);
  const inputs = [t('Links', 'Left'), t('Oben', 'Top'), t('Rechts', 'Right'), t('Unten', 'Bottom')].map((label, i) => {
    const input = element(doc, 'input', undefined, { type: 'number', min: '0', max: '100', step: '.1' });
    input.style.width = '64px'; input.setAttribute('aria-label', label + ' (%)');
    const wrapper = element(doc, 'label', label + ' (%) '); wrapper.append(input); coordinates.append(wrapper);
    input.addEventListener('change', () => {
      if (!rect) return;
      const changed = [...rect]; changed[i] = Number(input.value) / 100;
      if (validCrop(changed)) { rect = changed; paint(); }
      else { input.value = (rect[i] * 100).toFixed(1); }
    });
    return input;
  });
  const paint = () => {
    if (!rect) return;
    frame.style.left = `${rect[0] * 100}%`; frame.style.top = `${rect[1] * 100}%`;
    frame.style.width = `${(rect[2] - rect[0]) * 100}%`; frame.style.height = `${(rect[3] - rect[1]) * 100}%`;
    inputs.forEach((input, i) => { input.value = (rect[i] * 100).toFixed(1); });
  };
  frame.addEventListener('keydown', event => {
    if (!rect || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? .01 : .001;
    rect = dragCrop(rect, 'move', event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0); paint();
  });
  let drag;
  preview.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !rect || !event.target.dataset.handle) return;
    event.preventDefault(); preview.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, rect: [...rect], handle: event.target.dataset.handle,
      size: preview.getBoundingClientRect() };
  });
  preview.addEventListener('pointermove', event => {
    if (!drag) return;
    rect = dragCrop(drag.rect, drag.handle, (event.clientX - drag.x) / drag.size.width,
      (event.clientY - drag.y) / drag.size.height); paint();
  });
  const end = () => { drag = null; };
  preview.addEventListener('pointerup', end); preview.addEventListener('pointercancel', end);
  preview.addEventListener('lostpointercapture', end);
  const status = element(doc, 'p', '', { role: 'status' });
  const apply = button(doc, t('Übernehmen', 'Apply'), () => {
    if (!page || !rect) return;
    const natural = rotateReadingBounds(rect, -page.rotate);
    state.change({ ...state.options, mode: 'manual', crops: updateCrop(state.options.crops, scope, natural) });
    panel.close();
  });
  async function render(keepRect = false) {
    const request = ++token; task?.cancel(); apply.disabled = true; frame.hidden = true;
    pageLabel.textContent = `${index + 1} / ${entry.viewer.pagesCount}`;
    previous.disabled = index - (scope === 'all' ? 1 : 2) < 0;
    next.disabled = index + (scope === 'all' ? 1 : 2) >= entry.viewer.pagesCount;
    try {
      const loaded = waive(await entry.app.pdfDocument.getPage(index + 1));
      if (closed || token !== request) return;
      const natural = loaded.getViewport(contentData(entry.win, { scale: 1, rotation: loaded.rotate }));
      const viewport = loaded.getViewport(contentData(entry.win, {
        scale: Math.min(1, 520 / Math.max(natural.width, natural.height)), rotation: loaded.rotate
      }));
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const options = new entry.win.Object();
      options.canvasContext = canvas.getContext('2d'); options.viewport = viewport; options.background = '#fff';
      task = waive(loaded.render(options)); await task.promise;
      if (closed || token !== request) return;
      page = loaded;
      if (!keepRect || !rect) {
        const saved = cropForPage(state.options.crops, index);
        rect = saved ? rotateReadingBounds(saved, page.rotate) : await entry.naturalBounds(index);
      }
      if (closed || token !== request) return;
      frame.hidden = false; apply.disabled = false; paint(); status.textContent = '';
    }
    catch (error) {
      if (closed || token !== request) return;
      status.textContent = String(error.message || error); state.error(error);
    }
  }
  function navigate(direction) {
    index += direction * (scope === 'all' ? 1 : 2); render(true);
  }
  scopeSelect.addEventListener('change', () => {
    scope = scopeSelect.value;
    if (scope !== 'all' && index % 2 !== (scope === 'odd' ? 0 : 1)) {
      index = Math.max(0, Math.min(entry.viewer.pagesCount - 1, index + (index ? -1 : 1)));
    }
    render();
  });
  panel.append(row(doc, scopeSelect, previous, pageLabel, next),
    element(doc, 'p', t('Rahmen oder Griffe ziehen. Ungerade/gerade bezieht sich auf die PDF-Seitennummer.',
      'Drag the frame or its handles. Odd/even refers to the PDF page number.')),
    preview, coordinates, status, row(doc, apply,
      button(doc, t('Vollständige Seite', 'Full page'), () => { rect = [0, 0, 1, 1]; paint(); }),
      button(doc, t('Abbrechen', 'Cancel'), () => panel.close())));
  panel.addEventListener('close', () => { closed = true; ++token; task?.cancel(); canvas.width = canvas.height = 0; });
  panel.showModal(); await render();
}
