import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSnapshot, snapshotMarker, candidatePath
} from '../scripts/check-motero-upstream.mjs';

const main = 'a'.repeat(40);
const reader = 'b'.repeat(40);

test('monitor snapshot round-trips with exact SHAs', () => {
  assert.deepEqual(parseSnapshot('x\n' + snapshotMarker(main, reader)), { main, reader });
  assert.equal(parseSnapshot('irrelevant comment'), null);
  assert.equal(parseSnapshot('<!-- motero-upstream-snapshot main=abc reader=def -->'), null);
});

test('monitor rejects missing or malformed upstream commit SHAs', () => {
  assert.throws(() => snapshotMarker('short', reader), /Invalid SHA/);
  assert.throws(() => snapshotMarker(main, undefined), /Invalid SHA/);
});

test('candidate path filter is conservative and marks reader/QA changes for review', () => {
  assert.equal(candidatePath('reader/src/pdf/crop-bounds.ts'), true);
  assert.equal(candidatePath('src/annotations/BookmarkService.kt'), true);
  assert.equal(candidatePath('test/vendor/geometry.test.mjs'), true);
  assert.equal(candidatePath('docs/release-notes.md'), false);
});
