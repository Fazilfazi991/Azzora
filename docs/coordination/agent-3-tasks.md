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

## Current independent gate state

QA-COMPOSE-03 complete/integrated e48ef9c.19051cc gate failed,corrections reviewed/refrozen. db6bb114 repeat completed304units/static/build,18/18dev,17/18production; previousFINAL-01..04 verified fixed. FINAL-05 searchrace reproduced despite passing replay; FINAL-06 blank nativeprint page confirmed. Safe stopped-runner checkpoint returned; failed certificate preserved. Idle awaiting reviewed FIX-A1-04/FIX-A2-02 plus coordinator settled-route boundary regression and next full frozenSHA. Next gate includes two new suites,all existing18,actual native pagination/rapid-query/matrix/PDF/visual/static/unit/build and source guards. No acceptance based on prototypes or lucky replay.

## Final QA-FINAL complete / Verified

Full frozen SHA f72e6c1dd7c5914e97c509a635b64de8c6aa9750.304ordinary units,static/build,20of20dev and20of20production scripts passed without retry.24matrix,fourwidthvisual,66PDFs/158pages parsed,42renders inspected;no blocking defect,zero source/build hash mismatches. Final certificate ../AGENT-3-FINAL-INTEGRATION-QA.md. Runners/production preview stopped;dev5195 retained. No new Agent3 source commit. Reporting-only followups must preserve source/test/config;owner merge approval remains separate.
