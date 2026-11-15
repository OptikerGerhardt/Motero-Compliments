# Attribution

Motero Compliments is an independent, unofficial Zotero Desktop plugin, licensed
under GNU AGPL version 3 (COPYING). The original repository's GPLv3 LICENSE is
preserved. It is not affiliated with Zotero or Digital Scholar.

`src/vendor/motero/` and `test/vendor/` preserve algorithms and regression tests
from OptikerGerhardt/Motero's reader branch, commit
6114aeb26daf02104c9757423183994b31df27e9 (AGPLv3), derived from Zotero Reader.
Original authors retain their copyright. Source: https://github.com/OptikerGerhardt/Motero/tree/reader

`src/vendor/crop-to-margin/ink-box.mjs` adapts the inkBox detector from
[Crop to Margin](https://github.com/waelitani/crop-to-margin), commit
993326d8be23b2741809c1217c21490786bd4b3c, Copyright (c) 2026 Wael Itani (MIT).
Its complete license is included alongside the source and as
`licenses/crop-to-margin-MIT.txt` in the XPI. Detection logic is preserved;
background/confidence fields were added for conservative fallback selection.

Desktop integration is implemented here. Research references and design decisions
are in docs/RESEARCH.md. No PDF.js engine is bundled.
