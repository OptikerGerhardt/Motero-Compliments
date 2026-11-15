import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, preferenceKey, pageBookmarks, bookmarkAnnotation, paddedBounds, SerialQueue } from '../src/core.mjs';
import { rotateReadingBounds } from '../src/vendor/motero/reading-layout.mjs';

test('untrusted preferences cannot enable invalid modes, margins or rectangles', () => {
  assert.deepEqual(settings(null), { mode: 'off', fit: 'width', margin: .01, includeMarginalia: false, includeReferences: false, crops: {} });
  const value = settings({ mode: 'bad', fit: 'bad', margin: Infinity,
    includeMarginalia: 'true', crops: { all: [0, 0, 3, 1] } });
  assert.equal(value.mode, 'off'); assert.equal(value.margin, .01);
  assert.equal(value.includeMarginalia, false); assert.deepEqual(value.crops, {});
  assert.equal(settings({ margin: -.1 }).margin, 0);
  assert.equal(settings({ margin: 1 }).margin, .15);
});
test('reference policy migrates old marginal-note settings and allows independent explicit choices', () => {
  assert.equal(settings({ includeMarginalia: true }).includeReferences, true);
  assert.equal(settings({ includeMarginalia: true, includeReferences: false }).includeReferences, false);
  assert.equal(settings({ includeMarginalia: false, includeReferences: true }).includeReferences, true);
});
test('crop persistence is isolated by library and attachment', () => {
  const a = preferenceKey({ libraryID: 1, key: 'ABCDEFGH' });
  assert.notEqual(a, preferenceKey({ libraryID: 2, key: 'ABCDEFGH' }));
  assert.notEqual(a, preferenceKey({ libraryID: 1, key: 'ABCDEFGI' }));
  assert.throws(() => preferenceKey({ libraryID: 1, key: '../bad' }));
});
test('Motero bookmarks are semantic, preserve colors, and never include ordinary black notes', () => {
  const annotations = [
    { id: 'a', type: 'note', color: '#000000', comment: 'Bookmark · first', position: { pageIndex: 0 } },
    { id: 'b', type: 'note', color: '#f00', comment: 'lesezeichen · second', position: { pageIndex: 0 } },
    { id: 'c', type: 'note', color: '#000000', comment: 'ordinary', position: { pageIndex: 0 } },
    { id: 'd', type: 'highlight', comment: 'Bookmark · text', position: { pageIndex: 0 } },
    { id: 'e', type: 'note', comment: 'Bookmark · next', position: { pageIndex: 1 } }
  ];
  assert.deepEqual(pageBookmarks(annotations, 0).map(a => a.id), ['a', 'b']);
  assert.equal(annotations[1].color, '#f00');
});
test('bookmark placement uses PDF coordinates, including nonzero origins and rotated viewports', () => {
  const viewport = { width: 800, height: 600,
    convertToPdfPoint: (x, y) => [y + 20, x + 30] };
  const mark = bookmarkAnnotation(viewport, 7, [.1, .2, .9, .8], 'iv', 'today', true);
  assert.equal(mark.color, '#000000'); assert.equal(mark.comment, 'Lesezeichen · today');
  assert.equal(mark.pageLabel, 'iv'); assert.equal(mark.position.pageIndex, 7);
  assert.deepEqual(mark.position.rects, [[144, 720, 166, 742]]);
  assert.match(mark.sortIndex, /^00007\|\d{6}\|\d{5}$/);
});
test('padding and all view rotations remain within the original page', () => {
  assert.deepEqual(paddedBounds([.01, .1, .99, .9], .03), [0, .07, 1, .93]);
  assert.deepEqual(paddedBounds(null, .03), [0, 0, 1, 1]);
  for (const rotation of [0, 90, 180, 270]) {
    const original = [.13, .24, .76, .89];
    const b = rotateReadingBounds(rotateReadingBounds(original, rotation), -rotation);
    b.forEach((n, i) => assert.ok(Math.abs(n - original[i]) < 1e-12));
  }
});
test('rapid bookmark actions serialize and a failure does not block later work', async () => {
  const q = new SerialQueue(), order = [];
  const first = q.run(async () => { await Promise.resolve(); order.push(1); throw Error('failed'); });
  const second = q.run(() => order.push(2));
  await assert.rejects(first); await second;
  assert.deepEqual(order, [1, 2]);
});
