import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import { outlineTree } from './outline.mjs';

const name = PDFName.of;
export async function appendOutline(bytes, entries) {
  const pdf = await PDFDocument.load(new Uint8Array(bytes), { updateMetadata: false });
  const pages = pdf.getPages();
  const nodes = outlineTree(entries, pages.length);
  const context = pdf.context;
  let rootRef = pdf.catalog.get(name('Outlines'));
  let root;
  if (!rootRef) {
    root = context.obj({ Type: 'Outlines' });
    rootRef = context.register(root);
    pdf.catalog.set(name('Outlines'), rootRef);
  }
  else if (rootRef instanceof PDFRef) {
    root = context.lookup(rootRef, PDFDict);
  }
  else if (rootRef instanceof PDFDict) {
    root = rootRef;
    rootRef = context.register(root);
    pdf.catalog.set(name('Outlines'), rootRef);
  }
  else {
    throw Error('The existing PDF outline is invalid');
  }

  function writeSiblings(children, parent, previous) {
    const refs = children.map(() => context.nextRef());
    let count = children.length;
    for (const [index, entry] of children.entries()) {
      const ref = refs[index];
      const page = pages[entry.pageIndex];
      const dest = entry.x == null && entry.y == null
        ? [page.ref, 'Fit']
        : [page.ref, 'XYZ', entry.x ?? null, entry.y ?? null, null];
      const node = context.obj({ Title: PDFHexString.fromText(entry.title), Parent: parent, Dest: dest });
      const prev = refs[index - 1] || previous;
      if (prev) node.set(name('Prev'), prev);
      if (refs[index + 1]) node.set(name('Next'), refs[index + 1]);
      if (entry.children.length) {
        const nested = writeSiblings(entry.children, ref);
        node.set(name('First'), nested.first);
        node.set(name('Last'), nested.last);
        node.set(name('Count'), PDFNumber.of(nested.count));
        count += nested.count;
      }
      context.assign(ref, node);
    }
    return { first: refs[0], last: refs.at(-1), count };
  }

  const existingFirst = root.get(name('First'));
  const existingLast = root.get(name('Last'));
  if (!!existingFirst !== !!existingLast || (existingLast && !(existingLast instanceof PDFRef))) {
    throw Error('The existing PDF outline cannot be extended safely');
  }
  const previous = existingLast && context.lookup(existingLast, PDFDict);
  if (previous?.has(name('Next'))) throw Error('The existing PDF outline has an invalid last entry');
  const added = writeSiblings(nodes, rootRef, existingLast);
  if (previous) previous.set(name('Next'), added.first);
  else root.set(name('First'), added.first);
  root.set(name('Last'), added.last);
  const oldCount = root.lookupMaybe(name('Count'), PDFNumber)?.asNumber() ?? 0;
  root.set(name('Count'), PDFNumber.of(Math.max(0, oldCount) + added.count));
  return pdf.save({ updateFieldAppearances: false });
}
