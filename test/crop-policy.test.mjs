import test from 'node:test';
import assert from 'node:assert/strict';
import { policyBounds, constrainReadingFrame } from '../src/crop-policy.mjs';
import { buildReadingModel } from '../src/vendor/motero/reading-layout.mjs';
import { inkBox } from '../src/vendor/crop-to-margin/ink-box.mjs';

const body = [.2, .35, .5].map(y => ({ text: 'A full line of ordinary body text with sufficient width.', rect: [.2, y, .8, y + .02] }));
const reference = { text: 'A 123', rect: [.9, .35, .94, .37], sideCandidate: true };
const note = { text: 'Editor note', rect: [.04, .4, .08, .43] };
function image(lines, paper = 255) {
  const width = 800, height = 1000, data = new Uint8ClampedArray(width * height * 4).fill(paper);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (const { rect: r } of lines) for (let y = Math.floor(r[1] * height); y < r[3] * height; y++) {
    for (let x = Math.floor(r[0] * width); x < r[2] * width; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  return { width, height, data };
}
test('side references and ordinary marginal notes have independent include/exclude policies', () => {
  const lines = [...body, note, reference], pixels = image(lines), model = buildReadingModel([]);
  for (const includeMarginalia of [false, true]) for (const includeReferences of [false, true]) {
    const bounds = policyBounds(pixels, lines, model, 0, { includeMarginalia, includeReferences });
    assert.ok(Math.abs(bounds[0] - (includeMarginalia ? .04 : .2)) < .006, JSON.stringify({ bounds, includeMarginalia, includeReferences }));
    assert.ok(Math.abs(bounds[2] - (includeReferences ? .94 : .8)) < .006, JSON.stringify({ bounds, includeMarginalia, includeReferences }));
  }
});
test('reference masking does not modify the shared cached pixels', () => {
  const lines = [...body, note, reference], pixels = image(lines), before = pixels.data.slice();
  policyBounds(pixels, lines, buildReadingModel([]), 0, { includeMarginalia: true, includeReferences: false });
  assert.deepEqual(pixels.data, before);
});
test('stable document profiles cannot reintroduce excluded side references', () => {
  const actual = [.2, .1, .8, .9], profile = [.15, .1, .85, .9];
  const refs = [[.1, .3, .14, .32], [.86, .5, .9, .52]];
  assert.deepEqual(constrainReadingFrame(actual, profile, refs, false), actual);
  assert.deepEqual(constrainReadingFrame(actual, profile, refs, true), profile);
  assert.deepEqual(constrainReadingFrame(actual, [0, 0, 1, 1], refs, true), actual);
  assert.deepEqual(profile, [.15, .1, .85, .9]);
  assert.deepEqual(constrainReadingFrame(null, profile, [], false), profile);
});
test('blank pages retain the document-profile fallback without an analysis error', () => {
  for (const includeMarginalia of [false, true]) for (const includeReferences of [false, true]) {
    assert.equal(policyBounds(image([]), [], buildReadingModel([]), 0, { includeMarginalia, includeReferences }), null);
  }
});
test('reused Crop to Margin detector measures neutral and tinted paper without counting the background as ink', () => {
  for (const paper of [255, 220]) {
    const pixels = image(body, paper), box = inkBox(pixels);
    assert.equal(box.background, paper); assert.ok(box.backgroundShare > .9);
    assert.deepEqual([box.x0, box.y0, box.x1, box.y1], [160, 200, 640, 520]);
  }
  assert.equal(inkBox(image([])), null);
});
test('Crop to Margin fallback recovers tinted text pages while retaining all text', () => {
  const lines = [...body, { ...body[0], rect: [.2, .65, .8, .67] }];
  const pixels = image(lines, 220), model = buildReadingModel([]);
  const options = { includeMarginalia: false, includeReferences: false };
  assert.deepEqual(policyBounds(pixels, lines, model, 0, options), [0, 0, 1, 1]);
  const bounds = policyBounds(pixels, lines, model, 0, options, inkBox(pixels));
  assert.ok(bounds[0] > .15 && bounds[1] > .15 && bounds[2] < .85 && bounds[3] < .75);
  assert.ok(lines.every(({ rect: r }) => bounds[0] <= r[0] && bounds[1] <= r[1] && bounds[2] >= r[2] && bounds[3] >= r[3]));
});
