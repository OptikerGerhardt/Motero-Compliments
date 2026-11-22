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
- UI an Zotero ausrichten; native Schrift, Bedienelemente und passende Icongrößen übernehmen.
- Halte GitHub nachvollziehbar: fokussierte Commits, Issues/PRs, Changelog und versionierte Releases; nie bestehende Release-Assets überschreiben. Neue Releases mit `npm run release:prepare` vorbereiten und `update.json` samt SHA-256 veröffentlichen.

Desktop-Plugin: `src/`; originale Motero-Logik: `src/vendor/motero/` (AGPLv3, `COPYING`). Automatische Analyse in `content-analysis.mjs` im PDF-Kontext; nur geklonte Daten zurückgeben. Nativen Benutzerzoom respektieren. Desktop-Prefetch 12/6, Queue 2, Pixelcache 64. Zuschnitt nur als lokale Ansicht; Lesezeichen als native Notizannotationen. Recherche/Architektur: `docs/RESEARCH.md`. Prüfen: `npm test`, `npm run build`; Desktop-Test: `scripts/test-zotero.py` (isoliertes Profil).

Zuschnittmodus ist allein `options.mode`; Randreferenzen/Randnotizen unabhängig in `crop-policy.mjs`. Native UI: `split-toggle`, 20px-Sidebar, `search-box`; PDF-Fahne 42×54px. MIT-Fallback: `src/vendor/crop-to-margin/`, Lizenz erhalten. Private PDFs/Inhalte nie veröffentlichen.

## Verbindlicher Motero-Upstream-Abgleich und Agentenübergaben

- Bei allen Aufgaben die Regeln in `docs/AGENT_WORKFLOW.md` beachten; GitHub-Issues, PRs, CI und Commit-SHAs sind der gemeinsame verlässliche Arbeitsstand. Nicht auf fremde Chat-Zwischenstände verlassen.
- Bei Änderungen an PDF-Zuschnitt, Lesezeichen, Annotationsformat, Navigation oder gemeinsamen Einstellungen zusätzlich `docs/MOTERO_COMPATIBILITY.md` lesen und einhalten.
- Relevante Änderungen aus `OptikerGerhardt/Motero` (`main` und tatsächlicher `reader`-Branch bzw. im Android-Build verankerter Submodule-SHA) anhand von Diffs und Tests prüfen; funktionale Kompatibilität zählt, nicht das Kopieren der Android-UI.
- Neue upstream Crop-Erkennungsregeln einschließlich negativer Regressionstests evaluieren und wo angemessen auf Desktop übertragen. Bookmark-Daten, Farben, Positionen und Zotero-Sync-Semantik nicht inkompatibel verändern.
- Erfasster Upstream-SHA ist **keine** abgeschlossene Kompatibilitätsprüfung. Prüfstände nur mit konkreter Commit-/Test-Evidenz als verifiziert markieren.
- Große Issues bei Bedarf in kleine, unabhängig reviewfähige Teil-Issues zerlegen; nur bestätigte native GitHub-Sub-Issue-Verknüpfungen als solche bezeichnen. Ein PR je fokussiertem Scope, außer technisch notwendige Abhängigkeiten verlangen eine andere Aufteilung.
- Die automatisierte Upstream-Beobachtung meldet nur neue Commits im Tracking-Issue #15. Sie übernimmt keinen Code und gibt keine Releases frei. Für kompatibilitätsrelevante PRs Motero-/Reader-SHAs, betroffene Verträge, Tests und begründete Plattformunterschiede dokumentieren.


## Branching and merge gates (develop)

See `docs/BRANCHING_AND_SECURITY.md` in the relevant branch. `main` remains the human-approved release branch; `develop` is the shared tested integration branch. New independent implementation PRs target `develop` or an explicit parent feature branch; only a human-authorized PR may target/merge into `main`. Reviewed low-risk PRs may be squash-merged into `develop` by Agent 4 following SHA-specific independent review, successful current CI checks, explicit scope verification and a final mergeability check. No agent auto-merges releases, changes credentials, security rules, workflow definitions or data migrations. Review/CI is required on the actual PR branch and compatible target base. These are agent/process policies, not proof that GitHub settings enforce restrictions. The GitHub admin account is shared with the connected integration; it cannot technically distinguish agent from human until account separation is introduced.

## Deterministische Agenten-Übergaben

Verbindliches Protokoll: `docs/AGENT_HANDOFF_DISPATCHER.md` und `.github/scripts/agent-handoff-core.cjs`. Jede bestätigte offene Review-Beanstandung muss einen zugewiesenen nächsten Bearbeiter und einen klaren PR-Status (`agent:needs-fix` o. Ä.) erhalten. Bei Review-Handoff dokumentiere SHA, Tests und die einzeilige `agent-handoff:v1`-Markierung; bis zur menschlichen Aktivierung der `issue_comment`-Action auf dem Default-Branch setze Labels stets auch eigenständig. Keine riskanten Auto-Merges und niemals Änderungen direkt nach `main`. Wiederholte No-op-Zyklen mit bearbeitbaren Issues sind ein Planungsfehler und müssen durch einen konkreten, unabhängigen Arbeitsauftrag behoben werden.
