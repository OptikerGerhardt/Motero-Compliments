// Native-sized 20-unit controls: 1.25-unit strokes and the same optical bounds
// as Zotero's neighbouring 20px icons. Width-fit uses Zotero Reader's artwork.
const WIDTH = 'M17.75 4.25H2.25V15.75H17.75ZM2.25 3C1.55964 3 1 3.55964 1 4.25V15.75C1 16.4404 1.55964 17 2.25 17H17.75C18.4404 17 19 16.4404 19 15.75V4.25C19 3.55964 18.4404 3 17.75 3ZM5.50898 10.625L7.00009 12.1161L6.11621 13L3.11621 10L6.11621 7L7.00009 7.88388L5.50898 9.375H9V10.625ZM11 10.625H14.4911L13 12.1161L13.8839 13L16.8839 10L13.8839 7L13 7.88388L14.4911 9.375H11Z';
export function icon(doc, name) {
  const ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({ width: 20, height: 20, viewBox: '0 0 20 20', 'aria-hidden': true })) svg.setAttribute(key, value);
  const path = (d, fill = 'none', transform) => {
    const node = doc.createElementNS(ns, 'path'); node.setAttribute('d', d); node.setAttribute('fill', fill);
    if (fill === 'none') { node.setAttribute('stroke', 'currentColor'); node.setAttribute('stroke-width', '1.25'); node.setAttribute('stroke-linejoin', 'round'); }
    else node.setAttribute('fill-rule', 'evenodd');
    if (transform) node.setAttribute('transform', transform);
    svg.append(node);
  };
  if (name === 'bookmark') path('M3 2.625h14v14.75L10 13.5l-7 3.875Z');
  else if (name === 'width' || name === 'height') path(WIDTH, 'currentColor', name === 'height' ? 'rotate(90 10 10)' : undefined);
  else if (name === 'automatic') {
    path('M2.625 7V2.625H7M13 2.625h4.375V7M17.375 13v4.375H13M7 17.375H2.625V13');
    path('m10 5 1.4 3.6L15 10l-3.6 1.4L10 15l-1.4-3.6L5 10l3.6-1.4Z');
  }
  else if (name === 'manual') path('M3 3h14v14H3ZM2 2h2v2H2ZM16 2h2v2h-2ZM16 16h2v2h-2ZM2 16h2v2H2Z');
  else if (name === 'page') { path('M5 2.625h10v14.75H5ZM2 6V2h4M14 2h4v4M18 14v4h-4M6 18H2v-4'); }
  else if (name === 'off') path('M4 2.625h12v14.75H4ZM7 6h6M7 9h6M7 12h4');
  else if (name === 'include' || name === 'exclude') {
    path('M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z');
    if (name === 'exclude') path('M3 3l14 14');
  }
  else if (name === 'search') { path('M8.5 2.625a5.875 5.875 0 1 0 0 11.75 5.875 5.875 0 0 0 0-11.75ZM13 13l5 5'); }
  else if (name === 'clear') path('M5 5l10 10M15 5 5 15');
  else throw Error('Unknown reader icon: ' + name);
  return svg;
}
