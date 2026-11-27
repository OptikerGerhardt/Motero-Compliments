import { constrainReadingFrame } from './crop-policy.mjs';
import { buildReadingModel, buildReadingProfiles, getReadingFit, getReadingSamples,
  getReadingMarginalia, localReadingPages, resolveReadingBounds, rotateReadingBounds }
  from './vendor/motero/reading-layout.mjs';
import { CropCache } from './crop-cache.mjs';
import { Geometry } from './geometry.mjs';
import { WorkQueue, preparationPages } from './work-queue.mjs';
import { cropForPage, paddedBounds, isReaderBookmark } from './core.mjs';
import { waive, contentData, signal, drawingHook } from './bridge.mjs';
import { PDF_CSS } from './styles.mjs';
import { flagIcon } from './ui.mjs';
const FULL = [0, 0, 1, 1];

function visiblePageIndexes(viewer) {
  try {
    if (typeof viewer._getVisiblePages !== 'function') return [];
    const views = viewer._getVisiblePages()?.views;
    if (!Array.isArray(views)) return [];
    return views.filter(entry => Number.isInteger(entry?.id)).map(entry => entry.id - 1);
  }
  catch { return []; }
}

export class Analysis {
  constructor(win, rootURI, attachment) {
    this.win = waive(win);
    this.pdf = waive(this.win.PDFViewerApplication.pdfDocument);
    this.attachment = attachment;
    this.rootURI = rootURI;
    this.raw = new Map();
    this.work = new WorkQueue(2);
  }
  content() {
    if (!this.api) {
      Services.scriptloader.loadSubScriptWithOptions(this.rootURI + 'analysis.js', {
        target: this.win, ignoreCache: true, allowUnsafeURL: true
      });
      this.api = waive(this.win.MoteroPageAnalysis);
    }
    return this.api;
  }
  start() {
    if (this.renderer) return this.renderer;
    this.renderer = waive(this.content().create());
    return this.renderer;
  }
  async extract(renderer, index, textOnly = false) {
    const result = await renderer.extract(contentData(this.win, { index, optimized: true, textOnly }));
    if (renderer !== this.renderer) throw Error('Analysis stopped');
    return Components.utils.cloneInto(waive(result), globalThis);
  }
  async read(index, background = false) {
    const renderer = this.start();
    if (this.geometry?.crashed) {
      this.raw.clear();
      this.geometry.destroy();
      this.geometry = null;
    }
    if (this.raw.has(index)) {
      const value = this.raw.get(index);
      this.raw.delete(index);
      this.raw.set(index, value);
      return value;
    }
    return this.work.run(index, async () => {
      if (renderer !== this.renderer) throw Error('Analysis stopped');
      const value = await this.render(index, renderer);
      if (renderer !== this.renderer) throw Error('Analysis stopped');
      this.raw.set(index, value);
      if (this.raw.size > 64) {
        const oldest = this.raw.keys().next().value;
        this.raw.delete(oldest);
        this.geometry.forget(oldest);
      }
      return value;
    }, background);
  }
  async render(index, renderer = this.renderer) {
    const { pixels, ...page } = await this.extract(renderer, index);
    this.geometry ??= new Geometry();
    if (pixels) await this.geometry.store(index, pixels);
    else await this.geometry.ready;
    if (renderer !== this.renderer) {
      this.geometry?.forget(index);
      throw Error('Analysis stopped');
    }
    return page;
  }
  policyKey(options) {
    return `${options.includeMarginalia}:${options.includeReferences}`;
  }
  async buildProfile(options, keepGoing) {
    const renderer = this.start();
    const stillCurrent = () => renderer === this.renderer && keepGoing();
    const samples = [];
    for (const index of getReadingSamples(this.pdf.numPages)) {
      if (!stillCurrent()) return null;
      samples.push(await this.read(index, true));
    }
    const model = buildReadingModel(samples);
    const frames = [];
    for (const page of samples) {
      if (!stillCurrent()) return null;
      frames.push({ index: page.index, bounds: await this.geometry.bounds(page.index, page.lines, model, options) });
    }
    if (!stillCurrent()) return null;
    return { key: this.policyKey(options), model, profiles: buildReadingProfiles(frames) };
  }
  async bounds(index, options, background = false) {
    const renderer = this.start();
    const key = this.policyKey(options);
    const profile = this.profile?.key === key ? this.profile : null;
    const cacheKey = `${index}:${key}`;
    this.cache ??= new CropCache(this.attachment, this.pdf);
    await this.cache.ready;
    if (renderer !== this.renderer) throw Error('Analysis stopped');
    const cached = this.cache.frames.get(cacheKey);
    if (cached) return cached;
    const page = await this.read(index, background);
    if (!profile) return await this.geometry.bounds(index, page.lines, buildReadingModel([page]), options) || FULL;

    // Global profiles refine provisional bounds after the current page is visible.
    // Only text is needed from nearby pages to classify running heads.
    if (!page.nearby) {
      const nearby = [page];
      for (let i = Math.max(0, index - 2); i <= Math.min(this.pdf.numPages - 1, index + 2); i++) {
        if (i !== index) nearby.push(this.raw.get(i) || await this.extract(renderer, i, true));
      }
      page.nearby = localReadingPages(nearby.sort((a, b) => a.index - b.index), index)
        .map(({ index, lines }) => ({ index, lines }));
    }
    if (renderer !== this.renderer) throw Error('Analysis stopped');
    const model = page.nearby.length >= 3 ? buildReadingModel(page.nearby) : profile.model;
    for (const text of profile.model.repeated) model.repeated.add(text);
    const bounds = await this.geometry.bounds(index, page.lines, model, options);
    if (renderer !== this.renderer) throw Error('Analysis stopped');
    const resolved = resolveReadingBounds(bounds, index, profile.profiles);
    const stable = constrainReadingFrame(bounds, resolved, getReadingMarginalia(page.lines, model, index), options.includeReferences);
    this.cache.remember(cacheKey, stable);
    return stable;
  }
  stop() {
    this.renderer?.destroy();
    this.renderer = null;
    this.work = new WorkQueue(2);
  }
  destroy() {
    this.stop();
    this.geometry?.destroy();
    this.cache?.flush();
    this.raw.clear();
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
    this.analysis = new Analysis(this.win, state.rootURI, state.reader._item);
    this.bounds = new Map();
    this.busHandlers = [];
    this.saved = new Map();
    this.corners = new Map();
    this.dirty = new Set();
    this.noteHooks = new Map();
    this.generation = 0;
    this.autoFit = true; this.warmQueue = []; this.warmWorkers = 0; this.preparationErrors = new Map();
    this.style = this.win.document.createElement('style');
    this.style.textContent = PDF_CSS;
    this.win.document.head.append(this.style);
    for (const name of ['pagerendered', 'rotationchanging', 'scrollmodechanged', 'spreadmodechanged']) {
      this.on(name, () => {
        this.notePagesDirty = true;
        if (name === 'rotationchanging') this.rescale = true;
        this.schedule();
      });
    }
    this.on('scalechanging', () => {
      if (!this.settingScale && this.state.options.mode !== 'off') this.autoFit = false;
      this.rescale = true;
      this.schedule();
    });
    this.on('pagechanging', () => { this.notePagesDirty = true; this.schedule(true); state.updateButtons(); });
    this.scroll = () => {
      this.lastScroll = this.win.performance.now();
      if (this.state.options.mode !== 'off') this.schedule();
    };
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
      const generation = this.generation;
      this.refresh(wanted).catch(error => {
        if (!this.closed && generation === this.generation) { this.failed = true; this.state.error(error); }
      });
    }, 60);
  }
  invalidate(previous) {
    const options = this.state.options;
    this.failed = false;
    this.autoFit = true;
    if (previous?.mode === 'off' && options.mode !== 'off') this.previousScale = this.viewer.currentScaleValue;
    this.generation++;
    this.win.clearTimeout(this.warmTimer);
    this.warmQueue = [];
    this.preparationErrors.clear();
    if (!previous || previous.mode !== options.mode || previous.margin !== options.margin
        || previous.includeMarginalia !== options.includeMarginalia || previous.includeReferences !== options.includeReferences
        || (options.mode === 'manual' && JSON.stringify(previous.crops) !== JSON.stringify(options.crops))) {
      this.bounds.clear();
      this.dirty.clear();
      this.resetFrames = true;
    }
    if (options.mode !== 'automatic') this.analysis.stop();
    if (this.analysis.profile?.key !== this.analysis.policyKey(options)) {
      this.analysis.profile = null;
      this.profileFailed = false;
    }
    if (options.mode === 'off' && this.layout) {
      const anchor = this.captureAnchor();
      this.clearCrops();
      this.restoreScale();
      this.restoreAnchor(anchor);
    }
    this.schedule(true);
  }
  captureAnchor() {
    const page = this.viewer.getPageView(this.viewer.currentPageNumber - 1);
    const div = page?.div;
    return div?.isConnected ? { div, top: div.getBoundingClientRect().top } : null;
  }
  restoreAnchor(anchor) {
    if (!anchor?.div.isConnected) return;
    const delta = anchor.div.getBoundingClientRect().top - anchor.top;
    if (delta) this.viewer.container.scrollTop += delta;
  }
  clearCrops() {
    const host = this.viewer.viewer;
    host.removeAttribute('data-motero-cropping');
    this.layout?.destroy();
    this.layout = null;
    for (const [div, { original }] of this.saved) {
      for (const [key, [value, priority]] of original) {
        if (value) div.style.setProperty(key, value, priority);
        else div.style.removeProperty(key);
      }
      div.removeAttribute('data-motero-crop');
    }
    this.saved.clear();
    this.resetFrames = false;
    this.rescale = false;
  }
  async naturalBounds(index, background = false) {
    const options = this.state.options;
    if (options.mode === 'off') return FULL;
    if (options.mode === 'manual') {
      const page = waive(await this.app.pdfDocument.getPage(index + 1));
      // Manual crops are stored before user view rotation, like Motero.
      return rotateReadingBounds(cropForPage(options.crops, index) || FULL, page.rotate);
    }
    if (!background && this.preparationErrors.has(index)) throw this.preparationErrors.get(index);
    return paddedBounds(await this.analysis.bounds(index, options, background), options.margin);
  }
  prepareAhead(current) {
    if (this.closed || this.state.options.mode !== 'automatic') return;
    if (this.warmCenter === current && this.warmGeneration === this.generation) {
      if (!this.warmWorkers && (this.warmQueue.length || this.needsProfile())) this.scheduleWarm();
      return;
    }
    const direction = this.warmCenter !== undefined && current < this.warmCenter ? -1 : 1;
    this.warmCenter = current; this.warmGeneration = this.generation;
    this.warmQueue = preparationPages(current, this.viewer.pagesCount, direction)
      .filter(index => !this.bounds.has(index) && !this.preparationErrors.has(index));
    this.scheduleWarm();
  }
  scheduleWarm() {
    this.win.clearTimeout(this.warmTimer);
    this.warmTimer = this.win.setTimeout(() => {
      if (!this.warmWorkers && (this.warmQueue.length || this.needsProfile())) this.warm();
    }, 150);
  }
  needsProfile() {
    return this.state.options.mode === 'automatic' && !this.analysis.profile && !this.profileFailed;
  }
  idle() {
    return !this.closed && !this.busy && this.win.performance.now() - (this.lastScroll ?? -Infinity) >= 150;
  }
  async warm() {
    this.warmWorkers++;
    const generation = this.generation;
    const current = this.viewer.currentPageNumber;
    try {
      if (this.needsProfile() && this.idle()) {
        const options = this.state.options;
        const keepGoing = () => this.idle() && generation === this.generation && this.viewer.currentPageNumber === current;
        try {
          const profile = await this.analysis.buildProfile(options, keepGoing);
          if (profile && keepGoing()) {
            this.analysis.profile = profile;
            this.bounds.clear();
            this.dirty.clear();
            this.schedule();
          }
        }
        catch (error) {
          // Keep using the measured local frame when sampling another page fails.
          if (generation === this.generation && !this.closed) {
            this.profileFailed = true;
            Zotero.logError(error);
          }
        }
      }
      while (!this.closed && this.warmQueue.length) {
        if (!this.idle()) break;
        const index = this.warmQueue.shift(), generation = this.generation;
        if (this.bounds.has(index)) continue;
        try {
          const bounds = await this.naturalBounds(index, true);
          if (this.closed || generation !== this.generation) continue;
          this.bounds.set(index, bounds);
          this.dirty.add(index);
          this.viewer.viewer.setAttribute('data-motero-prepared-pages', String(this.bounds.size));
          this.viewer.viewer.setAttribute('data-motero-analysis-cache', String(this.analysis.raw.size));
          this.schedule();
        }
        catch (error) {
          if (!this.closed && generation === this.generation) this.preparationErrors.set(index, error);
        }
      }
    }
    finally {
      this.warmWorkers--;
      if (!this.closed && this.state.options.mode === 'automatic' && (this.warmQueue.length || this.needsProfile())) {
        this.scheduleWarm();
      }
    }
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
      const visible = visiblePageIndexes(this.viewer);
      const indexes = [...new Set([current, ...visible])].filter(i => i >= 0 && i < this.viewer.pagesCount);
      const mode = this.state.options.mode;
      if (mode !== 'off') {
        // Display the current page without waiting for a batch of neighbors.
        for (const index of mode === 'manual' ? indexes : indexes.slice(0, 1)) {
          if (this.bounds.has(index)) continue;
          const bounds = await this.naturalBounds(index);
          if (this.closed || generation !== this.generation) return;
          this.bounds.set(index, bounds);
          this.dirty.add(index);
        }
        if (this.viewer.currentPageNumber !== current + 1) {
          this.again = true;
          this.fitWanted ||= fit;
          return;
        }
        const changes = this.dirty.size || this.rescale || indexes.some(index => {
          const page = this.viewer.getPageView(index);
          return this.bounds.has(index) && this.saved.get(page.div)?.viewport !== page.viewport;
        });
        if (changes || this.resetFrames || fit && this.autoFit) {
          const anchor = this.captureAnchor();
          const reset = this.resetFrames;
          if (reset) this.clearCrops();
          if (fit) this.fit(current);
          const changed = this.applyPages(indexes);
          if (reset || changed) this.restoreAnchor(anchor);
        }
        this.prepareAhead(current);
      }
      this.updateBookmarks(indexes);
      if (mode === 'automatic') {
        this.viewer.viewer.setAttribute('data-motero-analysis-worker', String(!!this.analysis.geometry?.worker));
        this.viewer.viewer.setAttribute('data-motero-profile', this.analysis.profile ? 'ready' : 'local');
      }
      else {
        this.viewer.viewer.removeAttribute('data-motero-profile');
        this.viewer.viewer.removeAttribute('data-motero-analysis-worker');
      }
      this.viewer.viewer.setAttribute('data-motero-generation', String(this.generation));
    }
    finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(this.fitWanted); }
    }
  }
  applyPages(visible) {
    const host = this.viewer.viewer;
    if (!this.layout) this.layout = waive(this.analysis.content().installLayout());
    host.setAttribute('data-motero-cropping', '');
    const indexes = new Set([...this.dirty, ...visible]);
    if (this.rescale) {
      for (const { index } of this.saved.values()) indexes.add(index);
    }
    this.dirty.clear();
    this.rescale = false;
    let changed = false;
    for (const index of indexes) {
      if (!this.bounds.has(index)) continue;
      const page = waive(this.viewer.getPageView(index));
      if (!page?.div) continue;
      const { div, viewport } = page;
      const b = this.displayed(index, page);
      const { width: w, height: h } = viewport;
      const trims = [b[1] * h, (1 - b[2]) * w, (1 - b[3]) * h, b[0] * w];
      const signature = trims.join(' ');
      let saved = this.saved.get(div);
      if (saved?.signature === signature) {
        saved.viewport = viewport;
        continue;
      }
      if (!saved) {
        const keys = ['clip-path', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
        const original = keys.map(key => [key, [div.style.getPropertyValue(key), div.style.getPropertyPriority(key)]]);
        saved = { index, original };
        this.saved.set(div, saved);
      }
      Object.assign(saved, { signature, viewport, trims });
      div.setAttribute('data-motero-crop', signature);
      div.style.setProperty('clip-path', `inset(${trims.map(n => `${n}px`).join(' ')})`, 'important');
      ['top', 'right', 'bottom', 'left'].forEach((side, i) => {
        div.style.setProperty(`margin-${side}`, `${-trims[i]}px`, 'important');
      });
      changed = true;
    }
    return changed;
  }
  updateBookmarks(visible) {
    const bookmarks = new Map();
    for (const mark of this.state.annotations()) {
      if (!isReaderBookmark(mark)) continue;
      const index = mark.position.pageIndex;
      if (bookmarks.has(index)) bookmarks.get(index).push(mark);
      else bookmarks.set(index, [mark]);
    }
    this.hideNativeBookmarkNotes(bookmarks);
    const indexes = new Set(visible);
    for (const [div, corner] of this.corners) {
      if (div.isConnected && corner.isConnected && indexes.has(Number(corner.dataset.pageIndex))) continue;
      corner.remove();
      this.corners.delete(div);
    }
    for (const index of indexes) {
      const page = waive(this.viewer.getPageView(index));
      if (!page?.div?.isConnected || !page.pdfPage) continue;
      const { div, viewport } = page;
      let corner = this.corners.get(div);
      if (!corner) {
        corner = this.win.document.createElement('div');
        corner.className = 'motero-page-corner';
        corner.dataset.pageIndex = String(index);
        const marker = flagIcon(this.win.document);
        marker.classList.add('motero-bookmark-marker');
        const toggle = this.state.flagButton(this.win.document, index);
        toggle.className = 'motero-page-toggle';
        corner.append(marker, toggle);
        div.append(corner);
        this.corners.set(div, corner);
      }
      const [top, right, bottom, left] = this.saved.get(div)?.trims || [0, 0, 0, 0];
      const width = Math.max(1, Math.min(50, viewport.width - left - right - 8));
      const height = Math.max(1, Math.min(62, viewport.height - top - bottom - 8));
      const marks = bookmarks.get(index) || [];
      const color = marks[0]?.color || '#000000';
      const disabled = !this.state.canEdit() || marks.some(a => a.readOnly);
      const key = [top, right, width, height, !!marks.length, color, disabled].join(' ');
      if (corner.dataset.state === key) continue;
      corner.dataset.state = key;
      Object.assign(corner.style, { top: `${top + 4}px`, right: `${right + 4}px`, width: `${width}px`, height: `${height}px` });
      const [marker, button] = corner.children;
      marker.style.display = marks.length ? '' : 'none';
      marker.style.color = color;
      button.setAttribute('aria-pressed', String(!!marks.length));
      button.disabled = disabled;
    }
  }
  hideNativeBookmarkNotes(bookmarks) {
    if (!bookmarks.size && !this.noteHooks.size) return;
    const native = this.view._pages;
    const signature = [...bookmarks.keys()].sort((a, b) => a - b).join(',');
    if (!this.notePagesDirty && native === this.notePages && native?.length === this.notePagesLength
        && signature === this.noteSignature) return;
    this.notePagesDirty = false;
    this.notePages = native;
    this.notePagesLength = native?.length;
    this.noteSignature = signature;
    const current = new Set(Array.from(native || [], waive));
    for (const [page, { original, hook, own }] of this.noteHooks) {
      if (current.has(page) && bookmarks.has(page.pageIndex)) continue;
      if (waive(page._pushNote) === waive(hook)) {
        if (own) page._pushNote = original; else delete page._pushNote;
      }
      this.noteHooks.delete(page);
      if (current.has(page)) page.render();
    }
    for (const page of current) {
      if (!bookmarks.has(page.pageIndex) || this.noteHooks.has(page) || typeof page._pushNote !== 'function') continue;
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
    const { scale } = getReadingFit({
      mode: this.state.options.fit, reference: 'cropped-content', bounds: b,
      width: c.clientWidth - 24, height: c.clientHeight - 24, pageWidth: w, pageHeight: h
    });
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
    this.clearCrops();
    this.viewer.container.removeEventListener('scroll', this.scroll);
    this.win.removeEventListener('unload', this.unload);
    for (const [name, fn] of this.busHandlers) this.app.eventBus.off(name, fn);
    for (const corner of this.corners.values()) corner.remove();
    this.corners.clear();
    for (const [page, { original, hook, own }] of this.noteHooks) {
      if (waive(page._pushNote) !== waive(hook)) continue; // Another extension now owns it.
      if (own) page._pushNote = original; else delete page._pushNote;
      if (!this.view._destroyed) page.render();
    }
    this.noteHooks.clear();
    this.viewer.viewer.removeAttribute('data-motero-prepared-pages');
    this.viewer.viewer.removeAttribute('data-motero-analysis-cache');
    this.viewer.viewer.removeAttribute('data-motero-analysis-worker');
    this.viewer.viewer.removeAttribute('data-motero-profile');
    this.viewer.viewer.removeAttribute('data-motero-cropping');
    this.viewer.viewer.removeAttribute('data-motero-generation');
    this.saved.clear(); this.restoreScale(); this.style.remove();
  }
}
