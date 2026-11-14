import { compactReadingImage } from './vendor/motero/reading-image.mjs';

// This bundle executes in the PDF window, not in the privileged plugin sandbox.
// All PDF.js calls, DOM canvases, options, promises and callbacks stay there.
export function create() {
  const tasks = new Map();
  let closed = false;
  return {
    async extract({ index }) {
      if (closed) throw Error('Reader closed');
      let canvas, phase = 'page';
      try {
        const page = await window.PDFViewerApplication.pdfDocument.getPage(index + 1);
        if (closed) throw Error('Reader closed');
        phase = 'raster';
        const natural = page.getViewport({ scale: 1, rotation: page.rotate });
        const viewport = page.getViewport({ scale: Math.min(1, 640 / Math.max(natural.width, natural.height)), rotation: page.rotate });
        canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const task = page.render({ canvasContext: context, viewport, background: '#ffffff' });
        tasks.set(index, task); await task.promise;
        if (closed) throw Error('Reader closed');
        const image = compactReadingImage(context.getImageData(0, 0, canvas.width, canvas.height));
        phase = 'text';
        const text = await page.getTextContent();
        if (closed) throw Error('Reader closed');
        // Only structured-cloneable data crosses back; never page/DOM objects.
        return { index, image, text, rotation: page.rotate,
          viewport: { width: natural.width, height: natural.height, scale: natural.scale, transform: [...natural.transform] } };
      }
      catch (error) { throw Error(`Auto crop, page ${index + 1}, ${phase}: ${error.message || error}`); }
      finally { tasks.delete(index); if (canvas) canvas.width = canvas.height = 0; }
    },
    destroy() { closed = true; for (const task of tasks.values()) task.cancel(); tasks.clear(); }
  };
}

// Negative page margins must also affect PDF.js's visibility and plain-page
// navigation calculations. Keep full-size text/annotation coordinates intact.
export function installLayout() {
  const viewer = window.PDFViewerApplication.pdfViewer;
  const originalVisible = viewer._getVisiblePages, originalScroll = viewer.scrollPageIntoView;
  let closed = false;
  const active = () => !closed && viewer.viewer.hasAttribute('data-motero-cropping');
  const trims = div => (div.getAttribute('data-motero-crop') || '0 0 0 0').split(' ').map(Number);
  const visible = function () {
    const original = originalVisible.call(viewer);
    if (!active()) return original;
    const c = viewer.container, frame = c.getBoundingClientRect(), views = [], ids = new Set();
    for (const entry of original.views) {
      const page = entry.view, rect = page.div.getBoundingClientRect();
      const [top, right, bottom, left] = trims(page.div);
      const width = rect.width - left - right, height = rect.height - top - bottom;
      const x = rect.left - frame.left + c.scrollLeft, y = rect.top - frame.top + c.scrollTop;
      const minX = Math.max(c.scrollLeft, x + left), maxX = Math.min(c.scrollLeft + c.clientWidth, x + rect.width - right);
      const minY = Math.max(c.scrollTop, y + top), maxY = Math.min(c.scrollTop + c.clientHeight, y + rect.height - bottom);
      if (!(width > 0 && height > 0 && maxX > minX && maxY > minY)) continue;
      views.push({ id: page.id, view: page, x, y,
        percent: Math.min(100, Math.round(100 * (maxX - minX) * (maxY - minY) / (width * height))),
        widthPercent: Math.min(100, Math.round(100 * (maxX - minX) / width)),
        visibleArea: { minX: minX - x, minY: minY - y, maxX: maxX - x, maxY: maxY - y } });
      ids.add(page.id);
    }
    views.sort((a, b) => a.id - b.id);
    const first = views[0], last = views.at(-1);
    views.sort((a, b) => b.percent - a.percent || a.id - b.id);
    return { first, last, views, ids };
  };
  const scroll = function (options) {
    originalScroll.call(viewer, options);
    const dest = options.destArray;
    if (!active() || dest && !(dest[1]?.name === 'XYZ' && dest[2] == null && dest[3] == null)) return;
    const page = viewer.getPageView(options.pageNumber - 1);
    if (!page) return;
    const c = viewer.container, rect = page.div.getBoundingClientRect(), frame = c.getBoundingClientRect();
    const [top, right, , left] = trims(page.div);
    c.scrollTop += rect.top + top - frame.top;
    c.scrollLeft += rect.left + left - frame.left - Math.max(0, (c.clientWidth - (rect.width - left - right)) / 2);
  };
  viewer._getVisiblePages = visible; viewer.scrollPageIntoView = scroll;
  return { destroy() {
    closed = true;
    if (viewer._getVisiblePages === visible) viewer._getVisiblePages = originalVisible;
    if (viewer.scrollPageIntoView === scroll) viewer.scrollPageIntoView = originalScroll;
  } };
}
