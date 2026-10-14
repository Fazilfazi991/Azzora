# Task board

Statuses: **Backlog | Ready | Assigned | In Progress | Blocked | In Review | Verified | Integrated**.

`Pending Acknowledgement` is a delivery qualifier on Assigned tasks, not an extra task status. In Review means delivery/evidence exists but current independent combined acceptance remains pending. Branch codes: F = `codex/azzora-commercial-accounts`; A1 = `codex/azzora-operational-completion`; A2 = `codex/azzora-workforce-approvals`; A3 = `codex/azzora-qa-stabilization`; I = `codex/azzora-integration`.

| ID | Description / module | Priority | Agent | Dependencies | Status | Branch / relevant commit | Acceptance criteria | Verification result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BASE-01 | Commercial foundation: customers/projects/contracts/BOQ/invoices/receipts/expenses/dashboard/search/reports | P1 | Agent 1 | Supplied baseline | In Review | F / `ada782a` | Retain connected lifecycle, monetary and snapshot rules and delivery workflow | Recorded 90 unit passes and browser evidence inspected; preserve during integration |
| OP-01 | Approved variation revisions and revised contract | P1 | Agent 1 | BASE-01 | In Review | A1 / `26eb500` | Approved signed net applied once; immutable revisions; valid invoice/credit source | Agent 1 evidence; independent combined review pending |
| OP-02 | Supplier directory/profile/history | P1 | Agent 1 | BASE-01 | In Review | A1 / `26eb500` | Stable supplier IDs, archive-safe linked records | Agent 1 journey evidence |
| OP-03 | Material requests / PR approval / RFQ comparison | P1 | Agent 1 | OP-02 | In Review | A1 / `26eb500` | Explicit supplier selection; traceable request and authorization | Agent 1 journey evidence |
| OP-04 | PO approval/PDF and partial deliveries | P1 | Agent 1 | OP-03 | In Review | A1 / `26eb500` | Immutable approved PO; received quantity limits and reversal history | Agent 1 journey/PDF evidence |
| OP-05 | Supplier bills/payments and expense integration | P1 | Agent 1 | OP-04 | In Review | A1 / `26eb500` | Received/unbilled cap, one expense per bill, customer receipts unaffected | Agent 1 unit/browser evidence; independently reconcile |
| OP-06 | Credit notes/refunds/reversals | P1 | Agent 1 | BASE-01, OP-01 | In Review | A1 / `26eb500` | Correct receivable/customer credit, valid refund balance, immutable issue | Agent 1 evidence; review A3-005 |
| OP-07 | Company/VAT/numbering/settings | P1 | Agent 1 | BASE-01 | In Review | A1 / `26eb500` | Historical documents retain company snapshots; collision-safe references | Agent 1 boundary/PDF evidence |
| OP-08 | Budgets/commitments/forecast | P1 | Agent 1 | OP-01, OP-05 | In Review | A1 / `26eb500` | Net cost once; open commitment not duplicated; consistent dashboard/reports | Agent 1 unit/browser evidence |
| OP-09 | Shared approval inbox | P1 | Agent 1 | OP-03, OP-06, WF-02 | In Review | A1 / `26eb500` | One actor/reviewer/decision contract compatible with document history | Semantic overlap unresolved |
| OP-10 | Financial dashboard/search/Quick Add/reports | P2 | Agent 1 | OP-01..09 | In Review | A1 / `26eb500` | All surfaces use the authoritative selectors and working forms | Recorded ten new report exports; combined review pending |
| WF-01 | Employees/project assignments/workload | P1 | Agent 2 | BASE-01 | In Review | A2 / `06b1ad2`; parallel A1 implementation | Preserve IDs/history; no inactive new assignments; one write boundary | A2 recorded workforce tests; duplication unresolved |
| WF-02 | Documents/drawing revisions/review | P1 | Agent 2 | WF-01, OP-09 | In Review | A2 / `06b1ad2`; parallel A1 implementation | Immutable version bytes/history; assigned independent reviewer; latest-family gate | Individual branch evidence; model compatibility pending |
| WF-03 | Site supervision/return/resubmit | P1 | Agent 2 | WF-01 | In Review | A2 / `06b1ad2` | Trim/validate content; actor and review history; approved records locked | A2 recorded browser evidence; A3-008 reassessment needed |
| WF-04 | QA assignment/independent inspection/reopen | P1 | Agent 2 | WF-01 | In Review | A2 / `06b1ad2` | Valid transitions; inspector independence; retained prior closure history | A2 recorded tests/browser evidence |
| CLOSE-01 | Operational handover plus commercial closure | P1 | Coordinator; A1/A2 domain owners | OP-01..09, WF-02..04 | Blocked | I / no combined commit | Both gate sets retained; financial policy explicit; no bypass via alternate commands | Six-file/semantic reconciliation not done |
| QA-01 | Isolated upload race + two harness corrections | P2 | Agent 3 | BASE-01 | In Review | A3 / `7b9c26d` | No resurrected attachment; explicit target server and independent output directory | Recorded 2-width upload and retained suites; not integrated |
| QA-02 | Baseline audit and 13-issue register | P1 | Agent 3 | BASE-01 | In Review | A3 / `11da925` | Reproduction, exact outcomes and unverified limitations recorded | 3 fixes, 10 open baseline issues; audit excludes newer domains |
| COORD-001 | Central evidence/registry/board/ownership/integration strategy | P1 | Coordinator | Git/report discovery | Verified | I / foundation `ada782a` | All source identities and evidence recorded; actual dispatch distinguished from receipt | Discovery/docs/collector/link validation complete; all three acknowledged handoffs collected |
| COORD-A1-01 | Financial defect and duplicate-domain handoff | P0 | Agent 1 | QA-02, OP delivery | Verified | A1 / `8b79921` | Acknowledge; assess A3-005/006 and recommend financial/model boundaries | Acknowledged report collected; 141 fresh unit passes; negative VAT issuance reproduced |
| COORD-A2-01 | Workforce authority and baseline-defect handoff | P1 | Agent 2 | QA-02, WF delivery | Verified | A2 / `dd220df` | Acknowledge; reconcile six source overlaps; assess shared dialog/storage/site issues | Acknowledged report collected; typecheck/lint/118 unit passes and 15 targeted observations |
| COORD-A3-01 | Independent evidence reassessment and combined test plan | P1 | Agent 3 | A1/A2 recorded evidence | Verified | A3 / `11da925` | Acknowledge; precise provenance/counts; final combined regression plan | Acknowledged handoff collected; raw/tracked counts parsed; complete combined gate prepared |
| INT-01 | Resolve authority, types, migration and shared UI contracts | P1 | Coordinator | COORD-A1-01, COORD-A2-01 | Ready | I / none | Written integration map; one command boundary per entity; preserved legacy data | Authority direction agreed; lossless adapter and completion composition pending |
| INT-02 | Consolidate reviewed pinned source commits | P1 | Coordinator | INT-01, confirmed critical fixes | In Review | I / none | Controlled merges; conflict review; clean diff; all source commits tracked | Original deliveries, reviewed fixes and canonical composition merged; final QA pending |
| QA-FINAL | Independent complete quality gate | P1 | Agent 3 | INT-02, COORD-A3-01 | Ready | I / none | TypeScript/lint/domain/BOQ/financial/procurement/workforce/browser/PDF/responsive/build; exact counts | NOT RUN; cannot certify separate branches as combined |
| REL-01 | Owner review / merge to main | P1 | Owner + Coordinator | QA-FINAL | Blocked | main / `c191498` | Owner approval of tested combined revision | No approval requested yet; combined revision not ready |

