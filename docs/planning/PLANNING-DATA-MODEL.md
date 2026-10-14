# Planning data model and migration contract

**Status:** Proposed additive browser-local schema; review before application code.
**Authority:** Existing `Database.tasks` remains the sole project activity register. `Database.milestones` remains the project milestone register. There is no second timeline-task collection.

## Existing records and compatibility

Current [Task](../../src/domain/model.ts) has `id/projectId/phaseId/parentId`, name/description, one assignee, `start/due`, progress/status, bare predecessor IDs, priority, attachments/comments and timestamps. Current [Milestone](../../src/domain/model.ts) has `id/projectId/name/due/taskId`. [Project](../../src/domain/model.ts) has `start/due/managerId`. [saveTask](../../src/domain/repository.ts) updates dates directly and auto-syncs linked milestone due; [projectProgress](../../src/domain/logic.ts) is phase-weighted. Existing task, project, milestone, employee, document and commercial IDs must never be regenerated during migration.

Retain `Database.version = 1` and storage key `azzora-demo-v1`. Add optional `planningVersion?: 1` and `planning?: ProjectPlanning[]`; old saved JSON remains readable. Initialization is a pure in-memory adapter after saved-shape validation and before rendering. It must not call `localStorage.setItem` merely because old data was opened. The existing read-only recovery/export path remains available for malformed or incompatible data.

## Proposed canonical records

The following is a contract sketch, not implementation code:

```ts
type LocalDate = string; // validated YYYY-MM-DD in the project timezone
type NodeRef = { kind: "task" | "milestone"; id: string };
type LinkType = "FS" | "SS" | "FF" | "SF";

interface ProjectCalendar {
  timezone: string;                 // IANA; default Asia/Dubai
  workingWeekdays: number[];        // ISO 1=Mon ... 7=Sun; nonempty
  workdayStart: string;             // HH:mm, metadata in release one
  workdayEnd: string;               // HH:mm, metadata in release one
  holidays: LocalDate[];            // explicit
  projectNonworkingDates: LocalDate[];
}
interface DependencyLink {
  id: string;
  projectId: string;
  predecessor: NodeRef;
  successor: NodeRef;
  type: LinkType;
  lagWorkingDays: number;
  createdAt: string;
}
interface TaskPlanning {
  taskId: string;
  durationWorkingDays: number;      // >=1 for work tasks
  scheduleRole: "work" | "summary";
  startNoEarlierThan?: LocalDate;
  finishNoLaterThan?: LocalDate;
  lockedStart?: LocalDate;
  lockedFinish?: LocalDate;
  actualStart?: LocalDate;
  actualFinish?: LocalDate;
  explicitProgressWeight?: number;
  assigneeIds?: string[];           // includes existing primary assigneeId
  requiredInspectionIds?: string[]; // separate from temporal links
  progressHistory?: ProgressReport[];
}
interface MilestonePlanning {
  milestoneId: string;
  requiredDate?: LocalDate;
  actualDate?: LocalDate;
  completionCondition:
    | { kind: "Manual" }
    | { kind: "TaskComplete"; taskId: string }
    | { kind: "DocumentApproved"; documentId: string }
    | { kind: "QAApproved"; referenceId: string };
  completedAt?: string;
  completedBy?: string;
}
interface ScheduleSnapshot {
  id: string;
  revision: number;
  capturedAt: string;
  actorId: string;
  reason: string;
  calendar: ProjectCalendar;
  nodes: Array<{ node: NodeRef; start: LocalDate; finish: LocalDate;
                 durationWorkingDays: number }>;
  links: DependencyLink[];
  finish: LocalDate;
}
interface ScheduleProposal {
  id: string;
  projectId: string;
  revision: number;
  status: "Draft" | "Submitted" | "Approved" | "Rejected";
  sourceApprovedRevision: number;
  sourceFingerprint: string;
  initiatingNode: NodeRef;
  reason: string;
  initiatedBy: string;
  submittedAt?: string;
  submittedBy?: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  changes: Array<{ node: NodeRef; before: { start: LocalDate; finish: LocalDate;
             durationWorkingDays: number }; after: { start: LocalDate;
             finish: LocalDate; durationWorkingDays: number };
             cause: "direct" | "indirect" }>;
  warnings: ScheduleWarning[];
  conflicts: ScheduleConflict[];
  history: WorkflowEvent[];
}
interface ProjectPlanning {
  projectId: string;
  calendar: ProjectCalendar;
  approvedRevision: number;
  baselineStatus: "Unset" | "Captured";
  baselineHistory: ScheduleSnapshot[]; // append-only; current is last
  taskPlanning: TaskPlanning[];
  milestonePlanning: MilestonePlanning[];
  links: DependencyLink[];          // canonical schedule links
  proposals: ScheduleProposal[];    // append-only decisions/revisions
}
```

