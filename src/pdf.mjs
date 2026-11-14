import { getReadingSamples, getReadingTextLines, buildReadingModel, getReadingBounds,
  localReadingPages, buildReadingProfiles, resolveReadingBounds, rotateReadingBounds
} from './vendor/motero/reading-layout.mjs';
import { compactReadingImage } from './vendor/motero/reading-image.mjs';
import { cropForPage, paddedBounds, pageBookmarks, isReaderBookmark } from './core.mjs';
import { waive, contentData, signal, drawingHook } from './bridge.mjs';
import { PDF_CSS } from './styles.mjs';
import { flagIcon } from './ui.mjs';
const FULL = [0, 0, 1, 1];

export class Analysis {
  constructor(win) {
    this.win = waive(win);
    this.pdf = waive(this.win.PDFViewerApplication.pdfDocument);
    this.raw = new Map();
    this.pending = new Map();
    this.tasks = new Set();
    this.closed = false;
  }
  async read(index) {
    if (this.closed) throw new Error('Reader closed');
    if (this.raw.has(index)) return this.raw.get(index);
    if (this.pending.has(index)) return this.pending.get(index);
    const promise = this.render(index).then(value => {
      this.raw.set(index, value);
      if (this.raw.size > 32) this.raw.delete(this.raw.keys().next().value);
      return value;
    }).finally(() => this.pending.delete(index));
    this.pending.set(index, promise);
    return promise;
  }
  async render(index) {
    const page = waive(await this.pdf.getPage(index + 1));
    if (this.closed) throw new Error('Reader closed');
    const natural = page.getViewport(contentData(this.win, { scale: 1, rotation: page.rotate }));
    const viewport = page.getViewport(contentData(this.win, {
      scale: Math.min(1, 640 / Math.max(natural.width, natural.height)), rotation: page.rotate
    }));
    const canvas = waive(this.win.document.createElement('canvas'));
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = waive(canvas.getContext('2d', contentData(this.win, { willReadFrequently: true })));
    const options = new this.win.Object();
    options.canvasContext = context; options.viewport = viewport; options.background = '#ffffff';
    const task = waive(page.render(options));
    this.tasks.add(task);
    try {
      await task.promise;
      if (this.closed) throw new Error('Reader closed');
      const image = compactReadingImage(context.getImageData(0, 0, canvas.width, canvas.height));
      const text = waive(await page.getTextContent());
      return { index, image, lines: getReadingTextLines(text, natural),
        rotation: page.rotate, width: natural.width, height: natural.height };
    }
    finally { this.tasks.delete(task); canvas.width = canvas.height = 0; }
  }
  async initialize(includeMarginalia) {
    const samples = [];
    // Bounded sequential rendering avoids competing with the reader's canvases.
    for (const index of getReadingSamples(this.pdf.numPages)) samples.push(await this.read(index));
    const model = buildReadingModel(samples);
    const profiles = buildReadingProfiles(samples.map(p => ({ index: p.index,
      bounds: getReadingBounds(p.image, p.lines, model, p.index, { includeMarginalia }) })));
    return { samples, model, profiles };
  }
  async bounds(index, includeMarginalia) {
    if (!this.initial || this.includeMarginalia !== includeMarginalia) {
      this.includeMarginalia = includeMarginalia;
      this.initial = this.initialize(includeMarginalia);
    }
    const { samples, model, profiles } = await this.initial;
    const nearby = [];
    for (let i = Math.max(0, index - 2); i <= Math.min(this.pdf.numPages - 1, index + 2); i++) {
      nearby.push(await this.read(i));
    }
    const local = localReadingPages(nearby, index);
    const localModel = local.length >= 3 ? buildReadingModel(local) : model;
    for (const key of model.repeated) localModel.repeated.add(key);
    const page = nearby.find(p => p.index === index) || samples.find(p => p.index === index);
    const bounds = getReadingBounds(page.image, page.lines, localModel, index, { includeMarginalia });
    return resolveReadingBounds(bounds, index, profiles);
  }
  destroy() {
    this.closed = true;
    for (const task of this.tasks) task.cancel();
    this.raw.clear(); this.pending.clear(); this.initial = null;
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
    this.analysis = new Analysis(this.win);
    this.bounds = new Map();
    this.busHandlers = [];
    this.saved = new Map();
    this.noteHooks = new Map();
    this.generation = 0;
    this.style = this.win.document.createElement('style');
    this.style.textContent = PDF_CSS;
    this.win.document.head.append(this.style);
    for (const name of ['pagerendered', 'scalechanging', 'rotationchanging', 'scrollmodechanged', 'spreadmodechanged']) {
      this.on(name, () => this.schedule());
    }
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
  invalidate() { this.failed = false; this.bounds.clear(); this.generation++; this.schedule(true); }
  async naturalBounds(index) {
    const options = this.state.options;
    if (options.mode === 'off' || this.state.peek) return FULL;
    const page = waive(await this.app.pdfDocument.getPage(index + 1));
    if (options.mode === 'manual') {
      // Manual crops are stored before user view rotation, like Motero.
      return rotateReadingBounds(cropForPage(options.crops, index) || FULL, page.rotate);
    }
    return paddedBounds(await this.analysis.bounds(index, options.includeMarginalia), options.margin);
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
      this.applyPages();
      if (anchor && Number.isFinite(before)) {
        this.viewer.container.scrollTop += anchor.getBoundingClientRect().top - before;
      }
      if (fit && this.state.options.mode !== 'off' && !this.state.peek) this.fit(current);
      this.state.updateButtons();
    }
    finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(this.fitWanted); }
    }
  }
  applyPages() {
    const enabled = this.state.options.mode !== 'off' && !this.state.peek;
    this.hideNativeBookmarkNotes();
    for (let i = 0; i < this.viewer.pagesCount; i++) {
      const page = waive(this.viewer.getPageView(i));
      if (!page?.div) continue;
      const div = page.div;
      if (!this.saved.has(div)) {
        const original = {};
        for (const key of ['clip-path', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']) {
          original[key] = [div.style.getPropertyValue(key), div.style.getPropertyPriority(key)];
        }
        this.saved.set(div, original);
      }
      const b = enabled ? this.displayed(i, page) : FULL;
      const { width: w, height: h } = page.viewport;
      const trims = [b[1] * h, (1 - b[2]) * w, (1 - b[3]) * h, b[0] * w];
      const values = { 'clip-path': `inset(${trims.map(n => `${n}px`).join(' ')})` };
      ['top', 'right', 'bottom', 'left'].forEach((side, n) => { values[`margin-${side}`] = `${-trims[n]}px`; });
      for (const [key, value] of Object.entries(values)) {
        const original = this.saved.get(div)[key];
        if (enabled) div.style.setProperty(key, value, 'important');
        else if (original[0]) div.style.setProperty(key, ...original);
        else div.style.removeProperty(key);
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
      corner.style.width = `${Math.max(1, Math.min(40, (b[2] - b[0]) * w - 8))}px`;
      corner.style.height = `${Math.max(1, Math.min(40, (b[3] - b[1]) * h - 8))}px`;
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
    if (!p?.viewport || !this.bounds.has(index)) return;
    const b = this.displayed(index, p), c = this.viewer.container;
    const w = p.viewport.width / this.viewer.currentScale;
    const h = p.viewport.height / this.viewer.currentScale;
    const sx = Math.max(1, c.clientWidth - 24) / ((b[2] - b[0]) * w);
    const sy = Math.max(1, c.clientHeight - 24) / ((b[3] - b[1]) * h);
    const mode = this.state.options.fit;
    const scale = Math.max(.1, Math.min(10, mode === 'width' ? sx : mode === 'height' ? sy : Math.min(sx, sy)));
    if (Math.abs(scale - this.viewer.currentScale) > .002) this.viewer.currentScaleValue = scale;
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
    this.closed = true; this.generation++;
    this.win.clearTimeout(this.timer);
    this.analysis.destroy(); this.resize.disconnect();
    this.viewer.container.removeEventListener('scroll', this.scroll);
    this.win.removeEventListener('unload', this.unload);
    for (const [name, fn] of this.busHandlers) this.app.eventBus.off(name, fn);
    for (const [div, original] of this.saved) {
      for (const [key, [value, priority]] of Object.entries(original)) {
        if (value) div.style.setProperty(key, value, priority); else div.style.removeProperty(key);
      }
      div.querySelector('.motero-page-corner')?.remove();
    }
    for (const [page, { original, hook, own }] of this.noteHooks) {
      if (waive(page._pushNote) !== waive(hook)) continue; // Another extension now owns it.
      if (own) page._pushNote = original; else delete page._pushNote;
      if (!this.view._destroyed) page.render();
    }
    this.noteHooks.clear();
    this.saved.clear(); this.restoreScale(); this.style.remove();
  }
}
