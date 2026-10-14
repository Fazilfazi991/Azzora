# Agent 3 inbox

## COORD-A3-01 — Evidence reassessment and consolidated quality gate

- Priority: P1. Status: Verified handoff — acknowledged and completed; report collected directly. Final combined regression remains separate and Blocked.
- Objective: independently assess A1/A2 recorded evidence and applicability of ten baseline issues; prepare exact combined regression requirements.
- Owned output: `docs/coordination/agent-3-handoff.md` in integration worktree. Source and existing tests are read-only. Agent 3 retains independent test/report ownership for later gate work.
- Dependencies: A3 `11da925`, A1 `8b79921`, A2 `dd220df`. Final regression depends on INT-02, not this planning task.
- Acceptance: explicit acknowledgement; exact SHA/provenance and count reconciliation; expected failures separated; identify source-only candidates; complete financial/procurement/workforce/storage/closure/browser/PDF/responsive/keyboard plan; identify test harness URL/fixture dependencies.
- Testing: do not run or claim final combined regression on a feature branch or baseline-only integration checkout. Record targeted checks if performed; no percentage estimates or summed duplicate counts.
- Deliverables: concise handoff file and response in existing chat. No feature source changes, other coordination-file edits, merges, pushes, backend or deployment.

QA-FINAL is Blocked until a frozen combined SHA exists. Its gate includes TypeScript, lint, all meaningful unit/BOQ/financial/procurement/workforce tests, complete browser journeys at four widths, representative PDF rendering/inspection, migration/failure cases, and production build. Confirmed fixes must replace expected-failure tests with ordinary assertions.

## QA-PREP-02 — complete and integrated; QA-COMPOSE-03 active

Prep b88191b reviewed/merged, tests only. Its baseline failures were deliberately ordinary failures, not successful requirement tests. QA-COMPOSE-03 is dispatched and acknowledged: Agent3 operates in the integration worktree, owns test-only adaptations of old operational browser/boundary fixtures and independent combined checks; no app-source edits. Commit exact test paths and return composition SHA. Coordinator then reviews/refreezes and dispatches QA-FINAL against the full immutable combined SHA. No final certification against a moving source tree.
