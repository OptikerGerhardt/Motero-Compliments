# PDF scrolling benchmark

Zotero 10.0.8 on Linux with isolated profiles. The same synthetic 64-, 500- and
2,000-page image/text fixture and 18 scroll steps were used on the released 0.3.0
and PR #12. Counts are Motero lookups inside the layout update, not native
Zotero rendering work. Milliseconds are for one instrumented run and vary by device.

| Pages | Page lookups 0.3.0 → PR #12 | Crop attribute writes 0.3.0 → PR #12 | Layout time (ms) |
| ---: | ---: | ---: | ---: |
| 64 | 1088 → 24 | 1088 → 0 | 103 → 10 |
| 500 | 8500 → 23 | 8500 → 0 | 558 → 10 |
| 2000 | 32000 → 25 | 32000 → 0 | 2109 → 10 |

Reproduce with an installed package and the same harness for both versions.

```sh
python3 scripts/test-zotero.py /path/to/zotero --performance --rich-pdf --pages 2000 --xpi /path/to/plugin.xpi
```

The native 500-page run exercised navigation, bookmarks, Reset Zoom, manual crop, rotation and teardown.
Automatic mode in this PR still starts 13 extractions before the first crop. Issue #14 tracks that separate path.
