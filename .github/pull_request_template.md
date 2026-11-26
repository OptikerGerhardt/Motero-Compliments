## Issue and implementation scope

- Issue / sub-issue:
- Parent issue (if applicable):
- Purpose and scope:
- What is intentionally out of scope:

## Verification

- [ ] Relevant unit/regression tests completed (specify commands and results below)
- [ ] `npm test` and `npm run build` verified for this HEAD commit
- [ ] Isolated Zotero Desktop test performed, or reason it could not run explained
- [ ] CI link and current HEAD SHA included

**Executed tests and evidence:**

**Unavailable tests / residual risks:**

## Motero interoperability (complete when relevant)

- [ ] Not applicable; explain why:
- [ ] Checked exact Motero Android `main` SHA:
- [ ] Checked exact Motero `reader` SHA (and Android submodule pointer where applicable):
- [ ] Shared contract and any intentional Desktop/Android differences documented
- [ ] Bookmark/annotation persisted semantics and/or crop/settings/navigation parity considered
- [ ] Relevant upstream positive **and negative** regression cases compared/adapted
- [ ] Privacy, non-destructive crop, Zotero annotation coordinates and licensing preserved

Compatibility contract: [docs/MOTERO_COMPATIBILITY.md](../docs/MOTERO_COMPATIBILITY.md).
Autonomous development: [docs/AGENT_WORKFLOW.md](../docs/AGENT_WORKFLOW.md).

Do not claim complete compatibility just because the Node build passes. A newly detected upstream SHA is not a completed code review or test.
