# Recherche und Architektur

Stand: 14.11.2026. Referenz: Motero main
`7d38abdbe28ef9cedbedf82d8e743775a1c0b756`, Reader
`6114aeb26daf02104c9757423183994b31df27e9`.

| Quelle | Ergebnis / Verwendung |
| --- | --- |
| [Motero](https://github.com/OptikerGerhardt/Motero), Reader-Branch | Originale Erkennungs-, Layout-, Bild-, Rahmen- und Lesezeichenlogik samt Regressionstests unter `src/vendor/motero/` und `test/vendor/`. Keine Android-UI oder PDF.js-Version übernommen. |
| [Crop to Margin](https://github.com/waelitani/crop-to-margin) | Existierender Desktop-Ansatz: Seiten clippen und unsichtbare Ränder aus dem Layout nehmen; PDF-/Annotationskoordinaten erhalten. Cross-compartment-Zugriff und Split-Views berücksichtigt. Implementierung hier eigenständig. |
| [Zotero PDF Auto Crop](https://github.com/gjjisadog/zotero-pdf-auto-crop) | Alternative mit CropBox-Änderung der Datei, Sicherheitsabstand, Rotation und Schutz vor Dateikonflikten. Für Moteros lokale Ansicht nicht verwendet. Verweist auf die unabhängige Arbeit [pdfCropMargins](https://github.com/abarker/pdfCropMargins). |
| [Desktop-Cropping im Forum](https://forums.zotero.org/discussion/105583/feature-suggestion-pdf-cropping-on-mac-desktops) | Wunsch nach Skim-artigem, nicht destruktivem Zuschnitt; bestätigt die Trennung von Datei und Ansicht. |
| [Lesezeichen-Diskussion](https://forums.zotero.org/discussion/comment/509959#Comment_509959) | Unterscheidet Lesepositionen von PDF-Outlines. Annotationen ermöglichen native Speicherung; Hinweise auf Farb-/Tag-Lösungen und problematische Einzeltasten-Shortcuts beim Kommentieren. Deshalb semantischer Motero-Marker, explizite Schaltflächen und eigene Filterliste. |
| [Actions & Tags, Diskussion 586](https://github.com/windingwind/zotero-actions-tags/discussions/586), [Reading Flow](https://github.com/Moonweave-Research/zotero-reading-flow) | Bereits existierende Lesezeichen-/Lesepositionsansätze gefunden. Nicht übernommen: Motero-kompatible Annotationen statt eines zweiten Lesezeichenformats. |
| [Zotero Reader PR 261](https://github.com/zotero/reader/pull/261) | Verwandte Arbeit zum Spalten-Anpassen per Doppeltipp. Kein Ersatz für persistente manuelle Rahmen und Lesezeichen; hier keine Spalten-/SmartScroll-Funktion. Die PR-Suche nach Bookmark ergab keinen passenden Reader-PR. |
| [Offizielles Pluginbeispiel](https://github.com/zotero/make-it-red), [Reader-Anbindung](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/reader.js) | Bootstrap-Lebenszyklus, Reader-Ereignisse, native Annotationsspeicherung und Cleanup. |

`plugin.mjs` verbindet Zotero mit Reader-Zuständen; `pdf.mjs` analysiert begrenzt
und rendert Ansichtszuschnitte; `ui.mjs` enthält Dialoge und Rahmeneditor;
`core.mjs` validiert gespeicherte Daten und erzeugt Lesezeichen. Fremde Texte werden
nur über `textContent` angezeigt. Es gibt keine Telemetrie oder Netzwerkzugriffe
im Plugin; lediglich Zoteros normale Plugin-Updateprüfung auf die Manifest-URL.

Die private Reader-/PDF.js-Anbindung ist versionsabhängig. Bei einem Analysefehler
wird nicht bei jedem Scrollen erneut analysiert; eine Einstellungsänderung erlaubt
einen neuen Versuch. Dateien werden nie geschrieben. Deaktivieren entfernt
Ereignislistener, Beobachter, Dialoge und Ansichtsänderungen.

## Native UI and permission regression (0.2.0)

- [MDN: exportFunction](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts/exportFunction)
  documents that foreign-owned callback arguments are rejected by default.
  Reader/observer notifications now explicitly permit the call but discard all
  supplied arguments and expose no return value. No TLS or PDF security setting
  is changed. A real Firefox/Zotero compartment test covers both old and new paths.
- [Jasminum issue 396](https://github.com/l0o0/jasminum/issues/396) reports a custom
  bookmark tab breaking the return to native Outline and missing during reader
  restoration. Our tab owns only its additional panel and visibility class;
  native pane selection/data are retained. Repeated Outline switching and
  enable/disable restoration are explicit native regressions.
- [Zotero-Neo issue 133](https://github.com/zhongyangchuwu/Zotero-Neo/issues/133)
  similarly calls for enhancing native navigation rather than another overlay.
- Appearance controls reuse native popup groups, switches and theme colors.
  Sidebar flags use Motero's original silhouette as line art; PDF markers use
  the original filled silhouette at 25% opacity. A per-page drawing adapter hides
  only Motero's sticky-note glyph and is removed on disable. Annotation records,
  coordinates, ordinary notes and stored PDF bytes are not rewritten.

## Automatic extraction and desktop flow (0.2.1)

The supplied private document reproduces the remaining 0.2.0 failure, unlike the
initial synthetic fixture. PDF.js raster/text extraction now runs entirely in
its PDF-window realm (`content-analysis.mjs`); only a structured-cloned snapshot
crosses to the plugin for Motero's geometry analysis. Page, viewport and DOM
objects no longer cross this analysis boundary. The private document is not
part of the repository or any published artifact.

The native reset command delegates to `zoomReset()`/`zoomPageWidth()` in Zotero
Reader. External scale changes now relinquish automatic fitting until an explicit
crop-setting change, so background preparation cannot undo native zoom. The
cropped visibility/page-jump adapter follows the same coordinate-plane separation
as Motero's `cropped-page-layout.mjs`, but runs in the PDF realm. A longer fixture
caught navigation instability that the original six-page test missed.

Desktop preparation uses 12 forward/6 backward pages, two rendering slots,
foreground promotion and an LRU of 64 compact pixel snapshots. Look-ahead work
is replaced as navigation changes and is discarded after settings generations
change. Native UI font values come from an existing Appearance label; native
select wrappers and switch classes supply the controls' styling.
