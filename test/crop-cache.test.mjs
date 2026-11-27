import test from 'node:test';
import assert from 'node:assert/strict';
import { CropCache } from '../src/crop-cache.mjs';

test('measured frames survive reload, are bounded and invalidate when the PDF changes', async () => {
  let stored, mtime = 123;
  globalThis.Zotero = {
    Prefs: { get: () => stored, set: (_key, value) => { stored = value; } },
    getMainWindow: () => ({ setTimeout: () => 1, clearTimeout: () => {} })
  };
  globalThis.IOUtils = { stat: async () => ({ size: 1024, lastModified: mtime }) };
  const attachment = { libraryID: 1, key: 'ABCD1234', getFilePathAsync: async () => '/fixture.pdf' };
  const pdf = { fingerprints: ['fixture-id'], numPages: 256 };
  const bounds = [.1, .2, .9, .8];
  const initial = new CropCache(attachment, pdf);
  await initial.ready;
  for (let index = 0; index < 200; index++) initial.remember(`${index}:false:false`, bounds);
  initial.flush();

  const reopened = new CropCache(attachment, pdf);
  await reopened.ready;
  assert.equal(reopened.frames.size, 128);
  assert.deepEqual(reopened.frames.get('199:false:false'), bounds);
  assert.equal(reopened.frames.has('0:false:false'), false);

  mtime++;
  const edited = new CropCache(attachment, pdf);
  await edited.ready;
  assert.equal(edited.frames.size, 0);
});
