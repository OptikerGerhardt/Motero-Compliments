# Verifikation 0.1.0

Stand: 14.11.2026, Linux x86_64.

- `npm test`: **102 bestanden**, 0 fehlgeschlagen/übersprungen. Enthält die
  übernommenen Motero-Regressionstests für Inhaltserkennung, Scans,
  Kopf-/Fußzeilen, Randreferenzen, Fußnoten, lokale Layoutwechsel und
  manuelle Rahmen; zusätzlich Persistenzvalidierung, Lesezeichenidentität,
  Koordinaten, schnelle Klickfolgen und Schreibschutz.
- `npm run build`: installierbares XPI inklusive AGPL-Lizenz, Originalquellen
  und Build-/Testanweisungen.
- `python3 scripts/test-zotero.py <zotero>`: **23 funktionale Prüfungen bestanden**
  mit dem offiziellen Zotero **10.0.8**, in einem neuen temporären Profil,
  eigener Datenbank und synthetischem PDF. Ergebnis: [zotero-10.0.8.json](zotero-10.0.8.json).

Der Desktop-Test installiert das gepackte XPI und prüft Toolbar, automatischen
Zuschnitt, Breitenanpassung und lesbare Textebene. Er erstellt und speichert
native Lesezeichen in der Zotero-Datenbank, schaltet sie über schnelle Klickfolgen
um und prüft Seitenfähnchen, Filterliste, Sprung und Löschen. Der manuelle Editor
wird per Tastatur bedient; sein ungerader Rahmen wird gespeichert. Intrinsische
PDF-Rotation, Benutzerrotation, temporäre Originalansicht und das
Deaktivieren/Reaktivieren des Plugins werden ebenfalls geprüft. Die PDF-Bytes
werden vor und nach dem Ablauf vollständig verglichen und bleiben identisch.

## Noch nicht verifiziert

- Windows, macOS und Zotero 7–9; sie sind im Manifest zugelassen, aber nicht
  durch diesen Linux-/Zotero-10-Test abgedeckt.
- Synchronisierung mit einem echten Zotero-Konto bzw. Motero-Gerät. Die
  Lesezeichen verwenden das bestehende Motero-Format und Zoteros Speicherpfad;
  der Kontosync wurde nicht durchgeführt. Zuschnitte bleiben absichtlich lokal.
- Gleichzeitige Split-Views, Zusammenarbeit mit anderen Crop-Plugins,
  physische Maus-/Touch-Gesten und manuelle visuelle Prüfung. Der Drag-Algorithmus
  hat Regressionstests; der Desktop-Test bedient den Rahmen über die Tastatur.
- Performance sehr großer Bücher und beliebige reale PDF-Layouts. Die Analyse
  ist begrenzt gecacht; automatische Erkennung bleibt eine Heuristik. Bei
  ungewöhnlichen Layouts Originalansicht prüfen oder manuelle Rahmen verwenden.

Die Testumgebung meldet Zertifikatsfehler für Zoteros eigene Proxy-/API-Checks.
Diese wurden nicht umgangen; das Plugin benötigt für die getesteten lokalen
Funktionen keine Netzwerkverbindung. Daraus folgt keine Aussage über
Online-Funktionen des Zotero-Clients in dieser Cloud-Umgebung.
