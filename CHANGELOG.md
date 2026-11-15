# Changelog

## 0.3.0

- Replace crop/fit dropdowns and include/exclude switches with native Appearance segmented buttons, matching fonts and 20×20 line icons.
- Make Original/Automatic/Manual a single synchronized mode, eliminating the conflicting Original view state; prevent broad document profiles from erasing useful automatic body crops.
- Apply pixel crop insets after fitting the current viewport, avoiding stale-scale crops during automatic zoom changes.
- Add independent include/exclude choices for side edition/line references and general marginal notes. Stable profiles cannot reintroduce excluded reference columns.
- Reuse Crop to Margin's MIT ink detector as a conservative fallback for tinted text-bearing pages; retain Motero's semantic analysis and full license attribution.
- Move bookmark filtering to the right-hand sidebar magnifier with an expanding search field; keep the native-sized flag immediately after Outline.
- Enlarge the PDF flag threefold to 42×54 px, retaining 65% saved-marker opacity and hover/focus-only toggling.
- Remove plugin cropping/bookmark entries from the reader context menu; preserve native Reset Zoom, manual frames, desktop preparation and original PDF bytes.
- Verify 118 logic tests, 64 native checks and 13 content-free private-document checks in Zotero 10.0.8 on Linux.

## 0.2.1

- Fix the automatic-analysis permission failure reproduced with the privately supplied PDF: execute PDF.js raster/text extraction in the PDF window and transfer only cloned data. Errors now identify page and analysis stage.
- Prepare up to 12 pages ahead and 6 behind for desktop scrolling, with two analysis jobs, foreground priority and a 64-page pixel cache.
- Make PDF.js visibility/page navigation honor cropped frames while preserving native coordinates.
- Respect native Reset Zoom and manual zoom through page changes and sidebar resizing; never erase manual crop frames.
- Match native Appearance typography and aligned controls; remove the separate bold heading.
- Move the smaller bookmark tab immediately after Outline. Reduce the PDF flag to 14×18 px and increase saved-marker opacity to 65%; keep the toggle hover/focus-only.
- Verify 111 tests, 56 native checks on a 64-page image/soft-mask fixture, and 9 checks on the privately supplied document. No private document or image was published.

## 0.2.0

- Integrate PDF cropping into Zotero's Appearance (Aa) popup; remove the separate
  Motero toolbar and combined settings/bookmark dialog.
- Add an outlined Motero flag tab immediately before Outline in the native
  sidebar, with bookmark filtering, direct page navigation and deletion.
- Pin saved bookmark flags inside the cropped page's upper-right corner with
  25% opacity. Show the toggle affordance on corner hover or keyboard focus only.
  Hide the corresponding sticky-note glyph while preserving ordinary notes,
  annotation coordinates, colors and native storage.
- Handle compartment-owned reader notification arguments without consuming
  those arguments or exposing privileged return values.
- Restore native sidebar selection, note drawing and crop styles on disable;
  adopt existing reader windows when enabled.
- Add a checksum-bound Zotero update feed, reproducible XPI packaging and
  release preparation checks.

## 0.1.0

- Initial desktop implementation of Motero's automatic and manual PDF view
  crops, parity-specific frames, and native bookmark annotations.
- Preserve Motero's reader algorithms, regression tests and AGPL attribution.
