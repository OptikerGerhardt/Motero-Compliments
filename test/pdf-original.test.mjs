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

function harness(count, visible = [1, 2]) {
  const pages = Array.from({ length: count }, () => {
    const attrs = new Map();
    const div = {
      style: style(),
      isConnected: false,
      setAttribute: (key, value) => attrs.set(key, value),
      removeAttribute: key => attrs.delete(key),
      getAttribute: key => attrs.get(key) ?? null
    };
    return { div, viewport: { width: 100, height: 200 } };
  });
  let calls = 0;
  const viewer = {
    pagesCount: count,
    currentPageNumber: 1,
    viewer: { toggleAttribute() {}, setAttribute() {} },
    _getVisiblePages: () => ({ views: visible.map(id => ({ id })) }),
    getPageView(index) { calls++; return pages[index]; }
  };
  const view = Object.create(PDFView.prototype);
  view.viewer = viewer;
  view.state = { options: { mode: 'off' } };
  view.saved = new Map();
  view.generation = 1;
  view.hideNativeBookmarkNotes = () => {};
  view.displayed = () => [0.1, 0.2, 0.9, 0.8];
  return { view, pages, calls: () => calls, resetCalls: () => { calls = 0; } };
}

test('stable Original only visits visible/current pages and never writes crop styles', () => {
  for (const count of [64, 500, 2000]) {
    const { view, pages, calls } = harness(count);
    view.applyPages();
    assert.equal(calls(), 2, `unexpected traversal for ${count} pages`);
    assert.equal(view.saved.size, 0);
    assert.equal(pages.reduce((n, p) => n + p.div.style.writes.length, 0), 0);
  }
});

test('crop to Original restores original inline values and priorities', () => {
  const { view, pages, resetCalls, calls } = harness(64);
  const div = pages[0].div;
  div.style.setProperty('clip-path', 'inset(1px)', 'important');
  div.style.setProperty('margin-top', '7px', '');
  div.style.writes.length = 0;
  view.state.options.mode = 'manual';
  view.applyPages();
  assert.equal(div.getAttribute('data-motero-crop') !== null, true);
  assert.equal(div.style.getPropertyPriority('margin-top'), 'important');
  resetCalls();
  view.state.options.mode = 'off';
  view.applyPages();
  assert.equal(calls(), 64, 'transition must restore every previously cropped page');
  assert.equal(div.style.getPropertyValue('clip-path'), 'inset(1px)');
  assert.equal(div.style.getPropertyPriority('clip-path'), 'important');
  assert.equal(div.style.getPropertyValue('margin-top'), '7px');
  assert.equal(div.style.getPropertyPriority('margin-top'), '');
  assert.equal(div.style.getPropertyValue('margin-right'), '');
  assert.equal(div.getAttribute('data-motero-crop'), null);
  assert.equal(view.saved.size, 0);
  resetCalls();
  view.applyPages();
  assert.equal(calls(), 2, 'subsequent Original refresh must remain bounded');
});


test('return to Original restores a detached, replaced cropped page', () => {
  const { view, pages } = harness(64);
  const oldDiv = pages[0].div;
  view.state.options.mode = 'manual';
  view.applyPages();
  assert.equal(view.saved.has(oldDiv), true);
  const replacement = {
    ...oldDiv,
    style: style(),
    getAttribute: () => null,
    setAttribute() {},
    removeAttribute() {}
  };
  pages[0].div = replacement;
  view.state.options.mode = 'off';
  view.applyPages();
  assert.equal(oldDiv.style.getPropertyValue('clip-path'), '');
  assert.equal(oldDiv.getAttribute('data-motero-crop'), null);
  assert.equal(view.saved.size, 0);
});

test('Original mode uses a bounded current-page fallback for missing or changed visibility APIs', () => {
  for (const visibility of [
    undefined,
    () => ({ views: null }),
    () => ({ views: {} }),
    () => { throw new Error('private API changed'); }
  ]) {
    const { view, calls } = harness(2000);
    view.viewer._getVisiblePages = visibility;
    view.applyPages();
    assert.equal(calls(), 1, 'fallback should inspect only the current page');
    assert.equal(view.saved.size, 0);
  }
});

test('Original mode ignores malformed visible-page IDs without a full traversal', () => {
  const { view, calls } = harness(2000);
  view.viewer._getVisiblePages = () => ({ views: [
    { id: 1 }, { id: 2 }, { id: -1 }, { id: 2001 }, { id: '3' }, null
  ] });
  view.applyPages();
  assert.equal(calls(), 2);
});

test('stable Original refresh avoids page-wide bookmark hook resynchronization', () => {
  const { view } = harness(2000);
  // This test exercises the real prototype hook, not the page-traversal harness stub.
  delete view.hideNativeBookmarkNotes;
  const pages = Array.from({ length: 2000 }, () => ({
    _pushNote() {}, render() {}
  }));
  let scans = 0;
  const tracked = new Proxy(pages, {
    get(target, key, receiver) {
      if (key === Symbol.iterator) scans++;
      return Reflect.get(target, key, receiver);
    }
  });
  globalThis.Components.utils.exportFunction = callback => callback;
  view.view = { _pages: tracked };
  view.win = {};
  view.noteHooks = new Map();
  view.notePagesDirty = true;
  view.notePages = null;
  view.notePagesLength = -1;
  view.hideNativeBookmarkNotes();
  assert.equal(scans, 1);
  assert.equal(view.noteHooks.size, 2000);
  view.hideNativeBookmarkNotes();
  assert.equal(scans, 1, 'stable page array must not be rescanned');
  pages.push({ _pushNote() {}, render() {} });
  view.hideNativeBookmarkNotes();
  assert.equal(scans, 2, 'appended page must be hooked');
  assert.equal(view.noteHooks.size, 2001);
  const removed = pages[0];
  pages[0] = { _pushNote() {}, render() {} };
  view.notePagesDirty = true; // pagerendered/pagechanging event
  view.hideNativeBookmarkNotes();
  assert.equal(scans, 3, 'lifecycle event forces a rescan');
  assert.equal(view.noteHooks.has(removed), false);
  assert.equal(view.noteHooks.has(pages[0]), true);
});

test('stable Original applyPages keeps both page and bookmark-hook scans bounded', () => {
  const { view, calls, resetCalls } = harness(2000);
  delete view.hideNativeBookmarkNotes;
  const pages = Array.from({ length: 2000 }, () => ({
    _pushNote() {}, render() {}
  }));
  let scans = 0;
  const tracked = new Proxy(pages, {
    get(target, key, receiver) {
      if (key === Symbol.iterator) scans++;
      return Reflect.get(target, key, receiver);
    }
  });
  globalThis.Components.utils.exportFunction = callback => callback;
  view.view = { _pages: tracked };
  view.win = {};
  view.noteHooks = new Map();
  view.notePagesDirty = true;
  view.notePages = null;
  view.notePagesLength = -1;
  view.applyPages();
  assert.equal(scans, 1, 'initial hook registration scans once');
  resetCalls();
  view.applyPages();
  assert.equal(scans, 1, 'stable Original refresh must not rescan all note pages');
  assert.equal(calls(), 2, 'stable Original refresh must inspect only visible page views');
  assert.equal(view.saved.size, 0);
});
