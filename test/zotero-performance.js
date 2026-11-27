/* Runs only on synthetic PDFs created by scripts/test-zotero.py. */
async function run() {
  let plugin;
  const clock = () => Zotero.getMainWindow().performance.now();
  const delay = ms => Zotero.Promise.delay(ms);
  const wait = async (fn, label) => {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (fn()) return;
      await delay(25);
    }
    throw Error('Timeout: ' + label);
  };
  let report;
  try {
    await Zotero.initializationPromise;
    await Zotero.uiReadyPromise;
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await AddonManager.getAddonByID('motero-compliments@optikergerhardt');
    const rootURI = addon.getResourceURI().spec;
    await addon.disable();
    const item = await Zotero.Attachments.importFromFile({ file: TEST_ROOT + '/fixture.pdf' });
    const reader = await Zotero.Reader.open(item.id);
    await reader._initPromise;
    const scope = { Zotero, Services, Components, IOUtils, ChromeUtils };
    Services.scriptloader.loadSubScriptWithOptions(rootURI + 'motero.js',
      { target: scope, allowUnsafeURL: true, ignoreCache: true });
    plugin = scope.Motero;
    let state, counts, rasterIndexes;
    const discover = plugin.ReaderState.prototype.discover;
    plugin.ReaderState.prototype.discover = function(...args) {
      const result = discover.apply(this, args);
      state = this;
      for (const entry of this.views.values()) {
        if (entry.measuring) continue;
        entry.measuring = true;
        const apply = entry.applyPages;
        entry.applyPages = function(...args) {
          const native = this.viewer;
          const metrics = counts;
          const start = clock();
          if (metrics) metrics.layoutCalls++;
          this.viewer = new Proxy(native, {
            get(target, key) {
              if (key === 'getPageView') return index => {
                if (metrics) metrics.pageLookups++;
                return target.getPageView(index);
              };
              const value = target[key];
              return typeof value === 'function' ? value.bind(target) : value;
            }
          });
          try { return apply.apply(this, args); }
          finally {
            this.viewer = native;
            if (metrics) metrics.layoutMs += clock() - start;
          }
        };
        const render = entry.analysis.render;
        entry.analysis.render = function(index, ...args) {
          rasterIndexes?.push(index);
          return render.call(this, index, ...args);
        };
      }
      return result;
    };
    await plugin.startup({ id: 'motero-compliments@optikergerhardt', rootURI });
    await wait(() => state?.views.size, 'reader view');
    const entry = state.views.values().next().value;
    const viewer = entry.viewer;
    const pageCount = viewer.pagesCount;
    await delay(350);
    const target = Math.floor(pageCount / 2);
    reader.navigate({ pageIndex: target });
    await wait(() => viewer.currentPageNumber === target + 1 && viewer.getPageView(target)?.pdfPage, 'middle page');
    await delay(350);
    const mutations = new viewer.viewer.ownerDocument.defaultView.MutationObserver(
      Components.utils.exportFunction(records => {
        if (counts) counts.cropAttributeMutations += records.length;
      }, entry.win, { allowCrossOriginArguments: true })
    );
    mutations.observe(viewer.viewer, Components.utils.cloneInto({
      subtree: true, attributes: true, attributeFilter: ['data-motero-crop']
    }, entry.win));
    counts = { layoutCalls: 0, pageLookups: 0, layoutMs: 0, cropAttributeMutations: 0 };
    for (let i = 0; i < 18; i++) {
      viewer.container.scrollTop += 180;
      await delay(95);
    }
    await delay(180);
    const original = { ...counts, layoutMs: Math.round(counts.layoutMs) };
    counts = null;
    mutations.disconnect();

    const targetPage = viewer.currentPageNumber - 1;
    rasterIndexes = [];
    const start = clock();
    state.change({ ...state.options, mode: 'automatic', fit: 'page' });
    await wait(() => {
      const div = viewer.getPageView(targetPage)?.div;
      const crop = div?.getAttribute('data-motero-crop')?.split(' ').map(Number);
      return crop?.some(value => value > 0);
    }, 'visible automatic crop');
    const automatic = { page: targetPage + 1, firstCropMs: Math.round(clock() - start),
      extractionsBeforeFirstCrop: rasterIndexes.length, firstExtractionWasVisible: rasterIndexes[0] === targetPage };
    rasterIndexes = null;
    state.change({ ...state.options, mode: 'off' });
    await wait(() => !viewer.getPageView(targetPage)?.div?.style.clipPath, 'restore Original');
    const error = reader._iframeWindow.document.querySelector('[role=alert]')?.textContent;
    if (error) throw Error(error);
    report = { ok: true, zotero: Zotero.version, pages: pageCount, original, automatic };
  }
  catch (error) { report = { ok: false, error: String(error), stack: error.stack }; }
  finally { plugin?.shutdown(); }
  await IOUtils.writeUTF8(TEST_ROOT + '/result.json', JSON.stringify(report, null, 2));
}
