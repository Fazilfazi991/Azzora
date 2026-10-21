# Task board

## Accounts and finance cycle — 21 October 2026

Baseline `fd7754dfe0022f9b64bf875313bd9679cb0144eb`; local integration branch `codex/azzora-finance-integration`. See [finance coordinator report](../finance/COORDINATOR-REPORT.md) for the full gap matrix, boundaries and decisions. Statuses below describe this cycle only; earlier verified releases remain historical entries below.

| ID | Owner / scope | Status | Acceptance gate |
| --- | --- | --- | --- |
| FIN-00 | Coordinator — repository audit, feature gaps, contracts, B01–B12 | Complete locally | Baseline SHA, branch map, 384/384 units, TypeScript/ESLint/build; report |
| FIN-01 | Agent 1 — pure CoA/journal/period/reversal rules | In progress | Integer-fils balanced/idempotent append-only tests and coordinator review |
| FIN-02 | Agent 2 — pure explicit sales/bill allocations and due-date aging | Agent branch complete, review pending | One/many allocations, advances, reversals, party/balance checks |
| FIN-03 | Agent 3 — pure expense submission/category-mapping rules | In progress | Configurable approval, no duplicate cost path, manual review on failed extraction |
| FIN-04 | Coordinator — additive schema, event adapters, reconciled reports | Backlog | Approved mappings/policies, saved-data recovery, AR/AP/GL reconciliation |
| FIN-05 | Accountant UI and secure identity | Blocked for secure acceptance | B11 backend/auth authorization; demo navigation must be labeled |
| FIN-06 | Mobile expense/photo and historical PDF import | Backlog | B02/B03/B09/B11, actual extraction capability, reviewed import behavior |
| FIN-QA | Independent combined financial/CRM/browser/PDF gate | Pending | Frozen combined SHA and exact test results |

## Gantt UI correction cycle — 15 October 2026

Full tested local integration SHA: `5053b9be2c0e20070225a1805e903670270a335a`. The [Gantt correction report](GANTT-UI-CORRECTION-REPORT.md) and [independent QA matrix](../planning/evidence/gantt-final-qa-matrix.md) contain the source map and exact evidence.

| ID | Scope / owner | Status | Evidence |
| --- | --- | --- | --- |
| GANTT-01 | Typed connector attachment/routing, selected links, task labels and first-click details — Agent 2 | Verified | `6fce04f`, `1ebe965`; independent Gantt 31/31 in dev and production |
| GANTT-02 | One page vertical scroll, horizontal date rail, sticky header and four-width responsive layout — Agent 2 | Verified | `6fce04f`, `1ebe965`; before/after captures at 1440/1024/768/390 px |
| GANTT-03 | Approved-date, milestone, FS/SS/FF/SF and calendar positioning audit — Agent 1 | Verified | `8980f91`, `9fd7ca7`, `5053b9b`; Day/Week/Month dev and fresh preview passes |
| GANTT-QA-01 | Independent browser, accessibility and full CRM/timeline regression — Agent 3 | Verified | Frozen `5053b9b`; 384/384 units, TS, ESLint, build, 31/31 dev and 31/31 production browser suites |
| GANTT-ACCEPT-01 | Owner visual acceptance of local browser demo | Ready | Combined revision verified; no push, deployment or main merge authorized |

## Timeline implementation cycle — 15 October 2026

Frozen local integration revision: `b0858807194e13b3fb397fbdd2a50283e0649a3e`. The three feature owners used isolated worktrees; the coordinator reconciled their commits into `codex/azzora-timeline-integration`. The [timeline implementation report](TIMELINE-IMPLEMENTATION-REPORT.md) contains source mapping, evidence and independent results.

| ID | Scope / owner | Status | Evidence |
| --- | --- | --- | --- |
| TL-01 | Additive model, migration, calendar, dependency engine, CPM, proposals and atomic approval — Agent 1 | Integrated | Engine/source checkpoints `26f34fc`, `cbbb383`, `ea37a1f`, `32f867e`, `bfe76e7`, `b1c2abe` |
| TL-02 | Responsive Gantt, review controls, accessible mobile workflow — Agent 2 | Integrated | UI checkpoints `1469c67`, `33bd951`, `4a37c5b`, `c7a56c1`, `4758603`, `73e5e5e`; four-width before/after evidence |
| TL-03 | Empty-plan Wizard route, shared-file reconciliation and source freeze — Coordinator | Integrated | `735da56`; frozen `b085880` |
| TL-QA-01 | Independent full CRM and timeline gate — Agent 3 | Verified | Frozen `b085880`; 384/384 units, TypeScript, ESLint, build, 29/29 development and 29/29 production browser suites; Wizard/template and visual/PDF checks passed |
| TL-ACCEPT-01 | Owner visual acceptance and any later GitHub/main action — Owner | Ready | Verified local revision ready for visual acceptance; no push, deployment or main merge authorized |

