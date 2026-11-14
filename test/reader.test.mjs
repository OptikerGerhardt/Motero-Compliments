import test from 'node:test';
import assert from 'node:assert/strict';
import { ReaderState } from '../src/plugin.mjs';
import { SerialQueue } from '../src/core.mjs';

globalThis.Components = { utils: { waiveXrays: x => x, cloneInto: x => structuredClone(x) } };
globalThis.Zotero = { locale: 'en-US' };
function readerState(annotations = [], editable = true) {
  const page = { rotate: 0, getViewport: () => ({ width: 600, height: 800,
    convertToPdfPoint: (x, y) => [x, 800 - y] }) };
  const removed = [], created = [];
  const state = {
    queue: new SerialQueue(), reader: { _iframeWindow: {} }, canEdit: () => editable,
    annotations: () => annotations, changedAnnotations() {},
    internal: { _annotationManager: { deleteAnnotations(ids) {
      removed.push(...ids); ids.forEach(id => annotations.splice(annotations.findIndex(a => a.id === id), 1));
    } }, deleteAnnotations(ids) { removed.push(...ids); } },
    activeView: () => ({ win: {}, viewer: { currentPageNumber: 1, pagesCount: 3 },
      app: { pdfDocument: { getPage: async () => page } }, naturalBounds: async () => [.1, .1, .9, .9],
      view: { _getPageLabel: () => 'i', _onAddAnnotation(a) { a.id = 'new'; created.push(a); annotations.push(a); } } })
  };
  return { state, removed, created };
}
const bookmark = (readOnly = false) => ({ id: 'bookmark', type: 'note', color: '#ff0000',
  comment: 'Lesezeichen · imported', position: { pageIndex: 0 }, readOnly });
test('read-only library and imported read-only bookmarks cannot be toggled', async () => {
  for (const [annotations, editable] of [[[bookmark()], false], [[bookmark(true)], true]]) {
    const { state, removed, created } = readerState(annotations, editable);
    await ReaderState.prototype.toggleBookmark.call(state);
    assert.deepEqual(removed, []); assert.deepEqual(created, []);
  }
});
test('a recolored Motero bookmark toggles without creating a duplicate', async () => {
  const { state, removed, created } = readerState([bookmark()]);
  await ReaderState.prototype.toggleBookmark.call(state);
  assert.deepEqual(removed, ['bookmark']); assert.equal(created.length, 0);
});
test('ordinary black notes survive bookmark creation and queued removal', async () => {
  const note = { id: 'note', type: 'note', color: '#000000', comment: 'ordinary', position: { pageIndex: 0 } };
  const { state, removed, created } = readerState([note]);
  await Promise.all([ReaderState.prototype.toggleBookmark.call(state), ReaderState.prototype.toggleBookmark.call(state)]);
  assert.equal(created.length, 1); assert.deepEqual(removed, ['new']);
  assert.deepEqual(state.annotations(), [note]);
});
test('delete shortcut rejects arbitrary annotation IDs and read-only markers', async () => {
  for (const annotation of [bookmark(true), { ...bookmark(), comment: 'ordinary' }]) {
    const { state, removed } = readerState([annotation]);
    await ReaderState.prototype.removeBookmark.call(state, annotation.id);
    assert.deepEqual(removed, []);
  }
});
test('closing a reader during async bookmark creation prevents a late write', async () => {
  const { state, created } = readerState();
  let editable = true;
  state.canEdit = () => editable;
  const original = state.activeView();
  original.naturalBounds = async () => { editable = false; return [0, 0, 1, 1]; };
  state.activeView = () => original;
  await ReaderState.prototype.toggleBookmark.call(state);
  assert.equal(created.length, 0);
});