## Defect register reconciliation

Original QA details: sibling `azzora-qa-stabilization/docs/AGENT-3-ISSUES.md`. All ten were originally confirmed against foundation `ada782a`. Current handoffs establish branch-specific behavior below; none is integrated. Priority below reflects coordinator triage; original A3-005/006 priority was P1.

| ID | Description / module | Priority | Assigned owner | Dependencies | Status | Branch / relevant commit | Acceptance criteria | Verification result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A3-005 | Negative VAT from discount remainder / invoice | P0 | Agent 1 | COORD-A1-01 | Ready | A1 / baseline reproduction `ada782a` | Three 0.01 inclusive rows, 0.02 discount produce non-negative net/VAT and 0.01 gross; bounded allocation; ordinary regression | Fresh A1 in-memory save/issue reproduces VAT -1 fils; 141 existing tests miss it |
| A3-006 | Incomplete saved shape blanks app / persistence | P0 | Coordinator migration owner; Agent 2 schema, Agent 1 namespace input | COORD-A1-01/A2-01 | Ready | I / baseline reproduction `ada782a` | Missing people/required shapes produce protected recovery, retain exact raw data, reachable export | Fresh A2 missing-people blank app; A1 rejects people but accepts eight other missing collections; unified recovery needed |
| A3-001 | Dialog accessible name | P1 | Agent 2 | COORD-A2-01 | In Review | A2 / `06b1ad2` candidate | All dialogs named at four widths | Fresh A2 named-dialog checks at four widths pass; final combined acceptance pending |
| A3-002 | Interior padding discards draft | P1 | Agent 2 | COORD-A2-01 | Ready | A2 / baseline `ada782a` | Interior click retains draft; true backdrop behaves intentionally | Fresh A2 1440px interior-padding click loses draft; candidate patch remains unapplied |
| A3-007 | Closed mobile sidebar keyboard focus | P1 | Agent 1 | COORD-A1-01 | Backlog | A1 / baseline `ada782a` | Closed links unfocusable; open/close focus and Escape correct; desktop retained | Baseline confirmed; current behavior unknown |
| A3-008 | Whitespace-only site update | P2 | Agent 2 | COORD-A2-01 | In Review | A2 / `06b1ad2` candidate | Trimmed description required in command and UI | Fresh A2 browser rejects whitespace with visible error and no storage mutation; final combined gate pending |
| A3-009 | Drawer opener focus lost | P1 | Agent 2 | COORD-A2-01 | Ready | A2 / baseline `ada782a` | Escape/close restore connected opener, including nested transitions | Fresh A2 browser confirms at all four widths; patch remains unverified |
| A3-010 | Nested Escape closes parent wizard | P1 | Agent 2 | COORD-A2-01 | Ready | A2 / baseline `ada782a` | Only inner dialog closes; parent draft/focus retained | Fresh A2 browser confirms at all four widths; patch remains unverified |
| A3-011 | Warning text contrast 4.107:1 | P1 | Agent 1 | COORD-A1-01 | Backlog | A1 / baseline `ada782a` | Existing palette reaches >=4.5:1; representative warning states checked | Baseline computed-style evidence |
| A3-013 | Sticky header obscures invalid task field | P1 | Agent 1 CSS; Agent 2 form consultation | COORD-A1-01/A2-01 | Backlog | A1 / baseline `ada782a` | Invalid field/message visible with keyboard/native validation at four widths | Baseline geometry evidence |

