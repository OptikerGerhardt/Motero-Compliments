import { validCrop } from './vendor/motero/manual-crop.mjs';

const PREF = 'extensions.moteroCompliments.measuredFrames.v1';
const MAX_DOCUMENTS = 8;
const MAX_FRAMES = 128;

function loadAll() {
  try {
    const value = JSON.parse(Zotero.Prefs.get(PREF, true) || '[]');
    return Array.isArray(value) ? value.slice(-MAX_DOCUMENTS) : [];
  }
  catch {
    return [];
  }
}

// Cache only numeric rectangles. PDF identity and file stat prevent reuse
// after an attachment is replaced or edited. Failure leaves the live path intact.
export class CropCache {
  constructor(attachment, pdf) {
    this.frames = new Map();
    this.changed = new Map();
    this.ready = this.open(attachment, pdf).catch(() => {});
  }
  async open(attachment, pdf) {
    const fingerprint = pdf.fingerprints?.[0];
    if (!fingerprint) return;
    const path = await attachment.getFilePathAsync();
    if (!path) return;
    const { size, lastModified } = await IOUtils.stat(path);
    if (!Number.isFinite(size) || !Number.isFinite(lastModified)) return;
    this.id = [attachment.libraryID, attachment.key, fingerprint, pdf.numPages, size, lastModified].join(':');
    const saved = loadAll().find(entry => entry?.id === this.id);
    if (Array.isArray(saved?.frames)) {
      for (const entry of saved.frames.slice(-MAX_FRAMES)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && validCrop(entry[1])) this.frames.set(...entry);
      }
    }
  }
  remember(key, bounds) {
    if (!this.id || !validCrop(bounds)) return;
    this.frames.set(key, bounds);
    this.changed.set(key, bounds);
    if (this.frames.size > MAX_FRAMES) this.frames.delete(this.frames.keys().next().value);
    if (this.changed.size > MAX_FRAMES) this.changed.delete(this.changed.keys().next().value);
    const win = Zotero.getMainWindow();
    win.clearTimeout(this.timer);
    this.timer = win.setTimeout(() => this.flush(), 1200);
  }
  flush() {
    if (!this.changed.size) return;
    try {
      const documents = loadAll();
      const saved = documents.find(entry => entry?.id === this.id);
      const frames = new Map(Array.isArray(saved?.frames) ? saved.frames.filter(Array.isArray) : []);
      for (const [key, bounds] of this.changed) {
        frames.delete(key);
        frames.set(key, bounds);
      }
      const updated = [...documents.filter(entry => entry?.id !== this.id), {
        id: this.id, frames: [...frames].slice(-MAX_FRAMES)
      }].slice(-MAX_DOCUMENTS);
      Zotero.Prefs.set(PREF, JSON.stringify(updated), true);
    }
    catch {
      // A bad or unwritable cache must not interrupt the reader.
    }
    this.changed.clear();
  }
}
