import { policyBounds } from './crop-policy.mjs';
import { compactReadingImage } from './vendor/motero/reading-image.mjs';
import { inkBox } from './vendor/crop-to-margin/ink-box.mjs';

export class Geometry {
  constructor() {
    this.pending = new Map();
    this.sequence = 0;
    this.local = new Map();
    this.ready = new Promise(resolve => {
      const win = Zotero.getMainWindow();
      // Gecko cannot start a Worker directly from the add-on's jar:file URI.
      // The Blob contains only the static worker bundled with this XPI.
      let url;
      const release = () => {
        if (url) win.URL.revokeObjectURL(url);
        url = null;
      };
      try {
        url = win.URL.createObjectURL(new win.Blob([MOTERO_WORKER_SOURCE], { type: 'text/javascript' }));
        this.worker = new win.Worker(url);
        this.worker.onmessage = ({ data }) => {
          if (data.ready) {
            win.clearTimeout(timer);
            release();
            this.started = true;
            resolve(true);
            return;
          }
          const job = this.pending.get(data.id);
          if (!job) return;
          this.pending.delete(data.id);
          if (data.error) job.reject(Error(data.error)); else job.resolve(data.result);
        };
      }
      catch {
        release();
        resolve(false);
        return;
      }
      const fail = () => {
        win.clearTimeout(timer);
        release();
        if (this.started) this.crashed = true;
        this.closeWorker();
        resolve(false);
      };
      const timer = win.setTimeout(fail, 2000);
      this.worker.onerror = event => { event.preventDefault(); fail(); };
      this.worker.onmessageerror = fail;
      this.cancelStart = fail;
    });
  }
  send(operation, data, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, operation, ...data }, transfer);
      }
      catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async store(index, pixels) {
    await this.ready;
    if (this.closed || this.crashed) throw Error('Analysis worker stopped');
    if (this.worker) return this.send('store', { index, pixels }, [pixels.data.buffer]);
    this.local.set(index, { image: compactReadingImage(pixels), ink: inkBox(pixels) });
  }
  async bounds(index, lines, model, options) {
    if (this.closed || this.crashed) throw Error('Analysis worker stopped');
    if (this.worker) return this.send('bounds', { index, lines, model, options });
    const { image, ink } = this.local.get(index) || {};
    return policyBounds(image, lines, model, index, options, ink);
  }
  forget(index) {
    this.local.delete(index);
    this.worker?.postMessage({ operation: 'forget', index });
  }
  closeWorker() {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.pending.values()) job.reject(Error('Analysis worker stopped'));
    this.pending.clear();
  }
  destroy() {
    this.closed = true;
    this.cancelStart?.();
    this.closeWorker();
    this.local.clear();
  }
}
