import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFView } from '../src/pdf.mjs';

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
