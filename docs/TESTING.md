# Verifikation 0.2.1

14.11.2026, Linux x86_64, offizielles Zotero 10.0.8.

- **111 Logiktests bestanden**, keine fehlgeschlagenen oder übersprungenen Tests.
  Enthält Motero-Regressionen, Schreibschutz, native Koordinaten, Prioritätsqueue,
  begrenzte Vorverarbeitung und Diagnostik bei Raster-/Textanalysefehlern.
- **56 native Funktionstests bestanden** mit 64 synthetischen PDF-Seiten,
  eingebetteten Farbbildern und Softmasken. [Bericht](zotero-0.2.1-linux.json).
- **9 Prüfungen mit der privat bereitgestellten PDF bestanden.** Die unveränderte
  veröffentlichte 0.2.0 scheiterte beim automatischen Zuschnitt mit exakt
  `Permission denied to pass object to privileged code`. 0.2.1 besteht den
  Vergleich bei automatischem Zuschnitt, Breite/Höhe/Ganzseite, Marginalien/Rand,
  schnellem Seitenwechsel und Reset Zoom. Die PDF-Bytes bleiben identisch.
  [Inhaltsfreier Vorher-/Nachher-Nachweis](private-document-regression-0.2.1.json).

Die automatische Raster-/Textanalyse läuft im PDF-Fenster und gibt nur geklonte
Daten an das Plugin zurück. Das native Langdokument-Szenario prüft Vorverarbeitung
über mindestens zwölf zusätzliche Seiten, den 64-Seiten-Cache, schnelle Navigation
während der Vorbereitung und den Vorrang von Benutzerzoom. Reset Zoom wird auch
nach Speicherung eines manuellen Rahmens geprüft: Maßstab und Rahmen bleiben
unverändert erhalten. Sichtbarkeit und Seitensprünge berücksichtigen die sichtbaren
Zuschnitte, ohne PDF- oder Annotationskoordinaten umzuschreiben.

Weitere native Prüfungen: exakt gleiche Schrift wie Zoteros Labels, ausgerichtete
Appearance-Zeilen, kleiner Fähnchen-Tab rechts neben Outline, 65% Deckkraft,
14×18-Pixel-PDF-Flagge, Hover-/Fokus-Sichtbarkeit, native Notizen, Filter/Sprung/
Löschen, wiederholte Outline-Wechsel, manuelle Rahmen, Rotation, Abbrechen,
Originalansicht und Wiederherstellung beim Deaktivieren/Reaktivieren.

![Native Oberfläche; ausschließlich synthetisches Test-PDF](screenshots/native-reader-0.2.1.png)

Der Screenshot wurde aus dem echten Zotero-Reader erzeugt und visuell geprüft.
Von der privat bereitgestellten PDF wurden keine Screenshots angefertigt und
weder Datei, Text, Bilder noch Titel in das Repository übernommen.

## Grenzen

Windows/macOS, Zotero 7–9, andere Crop-Plugins und gleichzeitige Split-Views sind
nicht durch diese Tests abgedeckt. Konto-/Gerätesynchronisierung wurde nicht
getestet. Maus-/Touch-Hardware wurde nicht bedient; Rahmenalgorithmus,
Tastatur/Prozentfelder und berechnete Hover-Zustände wurden geprüft. Tests großer
Dateien ersetzen keine Prüfung beliebiger PDF-Layouts.

Alle nativen Prüfungen verwenden neue temporäre Profile und eigene Datenbanken.
Vorhandene System-Proxy-CAs werden ausschließlich in diese Testprofile importiert;
TLS-Prüfung bleibt aktiv. Persönliche Zotero-Profile bleiben unberührt.

## Frühere Versionen

Die Berichte zu [0.2.0](zotero-10.0.8.json) und zum öffentlichen
[0.1.0→0.2.0-Update](zotero-upgrade-0.1.0-to-0.2.0.json) bleiben für die Historie erhalten.
