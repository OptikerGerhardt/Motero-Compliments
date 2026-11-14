# Motero Compliments

Ein unabhängiges Plugin für Zotero Desktop: Moteros PDF-Zuschnitt und
Lesezeichen im integrierten Reader. PDF-Dateien bleiben unverändert.

## Installation

`dist/motero-compliments-0.1.0.xpi` in Zotero unter **Werkzeuge → Plugins →
Zahnrad → Plugin aus Datei installieren…** auswählen. Anschließend ein PDF öffnen.

Das Manifest erlaubt Zotero 7–10. Der tatsächliche Desktop-Teststand steht in
[docs/TESTING.md](docs/TESTING.md); andere Plattformen/Versionen sind dadurch
nicht automatisch verifiziert.

## Bedienung

- **Motero** in der PDF-Werkzeugleiste öffnet die Einstellungen und Lesezeichenliste.
- **Automatisch** erkennt Textkörper, Kopf-/Fußzeilen und Marginalien mit Moteros
  Leserlogik, einschließlich Scans und lokaler Layoutanalyse. Die Option
  **Marginalien beibehalten** erhält die seitlichen Randnotizen.
- **Breite / Höhe / Ganze Seite** passt den zugeschnittenen Ausschnitt an.
  **Rand (%)** gibt bei automatischem Zuschnitt zusätzlichen Abstand.
- **Manuellen Rahmen bearbeiten…** zeigt eine Vorschau mit verschiebbarem Rahmen,
  acht Griffen und Prozentfeldern. Pfeiltasten verschieben den fokussierten Rahmen,
  Umschalt vergrößert den Schritt. Der Rahmen gilt für **alle**, **ungerade** oder
  **gerade** PDF-Seiten, unabhängig von gedruckten Seitennummern. Ein neuer
  Alle-Seiten-Rahmen ersetzt die beiden Ausnahmen. Abbrechen verwirft die Bearbeitung.
- **Originalansicht umschalten** zeigt vorübergehend die vollständigen Seiten;
  gespeicherte Rahmen bleiben erhalten. **Zuschnitte zurücksetzen** löscht sie.
- Das **Fähnchen** in der Werkzeugleiste oder oben rechts auf einer PDF-Seite
  setzt bzw. entfernt ein Lesezeichen. Im Motero-Dialog lassen sich Lesezeichen
  filtern, anspringen und löschen. Gewöhnliche schwarze Notizen zählen nicht dazu.

Zuschnitt und Modi werden lokal pro Bibliothek und Anhang gespeichert.
Lesezeichen sind normale Zotero-Notizannotationen mit `Bookmark ·` bzw.
`Lesezeichen ·`, kompatibel mit Motero. Vorhandene Farben bleiben erhalten;
schreibgeschützte Annotationen werden nicht verändert. Zotero übernimmt deren
normale Synchronisierung. Es werden keine PDF-Inhaltsverzeichnisse bearbeitet.

## Entwicklung

Node.js 22+, npm und Python 3. Keine Laufzeit-Abhängigkeiten oder externen Dienste.

```sh
npm ci --cache /tmp/motero-npm-cache --no-audit --no-fund
npm test
npm run build
python3 scripts/test-zotero.py /absoluter/pfad/zu/zotero
```

Der letzte Befehl startet das fertige XPI in einem neuen temporären Profil mit
synthetischem PDF und eigener Datenbank. Persönliche Profile bleiben unberührt.
`dist/` ist generiert und nicht eingecheckt. Automatische Updates sind noch nicht
veröffentlicht (`update.json` enthält keine Releases).

[Recherche und Entscheidungen](docs/RESEARCH.md) ·
[Tests und Grenzen](docs/TESTING.md) · [Urheberhinweise](NOTICE.md) ·
[AGPLv3](COPYING)