## Current client-acceptance cycle — verified review revision

The historical board below records the original local integration. The current review-branch cycle is frozen at **`176acdc285670feffb6047cb71ec6f72900a7b3c`** and passed independent 25/25 development plus 25/25 production browser suites, 338/338 units, TypeScript, ESLint and cold build. Owner acceptance remains pending; main has not been merged.

| ID | Scope / owner | Status | Evidence |
| --- | --- | --- | --- |
| UX-FINAL-01 | Sidebar grouping, Accounts prominence, Dashboard — Agent 2; Accounts audit — Agent 1 | Verified | Original `33114ca`, Accounts audit `881a6a7`; 113 independent navigation and Accounts visibility/data checks, four widths and short heights |
| QUOTE-LIVE-01 | Current-draft quotation preview — Agents 1 and 2 | Verified | Wiring `f0b5abe`, preview `b19e0f1`; all five steps, PDF/print, error recovery, focus and saved-byte preservation |
| BOQ-HIER-01 | Stable parent/child commands, numbering, no double charge — Agent 1; editor — Agent 2 | Verified | `e79173e` + `82fd68f` + `425ce99`; 28 domain tests and four-width independent hierarchy/browser/PDF checks |
| PDF-ALIGN-01 | Client-approved quotation alignment — Coordinator | Verified | `d450885`; five rendered before/after examples, seven-page reference unchanged, six geometry/pagination regressions |
| QA-FINAL-01 | Full independent combined gate — Agent 3 | Verified | Frozen `176acdc`; 25/25 dev and 25/25 fresh-production suites; 338/338 unit tests; PDF/image and source/hash guards; two earlier stopped attempts retained separately |
| DELIVERY-PR-01 | Safe fast-forward review branch and PR #1 update — Coordinator | In Review | Publish only after the completed independent certificate and final documentation; no main merge or deployment |

Current state at freeze **`f72e6c1dd7c5914e97c509a635b64de8c6aa9750`**,14 October 2026. Integrated means source is composed locally; QA-FINAL now verifies this frozen combined revision. Owner acceptance remains separate. Earlier checkpoints and reproductions remain in Git history and the preserved failed-gate report.

Statuses: Backlog, Ready, Assigned, In Progress, Blocked, In Review, Verified, Integrated. A1=operational-completion; A2=workforce-approvals; A3=qa-stabilization; I=integration. All branches have `codex/azzora-` prefix.

