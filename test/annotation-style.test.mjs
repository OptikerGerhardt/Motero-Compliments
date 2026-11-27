import assert from 'node:assert/strict';
import test from 'node:test';
import { readAnnotationStyle, stylePatch } from '../src/annotation-style.mjs';

test('annotation style contains type, color and tag names without annotation content', () => {
  const source = { type: 'highlight', color: '#ff0000', tags: [{ name: 'Research', color: '#ffffff' }],
    comment: 'private comment', text: 'private selection', position: { pageIndex: 3 } };
  assert.deepEqual(readAnnotationStyle(source), { type: 'highlight', color: '#ff0000', tags: ['Research'] });
});

test('styling merges tags without changing a target’s identity, content or geometry', () => {
  const target = { id: 'target', tags: [{ name: 'Old', color: '#0f0f0f' }, { name: 'research' }], position: { pageIndex: 2 } };
  const style = { type: 'underline', color: '#ff0000', tags: ['Research', 'New'] };
  assert.deepEqual(stylePatch(target, style), {
    id: 'target', color: '#ff0000', tags: [{ name: 'Old', color: '#0f0f0f' }, { name: 'research' }, { name: 'Research' }, { name: 'New' }]
  });
  assert.equal(stylePatch({ ...target, readOnly: true }, style), null);
  assert.deepEqual(stylePatch(target, { ...style, tags: ['research'] }), { id: 'target', color: '#ff0000' });

});

test('applying another annotation style keeps Motero’s black bookmark flag compatible', () => {
  const bookmark = { id: 'bookmark', type: 'note', comment: 'Bookmark · Chapter 1', color: '#000000' };
  assert.deepEqual(stylePatch(bookmark, { color: '#ff0000', tags: ['Section'] }),
    { id: 'bookmark', tags: [{ name: 'Section' }] });
});
