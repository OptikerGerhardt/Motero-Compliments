import { isReaderBookmark } from './core.mjs';

const title = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
export const MAX_OUTLINE_ENTRIES = 2000;

export function outlineEntries(annotations, rule, pages) {
  const tag = rule.tag?.trim().normalize();
  const prefix = title(rule.prefix);
  return Array.from(annotations).filter(annotation => {
    if (rule.type && (rule.type === 'bookmark' ? !isReaderBookmark(annotation) : annotation.type !== rule.type)) return false;
    if (rule.color && annotation.color?.toLowerCase() !== rule.color.toLowerCase()) return false;
    return !tag || annotation.tags?.some(value => value.name?.trim().normalize() === tag);
  }).map(annotation => {
    const position = annotation.position;
    const text = rule.title === 'tag' ? annotation.tags?.[0]?.name : annotation[rule.title];
    let label = title(text);
    if (rule.title === 'page') label = title(annotation.pageLabel) || String((position?.pageIndex ?? 0) + 1);
    if (!label) return null;
    const points = position?.paths?.flatMap(path => {
      const result = [];
      for (let index = 0; index + 1 < path.length; index += 2) {
        result.push([path[index], path[index + 1], path[index], path[index + 1]]);
      }
      return result;
    });
    const rects = (position?.rects || points || []).filter(rect => rect.length >= 4 && rect.slice(0, 4).every(Number.isFinite));
    return {
      title: [prefix, label].filter(Boolean).join(' '),
      pageIndex: position?.pageIndex,
      level: rule.level,
      x: rects.length ? rects.reduce((left, rect) => Math.min(left, rect[0], rect[2]), Infinity) : null,
      y: rects.length ? rects.reduce((top, rect) => Math.max(top, rect[1], rect[3]), -Infinity) : null
    };
  }).filter(item => item && validOutlineEntry(item, pages))
    .sort((a, b) => a.pageIndex - b.pageIndex || (b.y ?? -Infinity) - (a.y ?? -Infinity));
}

export function validOutlineEntry(entry, pages) {
  return !!title(entry.title) && Number.isInteger(entry.pageIndex) && entry.pageIndex >= 0 && entry.pageIndex < pages
    && Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 6
    && (entry.x == null || Number.isFinite(entry.x)) && (entry.y == null || Number.isFinite(entry.y));
}

export function outlineTree(entries, pages) {
  if (!entries.length || entries.length > MAX_OUTLINE_ENTRIES || !entries.every(entry => validOutlineEntry(entry, pages))) {
    throw Error('Invalid or empty outline');
  }
  const root = { children: [] };
  const parents = [root];
  for (const entry of entries) {
    // Keep skipped heading levels relative to the nearest existing parent.
    const depth = Math.min(entry.level, parents.length);
    parents.length = depth;
    const node = { ...entry, title: title(entry.title), children: [] };
    parents[depth - 1].children.push(node);
    parents.push(node);
  }
  return root.children;
}

export function detectHeadings(lines, pageIndex, viewport) {
  const bodyHeights = lines.filter(line => !line.vertical && line.text.length > 25)
    .map(line => line.rect[3] - line.rect[1]).sort((a, b) => a - b);
  if (bodyHeights.length < 6) return [];
  const normal = bodyHeights[Math.floor(bodyHeights.length / 2)];
  if (normal <= 0) return [];
  return lines.filter(line => !line.vertical && line.text.length >= 3 && line.text.length <= 100
      && line.rect[1] >= .06 && line.rect[3] < .88 && line.rect[3] - line.rect[1] >= normal * 1.38)
    .map(line => {
      const [x, y] = viewport.convertToPdfPoint(line.rect[0] * viewport.width, line.rect[1] * viewport.height);
      const height = line.rect[3] - line.rect[1];
      return { title: title(line.text), pageIndex, x, y, level: height >= normal * 1.8 ? 1 : 2 };
    });
}
