import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFHexString, PDFNumber } from 'pdf-lib';
import { outlineEntries, outlineTree } from '../src/outline.mjs';
import { appendOutline } from '../src/outline-pdf.mjs';

test('annotation outline requires all conditions and keeps native PDF coordinates', () => {
  const match = { type: 'highlight', color: '#ffd400', text: '  Chapter one  ',
    tags: [{ name: 'Outline' }], position: { pageIndex: 1, rects: [[10, 40, 120, 51]] } };
  const rule = { type: 'highlight', tag: 'outline', color: '#FFD400', title: 'text', prefix: 'Part', level: 2 };
  const source = [match, { ...match, tags: [{ name: 'other' }] }, { ...match, color: '#111111' },
    { ...match, position: { pageIndex: 100 } }, { ...match, type: 'note' }];
  assert.deepEqual(outlineEntries(source, rule, 3), [{ title: 'Part Chapter one', level: 2, pageIndex: 1, x: 10, y: 51 }]);
  assert.equal(match.text, '  Chapter one  ');
  assert.throws(() => outlineTree([{ title: 'Invalid', level: 1, pageIndex: 3 }], 3), /Invalid/);
});

test('PDF export appends a Unicode hierarchy while retaining existing outline entries and page annotations', async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 500]);
  document.addPage([300, 500]);
  const link = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 20, 50, 65] }));
  page.node.set(PDFName.of('Annots'), document.context.obj([link]));
  const source = await document.save();
  const first = await appendOutline(source, [{ title: 'Original', level: 1, pageIndex: 0 }]);
  const second = await appendOutline(first, [
    { title: 'Kapitel Ä', level: 1, pageIndex: 1, x: 17, y: 370 },
    { title: 'Unterkapitel', level: 2, pageIndex: 1 }
  ]);
  const result = await PDFDocument.load(second);
  const name = PDFName.of;
  const root = result.catalog.lookup(name('Outlines'), PDFDict);
  const existing = root.lookup(name('First'), PDFDict);
  assert.equal(existing.lookup(name('Title'), PDFHexString).decodeText(), 'Original');
  const added = existing.lookup(name('Next'), PDFDict);
  assert.equal(added.lookup(name('Title'), PDFHexString).decodeText(), 'Kapitel Ä');
  const nested = added.lookup(name('First'), PDFDict);
  assert.equal(nested.lookup(name('Title'), PDFHexString).decodeText(), 'Unterkapitel');
  const dest = added.lookup(name('Dest'), PDFArray);
  assert.equal(dest.get(0), result.getPage(1).ref);
  assert.equal(dest.lookup(3, PDFNumber).asNumber(), 370);
  assert.equal(result.getPage(0).node.lookup(name('Annots'), PDFArray).size(), 1);
});
