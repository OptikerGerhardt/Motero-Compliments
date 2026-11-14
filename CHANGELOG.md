# Changelog

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
