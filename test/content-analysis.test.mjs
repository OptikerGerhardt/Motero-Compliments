import test from 'node:test';
import assert from 'node:assert/strict';
import { create } from '../src/content-analysis.mjs';

function setup({ rasterError, textError } = {}) {
  const canvas = { width: 0, height: 0, getContext() { return {
    getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) })
  }; } };
  const viewport = { width: 2, height: 2, scale: 1, transform: [1, 0, 0, -1, 0, 2] };
  const page = { rotate: 0, getViewport: () => viewport,
    render: () => ({ promise: rasterError ? Promise.reject(Error(rasterError)) : Promise.resolve(), cancel() {} }),
    getTextContent: async () => { if (textError) throw Error(textError); return { items: [], styles: {} }; }
  };
  globalThis.document = { createElement: () => canvas };
  globalThis.window = { PDFViewerApplication: { pdfDocument: { getPage: async () => page } } };
  return { canvas, page };
}
test('content extraction returns cloneable data and frees its offscreen canvas', async () => {
  const { canvas, page } = setup();
  const renderer = create(), result = await renderer.extract({ index: 3 });
  assert.doesNotThrow(() => structuredClone(result));
  assert.equal(result.index, 3); assert.equal(result.image.channels, 1);
  assert.equal(result.image.data.length, 4); assert.notEqual(result.viewport, page.getViewport());
  assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
  renderer.destroy(); await assert.rejects(renderer.extract({ index: 0 }), /Reader closed/);
});
test('automatic raster failures identify the page and actual failing stage', async () => {
  const { canvas } = setup({ rasterError: 'Permission denied to pass object to privileged code' });
  await assert.rejects(create().extract({ index: 302 }), /Auto crop, page 303, raster: Permission denied/);
  assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
});
test('text extraction failures retain a distinct diagnostic instead of a generic toast', async () => {
  const { canvas } = setup({ textError: 'Permission denied to pass object to privileged code' });
  await assert.rejects(create().extract({ index: 17 }), /Auto crop, page 18, text: Permission denied/);
  assert.equal(canvas.width, 0);
});

test('only plain text uses the fast path; painted and unknown operators keep pixels', async () => {
  const { page, canvas } = setup();
  page.getViewport = () => ({ width: 200, height: 250, scale: 1, transform: [1, 0, 0, -1, 0, 250] });
  page.getTextContent = async () => ({
    items: Array.from({ length: 8 }, (_, index) => ({
      str: 'Synthetic text long enough to represent a body paragraph.',
      transform: [10, 0, 0, 10, 25, 170 - 13 * index], width: 145, height: 10
    })),
    styles: {}
  });
  window.pdfjsLib = { OPS: { showText: 44, setTextRenderingMode: 38, paintImageXObject: 85 } };
  let renders = 0;
  page.render = () => { renders++; return { promise: Promise.resolve(), cancel() {} }; };
  const renderer = create();
  page.getOperatorList = async () => ({ fnArray: [44], argsArray: [[]] });
  const text = await renderer.extract({ index: 0, optimized: true });
  assert.equal(text.textOnly, true);
  assert.equal(renders, 0);
  for (const [op, arg] of [[85, 0], [38, 3], [999, 0]]) {
    page.getOperatorList = async () => ({ fnArray: [op], argsArray: [[arg]] });
    const raster = await renderer.extract({ index: 1, optimized: true });
    assert.ok(raster.pixels);
  }
  assert.equal(renders, 3);
  assert.equal(canvas.width, 0);
});
