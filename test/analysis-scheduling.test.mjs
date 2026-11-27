import assert from 'node:assert/strict';
import test from 'node:test';
import { Analysis } from '../src/pdf.mjs';

test('a blocked global sample does not block framing the requested page', async () => {
  let release;
  const slow = new Promise(resolve => { release = resolve; });
  const renderer = {};
  const calls = [];
  const bounds = [.1, .15, .9, .85];
  const analysis = Object.assign(Object.create(Analysis.prototype), {
    pdf: { numPages: 100 }, renderer, start: () => renderer,
    cache: { ready: Promise.resolve(), frames: new Map() },
    geometry: { bounds: async () => bounds },
    async read(index) {
      calls.push(index);
      if (index !== 49) await slow;
      return { index, lines: [] };
    }
  });
  const options = { includeMarginalia: false, includeReferences: false };
  let eligible = true;
  const profile = analysis.buildProfile(options, () => eligible);
  assert.deepEqual(await analysis.bounds(49, options), bounds);
  assert.deepEqual(calls.slice(1), [49], 'only the requested page is needed for the local frame');
  eligible = false;
  release();
  assert.equal(await profile, null, 'superseded sample batches are discarded');
});
