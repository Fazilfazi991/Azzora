# AZZORA project timeline: functional scope and gap review

**Status:** Proposed specification for owner review; no application implementation authorized.
**Reviewed revision:** `cecd69ce247d054fc37e30e2715bddf959e1bef7` (14 October 2026).
**Source:** Owner's “Project Timeline & Dependency Planning Specification” supplied 14 October 2026.

## Outcome and boundaries

The Project Manager will plan and monitor work from the **existing project task register**. Every scheduled Gantt row refers to an existing task or project milestone; Phase records render non-activity group headers only. A task-date edit on an active approved plan creates a suggested schedule; it does not move other tasks or alter the approved plan until the complete proposal is reviewed and approved. Baseline, approved, and proposed dates remain visibly distinct. Planning changes do not rewrite contracts, invoice payment schedules, procurement records, QA decisions, or handover records.

The first release uses project-specific **working-day** calendars, inclusive displayed finish dates, typed FS/SS/FF/SF relationships, positive and negative working-day offsets, zero-duration milestones, constraints, progress history, a deterministic rescheduling engine, critical path, and a local demo approval workflow. Exact working-hour scheduling, external notifications, secure authorization, cross-project links, resource leveling, and a backend remain outside this release.

The present project due date is retained as the contractual/management target. Calculated schedule completion is displayed beside it; approval of a schedule proposal never edits that target. The existing `azzora-demo-v1` key and saved records are preserved.

## Requirements gap matrix

“Existing” means the reviewed code supports the requirement substantially; “Partial” means a related behavior exists but is insufficient; “Missing” requires new behavior; “Requires Decision” is a product choice to approve before code.

| Requirement | State | Current evidence and required delta |
| --- | --- | --- |
| One authoritative activity register | **Existing** | `Database.tasks` has stable task/project/phase IDs; `Planning` and `Tasks` use it. Keep these records authoritative. [model](../../src/domain/model.ts), [Planning](../../src/components/Planning.tsx), [Tasks](../../src/components/Tasks.tsx). |
| Work-package hierarchy, dates, status, assignee, progress | **Partial** | Task parent, one assignee, start/due, percentage and status exist. Add schedule metadata, actual dates, reporting history, explicit weights and optional multiple assignees without breaking existing assignment semantics. |
| Four relationship types, lag/lead, multiple predecessors | **Partial** | Bare predecessor IDs act as FS only; multi-select exists. Add typed links and working-day offsets; keep approval requirements separate. [model](../../src/domain/model.ts), [TaskDrawer](../../src/components/TaskDrawer.tsx). |
| Dependency integrity | **Partial** | Save rejects self, missing/cross-project and cycles; duplicate links are not rejected, and load-time relationship validation does not check cycles. Add canonical link validation on load, create, revise and approval. [logic](../../src/domain/logic.ts), [validation](../../src/domain/validation.ts). |
| Project calendar and local-date semantics | **Missing** | Current `addDays`/`days` count calendar days. Add explicit weekdays, nonworking dates, holidays, IANA timezone, working hours metadata, and deterministic working-day math. [logic](../../src/domain/logic.ts). |
| Baseline / approved / forecast separation | **Missing** | Only `Task.start/due` is persisted. Legacy dates become current approved dates, never an inferred baseline. Explicit PM baseline capture is required. |
| Suggested downstream rescheduling | **Missing** | Existing dependency risk flags an issue but never calculates dates. Add affected-node traversal, precedence calculation, float-aware movement, constraints and a reviewable change set. [logic](../../src/domain/logic.ts). |
| PM proposal review and atomic decision | **Missing** | Operations approvals have no schedule kind; task dates save directly today. Add Draft → Submitted → Approved/Rejected, revise, stale guard, complete-set commit and history. [operations model](../../src/operations/model.ts), [repository](../../src/domain/repository.ts). |
| Locks, SNET, FNLT, required dates and actuals | **Missing** | Date fields have only start ≤ due validation. Add explicit constraint records and unresolved conflict handling. |
| Reported versus planned progress | **Partial** | Manual percentage exists and 100% sets task Completed; elapsed time is not used for actual percentage. Add dated actor/notes/evidence history, actual dates, planned curve and independent inspection/approval status. |
| Project progress weighting | **Requires Decision** | Existing method averages children/tasks then phase-weights; requested default is duration-weighted leaf work. Proposed: show new transparent planning metric alongside legacy metric until owner approves any Dashboard switch. [logic](../../src/domain/logic.ts). |
| Zero-duration scheduling milestones | **Partial** | Existing task-linked `Milestone` records have a due date, but do not render in Gantt or have independent completion/approval. Add independent or linked milestone conditions and diamond markers. [model](../../src/domain/model.ts), [seed](../../src/domain/seed.ts). |
| Critical path and total float | **Missing** | Risk color reflects overdue/dependency heuristics, not CPM. Add constrained forward/backward working-day passes; suppress path when infeasible. |
| Gantt table, chart, overlays, access | **Partial** | Phase/task rows, bars, progress fill, simple connectors and Week/Month/Quarter controls exist. Add compact synchronized panel, real day/week/month scales, milestones, today, baseline/proposal overlays, critical indication, keyboard controls and impact review. [Planning](../../src/components/Planning.tsx). |
| Existing display defects | **Partial** | CSS fixes left pane at 610/525/440px, ellipsizes names, and hides the chart below 768px; chart has horizontal overflow only. Replace with responsive shared-row layout and accessible mobile planning view. [styles](../../src/styles.css). |
| Fit-out template with parallel branches | **Partial** | Current 8-phase, 37-task generated plan uses calendar-day offsets and one four-task chain. Add editable 12-phase template preview, stable-ID instantiation, realistic parallel links. [seed](../../src/domain/seed.ts). |
| Links to Team, Site Updates, Documents, QA, Handover | **Partial** | Task assignee/assignment, documents and QA/handover exist, but schedule blockers and milestones are not joined. Add read-only blocker references and explicit milestone condition evaluation; no automatic date writes. |
| In-app warnings | **Partial** | Overdue and simple dependency risk exist. Add typed conflict, pending proposal, milestone risk, missing predecessor, inactive assignee and nonworking-date indicators with actionable details. No external-send claims. |
| Deterministic and browser regressions | **Partial** | Domain tests cover cycles/cross-project, progress and linked milestones; browser test covers one predecessor edit. No calendar, proposal, CPM or layout acceptance gate. [domain tests](../../src/domain/domain.test.ts), [browser tests](../../tests/browser.mjs). |

