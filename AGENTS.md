# Arbeitsregeln

Korrektheit, Codequalität und ausreichende Tests haben Vorrang vor Tokenersparnis.

- Antworte knapp; vermeide Einleitungen, Wiederholungen, lange Fortschrittsberichte und ausführliche Zusammenfassungen.
- Suche gezielt nach relevanten Dateien; lies keine vollständigen Verzeichnisbäume.
- Recherchiere vor Lösungen gezielt auf GitHub, im Zotero-Forum und geeigneten Quellen nach bestehenden PRs, Plugins und unabhängigen Implementierungen; berücksichtige auch Vorschläge und Fehlerberichte.
- Begrenze Dateiausgaben, Logs und Suchergebnisse auf relevante Ausschnitte.
- Wiederhole erfolglose Befehle nur bei neuer Erkenntnis; vermeide unnötige Untersuchungen.
- Ändere nur aufgabenrelevanten Code und bewahre bestehende Änderungen.
- Teste gezielt, ohne notwendige Prüfungen auszulassen.
- Halte wichtige Architekturinformationen und Projekterkenntnisse hier kompakt und aktuell.
- Halte GitHub nachvollziehbar: fokussierte Commits, Issues/PRs, Changelog und versionierte Releases; nie bestehende Release-Assets überschreiben. Neue Releases mit `npm run release:prepare` vorbereiten und `update.json` samt SHA-256 veröffentlichen.

Desktop-Plugin: `src/`; originale Motero-Logik: `src/vendor/motero/` (AGPLv3, `COPYING`). Zuschnitt nur als lokale Ansicht; Lesezeichen als native Notizannotationen. Recherche/Architektur: `docs/RESEARCH.md`. Prüfen: `npm test`, `npm run build`; Desktop-Test: `scripts/test-zotero.py` (isoliertes Profil).
