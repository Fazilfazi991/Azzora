# AZZORA timeline implementation and integration report

## Scope and provenance

The owner approved local implementation of the five planning specifications and six scheduling decisions on 14 October 2026. The implementation branch starts at GitHub `main` merge commit `8f00619d0c7690df07afff8ad7fb0b5eb7fe67ff`. The approved specification commit `6188dda685933abb1e46016bea501238e2b9b54d` was replayed without content changes as `3ff2849` on `codex/azzora-timeline-integration`. The independent deterministic fixture commit `a0bc7f286feb664c74414459a5f57d41b7ff4139` was replayed as `fad6a33`.

The branch remains local. No GitHub push, deployment, backend implementation or merge to `main` is authorized in this cycle. The browser-local key `azzora-demo-v1` and all existing records must be preserved.

## Ownership and safeguards

| Owner | Isolated worktree | Scope |
| --- | --- | --- |
| Agent 1 — planning engine | `azzora-timeline-engine` | Additive model/compatibility, working calendar, dependency graph, proposals, atomic decisions, baseline and progress calculations, deterministic tests. |
| Agent 2 — Gantt interface | `azzora-timeline-ui` | Task-first responsive chart, editor/proposal controls, timeline-specific styles and browser tests. |
| Agent 3 — independent QA | `azzora-timeline-qa` | Deterministic independent fixtures and final combined regression against the frozen integration SHA. |
| Coordinator | `azzora-timeline-integration` | Shared-file review, controlled cherry-picks, source freeze, full-result report. |

Approved scheduling changes must use the existing task and milestone registers. A saved legacy project receives no automatic baseline, date rewrite, or storage write on load. Once planning is activated, the task editor must not bypass proposal review for an approved date or canonical dependency change. A proposal approval updates its complete set through one cloned-store mutation and one browser-storage write. Failed or stale decisions preserve the previous state. Dashboard progress, commercial dates, accepted quotations, contracts and financial records retain their existing behavior.

## Baseline visual checkpoint

Agent 2 captured the original Planning page at 1440, 1024, 768 and 390 px before UI edits, using a fresh local synthetic browser fixture. The 37-row chart is visible on the first three widths and absent at 390 px. The untouched baseline is recorded in [1440 px](../planning/evidence/before-1440.png), [1024 px](../planning/evidence/before-1024.png), [768 px](../planning/evidence/before-768.png) and [390 px](../planning/evidence/before-390.png) screenshots. Matching [after 1440 px](../planning/evidence/after-1440.png), [1024 px](../planning/evidence/after-1024.png), [768 px](../planning/evidence/after-768.png) and [390 px](../planning/evidence/after-390.png) captures show the task-first responsive layout. Additional [desktop chart](../planning/evidence/after-chart-1440.png), [mobile chart](../planning/evidence/after-chart-390.png), [proposal overlay](../planning/evidence/proposal-overlay-1440.png), [approved/baseline overlay](../planning/evidence/approved-baseline-1440.png), [proposal review](../planning/evidence/proposal-review-1440.png) and [conflict review](../planning/evidence/conflict-review-1440.png) evidence shows the actual schedule states with bars, links and a milestone diamond.

## Controlled implementation checkpoints