`ScheduleWarning` and `ScheduleConflict` are typed code/detail/node references, not free-form strings used for business decisions. Proposal change rows are derived snapshots; the persisted approved dates continue to live on existing task `start/due` and milestone `due`. Draft/proposed dates never overwrite those fields. A phase is a grouping row, not a schedule activity. Parent tasks explicitly marked summary have derived dates/progress and no independent duration weight; legacy parents with children and independent work or links are flagged for PM classification rather than silently changed.

### One dependency write path

For a project with planning enabled, `ProjectPlanning.links` is the sole writable link source. Existing `Task.dependencies: string[]` is a **legacy import field**: map each valid predecessor ID to one task→task FS +0 link on first compatibility initialization. Preserve the original field in saved records for historical compatibility, but make every current view and command read canonical links; do not write both arrays. The task editor's old multi-select and risk calculation must be routed through the canonical adapter before the feature is enabled. Tests must prove that editing links through Tasks and Planning produces one graph, with no divergent write path. Projects not yet planning-enabled keep their old behavior until activated.

Milestone links use the same canonical collection and stable milestone IDs. Existing task-linked milestones keep their ID and task association. A new independent milestone may have an absent/empty `taskId`; validation is additive. Do not confuse project milestones with quotation payment milestones or invoice schedule terms.

### Approved, baseline and forecast

- **Current approved:** existing task `start/due` and milestone `due`, plus `approvedRevision`. On migration, all legacy dates stay here exactly as saved, even if they violate the new calendar. They are shown with a conflict/warning, not rewritten.
- **Baseline:** absent for legacy projects until an explicit PM capture. Every capture/rebaseline appends a complete immutable snapshot with actor, date and reason. Approval of a proposal never updates baseline.
- **Proposed/forecast:** proposal overlay and deterministic engine result. Persist the submitted change set and source fingerprint for audit; recalculate before approval. Draft revisions may be replaced only by a new revision, not by editing an approved/rejected record.

The current `Project.due` is a target. Baseline, approved and proposed project finishes are derived from their respective included terminal nodes. Do not mutate target dates, contracts, quotation snapshots, invoices or payment schedules as an incidental effect of schedule approval.

### People, progress and approvals

Existing `Task.assigneeId` remains the primary person for old views. Optional `assigneeIds` adds collaborators, each referencing active or historically valid employees; changes go through existing assignment/workforce commands. An inactive assignee is a warning. Schedule approval does not silently extend/rewrite staff allocation dates; show a separate assignment review need.

Progress reports hold `id/taskId/date/actorId/percent/notes/evidenceRefs/createdAt`; reported percentage is stored on the existing task through one command and history is append-only. Planned progress is calculated, never stored as actual. Existing `completedAt` remains source evidence; migration does not synthesize missing actual dates. Inspection and document-approval requirements are separate references. A task can be 100% work-complete with inspection pending. Linked milestone completion checks its own condition, never invoice payment status.

Schedule proposals use their own approval state and decision history. Existing procurement/variation/document `ApprovalKind` records are not repurposed; if the common approvals screen displays schedule decisions, it does so through an adapter to the schedule proposal command rather than a duplicate writable approval row. `Project.managerId` is the demo approver by default, without claiming secure RBAC.

## Migration and persistence sequence

1. Validate the original JSON shape before rendering. On failure, preserve the exact original bytes, disable writes and offer existing recovery export.
2. For a valid legacy project, create **in-memory** default calendar metadata and `baselineStatus: Unset`. Preserve all task/milestone dates, IDs, progress, status, assignments and attachments.
3. Adapt each legacy predecessor ID to a stable deterministic link ID and FS +0. Report invalid/duplicate/cyclic source relationships as recoverable incompatibility or a reviewable conflict, never silently drop them. New links and their IDs are persisted only on a subsequent authorized write.
4. Infer normal-task duration from inclusive working dates **only when dates are valid working dates**. For legacy off-calendar dates, retain the dates and flag `durationNeedsReview`; do not change them to make migration pass. Parent/linked-milestone ambiguities likewise require review.
5. Establish revision/fingerprint from the exact approved graph/calendar. Do not fabricate an approved baseline or historical progress event.
6. Save a future mutation by cloning the whole database, validating and applying the command, then one `localStorage.setItem`. Publish UI state only after the write succeeds. A quota/storage error leaves the original key and in-memory state unchanged.

Add saved-shape validation for optional planning data, graph endpoints, uniqueness, cycles, same-project refs, calendar/date constraints, proposal state/history and baseline immutability. Reject an incompatible future planning version into existing recovery mode rather than resetting data. Round-trip tests must compare all original customer, quotation, contract, invoice, project, task, employee and document IDs and records.

## Source touch points

The intended implementation touches `src/domain/model.ts`, `src/domain/validation.ts`, `src/domain/repository.ts`, `src/domain/logic.ts`, a new isolated `src/planning/` engine/migration/commands area, `src/domain/seed.ts`, `src/store.tsx`, `src/components/Planning.tsx`, `src/components/TaskDrawer.tsx`, and timeline CSS. These are proposed changes only; none are made by this specification.
