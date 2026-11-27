/* Loaded only in a disposable profile by scripts/test-zotero.py. */
async function run() {
  const checks = [];
  const ok = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
  const wait = async (fn, message, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = await fn(); if (result) return result;
      await Zotero.Promise.delay(100);
    }
    throw Error('Timed out: ' + message);
  };
  let report;
  try {
    await Zotero.initializationPromise; await Zotero.uiReadyPromise;
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    let addon = await AddonManager.getAddonByID('motero-compliments@optikergerhardt');
    ok(addon?.isActive, 'Packaged XPI is installed and active');
    if (TEST_CHECK_UPDATES) {
      const available = await new Promise((resolve, reject) => {
        let update;
        addon.findUpdates({
          onUpdateAvailable(_addon, install) { update = install; },
          onUpdateFinished(_addon, error) {
            if (error || !update) reject(Error('Published update check failed: ' + error));
            else resolve(update);
          }
        }, AddonManager.UPDATE_WHEN_USER_REQUESTED);
      });
      ok(available.version === TEST_EXPECTED_VERSION, 'Zotero discovers the new version from the public update feed');
      await new Promise((resolve, reject) => {
        available.addListener({
          onInstallEnded() { resolve(); },
          onInstallFailed(install) { reject(Error('Update install failed: ' + install.error)); },
          onDownloadFailed(install) { reject(Error('Update download/hash verification failed: ' + install.error)); }
        });
        Promise.resolve(available.install()).catch(reject);
      });
      addon = await AddonManager.getAddonByID('motero-compliments@optikergerhardt');
      ok(addon.version === TEST_EXPECTED_VERSION && addon.isActive, 'Zotero downloads, verifies and activates the published update');
    }
    const attachment = await Zotero.Attachments.importFromFile({ file: TEST_ROOT + '/fixture.pdf' });
    const file = await attachment.getFilePathAsync(), before = await IOUtils.read(file);
    const reader = await Zotero.Reader.open(attachment.id); await reader._initPromise;
    const internal = reader._internalReader, doc = reader._iframeWindow.document;
    internal.toggleSidebar(true);
    const tab = await wait(() => doc.getElementById('viewMoteroBookmarks'), 'native bookmark tab');
    const view = await wait(() => internal._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument
      && internal._primaryView, 'PDF viewer');
    const win = view._iframeWindow, viewer = win.PDFViewerApplication.pdfViewer;
    const domEvent = (type, options = {}) => new reader._iframeWindow.Event(type,
      Components.utils.cloneInto({ bubbles: true, ...options }, reader._iframeWindow));
    const clickText = (container, text) => {
      if (text === 'Original view') { container.querySelector('[data-motero-choice=mode] [data-value=off]').click(); return; }
      const button = [...container.querySelectorAll('button')].find(n => n.textContent === text);
      if (!button) throw Error('Missing button ' + text); button.click();
    };
    const openAppearance = async () => {
      if (!doc.querySelector('.appearance-popup')) doc.getElementById('appearance').click();
      return wait(() => doc.querySelector('[data-motero-crop-settings]'), 'native appearance crop group');
    };
    const closeAppearance = () => { if (doc.querySelector('.appearance-popup')) doc.getElementById('appearance').click(); };
    const select = (container, name, value) => {
      container.querySelector(`[data-motero-choice="${name}"] button[data-value="${value}"]`).click();
    };
    const bookmarks = () => internal._state.annotations.filter(a => /^(Bookmark|Lesezeichen)\s*·/.test(a.comment));
    const corner = index => viewer.getPageView(index).div.querySelector('.motero-page-corner');
    const toggle = index => corner(index)?.querySelector('button');
    await wait(() => viewer.getPageView(0)?.pdfPage && toggle(0), 'first page corner');
    ok(!doc.querySelector('[data-motero-toolbar]'), 'No standalone Motero toolbar or combined dialog');
    ok(tab.previousElementSibling.id === 'viewOutline', 'Bookmark tab is immediately after native Outline');
    ok(doc.defaultView.getComputedStyle(tab.querySelector('svg')).width === '20px', 'Sidebar flag matches the native 20px icon grid');
    ok(tab.querySelector('path').getAttribute('fill') === 'none', 'Sidebar uses the outlined Motero flag');

    // A system-owned argument passed BY content reproduces Firefox's reported
    // rejection. Plugin notifications intentionally discard all such arguments.
    const scope = { Zotero, Services, Components };
    Services.scriptloader.loadSubScriptWithOptions(addon.getResourceURI().spec + 'motero.js',
      { target: scope, allowUnsafeURL: true, ignoreCache: true });
    const caller = Components.utils.Sandbox('https://motero-compartment-test.invalid',
      { sandboxName: 'Motero permission regression' });
    const foreign = Components.utils.Sandbox('https://motero-foreign-test.invalid');
    caller.payload = Components.utils.evalInSandbox('({ source: "foreign" })', foreign);
    caller.notify = Components.utils.exportFunction(() => {}, caller);
    let rejection = '';
    try { Components.utils.evalInSandbox('notify(payload)', caller); }
    catch (error) { rejection = String(error); }
    ok(/Permission denied to pass object/.test(rejection), 'Reported compartment permission error is reproduced with the old callback: ' + (rejection || 'no rejection'));
    let called = 0;
    caller.notify = scope.Motero.readerSignal(caller, () => { called++; });
    Components.utils.evalInSandbox('notify(payload)', caller);
    ok(called === 1, 'Reader notifications accept compartment-owned arguments without reading or returning them');
    Components.utils.nukeSandbox(caller);
    Components.utils.nukeSandbox(foreign);

    const appearance = await openAppearance();
    ok(appearance.closest('.appearance-popup') !== null, 'Cropping is embedded under native Appearance (Aa)');
    ok(!appearance.querySelector('select') && appearance.querySelectorAll('.split-toggle').length === 4,
      'Crop, fit, marginal-note and reference choices use native segmented buttons');
    ok(!appearance.querySelector('[name=peek]'), 'There is no second conflicting Original view state');
    ok(!Zotero.Reader._registeredListeners.some(x => x.pluginID === 'motero-compliments@optikergerhardt' && x.type === 'createViewContextMenu'),
      'Plugin registers no crop or bookmark entries in the reader context menu');

    const nativeLabel = appearance.closest('.appearance-popup').querySelector('.group:not(.motero-crop-settings) .option>label');
    const font = node => doc.defaultView.getComputedStyle(node).font;
    ok(font(appearance.querySelector('label')) === font(nativeLabel), 'Crop settings use the exact native label font');
    ok(!appearance.querySelector('h3'), 'Crop settings use native rows instead of a separate bold heading');
    select(appearance, 'fit', 'page'); select(appearance, 'mode', 'automatic'); closeAppearance();
    await wait(() => viewer.getPageView(0).div.style.clipPath.includes('inset('), 'automatic whole-page crop');
    ok(!/^inset\(0px 0px 0px 0px\)$/.test(viewer.getPageView(0).div.style.clipPath), 'Automatic whole-page crop hides white margins');
    ok(!doc.querySelector('[role=alert]'), 'Whole-page fitting has no permission error');
    const modeButtons = (await openAppearance()).querySelectorAll('[data-motero-choice=mode] button');
    ok([...modeButtons].filter(b => b.getAttribute('aria-pressed') === 'true').length === 1
      && modeButtons[1].getAttribute('aria-pressed') === 'true', 'Automatic selection stays synchronized and excludes Original');
    closeAppearance();

    const cropWidth = () => {
      const page = viewer.getPageView(0), values = page.div.style.clipPath.match(/[\d.]+(?=px)/g)?.map(Number);
      return values ? 1 - (values[1] + values[3]) / page.viewport.width : 1;
    };
    const changeReferencePolicy = async value => {
      const generation = viewer.viewer.getAttribute('data-motero-generation');
      select(await openAppearance(), 'includeReferences', value); closeAppearance();
      await wait(() => viewer.viewer.getAttribute('data-motero-generation') !== generation, 'reference policy applied');
      let last, stable = Date.now();
      await wait(() => {
        const width = cropWidth();
        if (width !== last) { last = width; stable = Date.now(); }
        return Date.now() - stable > 350;
      }, 'reference crop and viewport settled');
      return cropWidth();
    };
    const excludedWidth = cropWidth();
    const includedWidth = await changeReferencePolicy(true);
    ok(includedWidth > excludedWidth + .05, 'Including a synthetic edition reference widens the visible native crop');
    ok(await changeReferencePolicy(false) < includedWidth - .05, 'Excluding the edition reference narrows the visible native crop again');

    ok(!!win.MoteroPageAnalysis, 'Automatic raster/text extraction executes in the PDF window');
    if (viewer.pagesCount > 20) {
      await wait(() => Number(viewer.viewer.getAttribute('data-motero-prepared-pages')) >= 13, 'desktop look-ahead preparation');
      ok(true, 'Desktop prepares twelve pages beyond the visible page');
      ok(Number(viewer.viewer.getAttribute('data-motero-analysis-cache')) <= 64, 'Analysis pixel cache stays bounded to 64 pages');
    }
    const textLayer = await wait(() => viewer.getPageView(0).div.querySelector('.textLayer'), 'text layer');
    ok(textLayer.textContent.includes('Synthetic reading'), 'Text layer stays readable after cropping');
    const widthSettings = await openAppearance(); select(widthSettings, 'fit', 'width'); closeAppearance();
    await wait(() => viewer.currentScale > 1, 'fit cropped width');
    ok(true, 'Cropped content can be fitted to width');
    reader.navigate({ pageIndex: 0 }); await wait(() => viewer.currentPageNumber === 1, 'first page navigation');
    await wait(() => toggle(0), 'page toggle');
    ok(Number(win.getComputedStyle(toggle(0)).opacity) === 0, 'Unbookmarked toggle is invisible without hover or focus');
    toggle(0).click(); await wait(() => bookmarks().length === 1, 'create bookmark');
    ok(bookmarks()[0].type === 'note' && bookmarks()[0].color === '#000000', 'Bookmark is a native Motero-compatible black note');
    const markID = bookmarks()[0].id, storedPosition = JSON.stringify(bookmarks()[0].position);
    await wait(() => attachment.getAnnotations().some(a => a.key === markID), 'persist native bookmark');
    ok(true, 'Bookmark is persisted in the Zotero database');
    await wait(() => toggle(0)?.getAttribute('aria-pressed') === 'true', 'page flag state');
    const marker = corner(0).querySelector('.motero-bookmark-marker');
    ok(marker.querySelector('path').getAttribute('d') === 'M5 2h14v20l-7-4.5-7 4.5z', 'Bookmark uses the original Motero flag geometry');
    ok(Number(win.getComputedStyle(marker).opacity) === .65, 'Saved bookmark uses the requested increased opacity');
    ok(win.getComputedStyle(marker).width === '42px' && win.getComputedStyle(marker).height === '54px', 'PDF bookmark glyph is exactly three times larger');
    ok(Number(win.getComputedStyle(toggle(0)).opacity) === 0, 'Saved bookmark does not expose the toggle outside hover or focus');
    const inspector = Zotero.getMainWindow().InspectorUtils;
    inspector.addPseudoClassLock(corner(0), ':hover');
    ok(Number(win.getComputedStyle(toggle(0)).opacity) > 0, 'Hovering the crop corner reveals the bookmark control');
    inspector.removePseudoClassLock(corner(0), ':hover');
    ok(Number(win.getComputedStyle(toggle(0)).opacity) === 0, 'Leaving the crop corner hides the bookmark control again');
    ok(parseFloat(corner(0).style.top) > 4 && parseFloat(corner(0).style.right) > 4, 'Flag is pinned inside the cropped upper-right corner');
    const originalNote = Components.utils.cloneInto({ type: 'note', color: '#000000',
      comment: 'Ordinary black note', tags: [{ name: 'Source style tag' }], pageLabel: '1', sortIndex: '00000|000000|00100',
      position: { pageIndex: 0, rects: [[120, 500, 142, 522]] } }, win);
    view._onAddAnnotation(originalNote, false);
    await wait(() => internal._state.annotations.some(a => a.comment === 'Ordinary black note'), 'ordinary note');
    await Zotero.Promise.delay(200);
    const renderedPage = Components.utils.waiveXrays(await wait(() => {
      for (const value of view._pages) {
        const page = Components.utils.waiveXrays(value);
        if (page.pageIndex === 0) return page;
      }
      return null;
    }, 'native page annotation renderer'));
    const display = Array.from(renderedPage._buildDisplayList(), value => Components.utils.waiveXrays(value));
    ok(display.filter(i => i.kind === 'noteIcon').length === 1, 'Native bookmark sticky-note icon is suppressed; ordinary black note is preserved');
    const stylesMenu = Zotero.Reader._registeredListeners.find(entry => entry.type === 'createAnnotationContextMenu'
      && entry.pluginID === 'motero-compliments@optikergerhardt');
    ok(!!stylesMenu, 'Annotation context menu exposes style operations');
    const sourceStyle = internal._state.annotations.find(a => a.comment === 'Ordinary black note');
    view._onAddAnnotation(Components.utils.cloneInto({
      type: 'note', color: '#ffd400', comment: 'Style target', tags: [{ name: 'Existing target tag' }], pageLabel: '1',
      sortIndex: '00000|000001|00100', position: { pageIndex: 0, rects: [[150, 505, 172, 527]] }
    }, win), false);
    const styleTarget = await wait(() => internal._state.annotations.find(a => a.comment === 'Style target'), 'style target');
    const oldTarget = JSON.stringify(styleTarget.position);
    internal.setSelectedAnnotations(Components.utils.cloneInto([sourceStyle.id], reader._iframeWindow));
    await wait(() => internal._state.selectedAnnotationIDs.includes(sourceStyle.id), 'source annotation selection');
    const copy = new win.KeyboardEvent('keydown', Components.utils.cloneInto({
      key: 'c', ctrlKey: true, bubbles: true, cancelable: true
    }, win));
    win.document.body.dispatchEvent(copy);
    const styleActions = [];
    stylesMenu.handler({ reader, doc, params: { ids: [styleTarget.id] }, append: item => styleActions.push(item) });
    const pasteStyle = styleActions.find(item => item.label === 'Paste annotation color and tags');
    ok(!!pasteStyle, 'Copying a selected annotation makes its style available for pasting');
    pasteStyle.onCommand();
    const pasted = await wait(() => {
      const current = internal._state.annotations.find(a => a.id === styleTarget.id);
      return current?.color === '#000000' && current;
    }, 'annotation color applied');
    ok(pasted.comment === 'Style target' && pasted.type === 'note' && JSON.stringify(pasted.position) === oldTarget,
      'Pasting style preserves the original annotation type, text and PDF coordinates');
    ok(pasted.tags.some(tag => tag.name === 'Source style tag') && pasted.tags.some(tag => tag.name === 'Existing target tag'),
      'Pasting annotation style adds source tags and keeps existing tags');
    const storedStyle = await wait(() => {
      const item = Zotero.Items.getByLibraryAndKey(attachment.libraryID, styleTarget.id);
      return item?.annotationColor === '#000000' && item.getTags().some(tag => tag.tag === 'Source style tag');
    }, 'annotation style persistence');
    ok(storedStyle, 'Copied style persists through Zotero’s annotation database');
    internal._annotationManager.deleteAnnotations(Components.utils.cloneInto([styleTarget.id], reader._iframeWindow));
    internal.toggleSidebar(true); tab.click();
    const panel = doc.getElementById('moteroBookmarksView');
    ok(tab.getAttribute('aria-selected') === 'true' && doc.body.classList.contains('motero-bookmarks-open'), 'Bookmark list opens as a native sidebar tab');
    ok(panel.querySelectorAll('[data-motero-bookmark-id]').length === 1, 'Bookmark sidebar lists only semantic bookmarks');
    const search = doc.querySelector('.sidebar-toolbar .motero-search');
    ok(search && !search.classList.contains('expanded') && !panel.querySelector('input'), 'Bookmark filtering starts as a native magnifier on the right');
    search.querySelector('button').click();
    ok(search.classList.contains('expanded'), 'Bookmark magnifier expands the native-style search field');
    const filter = search.querySelector('input'); filter.value = 'no match'; filter.dispatchEvent(domEvent('input'));
    ok(panel.textContent.includes('No bookmarks.'), 'Sidebar filter works');
    filter.value = ''; filter.dispatchEvent(domEvent('input'));
    doc.getElementById('viewOutline').click();
    ok(!doc.body.classList.contains('motero-bookmarks-open'), 'Native Outline restores immediately after bookmark tab');
    tab.click(); doc.getElementById('viewOutline').click();
    ok(!doc.body.classList.contains('motero-bookmarks-open'), 'Repeated bookmark-to-Outline switching works even when Outline was already selected');
    doc.getElementById('viewAnnotations').click();
    await wait(() => internal._state.sidebarView === 'annotations'
      && doc.getElementById('viewAnnotations').getAttribute('aria-selected') === 'true', 'native annotations tab selection');
    ok(internal._state.sidebarView === 'annotations' && doc.getElementById('viewAnnotations').getAttribute('aria-selected') === 'true', 'Native annotation sidebar remains usable');
    reader.navigate({ pageIndex: 5 }); await wait(() => viewer.currentPageNumber === 6, 'intrinsic rotation page');
    await wait(() => toggle(5), 'rotated page corner');
    ok(true, 'Intrinsic PDF rotation is supported');
    tab.click(); panel.querySelector('.motero-go').click();
    await wait(() => viewer.currentPageNumber === 1, 'sidebar bookmark jump');
    ok(true, 'Bookmark sidebar jumps to the stored page');
    // Native Reset Zoom must retain ownership across resize/page activity.
    doc.getElementById('zoomAuto').click();
    await wait(() => viewer.currentScaleValue === 'page-width', 'native Reset Zoom');
    const resetValue = viewer.currentScaleValue;
    await Zotero.Promise.delay(400);
    internal.toggleSidebar(false); await Zotero.Promise.delay(200); internal.toggleSidebar(true);
    await Zotero.Promise.delay(400);
    ok(viewer.currentScaleValue === resetValue, 'Native Reset Zoom survives sidebar resize without plugin refitting');
    internal.zoomIn(); await Zotero.Promise.delay(200);
    const userScale = viewer.currentScale;
    reader.navigate({ pageIndex: 1 }); await wait(() => viewer.currentPageNumber === 2, 'page after manual zoom');
    await Zotero.Promise.delay(400);
    ok(Math.abs(viewer.currentScale - userScale) < .001, 'Native manual zoom survives page changes');
    if (viewer.pagesCount > 40) {
      for (const index of [8, 24, 40, 16]) {
        reader.navigate({ pageIndex: index }); await Zotero.Promise.delay(40);
      }
      await wait(() => viewer.currentPageNumber === 17 && toggle(16), 'foreground page during rapid navigation');
      await Zotero.Promise.delay(600);
      ok(viewer.currentPageNumber === 17, 'Rapid desktop navigation settles on the requested page while preprocessing continues');
      ok(Math.abs(viewer.currentScale - userScale) < .001, 'Desktop preprocessing does not override user zoom');
    }
    reader.navigate({ pageIndex: 0 }); await wait(() => viewer.currentPageNumber === 1, 'return for manual crop');

    const manualSettings = await openAppearance(); clickText(manualSettings, 'Edit frame…');
    const editor = await wait(() => doc.querySelector('dialog canvas')?.closest('dialog'), 'manual editor');
    const ready = () => [...editor.querySelectorAll('button')].find(b => b.textContent === 'Apply' && !b.disabled);
    await wait(ready, 'manual preview');
    const parity = editor.querySelector('select'); parity.value = 'odd'; parity.dispatchEvent(domEvent('change'));
    await wait(ready, 'odd preview');
    const inputs = editor.querySelectorAll('input[type=number]');
    for (const [i, value] of [12, 16, 88, 84].entries()) { inputs[i].value = value; inputs[i].dispatchEvent(domEvent('change')); }
    const frame = editor.querySelector('[data-handle=move]'), leftBefore = parseFloat(frame.style.left);
    frame.dispatchEvent(new reader._iframeWindow.KeyboardEvent('keydown', Components.utils.cloneInto(
      { key: 'ArrowRight', shiftKey: true, bubbles: true }, reader._iframeWindow)));
    ok(parseFloat(frame.style.left) > leftBefore, 'Manual crop supports precise fields and keyboard movement');
    clickText(editor, 'Apply');
    const pref = `extensions.moteroCompliments.crop.${attachment.libraryID}.${attachment.key}`;
    const saved = JSON.parse(Zotero.Prefs.get(pref, true));
    ok(saved.mode === 'manual' && Math.abs(saved.crops.odd[0] - .13) < .00001 && !saved.crops.even, 'Manual odd-page crop persists exactly per attachment');
    await wait(() => parseFloat(corner(0).style.right) > 10, 'manual corner positioning');
    const savedManual = Zotero.Prefs.get(pref, true);
    doc.getElementById('zoomAuto').click();
    await wait(() => viewer.currentScaleValue === 'page-width', 'Reset Zoom with manual crop');
    await Zotero.Promise.delay(350);
    ok(viewer.currentScaleValue === 'page-width' && Zotero.Prefs.get(pref, true) === savedManual,
      'Reset Zoom preserves manual crop frames and retains the native zoom value');
    ok(JSON.stringify(bookmarks()[0].position) === storedPosition, 'Changing crop never rewrites bookmark annotation coordinates');
    viewer.pagesRotation = 90; await Zotero.Promise.delay(300);
    ok(viewer.getPageView(0).div.style.clipPath.includes('inset('), 'Crop and flag survive user view rotation');
    viewer.pagesRotation = 0;
    const cancelSettings = await openAppearance(); clickText(cancelSettings, 'Edit frame…');
    const cancelEditor = await wait(() => doc.querySelector('dialog canvas')?.closest('dialog'), 'cancel preview');
    await wait(() => [...cancelEditor.querySelectorAll('button')].find(b => b.textContent === 'Apply' && !b.disabled), 'cancel editor ready');
    const snapshot = Zotero.Prefs.get(pref, true); clickText(cancelEditor, 'Cancel');
    ok(Zotero.Prefs.get(pref, true) === snapshot, 'Cancelling manual editing leaves stored crops intact');
    const originalSettings = await openAppearance(); clickText(originalSettings, 'Original view'); closeAppearance();
    await wait(() => !viewer.getPageView(0).div.style.clipPath, 'original view');
    ok(JSON.parse(Zotero.Prefs.get(pref, true)).mode === 'off' && JSON.parse(Zotero.Prefs.get(pref, true)).crops.odd.length === 4, 'Original mode shows full pages without deleting stored frames');
    tab.click(); clickText(panel, 'Delete'); await wait(() => !bookmarks().length, 'sidebar delete');
    ok(internal._state.annotations.some(a => a.comment === 'Ordinary black note'), 'Sidebar delete preserves ordinary notes');
    toggle(0).click(); toggle(0).click(); toggle(0).click();
    await wait(() => bookmarks().length === 1, 'rapid toggles'); await Zotero.Promise.delay(300);
    ok(bookmarks().length === 1, 'Rapid bookmark clicks serialize');
    // Optional native screenshot of the synthetic fixture, never personal PDFs.
    const screenshotSettings = await openAppearance();
    select(screenshotSettings, 'mode', 'manual'); closeAppearance();
    await Zotero.Promise.delay(300);
    doc.getElementById('viewMoteroBookmarks').click();
    await openAppearance();
    const screenshotPopup = doc.querySelector('.appearance-popup');
    screenshotPopup.scrollTop = screenshotPopup.scrollHeight - screenshotPopup.clientHeight;
    try {
      const chromeWindow = Zotero.getMainWindow();
      const context = reader._iframe.browsingContext;
      const bitmap = await context.currentWindowGlobal.drawSnapshot(null, 1, 'rgb(255,255,255)');
      const canvas = chromeWindow.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
      const bytes = Uint8Array.from(chromeWindow.atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
      await IOUtils.write(TEST_ROOT + '/native-reader.png', bytes);
    }
    catch (error) { checks.push('Screenshot unavailable: ' + String(error)); }
    closeAppearance();
    await addon.disable();
    await wait(() => !doc.getElementById('viewMoteroBookmarks'), 'shutdown');
    ok(!viewer.getPageView(0).div.style.clipPath && !corner(0), 'Disable removes crop styles and page markers');
    ok(!doc.querySelector('[data-motero-crop-settings]') && !doc.body.classList.contains('motero-bookmarks-open'), 'Disable restores native sidebar and Appearance');
    ok(!Object.hasOwn(renderedPage, '_pushNote'), 'Disable restores native note drawing');
    await addon.enable(); await wait(() => doc.getElementById('viewMoteroBookmarks'), 're-enable');
    await wait(() => viewer.getPageView(0).div.style.clipPath.includes('inset('), 'restore saved crop');
    ok(doc.querySelectorAll('#viewMoteroBookmarks').length === 1, 'Re-enable adopts open readers without duplicate tabs');
    ok(JSON.parse(Zotero.Prefs.get(pref, true)).crops.odd.length === 4, 'Saved manual crops survive plugin restart');
    const after = await IOUtils.read(file);
    ok(before.length === after.length && before.every((v, i) => v === after[i]), 'PDF bytes are unchanged');
    ok(!doc.querySelector('[role=alert]'), 'No permission error occurs during the complete reader workflow');
    report = { ok: true, version: addon.version, zotero: Zotero.version, checks };
  }
  catch (error) {
    report = { ok: false, zotero: Zotero.version, checks, error: String(error), stack: error.stack,
      console: Services.console.getMessageArray().map(m => m.message).slice(-12),
      readerInfo: Zotero.Reader._readers.map(r => ({ type: r._type,
        outline: !!r._iframeWindow?.document?.getElementById('viewOutline'),
        moteroStyles: r._iframeWindow?.document?.querySelectorAll('[data-motero-style]').length,
        page: r._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfViewer?.currentPageNumber,
        scale: r._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfViewer?.currentScaleValue,
        status: r._iframeWindow?.document?.querySelector('[role=alert]')?.textContent })),
      listeners: Zotero.Reader._registeredListeners.map(x => ({ type: x.type, pluginID: x.pluginID })) };
  }
  await IOUtils.writeUTF8(TEST_ROOT + '/result.json', JSON.stringify(report, null, 2));
}
