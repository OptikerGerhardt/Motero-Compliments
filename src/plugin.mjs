import { settings, preferenceKey, pageBookmarks, bookmarkAnnotation, SerialQueue } from './core.mjs';
import { PDFView, waive, contentData, exported } from './pdf.mjs';
import { element, flagIcon, showPanel } from './ui.mjs';

const states = new Map();
const bindings = [];
let active = false, pluginID;
const t = (de, en) => Zotero.locale?.startsWith('de') ? de : en;
const logError = error => Zotero.logError(error);

export class ReaderState {
  constructor(reader, doc) {
    this.reader = reader; this.doc = doc; this.t = t;
    this.internal = waive(reader._internalReader);
    this.key = preferenceKey(reader._item);
    try { this.options = settings(JSON.parse(Zotero.Prefs.get(this.key, true) || '{}')); }
    catch { this.options = settings({}); }
    this.views = new Map(); this.dialogs = new Set(); this.buttons = new Set();
    this.queue = new SerialQueue();
    this.closed = false; this.peek = false;
    this.unload = () => { this.destroy(); states.delete(reader); };
    doc.defaultView.addEventListener('unload', this.unload);
    this.observer = new doc.defaultView.MutationObserver(exported(doc.defaultView, () => this.discover()));
    this.observer.observe(doc.body, contentData(doc.defaultView, { childList: true, subtree: true }));
    this.discover();
  }
  discover() {
    if (this.closed) return;
    const current = [this.internal._primaryView, this.internal._secondaryView].filter(Boolean).map(waive);
    for (const [view, entry] of this.views) {
      if (!current.includes(view) || entry.closed) { entry.destroy(); this.views.delete(view); }
    }
    for (const view of current) {
      const app = view._iframeWindow?.PDFViewerApplication;
      if (view._destroyed || !app?.pdfDocument || !app?.pdfViewer?.pagesCount || this.views.has(view)) continue;
      try { this.views.set(view, new PDFView(view, this)); }
      catch (error) { this.error(error); }
    }
  }
  activeView() {
    this.discover();
    const focused = this.internal._lastView;
    return this.views.get(focused) || this.views.values().next().value;
  }
  canEdit() { return !this.closed && !this.internal._state.readOnly && this.reader._item.isEditable(); }
  annotations() { return this.internal._state.annotations || []; }
  change(value) {
    if (this.closed) return;
    this.options = settings(value); this.peek = false;
    Zotero.Prefs.set(this.key, JSON.stringify(this.options), true);
    // Other tabs/windows for this attachment share the saved view settings.
    for (const state of states.values()) {
      if (state.key !== this.key) continue;
      state.options = this.options; state.peek = false;
      for (const entry of state.views.values()) {
        if (this.options.mode === 'off') entry.restoreScale();
        entry.invalidate();
      }
    }
  }
  togglePeek() {
    this.peek = !this.peek;
    for (const view of this.views.values()) {
      if (this.peek) view.restoreScale();
      view.invalidate();
    }
  }
  flagButton(doc, index) {
    const node = element(doc, 'button', undefined, { type: 'button', title: t('Lesezeichen umschalten', 'Toggle bookmark'),
      'aria-label': t('Lesezeichen umschalten', 'Toggle bookmark') });
    node.append(flagIcon(doc));
    node.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      this.toggleBookmark(index).catch(error => this.error(error));
    });
    // Keep PDF.js/Zotero's annotation and selection gestures off this shortcut.
    node.addEventListener('pointerdown', event => event.stopPropagation());
    this.updateFlag(node, index); return node;
  }
  updateFlag(node, index) {
    node.setAttribute('aria-pressed', String(pageBookmarks(this.annotations(), index).length > 0));
    node.disabled = !this.canEdit() || pageBookmarks(this.annotations(), index).some(a => a.readOnly);
  }
  updateButtons() {
    if (this.closed) return;
    const index = this.activeView()?.viewer.currentPageNumber - 1;
    for (const button of this.buttons) this.updateFlag(button, index);
  }
  toggleBookmark(index) {
    return this.queue.run(async () => {
      const entry = this.activeView();
      if (!entry || !this.canEdit()) return;
      index ??= entry.viewer.currentPageNumber - 1;
      if (!Number.isInteger(index) || index < 0 || index >= entry.viewer.pagesCount) return;
      const existing = pageBookmarks(this.annotations(), index);
      if (existing.some(a => a.readOnly)) return;
      if (existing.length) {
        // One per page; imported duplicate markers are removed in the same undo step.
        this.internal._annotationManager.deleteAnnotations(contentData(this.reader._iframeWindow, existing.map(a => a.id)));
      }
      else {
        const page = waive(await entry.app.pdfDocument.getPage(index + 1));
        const bounds = await entry.naturalBounds(index);
        if (!this.canEdit()) return;
        const viewport = page.getViewport(contentData(entry.win, { scale: 1, rotation: page.rotate }));
        const annotation = bookmarkAnnotation(viewport, index, bounds,
          entry.view._getPageLabel(index, true), new Intl.DateTimeFormat(Zotero.locale,
            { dateStyle: 'short', timeStyle: 'short' }).format(new Date()), Zotero.locale?.startsWith('de'));
        entry.view._onAddAnnotation(contentData(entry.win, annotation), false);
      }
      this.changedAnnotations();
    });
  }
  removeBookmark(id) {
    return this.queue.run(() => {
      const annotation = this.annotations().find(a => a.id === id);
      if (!this.canEdit() || !annotation || annotation.readOnly || !pageBookmarks([annotation], annotation.position.pageIndex).length) return;
      this.internal.deleteAnnotations(contentData(this.reader._iframeWindow, [id]));
      this.changedAnnotations();
    });
  }
  changedAnnotations() {
    this.updateButtons(); this.renderList?.();
    for (const view of this.views.values()) view.schedule();
  }
  error(error) {
    logError(error);
    if (this.closed) return;
    const message = t('Motero: ', 'Motero: ') + String(error.message || error);
    // Inline status avoids a recurring modal when an unsupported reader changes.
    if (!this.status) {
      this.status = element(this.doc, 'div', '', { role: 'alert' });
      this.status.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:10000;'
        + 'background:Canvas;color:CanvasText;border:1px solid GrayText;padding:8px;max-width:420px';
      this.doc.body.append(this.status);
    }
    this.status.textContent = message;
    this.doc.defaultView.clearTimeout(this.errorTimer);
    this.errorTimer = this.doc.defaultView.setTimeout(() => { this.status?.remove(); this.status = null; }, 10000);
  }
  destroy() {
    if (this.closed) return;
    this.closed = true; this.observer.disconnect();
    this.doc.defaultView.removeEventListener('unload', this.unload);
    this.doc.defaultView.clearTimeout(this.errorTimer); this.status?.remove();
    for (const dialog of this.dialogs) dialog.close();
    for (const entry of this.views.values()) entry.destroy();
    for (const node of this.doc.querySelectorAll('[data-motero-toolbar]')) node.remove();
    this.views.clear(); this.buttons.clear(); this.dialogs.clear();
  }
}

