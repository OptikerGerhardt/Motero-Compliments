export const waive = value => Components.utils.waiveXrays(value);
export const contentData = (win, value) => waive(Components.utils.cloneInto(value, win));

// PDF.js and DOM observers can supply objects owned by another compartment.
// These notifications carry no data into privileged logic: discard ALL args and
// return nothing. The explicit option permits the call, not access to its data.
export function signal(win, callback) {
  return Components.utils.exportFunction(() => { callback(); }, win,
    { allowCrossOriginArguments: true });
}

// Only for the reader-owned annotation drawing hook. The caller already owns
// these arrays/annotations; no new privileged capabilities are exposed.
export function drawingHook(win, callback) {
  return Components.utils.exportFunction(callback, win, { allowCrossOriginArguments: true });
}
