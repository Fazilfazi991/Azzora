# Agent 2 coordination handoff — COORD-A2-01

**Acknowledged: P1 read-only review complete, 14 October 2026 (Asia/Dubai).** Delivered workforce branch `codex/azzora-workforce-approvals` is `dd220dfaca1e0f072d84c5895e8a8c0639345297` (implementation `06b1ad2`, followed by report). No feature code was changed for this coordination task. This handoff is the only coordination file written; no merge, reset, push, deployment or backend work occurred.

## Reviewed revisions and verification scope

- Agent 2: `dd220dfaca1e0f072d84c5895e8a8c0639345297`.
- Agent 1: `8b7992156a2f97e6f8d9d38b98a4b120ad2793a9`, branch `codex/azzora-operational-completion`.
- Agent 3 findings: `11da92566fe5bbb524e36a3128937756ce506204`; issue register describes the original `ada782a` baseline.
- Shared verified base: `ada782a21232b3072850889e3796c3bc5c8d5dd4`. Integration remains unconsolidated; this report does not certify a combined application.

**Executed now on unchanged Agent 2 source:** TypeScript passed; ESLint passed; Vitest **118 passed, 0 failed, 5 files**. A disposable Chromium reproduction against Agent 2's existing production build at isolated port 5186 produced **15 targeted observations** for the six requested QA issues below. The test printed results to the tool output and did not write or update feature/evidence files. Browser contexts were disposable, not the owner's profile. The temporary preview was stopped after review.

**Previously executed, committed Agent 2 evidence:** 40 workforce browser checks; 66 existing route/viewport checks plus the project-to-handover journey; production build with no chunk warning; 24 screenshots at 1440/1024/768/390px. Those broad suites were not rerun in this read-only coordination turn. See `docs/AGENT-2-WORKFORCE-REPORT.md` and `docs/workforce-evidence/` on the delivered branch.

**Agent 1 source/document inspection only:** its committed operational report records 141 unit tests, 128 operational browser checks and 18 operational boundaries. I did not execute or independently certify those checks in this turn. No combined-branch tests were possible before consolidation.

## Authoritative integration choices

There are competing writes to the same `people` and `documents` collections, rather than independent datasets. Retaining both UI paths would bypass validation and create contradictory approval states.

| Concern | Recommended authority | Duplicate path to retire or adapt |
| --- | --- | --- |
| Employee create/edit | Agent 2 `src/workforce/commands.ts::saveEmployee` and `Employees.tsx::EmployeeEditor` | Agent 1 `operations/repository.ts::saveEmployee` / `operations/EmployeeForm.tsx`; it permits absent email, lacks uniqueness/upper-capacity checks and uses the first active actor automatically. |
| Deactivate/reactivate | Agent 2 `setEmployeeActive` / `EmployeeStatus` | Agent 1 Team's direct `saveEmployee` status toggle, which records no user-entered deactivation reason. Preserve every existing person/task/assignment ID. |
| Project membership/replacement | Agent 2 `saveAssignment`, Team UI and domain `saveTask` guards | Agent 1 Team's inline assignment mutation. Agent 2 preserves replaced/completed history, records task transfers and links a new task owner to project membership. |
| Document draft/revision/decision | Agent 2 `saveDocumentDraft`, `reviseDocument`, `reviewDocument`, `Documents.tsx` | Agent 1 `saveControlledDocument`, `DocumentControl.tsx` and the Document-specific branches of `submitApproval` / `decideApproval`. Do not leave an alternate writer to canonical document status. |
| Latest revision selector | Agent 2 `latestDocuments` / `operationalReadiness` | Agent 1's separate latest-family loop may consume the selector while retaining its original commercial category/count policy. |
| Site submission/supervision | Agent 2 `saveSiteUpdate` / `reviewSiteUpdate` and Operations SiteUpdates | Agent 1's base-style direct `updates.push` path has no supervisory review and accepts whitespace. |
| QA assignment/resolution | Agent 2 `saveSnag` and compatibility `domain/repository.ts::transitionSnag` | Agent 1's base-style inline save/transition path. Retain independent inspector, reason, immutable closed record and reopen/inspection history. |
| Financial/procurement approvals | Agent 1 `operations/repository.ts::{submitApproval,decideApproval,reassignApproval}` for Variation, Purchase Request, Supplier Quotation, Purchase Order and Credit Note | Keep these financial paths, their snapshots and assigned-approver checks intact. Do not replace them with workforce commands. |
| Commercial closure | Agent 1 `operations/closure-domain.ts::{closureSummary,closeCommercial}`, `Closure.tsx::CommercialClosure` and `blockOperationalForFinance` | Agent 2's inherited manual Commercial checkbox/card must not overwrite the completed commercial implementation. |