export function adopt(reader, doc) {
  if (!active || reader._type !== 'pdf' || !reader._internalReader || !reader._item?.key) return null;
  let state = states.get(reader);
  if (state?.closed) { states.delete(reader); state = null; }
  if (!state) { state = new ReaderState(reader, doc); states.set(reader, state); }
  return state;
}
function toolbar({ reader, doc, append }) {
  try {
    const state = adopt(reader, doc);
    if (!state || doc.querySelector('[data-motero-toolbar]')) return;
    const group = element(doc, 'div', undefined, { 'data-motero-toolbar': 'true' });
    group.style.cssText = 'display:flex;align-items:center;gap:4px';
    const controls = element(doc, 'button', 'Motero', { type: 'button', title: t('Zuschnitt und Lesezeichen', 'Cropping and bookmarks') });
    controls.style.cssText = 'padding:2px 6px;background:transparent;color:inherit;border:1px solid GrayText;border-radius:4px;cursor:pointer';
    controls.addEventListener('click', () => showPanel(state));
    const mark = state.flagButton(doc);
    mark.style.cssText = 'padding:3px;width:26px;height:26px;background:transparent;color:inherit;border:0;cursor:pointer';
    state.buttons.add(mark); group.append(controls, mark); append(group);
    state.updateButtons();
  }
  catch (error) { logError(error); }
}
export async function startup({ id }) {
  // Reader event handlers are registered synchronously during plugin startup.
  active = true; pluginID = id;
  const register = (type, fn) => { Zotero.Reader.registerEventListener(type, fn, id); bindings.push([type, fn]); };
  register('renderToolbar', toolbar);
  register('createViewContextMenu', ({ reader, doc, append }) => {
    const state = adopt(reader, doc);
    if (state) append({ label: 'Motero: ' + t('Zuschnitt und Lesezeichen…', 'Cropping and bookmarks…'), onCommand: () => showPanel(state) });
  });
  // Plugin enables/upgrades must also adopt already open tabs and reader windows.
  for (const reader of Zotero.Reader._readers) {
    await reader._initPromise;
    if (reader._type !== 'pdf') continue;
    const doc = reader._iframeWindow?.document;
    const host = doc?.querySelector('.toolbar .end, .toolbar .center, .toolbar');
    if (host) toolbar({ reader, doc, append: node => host.append(node) });
  }
  observerID = Zotero.Notifier.registerObserver({ notify: () => {
    for (const state of states.values()) state.changedAnnotations();
  } }, ['item'], 'moteroCompliments');
}
let observerID;
export function shutdown() {
  active = false;
  if (observerID) Zotero.Notifier.unregisterObserver(observerID);
  observerID = null;
  // Some older Reader versions inverted unregisterEventListener's predicate.
  // Per-plugin removal is used by Zotero's own plugin shutdown path as well.
  if (Zotero.Reader._unregisterEventListenerByPluginID) Zotero.Reader._unregisterEventListenerByPluginID(pluginID);
  else for (const [type, fn] of bindings) Zotero.Reader.unregisterEventListener(type, fn);
  bindings.length = 0;
  for (const state of states.values()) state.destroy();
  states.clear();
}
