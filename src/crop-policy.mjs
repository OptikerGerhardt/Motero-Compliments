import { getReadingBounds, getReadingMarginalia } from './vendor/motero/reading-layout.mjs';
import { compactReadingImage } from './vendor/motero/reading-image.mjs';

function union(bounds, rects) {
  return rects.reduce((a, b) => a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[2], b[2]), Math.max(a[3], b[3])] : [...b], bounds);
}

export function policyBounds(image, lines, model, index, options, ink = null) {
  const refs = getReadingMarginalia(lines, model, index);
  let pixels = image;
  // Keep ordinary side notes without retaining the independently excluded
  // edition/line-reference column. Do not modify the cached source image.
  if (options.includeMarginalia && !options.includeReferences && refs.length) {
    const compact = compactReadingImage(image);
    pixels = { ...compact, data: compact.data.slice(), red: compact.red?.slice() };
    for (const r of refs) {
      const x0 = Math.max(0, Math.floor(r[0] * pixels.width) - 2);
      const x1 = Math.min(pixels.width, Math.ceil(r[2] * pixels.width) + 2);
      for (let y = Math.max(0, Math.floor(r[1] * pixels.height) - 2);
        y < Math.min(pixels.height, Math.ceil(r[3] * pixels.height) + 2); y++) {
        pixels.data.fill(255, y * pixels.width + x0, y * pixels.width + x1);
        pixels.red?.fill(255, y * pixels.width + x0, y * pixels.width + x1);
      }
    }
  }
  let bounds = getReadingBounds(pixels, lines, model, index, { includeMarginalia: options.includeMarginalia });
  // Crop to Margin's modal-paper detector provides a conservative fallback for
  // text-bearing tinted pages where Motero otherwise sees ink over all paper.
  if ((!bounds || bounds[2] - bounds[0] > .985 && bounds[3] - bounds[1] > .985)
      && ink?.background >= 160 && ink.backgroundShare > .45 && lines.length > 3
      && (options.includeReferences || !refs.length)) {
    const measured = [Math.min(.3, Math.max(0, ink.x0 / image.width - .005)),
      Math.min(.3, Math.max(0, ink.y0 / image.height - .005)),
      Math.max(.7, Math.min(1, ink.x1 / image.width + .005)),
      Math.max(.7, Math.min(1, ink.y1 / image.height + .005))];
    bounds = union(measured, lines.map(line => line.rect));
  }
  if (options.includeReferences && !options.includeMarginalia) bounds = union(bounds, refs);
  return bounds;
}

export function constrainReadingFrame(actual, resolved, references, includeReferences) {
  if (!actual) return resolved;
  if (resolved[2] - resolved[0] > (actual[2] - actual[0]) * 1.25) return actual;
  const result = [...resolved];
  if (!includeReferences) {
    // Stable document widths must not bring excluded reference columns back.
    if (references.some(r => r[2] <= actual[0] + .004)) result[0] = Math.max(result[0], actual[0]);
    if (references.some(r => r[0] >= actual[2] - .004)) result[2] = Math.min(result[2], actual[2]);
  }
  return result;
}
