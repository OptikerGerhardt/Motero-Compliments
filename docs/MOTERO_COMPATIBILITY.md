# Motero compatibility contract

## Purpose and source of truth

Motero-Compliments is a complementary **Zotero Desktop** plugin to [Motero Android](https://github.com/OptikerGerhardt/Motero), not an attempt to copy every Android feature. Shared document/annotation semantics, reader behavior and quality controls must remain compatible wherever applicable; native desktop UI and Android hardware-specific functions can differ.

- Upstream Android: `OptikerGerhardt/Motero`, branch `main`.
- Upstream embedded Reader source: `OptikerGerhardt/Motero`, branch `reader`. The Android `reader/` directory is a submodule; inspect the actual submodule pointer when a change concerns a shipped Android build.
- Desktop: `OptikerGerhardt/Motero-Compliments`, branch `main`.
- Desktop vendor logic: `src/vendor/motero/`; regression tests: `test/vendor/`.
- Desktop research and historical source comparison: `docs/RESEARCH.md`.

**Historical references, not current verification:** `docs/RESEARCH.md` lists Motero `7d38abdbe28ef9cedbedf82d8e743775a1c0b756` and Reader `6114aeb26daf02104c9757423183994b31df27e9`. Do not promote these references to a fresh compatibility sign-off without comparing the actual source and tests.

**Keep these states separate:**
1. **Observed:** A monitor has seen a new upstream HEAD SHA. This establishes no behavioral change.
2. **Analyzed:** Relevant diffs/files and possible impact have been inspected.
3. **Verified:** The specific functionality and required tests have been checked on exact commit SHAs, with limitations recorded.

Do not automatically advance a "last verified" baseline when new commits merely appear. Record the last *actually verified* Motero main SHA, Reader SHA, Desktop SHA, tests, date and coverage in an issue/PR or a dated section of this document only after review. Never invent a successful cross-platform test.

## Shared functional contracts

### PDF cropping and content recognition

Check content bounds, running heads, separators, roman/arabic folios, edition/margin references, footnotes, genuine chapter headings, marginal notes, OCR/raster marks, mixed layouts, illustrations, blank/colored pages and false-positive *negative* cases. Preserve the meaning of include/exclude reference and marginalia settings.

Preserve view-only crop: never change PDF bytes or Zotero annotation coordinates to implement a visual crop. Preserve native zoom, reset zoom, rotation, reading/scroll modes, manual all/odd/even frames, cache invalidation, page lifecycle and performance. Motero Android's geometry heuristics and fixtures can inform the desktop implementation; do not transplant Android UI, engine versions or native assumptions blindly.

### Bookmarks and annotation interoperability

Compare the **persisted** Zotero annotation type, semantic marker/title, color semantics, page/position, creation/deletion, syncing, reading-position versus outline distinction and compatibility with existing annotations. Check navigation, searching/filtering, restoration, corners and spread/page assignment. Verify data interoperability independently of UI parity. Desktop bookmark flags and native sidebar may look different from Android; avoid introducing a second incompatible bookmark format.

### Shared controls and settings

Map meaning, defaults, valid ranges, persistence scope (per library/attachment/device), option transitions and invalidation for crop mode, fit, margin options, bookmark preferences and relevant navigation. Distinguish documented platform differences from regressions. Preserve single-source-of-truth state and native Zotero Desktop styling.

### Tests, security and data

For relevant upstream changes:
1. Determine exact Motero main + Reader SHAs and identify relevant commits/files/tests since the last analyzed SHA.
2. Compare semantics and negative regression cases against Desktop logic and fixtures.
3. Port/adapt only relevant tests and fixes; demonstrate failure where possible before changing Desktop implementation.
4. Run `npm test` and `npm run build`; where available run the isolated `scripts/test-zotero.py` test. Distinguish CI, local and hardware/live-sync evidence.
5. Record missing test access, version limits, perf impacts and known unsupported cases explicitly.
6. Preserve AGPL/licensing, third-party notices and privacy: no personal PDFs, extracted private text, annotation content or account data in public commits, CI logs and issues.

## Required PR evidence

If a PR changes cropping, bookmark data/navigation, reader integration or shared settings, its description or review must state:
- Scope and source of change, linked issue/sub-issue.
- Motero main / Reader / Desktop SHA references actually inspected, or explicit reason upstream inspection is inapplicable.
- Shared contract affected, relevant transferred/adapted regression cases and test results.
- Justified platform differences, known risks and limits of verification.
- Whether the change is only an observed upstream difference or actually compatibility-verified.

Do not delay *unrelated* fixes for a global audit. If upstream access fails, document the blocker and restrict claims; do not silently declare parity.

## Ongoing coordination

Tracking issue: [#15](https://github.com/OptikerGerhardt/Motero-Compliments/issues/15). Any worker may triage, implement or repair scoped changes. Another worker independently reviews the affected contracts. Follow [the shared workflow](AGENT_WORKFLOW.md).

The scheduled GitHub Action only **detects and reports HEAD changes**, without reviewing code, creating implementation PRs, updating this verified baseline or merging upstream code.