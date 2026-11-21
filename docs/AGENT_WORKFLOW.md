# Agent coordination and handoffs

## Shared authority

- `AGENTS.md`: permanent repository engineering rules.
- `docs/MOTERO_COMPATIBILITY.md`: binding cross-repository functional contract and upstream quality assurance.
- GitHub issues, PRs, commit SHAs, CI and comments: authoritative *current* state.
- ChatGPT Project memory or uploaded files can provide human context, but scheduled agent runs must not assume they can access other chats' transient state or attachments.
- The four hourly chat schedules are **opportunities to act, not sequential guarantees**. Never treat a previous scheduled run as successful without checking GitHub.

## Roles and ownership

| Agent | Scope | Can modify |
| --- | --- | --- |
| 1 Architect | Backlog, upstream triage, plan and small sub-issues, dependency/blocker management | Issue bodies, labels and planning comments; not implementation branches |
| 2 Implementer | Focused implementation per selected sub-issue, tests and PR | Its owned PR branch while `agent:in-progress` |
| 3 Reviewer | Independent SHA-specific provisional/formal review | Review and findings; no product code |
| 4 Refinement | Verified fix findings on handed-off PR and final verification | PR branch only after `agent:needs-fix` handoff |

Only **one agent may write a given PR branch at a time**. Never have Agent 2 and Agent 4 push competing commits to the same branch. No agent auto-merges into `main`, releases artifacts or changes another repository.

## Issue hierarchy

For large work, Agent 1 should create individually testable **sub-issues**, each with scope, acceptance criteria, required tests, dependencies and parent link. Prefer GitHub native Parent/Sub-Issue when the available tool supports it; otherwise explicitly link normal issues in parent/sub-issue bodies and maintain a parent checklist. Never claim to have created a native relation unless confirmed.

Prefer one independently reviewable PR per sub-issue. A PR may pass its **sub-issue scope** while the parent remains open. Do not close the parent until all required child work and parent acceptance criteria are complete. Avoid artificial fragmentation and overlapping branches.

## States

For active PRs, use one of:
- `agent:in-progress`: Agent 2 owns implementation.
- `agent:needs-review`: implementation scope is ready for Agent 3.
- `agent:needs-fix`: verified review issues handed to Agent 4, exclusive write ownership.
- `agent:review-passed`: Agent 3 approved the stated HEAD SHA.
- `agent:ready-for-human-review`: Agent 4 verified CI, scope, docs and unchanged reviewed SHA.
- `agent:blocked`: actionable obstacle with evidence and a documented next owner.

Issue labels such as `agent:ready-to-implement` and `agent:in-progress` describe preparation/in-flight status. Check real PRs and issue links even when labels are absent. Clear conflicting PR phase labels when transitioning.

Agent 3 may perform a **preliminary** review on a newer `agent:in-progress` Draft-PR commit without taking branch ownership or incorrectly changing it to formal `needs-fix`. Formal approval only covers the reviewed HEAD SHA; any new commit invalidates it.

## Each handoff contains

- Issue (and parent, if any), PR and owner.
- Current base/head SHA and relevant reviewed SHA.
- What changed, what remains, why it matters.
- Executed tests with links to CI and native runs; missing tests and limitations.
- Verified blockers and exact next action/next role.
- For relevant code: Motero/Reader reference SHAs and compatibility impact as required by `docs/MOTERO_COMPATIBILITY.md`.

Do not repeat an unchanged investigation without new evidence. After repeated unsuccessful attempts, document why, identify a narrower alternative and escalate to Agent 1; no infinite review-fix loop.

## Safe progress and workflow constraints

- Prioritize critical bugs, data integrity and regression risks.
- Do not duplicate an existing PR or interrupt an unrelated active branch.
- CI success only proves the checks *actually run*. A green Node build is not a native Zotero Desktop test, physical Android test or proof of bookmark sync.
- Workflows that only monitor Motero should never alter code in either repository.
- Any inability to access, run or verify something must be reported explicitly, not implied to be successful.