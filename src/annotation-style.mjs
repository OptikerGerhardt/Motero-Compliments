import { isReaderBookmark } from './core.mjs';
import { contentData } from './bridge.mjs';

const hexColor = /^#[\da-f]{6}$/i;
const annotationTags = annotation => Array.from(annotation?.tags || []).filter(tag => typeof tag.name === 'string' && tag.name.trim());
let copied;

export function readAnnotationStyle(annotation) {
  if (!annotation || !hexColor.test(annotation.color)) return null;
  return { type: annotation.type, color: annotation.color, tags: annotationTags(annotation).map(tag => tag.name) };
}

export function stylePatch(annotation, style) {
  if (!annotation?.id || annotation.readOnly || !style || !hexColor.test(style.color)) return null;
  const tags = annotationTags(annotation).map(tag => ({ ...tag }));
  const names = new Set(tags.map(tag => tag.name.trim().normalize()));
  const patch = { id: annotation.id };
  if (!isReaderBookmark(annotation)) patch.color = style.color;
  for (const value of style.tags) {
    if (typeof value !== 'string') continue;
    const name = value.trim().normalize();
    if (!name || names.has(name)) continue;
    tags.push({ name });
    names.add(name);
    patch.tags = tags;
  }
  return patch.color || patch.tags ? patch : null;
}

function selected(state, ids) {
  const keys = new Set(ids || state.internal._state.selectedAnnotationIDs || []);
  return Array.from(state.annotations()).filter(annotation => keys.has(annotation.id));
}

function captureAnnotationCopy(state, event) {
  if (event.target?.closest?.('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
  const textSelection = event.target?.ownerDocument?.getSelection?.();
  if (textSelection && !textSelection.isCollapsed) return;
  const annotations = selected(state);
  if (annotations.length === 1) copied = readAnnotationStyle(annotations[0]);
}

export function attachAnnotationCopy(state, doc) {
  const listener = event => captureAnnotationCopy(state, event);
  doc.addEventListener('copy', listener, true);
  const keyboard = event => {
    if (!event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'c') {
      listener(event);
    }
  };
  doc.defaultView.addEventListener('keydown', keyboard, true);
  return () => {
    doc.removeEventListener('copy', listener, true);
    doc.defaultView.removeEventListener('keydown', keyboard, true);
  };
}

export function annotationStyleMenu(state, params, append) {
  const ids = Array.from(params.ids || []);
  const annotations = selected(state, ids);
  const canCopy = annotations.length === 1 && readAnnotationStyle(annotations[0]);
  if (canCopy) append({
    label: state.t('Anmerkungsstil kopieren', 'Copy annotation style'),
    onCommand: () => {
      const source = selected(state, ids)[0];
      if (source) copied = readAnnotationStyle(source);
    }
  });
  if (copied && state.canEdit() && annotations.some(annotation => !annotation.readOnly)) append({
    label: state.t('Farbe und Tags übernehmen', 'Paste annotation color and tags'),
    onCommand: () => {
      if (!state.canEdit()) return;
      const patches = selected(state, ids).map(annotation => stylePatch(annotation, copied)).filter(Boolean);
      if (patches.length) state.internal._annotationManager.updateAnnotations(contentData(state.reader._iframeWindow, patches));
    }
  });
}

export function clearAnnotationStyle() { copied = null; }
