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
  let report, addon, pages, comparison;
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
      const choice = panel.querySelector(`[data-motero-choice="${name}"] button[data-value="${value}"]`);
      if (choice) { choice.click(); return; }
      const node = panel.querySelector(`[name=${name}]`);
      if (node.type === 'checkbox') node.checked = value; else node.value = value;
      node.dispatchEvent(new reader._iframeWindow.Event('change', Components.utils.cloneInto({ bubbles: true }, reader._iframeWindow)));
    };
    const close = () => { if (doc.querySelector('.appearance-popup')) doc.getElementById('appearance').click(); };
    reader.navigate({ pageIndex: target });
    await wait(() => viewer.currentPageNumber === target + 1, 'reported page');
    await wait(() => viewer.getPageView(target)?.pdfPage, 'reported page viewport loaded');
    ok(true, 'Privately supplied PDF opens at the reported reading area');
    const geometry = () => {
      const page = viewer.getPageView(target), values = page.div.style.clipPath.match(/[\d.]+(?=px)/g)?.map(Number);
      if (!values || values.length !== 4) return { area: 1, width: 1 };
      const width = Math.max(0, 1 - (values[1] + values[3]) / page.viewport.width);
      return { width, area: width * Math.max(0, 1 - (values[0] + values[2]) / page.viewport.height) };
    };
    const apply = async (name, value) => {
      const previous = viewer.viewer.getAttribute('data-motero-generation');
      const panel = await open(); change(panel, name, value); close();
      await wait(() => { guard(); return viewer.viewer.getAttribute('data-motero-generation') !== previous; }, 'applied crop state');
      // Fit updates the viewport before PDF.js has reapplied pixel clip insets.
      // Wait for both to settle rather than comparing different scale epochs.
      let last, stableSince = Date.now();
      await wait(() => {
        guard();
        const value = JSON.stringify(geometry());
        if (value !== last) { last = value; stableSince = Date.now(); }
        return Date.now() - stableSince > 350;
      }, 'stable crop geometry');
    };
    await apply('fit', 'page'); await apply('mode', 'automatic');
    const initial = geometry();
    await wait(() => viewer.viewer.getAttribute('data-motero-profile') === 'ready', 'deferred document profile');
    const excluded = geometry();
    ok(excluded.area < .9 && excluded.width < .97, 'Automatic visibly removes paper margins on the supplied PDF');
    const probe = Components.utils.waiveXrays(win.MoteroPageAnalysis.create());
    const measured = Components.utils.waiveXrays(await probe.extract(Components.utils.cloneInto({ index: target }, win)));
    const ink = measured.ink;
    comparison = { crop_to_margin_raw_ink_area: ink ? (ink.x1 - ink.x0) * (ink.y1 - ink.y0) / (measured.image.width * measured.image.height) : null,
      motero_first_area: initial.area, motero_policy_area: excluded.area, motero_policy_width: excluded.width };
    probe.destroy();
    await apply('includeReferences', true);
    const included = geometry();
    comparison.references_included_width = included.width;
    ok(included.area < .9, 'Including side references preserves automatic paper-margin removal');
    await apply('includeReferences', false);
    comparison.references_excluded_again_width = geometry().width;
    ok(Math.abs(geometry().width - excluded.width) < .0001, 'Reference policy round-trip restores the original reading frame');
    for (const mode of ['width', 'height', 'page']) {
      await apply('fit', mode); guard();
      ok(geometry().area < .9, 'Fit mode retains a visible automatic crop: ' + mode);
    }
    await apply('mode', 'off');
    ok(!viewer.getPageView(target).div.style.clipPath, 'Original is a single full-page mode');
    await apply('mode', 'automatic');
    ok(geometry().area < .9, 'Switching Original to Automatic reliably reapplies the crop');
    await apply('includeMarginalia', true); await apply('margin', '2'); guard();
    ok(true, 'Margin and marginal-note settings apply independently without a permission error');
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
    report = { ok: true, private_document: true, version: addon.version, zotero: Zotero.version, pages, checks, comparison };
  }
  catch (error) {
    report = { ok: false, private_document: true, version: addon?.version, zotero: Zotero.version, pages,
      checks, comparison, error: String(error), errors,
      diagnostic: Zotero.getErrors().map(e => e.message || String(e)).filter(e => /Permission denied|Auto crop/.test(e)).slice(-4) };
  }
  await IOUtils.writeUTF8(TEST_ROOT + '/result.json', JSON.stringify(report, null, 2));
}