## Deferred scope

| ID | Description / module | Priority | Assigned agent | Dependencies | Status | Branch / commit | Acceptance criteria | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PERF-01 | Main bundle optimization | P2 | Unassigned; coordinator to schedule | INT-02 | Backlog | A1 / `26eb500` | Preserve lazy PDF/domain behavior while reducing measured main chunk | Recorded 585.22 kB warning |
| FUT-01 | Retention release, price variance/inventory, supplier debit notes, multi-invoice allocation, ledger, timesheets, Unicode fonts | P3 | Unassigned | Separate owner scope | Backlog | none | Define scope and acceptance before allocation | Not implemented/verified |
| BACKEND-01 | Auth/server persistence/concurrency/cloud attachments/deployment | P3 | Unassigned; explicitly deferred | New owner authorization | Backlog | none | Separate production phase approved before work | No action initiated |

## Authorized corrective cycle register

| Task ID | Description / module | Priority | Agent | Dependencies | Status | Branch / commit | Acceptance criteria | Verification result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FIX-A1-01 | Bounded discounts, variation tax basis, shell focus/contrast/validation | P0 | Agent 1 | COORD-A1-01 | In Progress | A1 / a4620eb | Non-negative line base/VAT; exact approved basis; snapshots preserved; strict shell checks | Active acknowledged; recorded 160 unit passes and 35 focused browser checks; final handoff pending |
| FIX-A2-01 | Modal padding, opener focus, nested Escape/BOQ retention | P1 | Agent 2 | COORD-A2-01 | In Review | A2 / c95a1cf; report94c568b; merged into I | Strict four-width regressions preserve parent drafts | Acknowledged complete; 64 branch checks pass; combined QA pending |
| FIX-RECOVERY-01 | Saved-shape/ref validation and reachable original backup | P0 | Coordinator | A3-006 | In Review | I / 8d7a277 plus reviewed hardening | No automatic resets/writes; incompatible raw exact export; fallback reachable | 25 browser recovery cases pass; malformed/missing collections covered by ordinary tests |
| INT-01 | Canonical workforce/documents with lossless approvals/closure adapters | P1 | Coordinator | A1/A2 handoffs | In Review | I / e136489,8d7a277 | One write boundary, assigned independent reviewer, supersession/history, both completion gates | 198 application unit passes; three Agent2 review findings addressed |
| QA-PREP-02 | Strict final harnesses and ordinary defect assertions | P1 | Agent 3 | COORD-A3-01 | In Progress | A3 / b88191b | Required failures are strict; isolated URLs/actors; no baseline certification | Active acknowledged; prep remains intentionally red on old baseline |
| QA-FINAL | Independent whole integrated system gate | P1 | Agent 3 | Reviewed fixes, composed harnesses and frozen I SHA | Blocked | I / not frozen | Full stated gate, source binding, exact counts and PDF/visual review | NOT RUN |

| FIX-A1-02 | Legacy item-credit basis and cumulative tiny-credit VAT | P0 | Agent 1 | INT-REVIEW-A1 | In Review | A1 / starting647762d | Immutable historical basis or explicit review block; repeated small credits bounded by original VAT; exact final settlement | 857b57c/reportd4d251f reviewed and merged;192 source unit/14 UI passes; all303 combined unit cases pass |

## Final freeze readiness

All original source deliveries, both Agent1 corrective stages, Agent2 modal fixes, QA preparation and canonical test composition are integrated. Combined preflight:303 ordinary passes,0 failures/pending,13 files; TypeScript and lint pass. QA-FINAL is Ready for dispatch after this checkpoint. Any earlier Blocked/Assigned cycle entries above are historical; independent combined verification remains pending.
