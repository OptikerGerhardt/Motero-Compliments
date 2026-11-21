import { getReadingSamples, getReadingTextLines, buildReadingModel,
  localReadingPages, buildReadingProfiles, resolveReadingBounds, rotateReadingBounds, getReadingMarginalia
} from './vendor/motero/reading-layout.mjs';
import { policyBounds, constrainReadingFrame } from './crop-policy.mjs';
import { WorkQueue, preparationPages } from './work-queue.mjs';
import { cropForPage, paddedBounds, pageBookmarks, isReaderBookmark } from './core.mjs';
import { waive, contentData, signal, drawingHook } from './bridge.mjs';
import { PDF_CSS } from './styles.mjs';
import { flagIcon } from './ui.mjs';
const FULL = [0, 0, 1, 1];

export class Analysis {
  constructor(win, rootURI) {
    this.win = waive(win);
    this.pdf = waive(this.win.PDFViewerApplication.pdfDocument);
    this.raw = new Map();
    this.work = new WorkQueue(2);
    Services.scriptloader.loadSubScriptWithOptions(rootURI + 'analysis.js', {
      target: this.win, ignoreCache: true, allowUnsafeURL: true
    });
    this.renderer = waive(this.win.MoteroPageAnalysis.create());
    this.closed = false;
  }
  async read(index, background = false) {
    if (this.closed) throw new Error('Reader closed');
    if (this.raw.has(index)) {
      const value = this.raw.get(index); this.raw.delete(index); this.raw.set(index, value); return value;
    }
    return this.work.run(index, async () => {
      const value = await this.render(index);
      if (!this.closed) this.raw.set(index, value);
      if (this.raw.size > 64) this.raw.delete(this.raw.keys().next().value);
      return value;
    }, background);
  }
  async render(index) {
    if (this.closed) throw Error('Reader closed');
    let phase = 'extract';
    try {
      const result = await this.renderer.extract(contentData(this.win, { index }));
      if (this.closed) throw Error('Reader closed');
      phase = 'data transfer';
      const data = Components.utils.cloneInto(waive(result), globalThis);
      phase = 'text geometry';
      return { index, image: data.image, ink: data.ink, rotation: data.rotation,
        width: data.viewport.width, height: data.viewport.height,
        lines: getReadingTextLines(data.text, data.viewport) };
    }
    catch (error) { throw Error(`Auto crop, page ${index + 1}, ${phase}: ${error.message || error}`); }
  }
  async initialize(options) {
    const samples = [];
    // Bounded sequential rendering avoids competing with the reader's canvases.
    for (const index of getReadingSamples(this.pdf.numPages)) samples.push(await this.read(index));
    const model = buildReadingModel(samples);
    const profiles = buildReadingProfiles(samples.map(p => ({ index: p.index,
      bounds: policyBounds(p.image, p.lines, model, p.index, options, p.ink) })));
    return { samples, model, profiles };
  }
  async bounds(index, options, background = false) {
    const key = `${options.includeMarginalia}:${options.includeReferences}`;
    if (!this.initial || this.policyKey !== key) {
      this.policyKey = key;
      this.initial = this.initialize(options);
    }
    const { samples, model, profiles } = await this.initial;
    const nearby = [];
    for (let i = Math.max(0, index - 2); i <= Math.min(this.pdf.numPages - 1, index + 2); i++) {
      nearby.push(await this.read(i, background));
    }
    const local = localReadingPages(nearby, index);
    const localModel = local.length >= 3 ? buildReadingModel(local) : model;
    for (const key of model.repeated) localModel.repeated.add(key);
    const page = nearby.find(p => p.index === index) || samples.find(p => p.index === index);
    const bounds = policyBounds(page.image, page.lines, localModel, index, options, page.ink);
    const resolved = resolveReadingBounds(bounds, index, profiles);
    // A broad cover/front-matter profile must not erase a useful body crop.
    return constrainReadingFrame(bounds, resolved, getReadingMarginalia(page.lines, localModel, index), options.includeReferences);
  }
  destroy() {
    this.closed = true;
    this.renderer.destroy();
    this.raw.clear(); this.initial = null;
  }
}