The supplied attachment contained the specification text only; the referenced timeline screenshot was not attached. The layout findings above come from component/CSS inspection. The implementation acceptance gate must capture the current view and compare at 1440, 1024, 768 and 390px.

## User workflow and acceptance behavior

1. The PM selects a project and sees phase/task hierarchy, assigned people, approved dates, progress, status, contractual target, approved forecast finish and warnings. Baseline appears only if explicitly captured.
2. The PM edits or creates tasks, working calendar, milestones, links or constraints. Before an approved plan exists, the plan stays Draft. Once approved, schedule-affecting edits produce a **draft proposal** rather than silently changing approved dates. Non-schedule notes/attachments may save through existing task commands.
3. The proposal view identifies initiating task, reason, direct/indirect successors, before/after dates and durations, milestone/project-finish effects, critical-path changes, conflicts and unchanged successors that absorb the impact.
4. Submit freezes the proposed set and source revision. The PM may approve, reject with reason, or revise into a new draft. Reject preserves approved dates. Stale or infeasible submissions cannot be applied.
5. Approval validates the whole graph against current records, updates all approved task/milestone dates and proposal decision/history in one local-store write, and **does not rebaseline**. A failed storage write leaves all previous records intact.
6. Dated progress updates can include actor, notes and optional existing attachment/site-evidence reference. A task at 100% may await a separate inspection. A milestone is complete only when its configured explicit condition is met.
7. Critical path and float use approved dates and project calendar; an infeasible graph displays a conflict instead of a path. Proposed path is separately labeled.

No physical task or approval state is inferred from an invoice/payment milestone. Procurement, site updates, document approvals and QA can create blocker context or a proposal trigger, but cannot silently rewrite approved dates.

## Fit-out template content

