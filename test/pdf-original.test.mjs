import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFView } from '../src/pdf.mjs';

// PDFView normally runs in Zotero's privileged compartment.
globalThis.Components = { utils: { waiveXrays: value => value } };

function style(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getPropertyValue: key => values.get(key)?.[0] || '',
    getPropertyPriority: key => values.get(key)?.[1] || '',
    setProperty(key, value, priority = '') {
      writes.push(['set', key, value, priority]);
      values.set(key, [value, priority]);
    },
    removeProperty(key) {
      writes.push(['remove', key]);
      values.delete(key);
    }
  };
}

function harness(count) {
  const pages = Array.from({ length: count }, () => {
    const attrs = new Map();
    return { viewport: { width: 100, height: 200 }, div: {
      style: style(), isConnected: false,
      setAttribute: (key, value) => attrs.set(key, value),
      removeAttribute: key => attrs.delete(key),
      getAttribute: key => attrs.get(key)
    } };
  });
  let calls = 0;
  const view = Object.assign(Object.create(PDFView.prototype), {
    viewer: { pagesCount: count, currentPageNumber: 1,
      viewer: { setAttribute() {}, removeAttribute() {} },
      _getVisiblePages: () => ({ views: [{ id: 1 }, { id: 2 }, { id: 'invalid' }] }),
      getPageView(index) { calls++; return pages[index]; }
    },
    state: { options: { mode: 'off' }, annotations: () => [] },
    view: { _pages: [] }, saved: new Map(), corners: new Map(), noteHooks: new Map(),
    dirty: new Set(), bounds: new Map(), layout: { destroy() {} },
    displayed: () => [.1, .2, .9, .8]
  });
  return { view, pages, calls: () => calls };
}

test('Original refresh only visits visible and current pages and writes no crop styles', async () => {
  for (const count of [64, 500, 2000]) {
    const { view, pages, calls } = harness(count);
    await view.refresh();
    assert.equal(calls(), 2);
    assert.equal(pages.reduce((total, page) => total + page.div.style.writes.length, 0), 0);
    view.viewer._getVisiblePages = () => { throw Error('changed private visibility API'); };
    await view.refresh();
    assert.equal(calls(), 3, 'fallback visits only the current page');
  }
});

test('unchanged crop frames avoid style writes and detached pages restore original values', () => {
  const { view, pages } = harness(64);
  const div = pages[0].div;
  div.style.setProperty('clip-path', 'inset(1px)', 'important');
  div.style.setProperty('margin-top', '7px');
  view.bounds.set(0, [.1, .2, .9, .8]);
  view.dirty.add(0);
  assert.equal(view.applyPages([0, 1]), true);
  assert.equal(view.saved.size, 1);
  div.style.writes.length = 0;
  assert.equal(view.applyPages([0, 1]), false);
  assert.equal(div.style.writes.length, 0);
  pages[0].div = { style: style() };
  view.clearCrops();
  assert.equal(div.style.getPropertyValue('clip-path'), 'inset(1px)');
  assert.equal(div.style.getPropertyPriority('clip-path'), 'important');
  assert.equal(div.style.getPropertyValue('margin-top'), '7px');
  assert.equal(div.style.getPropertyPriority('margin-top'), '');
  assert.equal(div.getAttribute('data-motero-crop'), undefined);
  assert.equal(view.saved.size, 0);
});

test('bookmark note hooks stay bounded and follow changed visibility', () => {
  const { view } = harness(2000);
  globalThis.Components.utils.exportFunction = callback => callback;
  let scans = 0;
  const pages = Array.from({ length: 2000 }, (_, pageIndex) => ({ pageIndex, _pushNote() {}, render() {} }));
  view.view._pages = new Proxy(pages, {
    get(target, key, receiver) {
      if (key === Symbol.iterator) scans++;
      return Reflect.get(target, key, receiver);
    }
  });
  const markers = new Map([[1, [{}]]]);
  view.hideNativeBookmarkNotes(markers);
  assert.equal(view.noteHooks.size, 1);
  view.hideNativeBookmarkNotes(markers);
  assert.equal(scans, 1);
  const first = pages[1];
  pages[1] = { pageIndex: 1, _pushNote() {}, render() {} };
  view.notePagesDirty = true;
  view.hideNativeBookmarkNotes(markers);
  assert.equal(scans, 2);
  assert.equal(view.noteHooks.has(first), false);
  assert.equal(view.noteHooks.has(pages[1]), true);
  view.hideNativeBookmarkNotes(new Map());
  assert.equal(view.noteHooks.size, 0);
});
