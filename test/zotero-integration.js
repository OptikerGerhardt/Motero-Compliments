/* Loaded only by scripts/test-zotero.py in a disposable test extension/profile. */
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
    await Zotero.initializationPromise;
    await Zotero.uiReadyPromise;
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await AddonManager.getAddonByID('motero-compliments@optikergerhardt');
    ok(addon?.isActive, 'Packaged XPI is installed and active');
    const attachment = await Zotero.Attachments.importFromFile({ file: TEST_ROOT + '/fixture.pdf' });
    const file = await attachment.getFilePathAsync();
    const before = await IOUtils.read(file);
    const reader = await Zotero.Reader.open(attachment.id);
    await reader._initPromise;
    const internal = reader._internalReader;
    const doc = reader._iframeWindow.document;
    const control = await wait(() => doc.querySelector('[data-motero-toolbar]'), 'Motero toolbar');
    const view = await wait(() => internal._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument
      && internal._primaryView, 'PDF viewer');
    const win = view._iframeWindow, viewer = win.PDFViewerApplication.pdfViewer;
    await wait(() => viewer.getPageView(0)?.pdfPage, 'first page');
    ok(!!control, 'Reader toolbar rendered');
    const clickText = (container, text) => {
      const button = [...container.querySelectorAll('button')].find(n => n.textContent === text);
      if (!button) throw Error('Missing button ' + text); button.click();
    };
    const openPanel = () => { control.querySelector('button').click(); return doc.querySelector('dialog'); };
    const panel = openPanel();
    const mode = panel.querySelector('select'); mode.value = 'automatic';
    clickText(panel, 'Apply'); panel.close();
    await wait(() => viewer.getPageView(0).div.style.clipPath.includes('inset('), 'automatic crop');
    const cropped = viewer.getPageView(0).div.style.clipPath;
    ok(!/^inset\(0px 0px 0px 0px\)$/.test(cropped), 'Automatic crop hides synthetic white margins');
    ok(viewer.currentScale > 1, 'Cropped content is fitted to available width');
    const textLayer = await wait(() => viewer.getPageView(0).div.querySelector('.textLayer'), 'text layer');
    ok(textLayer.textContent.includes('Synthetic reading'), 'Text layer remains readable after cropping');
    const mark = control.querySelectorAll('button')[1];
    mark.click();
    const bookmarks = () => internal._state.annotations.filter(a => /^(Bookmark|Lesezeichen)\s*·/.test(a.comment));
    await wait(() => bookmarks().length === 1, 'create bookmark');
    ok(bookmarks()[0].type === 'note' && bookmarks()[0].color === '#000000', 'Bookmark is a native black note annotation');
    const markID = bookmarks()[0].id;
    await wait(() => attachment.getAnnotations().some(a => a.key === markID), 'bookmark persisted to Zotero database');
    ok(true, 'Bookmark persisted through native Zotero annotation API');
    const bookmarkedPage = bookmarks()[0].position.pageIndex;
    await wait(() => viewer.getPageView(bookmarkedPage).div.querySelector('.motero-page-flag')?.getAttribute('aria-pressed') === 'true', 'page flag state');
    ok(true, 'Page corner shortcut tracks the bookmark');
    mark.click(); await wait(() => bookmarks().length === 0, 'remove bookmark');
    ok(true, 'Second click removes bookmark');
    mark.click(); mark.click(); mark.click();
    await wait(() => bookmarks().length === 1, 'serialized rapid toggles');
    await Zotero.Promise.delay(500);
    ok(bookmarks().length === 1, 'Rapid bookmark toggles serialize correctly');
    const listPanel = openPanel();
    ok(listPanel.textContent.includes('Bookmark ·'), 'Bookmark appears in dedicated list');
    const filter = listPanel.querySelector('input[type=search]');
    filter.value = 'no match'; filter.dispatchEvent(new reader._iframeWindow.Event('input'));
    ok(listPanel.textContent.includes('No bookmarks.'), 'Bookmark list filters without changing annotation metadata');
    listPanel.close();
    const targetPage = bookmarks()[0].position.pageIndex;
    reader.navigate({ pageIndex: 5 });
    await wait(() => viewer.currentPageNumber === 6, 'navigate to intrinsically rotated page');
    await wait(() => viewer.getPageView(5).div.querySelector('.motero-page-flag'), 'rotated page shortcut');
    ok(true, 'Intrinsic PDF rotation is supported');
    const jumpPanel = openPanel();
    const jump = [...jumpPanel.querySelectorAll('button')].find(b => b.textContent.includes('Bookmark ·'));
    jump.click();
    await wait(() => viewer.currentPageNumber === targetPage + 1, 'bookmark jump');
    ok(true, 'Bookmark list jumps to its stored annotation');
    const deletePanel = openPanel(); clickText(deletePanel, 'Delete');
    await wait(() => bookmarks().length === 0, 'delete from list');
    ok(true, 'Bookmark list delete removes the native annotation');
    deletePanel.close();
    const manualPanel = openPanel(); clickText(manualPanel, 'Edit manual frame…');
    const editor = await wait(() => doc.querySelector('dialog canvas')?.closest('dialog'), 'manual editor');
    await wait(() => [...editor.querySelectorAll('button')].find(b => b.textContent === 'Apply' && !b.disabled), 'manual preview');
    const scope = editor.querySelector('select'); scope.value = 'odd';
    scope.dispatchEvent(new reader._iframeWindow.Event('change'));
    await wait(() => [...editor.querySelectorAll('button')].find(b => b.textContent === 'Apply' && !b.disabled), 'odd-page preview');
    const frame = editor.querySelector('[data-handle=move]');
    const leftBefore = Number.parseFloat(frame.style.left);
    frame.dispatchEvent(new reader._iframeWindow.KeyboardEvent('keydown', Components.utils.cloneInto(
      { key: 'ArrowRight', shiftKey: true, bubbles: true }, reader._iframeWindow)));
    ok(Number.parseFloat(frame.style.left) > leftBefore, 'Manual frame supports keyboard adjustment');
    clickText(editor, 'Apply');
    const pref = `extensions.moteroCompliments.crop.${attachment.libraryID}.${attachment.key}`;
    const saved = JSON.parse(Zotero.Prefs.get(pref, true));
    ok(saved.mode === 'manual' && saved.crops.odd.length === 4 && !saved.crops.even, 'Manual odd-page crop persists per attachment');
    viewer.pagesRotation = 90;
    await Zotero.Promise.delay(500);
    ok(viewer.getPageView(0).div.style.clipPath.includes('inset('), 'Crop survives user view rotation');
    viewer.pagesRotation = 0;
    const originalPanel = openPanel(); clickText(originalPanel, 'Toggle original view'); originalPanel.close();
    await wait(() => !viewer.getPageView(0).div.style.clipPath, 'temporary original view');
    ok(JSON.parse(Zotero.Prefs.get(pref, true)).mode === 'manual', 'Temporary original view preserves saved crop settings');
    await addon.disable();
    await wait(() => !doc.querySelector('[data-motero-toolbar]'), 'plugin shutdown');
    ok(!viewer.getPageView(0).div.style.clipPath && !viewer.getPageView(0).div.querySelector('.motero-page-flag'), 'Disabling restores styles and removes page shortcuts');
    await addon.enable();
    await wait(() => doc.querySelector('[data-motero-toolbar]'), 'adopt existing reader after enable');
    ok(true, 'Re-enabling adopts already open PDF readers');
    await wait(() => viewer.getPageView(0).div.style.clipPath.includes('inset('), 'restore persisted crop');
    ok(JSON.parse(Zotero.Prefs.get(pref, true)).crops.odd.length === 4, 'Saved manual crop is restored after plugin restart');
    const after = await IOUtils.read(file);
    ok(before.length === after.length && before.every((v, i) => v === after[i]), 'PDF bytes are unchanged');
    report = { ok: true, zotero: Zotero.version, checks };
  }
  catch (error) { report = { ok: false, zotero: Zotero.version, checks, error: String(error), stack: error.stack,
    console: Services.console.getMessageArray().map(m => m.message).slice(-15),
    errors: Zotero.getErrors?.().slice(-12).map(e => e.message || String(e)),
    readerInfo: Zotero.Reader._readers.map(r => ({ type: r._type, item: r._item?.key,
      status: r._iframeWindow?.document?.querySelector('[role=alert]')?.textContent,
      flags: [...(r._internalReader?._primaryView?._iframeWindow?.document.querySelectorAll('.motero-page-flag') || [])].slice(0, 8).map(n => ({ pressed: n.getAttribute('aria-pressed'), page: n.closest('.page')?.dataset.pageNumber })),
      annotations: r._internalReader?._state.annotations.map(a => ({ comment: a.comment, position: a.position })) })) }; }
  await IOUtils.writeUTF8(TEST_ROOT + '/result.json', JSON.stringify(report, null, 2));
}
