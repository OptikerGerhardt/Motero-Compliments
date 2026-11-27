import assert from 'node:assert/strict';
import test from 'node:test';
import { readAnnotationStyle, stylePatch } from '../src/annotation-style.mjs';

test('annotation style contains type, color and tag names without annotation content', () => {
  const source = { type: 'highlight', color: '#ff0000', tags: [{ name: 'Research', color: '#ffffff' }],
    comment: 'private comment', text: 'private selection', position: { pageIndex: 3 } };
  assert.deepEqual(readAnnotationStyle(source), { type: 'highlight', color: '#ff0000', tags: ['Research'] });
});

test('styling merges tags without changing a target’s identity, content or geometry', () => {
  const target = { id: 'target', tags: [{ name: 'Old' }, { name: 'research' }], position: { pageIndex: 2 } };
  const style = { type: 'underline', color: '#ff0000', tags: ['Research', 'New'] };
  assert.deepEqual(stylePatch(target, style), {
    id: 'target', color: '#ff0000', tags: [{ name: 'Old' }, { name: 'research' }, { name: 'New' }]
  });
  assert.equal(stylePatch({ ...target, readOnly: true }, style), null);
});
