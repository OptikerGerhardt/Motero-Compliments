import test from 'node:test';
import assert from 'node:assert/strict';
import { signal } from '../src/bridge.mjs';
import { releaseUpdate } from '../scripts/prepare-release.mjs';

test('notification bridge explicitly permits foreign-owned args but never reads, forwards or returns them', () => {
  const target = {}, captures = [];
  globalThis.Components = { utils: { exportFunction(fn, win, options) { captures.push({ win, options }); return fn; } } };
  const called = [];
  const callback = signal(target, (...args) => { called.push(args); return { secret: 'not returned' }; });
  const hostile = new Proxy({}, { get() { throw Error('Argument must not be inspected'); } });
  assert.equal(callback(hostile, hostile), undefined);
  assert.deepEqual(called, [[]]);
  assert.deepEqual(captures, [{ win: target, options: { allowCrossOriginArguments: true } }]);
});
test('update feed binds the release version, exact artifact bytes and supported Zotero versions', () => {
  const manifest = { version: '0.2.0', applications: { zotero: { strict_min_version: '7.0', strict_max_version: '10.*' } } };
  const update = releaseUpdate(manifest, Buffer.from('fixture'));
  assert.match(update.update_link, /\/v0\.2\.0\/motero-compliments-0\.2\.0\.xpi$/);
  assert.match(update.update_hash, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(update.update_hash, releaseUpdate(manifest, Buffer.from('different')).update_hash);
  assert.deepEqual(update.applications.zotero, manifest.applications.zotero);
  assert.throws(() => releaseUpdate({ ...manifest, version: 'unversioned' }, Buffer.from('x')));
});