| ID              | Scope / owner                                                    | Priority | Status     | Source / acceptance evidence                                                                                                                               |
| --------------- | ---------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BASE-01         | Customers/projects/BOQ/contracts/invoices/receipts/expenses — A1 | P1       | Integrated | ada782a; retain lifecycle and immutable snapshots; final gate passed                                                                                       |
| OP-01           | Approved variations/revised contract — A1                        | P1       | Integrated | 26eb500+a4620eb; signed approved basis applied once                                                                                                        |
| OP-02           | Suppliers/history — A1                                           | P1       | Integrated | 26eb500; stable linked IDs                                                                                                                                 |
| OP-03           | Requests/RFQ/comparison — A1                                     | P1       | Integrated | 26eb500; authorization and explicit supplier selection                                                                                                     |
| OP-04           | PO/PDF/partial delivery — A1                                     | P1       | Integrated | 26eb500; immutable approval and quantity bounds                                                                                                            |
| OP-05           | Supplier bills/payments/expense — A1                             | P1       | Integrated | 26eb500; cost once, customer receipts separate                                                                                                             |
| OP-06           | Credit/refund/reversal — A1                                      | P0       | Integrated | 26eb500+857b57c+62c6948; bounded posted basis and accessible rejection                                                                                     |
| OP-07           | Company/VAT/settings — A1                                        | P1       | Integrated | 26eb500; historical branding/reference integrity                                                                                                           |
| OP-08           | Budgets/commitments/forecast — A1                                | P1       | Integrated | 26eb500; net cost/commitments reconciled                                                                                                                   |
| OP-09           | Shared approvals — Coordinator/A1/A2                             | P1       | Integrated | 8d7a277+562a819; canonical atomic document decisions                                                                                                       |
| OP-10           | Dashboard/search/Quick Add/reports — A1                          | P2       | Integrated | 26eb500; authoritative selectors and forms retained                                                                                                        |
| WF-01           | Employees/assignments/workload — A2                              | P1       | Integrated | 06b1ad2; canonical command boundary with legacy adapters                                                                                                   |
| WF-02           | Documents/revisions/review — A2                                  | P1       | Integrated | 06b1ad2+8d7a277; immutable history, independent assigned reviewer                                                                                          |
| WF-03           | Site supervision — A2                                            | P1       | Integrated | 06b1ad2; trimmed input and return/resubmit history                                                                                                         |
| WF-04           | QA/inspection/reopening — A2                                     | P1       | Integrated | 06b1ad2; valid independent transitions/history                                                                                                             |
| CLOSE-01        | Operational handover+commercial closure — Coordinator            | P1       | Integrated | e136489+8d7a277+cb3f4d9; both gate sets/policy retained                                                                                                    |
| QA-01           | Upload race+isolated harness fixes — A3                          | P2       | Integrated | 7b9c26d; source-bound targets and stale-read guard                                                                                                         |
| QA-02           | Original audit/issue register — A3                               | P1       | Integrated | 11da925; baseline evidence retained, not combined certification                                                                                            |
| COORD-001       | Registry/evidence/ownership/controlled integration — Coordinator | P1       | Verified   | Supported dispatch/handoffs and checkpoint records                                                                                                         |
| COORD-A1-01     | Financial/model handoff — A1                                     | P0       | Verified   | 8b79921; confirmed negative VAT reproduction                                                                                                               |
| COORD-A2-01     | Canonical workforce/modal handoff — A2                           | P1       | Verified   | dd220df; canonical model and shared-file requirements                                                                                                      |
| COORD-A3-01     | Independent evidence/test-plan handoff — A3                      | P1       | Verified   | 11da925; exact raw counts/provenance                                                                                                                       |
| INT-01          | Authority/adapters/migration/atomic approvals — Coordinator      | P1       | Integrated | e136489+8d7a277+562a819+93926da;30 integration regressions plus customer-only reload case                                                                  |
| INT-02          | Controlled pinned/corrective merges — Coordinator                | P1       | Integrated | Full source list in INTEGRATION-PLAN; frozen f72e6c1                                                                                                       |
| FIX-A1-01       | Discounts/variation basis/sidebar/contrast/CSS — A1              | P0       | Integrated | a4620eb/report647762d;160 branch units,35 UI checks                                                                                                        |
| FIX-A1-02       | Legacy credit basis/cumulative VAT — A1                          | P0       | Integrated | 857b57c/reportd4d251f;192 branch units,14 UI checks                                                                                                        |
| FIX-A1-03       | Financial dialog error visibility/focus — A1                     | P1       | Integrated | 62c6948/report3dba134;38 production checks,192 units                                                                                                       |
| FIX-A2-01       | Modal padding/opener/nested Escape/BOQ — A2                      | P1       | Integrated | c95a1cf/report94c568b;64 strict four-width checks                                                                                                          |
| FIX-RECOVERY-01 | Protected loading/export/retry — Coordinator                     | P0       | Integrated | 8d7a277 and hardening;25 recovery/rollback browser cases                                                                                                   |
| FIX-RECOVERY-02 | Customer-only credit approvals reload — Coordinator              | P0       | Integrated | 3417fe1; lossless receipt/credit/refund reload, no write, wrong-project rejection                                                                          |
| QA-PREP-02      | Strict ordinary regression promotion — A3                        | P1       | Integrated | b88191b; no expected-failure acceptance                                                                                                                    |
| QA-COMPOSE-03   | Canonical operational/boundary/atomic tests — A3                 | P1       | Integrated | e48ef9c;136/18/9 prep groups, production-compatible public UI                                                                                              |
| FIX-A1-04       | Search navigation/query race — A1                                | P2       | Integrated | 08a2a15;166focused checks including144unwrapped native selections;coordinator-collected report                                                             |
| FIX-A2-02       | Native quotation print blank tail — A2                           | P2       | Integrated | 39c1bff/reportd69e692;4native-print cases7/3pages at1440/390                                                                                               |
| QA-FINAL        | Independent full combined gate — A3                              | P0       | Verified   | Frozen f72e6c1;304ordinary units/static/build,20/20dev and20/20production suites,24matrix,66PDFs/158pages,42renders/four-width review;first-execution pass |
| REL-01          | Owner acceptance / main merge — Owner                            | P1       | Ready      | Technical gate verified;owner acceptance and explicit main merge approval awaited;main unchanged                                                           |

## Defect reconciliation

