/* A private PDF is only read in the temporary profile. No text or images are
 * written to the result, and this harness never takes a screenshot. */
async function run() {
  const checks = [], errors = [];
  const ok = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
  const wait = async (fn, message) => {
    const end = Date.now() + 30000;
    while (Date.now() < end) { const value = fn(); if (value) return value; await Zotero.Promise.delay(100); }
    throw Error('Timed out: ' + message);
  };
  let report, addon, pages;
  try {
    await Zotero.initializationPromise; await Zotero.uiReadyPromise;
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    addon = await AddonManager.getAddonByID('motero-compliments@optikergerhardt');
    const attachment = await Zotero.Attachments.importFromFile({ file: TEST_ROOT + '/fixture.pdf' });
    const path = await attachment.getFilePathAsync(), before = await IOUtils.read(path);
    const reader = await Zotero.Reader.open(attachment.id); await reader._initPromise;
    const doc = reader._iframeWindow.document;
    const view = await wait(() => reader._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument
      && reader._internalReader._primaryView, 'PDF reader');
    const win = view._iframeWindow, viewer = win.PDFViewerApplication.pdfViewer;
    pages = viewer.pagesCount;
    const target = Math.min(302, pages - 1);
    const guard = () => {
      const error = doc.querySelector('[role=alert]')?.textContent;
      if (error) { errors.push(error); throw Error(error); }
    };
    const open = async () => {
      if (!doc.querySelector('.appearance-popup')) doc.getElementById('appearance').click();
      return wait(() => doc.querySelector('[data-motero-crop-settings]'), 'crop controls');
    };
    const change = (panel, name, value) => {
      const node = panel.querySelector(`[name=${name}]`);
      if (node.type === 'checkbox') node.checked = value; else node.value = value;
      node.dispatchEvent(new reader._iframeWindow.Event('change', Components.utils.cloneInto({ bubbles: true }, reader._iframeWindow)));
    };
    const close = () => { if (doc.querySelector('.appearance-popup')) doc.getElementById('appearance').click(); };
    reader.navigate({ pageIndex: target });
    await wait(() => viewer.currentPageNumber === target + 1, 'reported page');
    ok(true, 'Privately supplied PDF opens at the reported reading area');
    let panel = await open(); change(panel, 'fit', 'page'); change(panel, 'mode', 'automatic'); close();
    await wait(() => { guard(); return viewer.getPageView(target).div.style.clipPath.includes('inset('); }, 'automatic crop');
    ok(true, 'Automatic crop completes on the supplied PDF');
    for (const mode of ['width', 'height', 'page']) {
      panel = await open(); change(panel, 'fit', mode); close();
      await Zotero.Promise.delay(350); guard();
      ok(true, 'Fit mode applies without a permission error: ' + mode);
    }
    panel = await open(); change(panel, 'includeMarginalia', true); change(panel, 'margin', '2'); close();
    await Zotero.Promise.delay(600); guard();
    ok(true, 'Margin and marginal-note settings apply without a permission error');
    for (const index of [Math.min(150, pages - 1), Math.min(320, pages - 1), target]) {
      reader.navigate({ pageIndex: index }); await Zotero.Promise.delay(80);
    }
    await wait(() => { guard(); return viewer.currentPageNumber === target + 1; }, 'rapid page changes');
    await Zotero.Promise.delay(700); guard();
    ok(viewer.currentPageNumber === target + 1, 'Fast navigation settles on the requested page');
    doc.getElementById('zoomAuto').click();
    await wait(() => viewer.currentScaleValue === 'page-width', 'Reset Zoom');
    await Zotero.Promise.delay(500); guard();
    ok(viewer.currentScaleValue === 'page-width', 'Native Reset Zoom remains in effect with this PDF');
    const after = await IOUtils.read(path);
    ok(before.length === after.length && before.every((v, i) => v === after[i]), 'Supplied PDF bytes remain unchanged');
    report = { ok: true, private_document: true, version: addon.version, zotero: Zotero.version, pages, checks };
  }
  catch (error) {
    report = { ok: false, private_document: true, version: addon?.version, zotero: Zotero.version, pages,
      checks, error: String(error), errors,
      diagnostic: Zotero.getErrors().map(e => e.message || String(e)).filter(e => /Permission denied|Auto crop/.test(e)).slice(-4) };
  }
  await IOUtils.writeUTF8(TEST_ROOT + '/result.json', JSON.stringify(report, null, 2));
}