// Only the page's visible frame and layout margins change. Its full coordinate
// plane, PDF.js viewport, text layer and annotation coordinates remain intact.
export class PDFView {
  constructor(view, state) {
    this.view = waive(view);
    this.state = state;
    this.win = waive(view._iframeWindow);
    this.app = waive(this.win.PDFViewerApplication);
    this.viewer = waive(this.app.pdfViewer);
    this.analysis = new Analysis(this.win, state.rootURI);
    this.layout = waive(this.win.MoteroPageAnalysis.installLayout());
    this.bounds = new Map();
    this.busHandlers = [];
    this.saved = new Map();
    this.noteHooks = new Map();
    this.generation = 0;
    this.autoFit = true; this.warmQueue = []; this.warmWorkers = 0; this.preparationErrors = new Map();
    this.style = this.win.document.createElement('style');
    this.style.textContent = PDF_CSS;
    this.win.document.head.append(this.style);
    for (const name of ['pagerendered', 'rotationchanging', 'scrollmodechanged', 'spreadmodechanged']) {
      this.on(name, () => this.schedule());
    }
    this.on('scalechanging', () => {
      if (!this.settingScale) this.autoFit = false;
      this.schedule();
    });
    this.on('pagechanging', () => { this.schedule(true); state.updateButtons(); });
    this.scroll = () => this.schedule();
    this.viewer.container.addEventListener('scroll', this.scroll);
    this.resize = new this.win.ResizeObserver(signal(this.win, () => this.schedule(true)));
    this.resize.observe(this.viewer.container);
    this.unload = () => this.destroy();
    this.win.addEventListener('unload', this.unload);
    this.previousScale = this.viewer.currentScaleValue;
    this.schedule(true);
  }
  on(name, fn) {
    const handler = signal(this.win, fn);
    this.app.eventBus.on(name, handler);
    this.busHandlers.push([name, handler]);
  }
  schedule(fit = false) {
    if (this.closed || this.failed) return;
    this.fitWanted ||= fit;
    this.win.clearTimeout(this.timer);
    this.timer = this.win.setTimeout(() => {
      const wanted = this.fitWanted; this.fitWanted = false;
      this.refresh(wanted).catch(error => {
        if (!this.closed) { this.failed = true; this.state.error(error); }
      });
    }, 60);
  }
  invalidate() { this.failed = false; this.autoFit = true; this.warmQueue = []; this.preparationErrors.clear(); this.bounds.clear(); this.generation++; this.schedule(true); }
  async naturalBounds(index, background = false) {
    const options = this.state.options;
    if (options.mode === 'off') return FULL;
    const page = waive(await this.app.pdfDocument.getPage(index + 1));
    if (options.mode === 'manual') {
      // Manual crops are stored before user view rotation, like Motero.
      return rotateReadingBounds(cropForPage(options.crops, index) || FULL, page.rotate);
    }
    if (!background && this.preparationErrors.has(index)) throw this.preparationErrors.get(index);
    return paddedBounds(await this.analysis.bounds(index, options, background), options.margin);
  }
  prepareAhead(current) {
    if (this.closed || this.state.options.mode !== 'automatic') return;
    if (this.warmCenter === current && this.warmGeneration === this.generation) return;
    const direction = this.warmCenter !== undefined && current < this.warmCenter ? -1 : 1;
    this.warmCenter = current; this.warmGeneration = this.generation;
    this.warmQueue = preparationPages(current, this.viewer.pagesCount, direction)
      .filter(index => !this.bounds.has(index) && !this.preparationErrors.has(index));
    this.win.clearTimeout(this.warmTimer);
    this.warmTimer = this.win.setTimeout(() => {
      while (this.warmWorkers < 2 && this.warmQueue.length) this.warm();
    }, 150);
  }
  async warm() {
    this.warmWorkers++;
    try {
      while (!this.closed && this.warmQueue.length) {
        const index = this.warmQueue.shift(), generation = this.generation;
        if (this.bounds.has(index)) continue;
        try {
          const bounds = await this.naturalBounds(index, true);
          if (this.closed || generation !== this.generation) continue;
          this.bounds.set(index, bounds);
          this.viewer.viewer.setAttribute('data-motero-prepared-pages', String(this.bounds.size));
          this.viewer.viewer.setAttribute('data-motero-analysis-cache', String(this.analysis.raw.size));
          this.schedule();
        }
        catch (error) {
          if (!this.closed && generation === this.generation) this.preparationErrors.set(index, error);
        }
      }
    }
    finally { this.warmWorkers--; }
  }
  displayed(index, pageView) {
    const bounds = this.bounds.get(index) || FULL;
    return rotateReadingBounds(bounds, pageView.viewport.rotation - (pageView.pdfPage?.rotate || 0));
  }
  async refresh(fit = false) {
    if (this.closed) return;
    if (this.busy) { this.again = true; this.fitWanted ||= fit; return; }
    this.busy = true;
    const generation = this.generation;
    try {
      const current = this.viewer.currentPageNumber - 1;
      const visible = this.viewer._getVisiblePages?.().views?.map(p => p.id - 1) || [current];
      const indexes = [...new Set([current, ...visible])].filter(i => i >= 0 && i < this.viewer.pagesCount);
      for (const index of indexes) {
        if (!this.bounds.has(index)) {
          const bounds = await this.naturalBounds(index);
          if (this.closed || generation !== this.generation) return;
          this.bounds.set(index, bounds);
        }
      }
      if (this.closed) return;
      const anchor = this.viewer.getPageView(current)?.div;
      const before = anchor?.getBoundingClientRect().top;
      // Pixel insets must use the fitted viewport, not its previous scale.
      if (fit && this.state.options.mode !== 'off') this.fit(current);
      this.applyPages();
      if (anchor && Number.isFinite(before)) {
        this.viewer.container.scrollTop += anchor.getBoundingClientRect().top - before;
      }
      this.state.updateButtons();
      this.prepareAhead(current);
    }
    finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(this.fitWanted); }
    }
  }
  applyPages() {
    const enabled = this.state.options.mode !== 'off';
    this.viewer.viewer.toggleAttribute('data-motero-cropping', enabled);
    this.viewer.viewer.setAttribute('data-motero-generation', String(this.generation));
    this.hideNativeBookmarkNotes();
    // A full pass is required when leaving a cropped view to restore every
    // modified page. In stable Original mode only attached visible pages need
    // bookmark overlays; scrolling must not traverse the whole document.
    const restoreAll = this.wasCropping && !enabled;
    this.wasCropping = enabled;
    const indexes = enabled || restoreAll
      ? Array.from({ length: this.viewer.pagesCount }, (_, i) => i)
      : [...new Set([
        this.viewer.currentPageNumber - 1,
        ...(this.viewer._getVisiblePages?.().views || []).map(entry => entry.id - 1)
      ])].filter(i => i >= 0 && i < this.viewer.pagesCount);
    for (const i of indexes) {
      const page = waive(this.viewer.getPageView(i));
      if (!page?.div) continue;
      const div = page.div;
      // Original mode must not write crop styles on pages that Motero never
      // cropped. Restore only pages whose original styles we actually saved.
      if (enabled && !this.saved.has(div)) {
        const original = {};
        for (const key of ['clip-path', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']) {
          original[key] = [div.style.getPropertyValue(key), div.style.getPropertyPriority(key)];
        }
        this.saved.set(div, original);
      }
      const b = enabled ? this.displayed(i, page) : FULL;
      const { width: w, height: h } = page.viewport;
      const trims = [b[1] * h, (1 - b[2]) * w, (1 - b[3]) * h, b[0] * w];
      if (enabled) {
        div.setAttribute('data-motero-crop', trims.join(' '));
        const values = { 'clip-path': `inset(${trims.map(n => `${n}px`).join(' ')})` };
        ['top', 'right', 'bottom', 'left'].forEach((side, n) => { values[`margin-${side}`] = `${-trims[n]}px`; });
        for (const [key, value] of Object.entries(values)) div.style.setProperty(key, value, 'important');
      }
      else if (this.saved.has(div)) {
        for (const [key, [value, priority]] of Object.entries(this.saved.get(div))) {
          if (value) div.style.setProperty(key, value, priority);
          else div.style.removeProperty(key);
        }
        div.removeAttribute('data-motero-crop');
        this.saved.delete(div);
      }
      // Add the shortcut only to pages PDF.js has actually attached.
      if (!div.isConnected || !page.pdfPage) continue;
      let corner = div.querySelector('.motero-page-corner');
      if (!corner) {
        corner = this.win.document.createElement('div'); corner.className = 'motero-page-corner';
        const marker = flagIcon(this.win.document); marker.classList.add('motero-bookmark-marker');
        const toggle = this.state.flagButton(this.win.document, i); toggle.className = 'motero-page-toggle';
        corner.append(marker, toggle); div.append(corner);
      }
      corner.style.top = `${trims[0] + 4}px`;
      corner.style.right = `${trims[1] + 4}px`;
      corner.style.width = `${Math.max(1, Math.min(50, (b[2] - b[0]) * w - 8))}px`;
      corner.style.height = `${Math.max(1, Math.min(62, (b[3] - b[1]) * h - 8))}px`;
      const bookmarks = pageBookmarks(this.state.annotations(), i);
      const marker = corner.querySelector('.motero-bookmark-marker');
      marker.style.display = bookmarks.length ? '' : 'none';
      marker.style.color = bookmarks[0]?.color || '#000000';
      this.state.updateFlag(corner.querySelector('button'), i);
    }
  }
  hideNativeBookmarkNotes() {
    const current = new Set(Array.from(this.view._pages || [], waive));
    for (const [page, { original, hook, own }] of this.noteHooks) {
      if (current.has(page)) continue;
      if (waive(page._pushNote) === waive(hook)) {
        if (own) page._pushNote = original; else delete page._pushNote;
      }
      this.noteHooks.delete(page);
    }
    for (const page of current) {
      if (this.noteHooks.has(page) || typeof page._pushNote !== 'function') continue;
      const original = page._pushNote;
      const own = Object.hasOwn(page, '_pushNote');
      const hook = drawingHook(this.win, (items, annotation) => {
        const mark = waive(annotation);
        if (this.closed || !isReaderBookmark(mark)) original.call(page, waive(items), mark);
      });
      page._pushNote = hook;
      this.noteHooks.set(page, { original, hook, own });
      page.render();
    }
  }
  fit(index) {
    const p = this.viewer.getPageView(index);
    if (!this.autoFit || !p?.viewport || !this.bounds.has(index)) return;
    const b = this.displayed(index, p), c = this.viewer.container;
    const w = p.viewport.width / this.viewer.currentScale;
    const h = p.viewport.height / this.viewer.currentScale;
    const sx = Math.max(1, c.clientWidth - 24) / ((b[2] - b[0]) * w);
    const sy = Math.max(1, c.clientHeight - 24) / ((b[3] - b[1]) * h);
    const mode = this.state.options.fit;
    const scale = Math.max(.1, Math.min(10, mode === 'width' ? sx : mode === 'height' ? sy : Math.min(sx, sy)));
    this.settingScale = true;
    try { if (Math.abs(scale - this.viewer.currentScale) > .002) this.viewer.currentScaleValue = scale; }
    finally { this.settingScale = false; }
    this.appliedScale = this.viewer.currentScaleValue;
  }
  restoreScale() {
    if (this.appliedScale !== undefined && this.viewer.currentScaleValue === this.appliedScale) {
      this.viewer.currentScaleValue = this.previousScale;
    }
    this.appliedScale = undefined;
  }
  destroy() {
    if (this.closed) return;
    this.closed = true; this.generation++; this.warmQueue = [];
    this.win.clearTimeout(this.timer);
    this.win.clearTimeout(this.warmTimer);
    this.analysis.destroy(); this.resize.disconnect();
    this.layout.destroy();
    this.viewer.container.removeEventListener('scroll', this.scroll);
    this.win.removeEventListener('unload', this.unload);
    for (const [name, fn] of this.busHandlers) this.app.eventBus.off(name, fn);
    for (const [div, original] of this.saved) {
      for (const [key, [value, priority]] of Object.entries(original)) {
        if (value) div.style.setProperty(key, value, priority); else div.style.removeProperty(key);
      }
      div.querySelector('.motero-page-corner')?.remove();
      div.removeAttribute('data-motero-crop');
    }
    for (const [page, { original, hook, own }] of this.noteHooks) {
      if (waive(page._pushNote) !== waive(hook)) continue; // Another extension now owns it.
      if (own) page._pushNote = original; else delete page._pushNote;
      if (!this.view._destroyed) page.render();
    }
    this.noteHooks.clear();
    this.viewer.viewer.removeAttribute('data-motero-prepared-pages');
    this.viewer.viewer.removeAttribute('data-motero-analysis-cache');
    this.viewer.viewer.removeAttribute('data-motero-cropping');
    this.viewer.viewer.removeAttribute('data-motero-generation');
    this.saved.clear(); this.restoreScale(); this.style.remove();
  }
}
