import { normalizeCrops, validCrop, cropForPage } from './vendor/motero/manual-crop.mjs';
import { isReaderBookmark } from './vendor/motero/reader-bookmark.mjs';
export { isReaderBookmark, cropForPage };
export const defaults = Object.freeze({ mode: 'off', fit: 'width', margin: 0.01,
  includeMarginalia: false, crops: {} });
export function settings(value) {
  if (!value || typeof value !== 'object') value = {};
  return {
    mode: ['off', 'automatic', 'manual'].includes(value.mode) ? value.mode : 'off',
    fit: ['width', 'height', 'page'].includes(value.fit) ? value.fit : 'width',
    margin: Number.isFinite(value.margin) ? Math.max(0, Math.min(.15, value.margin)) : .01,
    includeMarginalia: value.includeMarginalia === true,
    crops: normalizeCrops(value.crops)
  };
}
export function preferenceKey(item) {
  if (!Number.isInteger(item?.libraryID) || !/^[A-Z0-9]{8}$/.test(item?.key || '')) {
    throw new Error('A saved Zotero attachment is required');
  }
  return `extensions.moteroCompliments.crop.${item.libraryID}.${item.key}`;
}
export function pageBookmarks(annotations, index) {
  return annotations.filter(a => isReaderBookmark(a) && a.position?.pageIndex === index);
}
export function paddedBounds(bounds, margin) {
  if (!validCrop(bounds)) return [0, 0, 1, 1];
  return [Math.max(0, bounds[0] - margin), Math.max(0, bounds[1] - margin),
    Math.min(1, bounds[2] + margin), Math.min(1, bounds[3] + margin)];
}
export function bookmarkAnnotation(viewport, pageIndex, bounds, pageLabel, date, de = false) {
  const [x0, y0, x1, y1] = bounds;
  const size = Math.min(22, (x1 - x0) * viewport.width, (y1 - y0) * viewport.height);
  const right = Math.max(x0 * viewport.width + size, x1 * viewport.width - 8);
  const top = Math.min(y0 * viewport.height + 4, y1 * viewport.height - size);
  const a = viewport.convertToPdfPoint(right - size, top);
  const b = viewport.convertToPdfPoint(right, top + size);
  return { type: 'note', color: '#000000',
    comment: `${de ? 'Lesezeichen' : 'Bookmark'} · ${date}`, pageLabel,
    sortIndex: `${String(pageIndex).padStart(5, '0')}|000000|${String(Math.max(0, Math.floor(top))).padStart(5, '0')}`,
    position: { pageIndex, rects: [[Math.min(a[0], b[0]), Math.min(a[1], b[1]),
      Math.max(a[0], b[0]), Math.max(a[1], b[1])]] } };
}
// Serialize rapid clicks; split views share one ReaderState.
export class SerialQueue {
  tail = Promise.resolve();
  run(fn) {
    const result = this.tail.catch(() => {}).then(fn);
    this.tail = result;
    return result;
  }
}
