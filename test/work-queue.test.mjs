import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkQueue, preparationPages } from '../src/work-queue.mjs';

test('desktop preparation covers twelve pages ahead and six behind without leaving the document', () => {
  assert.deepEqual(preparationPages(10, 64), [...Array.from({ length: 12 }, (_, i) => 11 + i), 9, 8, 7, 6, 5, 4]);
  assert.deepEqual(preparationPages(1, 4, -1), [0, 2, 3]);
  assert.deepEqual(preparationPages(0, 1), []);
});
test('visible work overtakes queued background jobs; concurrency is bounded', async () => {
  const queue = new WorkQueue(1), order = [];
  let release;
  const active = queue.run('active', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const background = queue.run('ahead', () => order.push('ahead'), true);
  const foreground = queue.run('visible', () => order.push('visible'));
  release(); await Promise.all([active, background, foreground]);
  assert.deepEqual(order, ['visible', 'ahead']);
  assert.equal(queue.active, 0);
});
test('foreground requests promote an already queued background page instead of rendering twice', async () => {
  const queue = new WorkQueue(1), order = [];
  let release;
  const active = queue.run('active', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const other = queue.run('other', () => order.push('other'), true);
  const original = queue.run('same', () => order.push('same'), true);
  assert.equal(queue.run('same', () => { throw Error('Must not render twice'); }), original);
  release(); await Promise.all([active, other, original]);
  assert.deepEqual(order, ['same', 'other']);
});
test('failed analysis releases its slot and allows a diagnosed retry', async () => {
  const queue = new WorkQueue(2);
  await assert.rejects(queue.run(1, () => { throw Error('render failed'); }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await queue.run(1, () => 'recovered'), 'recovered');
});