| ID       | Owner       | Status     | Correction / final verification requirement                                             |
| -------- | ----------- | ---------- | --------------------------------------------------------------------------------------- |
| A3-001   | A2          | Integrated | Named dialogs retained; four-width final gate                                           |
| A3-002   | A2          | Integrated | Bounds-aware interior clicks preserve drafts                                            |
| A3-005   | A1          | Integrated | Bounded one-fils discounts/ordinary regressions; snapshots retained                     |
| A3-006   | Coordinator | Integrated | Shape/relation validation before rendering; protected original export/retry             |
| A3-007   | A1          | Integrated | Closed mobile sidebar inert; focus/trap/Escape                                          |
| A3-008   | A2          | Integrated | Whitespace-only site update rejected without mutation                                   |
| A3-009   | A2          | Integrated | Connected opener focus restored                                                         |
| A3-010   | A2          | Integrated | Only topmost nested dialog closes; parent draft/focus retained                          |
| A3-011   | A1          | Integrated | Warning contrast5.206:1; final computed-style check                                     |
| A3-013   | A1          | Integrated | Sticky invalid-field scroll padding                                                     |
| FINAL-01 | Coordinator | Integrated | Customer-only approval empty project accepted; target consistency remains guarded       |
| FINAL-04 | A1          | Integrated | Focused alert inside three financial dialogs; error/draft/raw data preserved            |
| FINAL-02 | Coordinator | Integrated | Quick Add button scoped to named dialog; nested assertions retained                     |
| FINAL-03 | Coordinator | Integrated | Write-protection alert scoped to named recovery region; raw invariance retained         |
| FINAL-05 | A1          | Integrated | Fresh current-location query survives delayed route events;166focused regression groups |
| FINAL-06 | A2          | Integrated | Scoped block SVG removes native blank page;actual parsed/rendered PDF pagination        |

Original A3-003/004/012 were isolated QA fixes documented in the issue register and7b9c26d. All recorded fixes are verified by the current combined gate. Failed19051cc/db6bb114 certificates/evidence remain preserved separately;neither is reclassified as passing.

## Deferred scope

| ID         | Scope                                                                                                 | Priority | Status  | Constraint                                            |
| ---------- | ----------------------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------- |
| PERF-01    | Main bundle optimization                                                                              | P2       | Backlog | 618.49kB/172.45gzip warning; outside corrective scope |
| FUT-01     | Retention release, inventory/debit notes, multi-invoice allocation, ledger, timesheets, Unicode fonts | P3       | Backlog | Separate owner scope/acceptance                       |
| BACKEND-01 | Auth/server persistence/concurrency/cloud attachments/deployment                                      | P3       | Backlog | Explicitly prohibited in this cycle                   |

## Historical completed integration gate

Full tested SHA `f72e6c1dd7c5914e97c509a635b64de8c6aa9750`:304ordinary unit passes,0failed/pending,13files;TypeScript/ESLint/cold build pass;20/20browser suites on each target pass without retries;24policy/supervision checks, four-width visual/keyboard review,66PDFs/158pages parsed and42rendered pages reviewed. Zero source/build hash mismatches. All recorded blocking audit issues resolved. Agent3 completed/stopped its runners and preview. Agent1 final report-only capacity failure is transparently covered by Coordinator-collected actual source/output evidence;no agent completion/report commit is invented.

REL-01 is Ready for owner acceptance. No main merge, push, deployment, backend or worktree reset/delete occurred. Existing browser-local/physical-device/PDF-reference/bundle limitations are in FINAL-INTEGRATION-REPORT.md.

## Quotation UX cycle

| ID | Scope / owner | Status | Dependencies / evidence |
| --- | --- | --- | --- |
| QUOT-UX-01 | Guided workflow, progressive simple/advanced scope and help — Agent 1 | Complete | Reviewed `c53f08e62c86f46e64bd4cfce7c7162aab6362a8`; all three refinements included and final QA passed |
| QUOT-UX-02 | Accessible responsive guide, scoped styles and usability review — Agent 2 | Complete | Reviewed `efc8670061d5bfef01d6396d748c8b029da03acd`; final four-width/keyboard checks passed |
| QUOT-UX-03 | Actual before/after, independent UX and retained regressions — Agent 3 | Complete | Reviewed `861db54bcbb171fe3ac4f8a36b604333b4595e67`; 64 UX groups, retained quotation/dialog assertions and full final gate passed |
| QUOT-UX-04 | Integration, demo walkthrough and report — Coordinator | Complete | Serialized review/commits, rollback/freeze, actual clean captures and consolidated delivery complete |
| QUOT-UX-FINAL | Fresh full quality gate — Agent 3 | Passed | Exact `861db54bcbb171fe3ac4f8a36b604333b4595e67`; 304 units, 21/21 suites on each target, static/build, four widths, 90 PDFs/246 pages and separate populated-report supplement |
| QUOT-UX-ACCEPT | Owner/client acceptance — Owner | Ready for review | Owner visual/usability acceptance pending; main merge/push/deployment remain unauthorized |

No open critical application regression was established. Three runner setup failures and one dev service outage remain separately preserved; complete final target runs passed afterward without source/test changes. Coordinator clean captures and supplemental populated-report checks are distinct from primary gate totals. See QUOTATION-UX-DELIVERY.md and CLIENT-DEMO-WALKTHROUGH.md. Main remains `c1914984021a20a9e83f5e60ee4f93ef035659dc`; no release or owner-data reset occurred.
