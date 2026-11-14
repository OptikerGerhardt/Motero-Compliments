export class WorkQueue {
  constructor(limit = 2) { this.limit = limit; this.active = 0; this.jobs = new Map(); this.pending = []; }
  run(key, work, background = false) {
    const existing = this.jobs.get(key);
    if (existing) { if (!background) existing.background = false; return existing.promise; }
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const job = { key, work, background, promise, resolve, reject };
    this.jobs.set(key, job); this.pending.push(job); this.drain(); return promise;
  }
  drain() {
    while (this.active < this.limit && this.pending.length) {
      const foreground = this.pending.findIndex(job => !job.background);
      const [job] = this.pending.splice(foreground < 0 ? 0 : foreground, 1);
      this.active++;
      Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => {
        this.jobs.delete(job.key); this.active--; this.drain();
      });
    }
  }
}

// Prefer the scrolling direction; keep some ready pages behind it as well.
export function preparationPages(index, count, direction = 1, ahead = 12, behind = 6) {
  const pages = [];
  for (let distance = 1; distance <= ahead; distance++) {
    const next = index + direction * distance;
    if (next >= 0 && next < count) pages.push(next);
  }
  for (let distance = 1; distance <= behind; distance++) {
    const next = index - direction * distance;
    if (next >= 0 && next < count) pages.push(next);
  }
  return pages;
}