1. The approved specification and untouched baseline screenshots were committed before application edits (`3ff2849`, `77e96be`). The independent fixture was added as `fad6a33`.
2. The additive planning engine, guarded TaskDrawer path, canonical links, calendar, proposal commands and first deterministic tests landed as `26f34fc`; independent relationship, project-finish and float tests followed as `d820c51` and `568741a`.
3. The responsive chart and proposal controls landed as `1469c67` and `33bd951`. Template instantiation and graph-wide impact hardening followed as `cbbb383`.
4. The coordinator added an explicit empty-plan choice to the Project Wizard in `735da56`. Existing standard and custom choices retain their legacy generation behavior. The twelve-phase template is previewed and applied only to a project with no existing plan.
5. Additional engine checkpoints `ea37a1f`, `32f867e` and `bfe76e7` cover removed-link impact, explicit milestone completion, superseded revisions and progress-evidence integrity. UI checkpoints `4a37c5b`, `c7a56c1` and `4758603` expose schedule context, history, editable template and milestone state.
6. Agent 3's independent deterministic acceptance and browser recovery tests were integrated as `52ac588`, `6a0acdd`, `95051cd` and `5f2931c`; Agent 1's targeted command tests as `9437f6e`. Agent 2's final accessibility, phase-collapse and production-portable browser correction was integrated as `73e5e5e`.
7. The first source freeze, `73e5e5ee3e475a88a16f9fc84011cab1b77047a6`, passed 383/383 units, TypeScript, ESLint and build, but Agent 3's targeted multi-project browser recovery test found a critical reload defect: generic ID validation treated project-keyed planning rows as duplicate `undefined` IDs. The diagnostic test update `d67cbb0` and Agent 1's focused correction `b1c2abe` were integrated. A new freeze and complete independent gate are required; the first freeze is not an acceptance candidate.
8. On the corrected source freeze `b1c2abe9f371608077c9eafcde4ae1e88fda003b`, independent static checks and the multi-project recovery browser regression passed. Its complete development browser diagnostic yielded **21/29 passing, 8 failing suites**. Six direct failures were old browser fixtures that assumed direct task saves, an obsolete predecessor multiselect, or completion without a progress note; two suites depended on an artifact from the first failed operational fixture. Agent 2 migrated six test journeys without changing application code (`ebf8351` replayed as `9c3f36d`). The old-tree production run was intentionally skipped after the known development failures. This test-tree change requires a new exact-SHA full gate.
9. The next `9c3f36d` static run found a date-sensitive pre-existing recovery unit fixture after Dubai local midnight: it posted a receipt on 14 October against an invoice issued on 15 October. The coordinator corrected only fixture dates to use the issued invoice date in `b085880`; focused recovery tests passed 31/31 and the full local unit suite passed 384/384. A short `9c3f36d` development browser diagnostic showed operational, general CRM, quotation and BOQ suites passing, then stopped safely before redundant work. The full gate restarts on `b085880`.

| Source worktree | Original local feature/correction commits | Replayed integration commits |
| --- | --- | --- |
| Agent 1 engine | `cf2a0e9`, `4f94c5d`, `d792654`, `a6ad8fe`, `64974f3`, `d4d3c5e`, `c8ee76f` | `26f34fc`, `cbbb383`, `9437f6e`, `ea37a1f`, `32f867e`, `bfe76e7`, `b1c2abe` |
| Agent 2 Gantt | `a0c4941`, `836b24b`, `d72c4d2`, `4cef910`, `a67c38b`, `b0cbc69`, `c1ed9f9`, `ebf8351` | `77e96be`, `1469c67`, `33bd951`, `4a37c5b`, `c7a56c1`, `4758603`, `73e5e5e`, `9c3f36d` |
| Agent 3 independent QA | `a0bc7f2`, `b3e286a`, `03a3f2d`, `c4a0627`, `e03460d`, `00f73d2`, `b9b88ba`, `1c38a20` | `fad6a33`, `d820c51`, `568741a`, `52ac588`, `6a0acdd`, `95051cd`, `5f2931c`, `d67cbb0` |
| Coordinator | Approved specification `6188dda`; Wizard empty-plan change local to integration | `3ff2849`, `735da56` |

The planning layer reads legacy task dates and string predecessor IDs without a storage write, adapting them as FS +0 links when no planning record exists. It keeps approved task and milestone dates separate from submitted changes and explicit baseline snapshots. The engine calculates working-day FS, SS, FF and SF bounds with signed offsets and multiple predecessors, validates cycles and constraints, and reports float only for feasible networks. Approval rechecks the source fingerprint and atomically applies the full reviewed change set. Progress is reported through its own history and duration-weighted leaf-task planning metric; the existing Dashboard metric and all commercial records remain outside scheduling writes.

## Scheduling behavior demonstrated

The deterministic parallel fixture starts A on 2 November 2026 for two working days. B and C follow A, with B running three days and C two days; D follows both. The approved network completes on 9 November. A, B and D have zero total float, while C has one working day. The independent test verifies these values and suppresses a valid-critical-path claim if a lock or finish constraint makes the network infeasible.

In the browser proposal fixture, “Fit-out mock-up” moves from 15–16 October to 15–19 October 2026. Its FS successor “Client inspection” moves from 19–20 October to 20–21 October. The Draft state leaves both approved records and the captured baseline unchanged. Submitting and approving as the designated demo Project Manager applies the reviewed dates together, records decision history, and keeps the earlier baseline snapshot intact. A separate conflict fixture requests a nonworking finish; it presents the violated bounds and disables submission. Negative lag requires an explicit overlap acknowledgment before submission.