Agent 1's approval engine requires the assigned actor but permits requester and approver to be the same identity. Agent 2's document command requires a different reviewer but currently has no assigned-approver field. Use Agent 2's independent-review rule as the minimum for workforce documents. Preserve Agent 1 `reviewerId`/approver assignment data during migration; adding enforcement of a retained assigned reviewer is a narrowly scoped operational follow-up, not a reason to retain two decision writers. Financial self-approval policy remains Agent 1/owner scope.

## Exact six-file reconciliation map

1. **`components/Team.tsx`:** use Agent 2 directory/profile, EmployeeEditor/EmployeeStatus and `saveAssignment` calls. Preserve any unrelated future shell integration; do not keep Agent 1's second EmployeeForm/status toggle. Keep the shared `Database.people` list and historical task ownership.
2. **`components/Operations.tsx`:** retain Agent 2 SiteUpdates and Snags implementation plus its lazy `Documents` adapter. Remove the competing export of Agent 1 DocumentControl. App/Workspace's existing imports still work; no independent navigation edits are needed.
3. **`components/Handover.tsx`:** combine Agent 2 operational checklist, three derived gates, readiness links and explicit completion actor/note with Agent 1 financialBlock banner/disabled condition and CommercialClosure component. Display only Site Completion, Quality, Documents and Client manual groups; remove the inherited manual Commercial card. Derived `operational-*` rows remain disabled and are never written into `db.handover`.
4. **`domain/model.ts`:** retain Agent 1 `OperationalData` import and optional `Database.operations`; combine Agent 2 Person fields (`employeeCode`, `notes`, `deactivatedAt`, `history`) with Agent 1 optional `demoRole`. Retain Agent 2 `WorkflowEvent`, SiteUpdate review/history, Snag history and canonical DocumentRecord lifecycle/history. Keep legacy document fields temporarily for a lossless adapter/migration. No employee/project/task renumbering and no destructive database reset.
5. **`domain/logic.ts`:** retain Agent 1 `h.group !== "Commercial"` filter in `handoverState`, then append Agent 2 independent document/supervision/QA gates. This is essential: copying Agent 2 whole-file logic would reintroduce a mandatory manual commercial checkbox even when financial blocking is off. Keep financial calculations out of `operationalReadiness`.
6. **`domain/repository.ts`:** retain Agent 2 phase/project validation, inactive-person guards (including cross-project task moves), task-to-project membership and QA compatibility adapter; keep its optional final `record` actor argument and `completeProject(db,id,actor,reason)`. Add Agent 1's `closureSummary` guard inside that completion command. Recheck both operational and configured financial conditions at mutation time, before setting Completed. Keep quotation/commercial/operations initialization and migration protections together; do not select one branch's loader wholesale.

Completion truth table: operational blockers always prevent completion. If operational criteria pass, financial obligations prevent completion **only when `blockOperationalForFinance` is true**. The UI and repository command must implement the same condition. Recording commercial closure remains Agent 1's separate action and snapshot.

Additional shared files outside the six conflicts: retain Agent 2 TaskDrawer/Wizard active-employee filtering and inline errors; reconcile shared ui.tsx accessibility changes with Agent 3's pending fixes; retain Agent 1 App/Workspace/Accounts/financial/navigation changes. Neither this task nor Agent 2 should independently overwrite those files.

## Document compatibility and migration constraints

Agent 2 canonical lifecycle is `Draft | Pending | Rejected | Approved`; Agent 1 uses `status: Pending | Approved` plus `reviewState`. Explicit mapping before any canonical writes:

| Agent 1 representation | Agent 2 canonical representation |
| --- | --- |
| `reviewState=Draft` | `status=Draft` |
| `reviewState=Submitted` | `status=Pending` |
| `reviewState=Revise & Resubmit` | `status=Rejected` |
| `reviewState=Approved`, or approved status without reviewState | `status=Approved` |
| Legacy Pending without reviewState | retain `status=Pending` |
| `revisionOf` | `previousRevisionId` |
| `familyId`, stable ID, project, version, attachment | retain exactly |
| `reviewerId`, `reviewComments`, `decisionAt`, old approval snapshots | preserve as legacy/assigned-review metadata and traceable source history; do not invent missing actors, times or decisions |