The editable default template contains these twelve phase headers in order: Planning and Design; Approvals and Procurement; Site Mobilization; Demolition and Preparation; MEP First Fix; Civil and Partition Work; Waterproofing and Tiling; Ceiling and Finishes; Joinery and Final Fixtures; MEP Second Fix; QA and Snagging; Handover. It supplies practical tasks and milestone conditions such as drawings approved, authority NOC received, waterproofing inspection approved, material delivery complete, MEP testing complete, final QA approved and client handover. These are project milestones, distinct from invoice terms.

Starting links include parallel design and procurement branches after scope confirmation, electrical and HVAC first-fix work proceeding in parallel where permitted, ceiling closure requiring both first-fix completion and a separately approved inspection, and joinery fabrication running alongside site preparation before installation. Handover depends on final QA and required documents, not simply the last task in a single chain. The PM can edit/remove/add each proposed task and link before confirming; instantiation assigns real stable IDs and never leaves a link to a discarded preview task.

## Recommended implementation order and ownership

| Stage | Owner | Scope | Exit checkpoint |
| --- | --- | --- | --- |
| 0. Semantics approval | Owner + coordinator | Approve the decisions in this document and [rules](DEPENDENCY-SCHEDULING-RULES.md). | Written scope approval before any app code changes. |
| 1. Model and safe migration | Domain/engine agent | Add optional planning schema, one-time legacy link adapter, validation, baseline/approved/proposal records, recovery tests. | Old saved data opens unchanged; no implicit baseline or data loss. |
| 2. Calendar, engine and commands | Domain/engine agent | Working-day math, four link types, forward/backward passes, conflicts, deterministic proposal, stale guard and atomic decision commands. | All deterministic unit tests pass, including storage rollback. |
| 3. Task/proposal interaction and Gantt | UI agent | Reuse Tasks/TaskDrawer, build plan review and accessible chart/table/mobile view against agreed read-only view model and commands. | Browser flow, geometry and keyboard checks at four widths. |
| 4. Integration and release gate | Coordinator + independent QA agent | Resolve shared files deliberately, verify all CRM modules, migration, PDFs, production build and browser suite. | Exact tested SHA and pass/fail report; no push/deploy without separate instruction. |

**Code ownership contract:** Domain/engine agent owns `src/domain/model.ts`, planning model/engine/commands/migration/validation and domain tests. UI agent owns `src/components/Planning.tsx`, timeline-specific `src/styles.css` rules, TaskDrawer planning controls and browser tests. Changes to shared `TaskDrawer`, `Tasks`, `store`, `repository`, `seed`, and project Dashboard are coordinated through agreed interfaces and reviewed by the coordinator; no whole-file replacement of concurrent work.

## Decisions for owner review

1. **Progress continuity:** Approve displaying duration-weighted leaf-task planning progress as a new metric first, with any replacement of existing phase-weighted Dashboard percentage deferred until an explicit migration decision.
2. **Legacy baseline:** Approve leaving baseline “Not set” on existing projects and allowing an explicit PM capture action. Legacy task dates stay the current approved schedule.
3. **Schedule approval identity:** Approve the existing project manager as the demo approver; this is recorded for local review and is not secure RBAC.
4. **Mobile layout:** Approve a task-first planning list with a horizontally scrollable date rail and proposal details at 390px; the complete dense desktop grid is not squeezed into the viewport.
5. **Hours:** Approve storing/displaying project working hours while scheduling at working-day precision in release one.
6. **Pull-forward:** Approve default downstream **push-only** proposals. Earlier feasible dates require an explicit PM “consider earlier dates” action so the engine does not unexpectedly advance work.

## Risks and non-goals

The largest risks are accidental rebaselining, direct TaskDrawer date writes bypassing review, dual dependency write paths, changed historical progress percentages, task-linked milestone auto-sync outside approval, timezone/holiday boundaries, misleading critical-path labels on infeasible plans, and browser storage limits. The [data model](PLANNING-DATA-MODEL.md), [rules](DEPENDENCY-SCHEDULING-RULES.md), [UX spec](GANTT-UX-SPEC.md), and [acceptance plan](TEST-AND-ACCEPTANCE-PLAN.md) set explicit gates for each.

No backend, deployment, automatic external notifications, resource leveling, task-bar drag commit, or contract/payment-date mutation is in scope. This document authorizes no application-code changes.