The 12-phase fit-out template opens as an editable preview on a deliberately empty project. Adding/removing activities in the preview does not create records. A single confirmation assigns stable task and milestone IDs, validates all predecessor endpoints and creates the parallel network once. Subsequent instantiation is rejected to prevent duplicates. Legacy projects are never replaced with this template automatically.

The release remains browser-local. Hour-level scheduling, secure identity and authorization, cross-project dependencies, resource leveling, external notifications and a backend are outside this approved cycle. Conflicting legacy dates are surfaced as planning warnings without changing the saved dates or claiming a valid critical path for an infeasible network. The designated Project Manager is a demo actor, not an authenticated authority. Owner visual acceptance should review the four-width evidence and live workflow before any separate GitHub push or main merge authorization.

## Final implementation and test certificate

The final-candidate integration freeze is `b0858807194e13b3fb397fbdd2a50283e0649a3e` on the local `codex/azzora-timeline-integration` branch. Application source is identical to corrected source freeze `b1c2abe9f371608077c9eafcde4ae1e88fda003b`; the later commits change six browser tests and one date-sensitive unit fixture only. Independent verification on this exact SHA passed **384/384 unit tests across 17 files**, TypeScript, ESLint and a cold production build. Source tree: `e54fc02508d70873f011815c1d2bf967ca32de74`; tests tree: `633a3995a8a6d3562c740e8b93d86bb0643993fa`. The pre-freeze focused planning suites passed **31/31**. The production build retains the existing nonblocking large-chunk advisory.

Agent 3's targeted multi-project browser journey passed on the corrected source SHA: a simulated `QuotaExceededError` during approval retained the exact saved bytes and approved dates; after reload a successful approval kept the original baseline, and incompatible planning data exposed the original-byte recovery export. The **full development browser gate passed 29/29 suites, zero failures**, and the **fresh-production browser gate passed 29/29 suites, zero failures**, on the exact final-candidate SHA. Every suite name and both exit results are recorded in the [independent browser matrix](../planning/evidence/timeline-final-qa-matrix.md). The real Project Wizard journey also passed in a disposable browser context: an empty-plan project began with zero phases and tasks, the Planning preview showed twelve phases, confirmation created exactly twelve phases and 26 tasks, and a second confirmation could not add duplicates.

Agent 3 rendered and visually inspected every page of the generated three-page A4 quotation workflow and seven-page long-BOQ A4 quotation, including repeated BOQ headings, wrapped descriptions, totals, Summary of Cost, payment terms and terms pages. Representative one-page invoice, credit note, purchase order and report PDFs were also inspected. No clipping or column overlap was observed in those inspected files; the report fixture intentionally has empty approval rows. The quotation print suite separately confirmed the seven-page reference and two-page accepted workflow in native and download paths at desktop and mobile widths without changing saved data. Timeline browser assertions passed at 1440×900, 1024×768, 768×1024, 390×844 and 390×600; screenshots and proposal/review overlays were visually inspected. Keyboard/focus and reduced-motion behavior were covered by the existing A3 browser suites. These are browser/PDF render checks, not physical-printer or screen-reader speech certification.

| Independent final check on `b085880` | Result |
| --- | --- |
| Unit tests | 384 passed / 0 failed, 17 files |
| TypeScript | Passed |
| ESLint | Passed |
| Cold production build | Passed; existing nonblocking large-chunk advisory |
| Development browser suites | 29 passed / 0 failed |
| Fresh-production browser suites | 29 passed / 0 failed |
| Real Wizard empty-plan and template journey | Passed; 0→12 phases, 0→26 tasks, duplicate confirmation disabled |
| Timeline visual/short-height review | 1440×900, 1024×768, 768×1024, 390×844 and 390×600 passed |
| Generated document visual inspection | 14 PDF pages inspected: 3+7 quotation pages and four representative one-page documents; no clipping or overlap observed |

This combined revision is **ready for owner visual acceptance** as a browser-local CRM timeline implementation. It has not been owner-accepted, pushed, deployed or merged into `main`. The separate approval needed for any later GitHub/main action remains outstanding.