Retain Agent 1's existing Document approval ledger entries intact for audit. New document submissions/decisions should have one authority. The coordinator must arrange an explicit compatibility/read-model adapter for any generic Approval Pending report/Controls/closure caller that still consumes Document approvals. Do not simply remove the UI and leave stale Pending Approval rows blocking closure after a canonical document is approved. Do not silently mark old approvals rejected to make counts clear. Preserve original source records, map their state once, and derive active pending-document counts from the canonical latest revision. Financial approval rows and calculations must remain unchanged.

Agent 1 `closureSummary.commercialClear` includes pending generic approvals and **all** latest document categories, in addition to money/deliveries. Agent 2's operational gate applies only to configured approval-requiring categories. Preserve that existing commercial scope unless Agent 1/owner deliberately changes it; do not assume commercialClear means money alone.

## Requested Agent 3 reassessment on Agent 2

| Issue | Current classification | Source inspection | Executed observation this turn |
| --- | --- | --- | --- |
| A3-001 unnamed dialog | **Fixed on Agent 2** | Modal has useId heading and aria-labelledby. | Exactly one dialog named Quick Add at each of 1440/1024/768/390px. |
| A3-002 padding click loses draft | **Open** | onClick still closes when target equals currentTarget without bounds check. | Entered employee draft; click 3px inside top-left padding closed the dialog at 1440px (remaining dialogs 0). |
| A3-006 malformed operational storage | **Open** | Loader validates projects/tasks/clients, but not required people and other operational shapes. | Removed people from an otherwise saved complete fixture: body text length 0, error `Cannot read properties of undefined (reading 'map')`, no read-only fallback, original raw storage preserved. |
| A3-008 whitespace site update | **Fixed on Agent 2** | `saveSiteUpdate` rejects `!completed.trim()` and invalid manpower before mutation. | Three spaces with a selected actor retained the dialog, displayed inline validation and left localStorage unset. |
| A3-009 closing loses opener focus | **Open** | Modal cleanup closes without capturing/restoring connected opener. Tab containment is a separate fixed behavior. | Task Create trigger was not focused after Enter → Escape at all four widths. |
| A3-010 nested Escape closes parent | **Open** | `onCancel={onClose}` neither prevents native default nor stops React propagation. | Project name entered, inline customer opened, Escape left zero dialogs and lost the parent draft at all four widths. |

These are current executed reproductions, not inferences from passing broad tests. Agent 2's previous keyboard coverage tested Tab containment, Enter and Escape dismissal; it did not assert opener restoration or nested-draft survival. Passing those earlier checks did not resolve A3-009/A3-010. Agent 3's candidate patch is still unapplied here; reconcile its padding/focus/cancel fixes with Agent 2's existing name and Tab-containment code rather than apply it blindly.

## Next narrowly scoped tasks

1. **P1 shared dialog correction (Agent 2, only after coordinator grants an implementation task):** ui.tsx bounds-aware backdrop handling, connected opener restoration and cancel preventDefault/stopPropagation. Add strict padding, nested Escape and focus-return tests at all four widths; preserve existing Tab containment and named dialogs. No shell redesign.
2. **P1 protected loading (Agent 2 + Agent 1 migration review):** validate every required base operational collection and meaningful record/relationship shapes before migrations/rendering; preserve raw data and expose read-only fallback/export. Coordinate with Agent 1 operations initialization. Promote A3-006 from expected failure to strict passing assertions. No destructive reset or backend work.
3. **P1 coordinator integration:** choose the authoritative writes above, implement one lossless document compatibility adapter, and reconcile the six files with the financial block truth table. Obtain the assigned-reviewer and historical generic-approval migration test cases before removing duplicate UI paths.
4. **P1 Agent 3 combined-branch acceptance:** execute both financial and workforce suites plus strict A3 regressions on the actual consolidated SHA. Test pending site review with finance clear; unpaid invoice with policy off/on; approved canonical document with historical generic approval entries; no stale commercial checkbox requirement; and persistence across both legacy schema variants. No integration acceptance claim until these checks pass.

**Ready for coordinator review.** Feature branch remains at the acknowledged SHA and clean. The four open requested defects require a separate implementation authorization; none was modified during this read-only assignment.
