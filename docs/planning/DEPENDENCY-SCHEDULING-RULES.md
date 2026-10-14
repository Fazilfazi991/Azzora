# Dependency and scheduling rules

**Status:** Proposed release-one semantics; owner approval required before implementation. The current code has only calendar-day date helpers and untyped finish-to-start predecessor IDs.

## Calendar and dates

- Store schedule dates as ISO `YYYY-MM-DD` **local project dates**, not UTC instants. Every project has an IANA timezone (default `Asia/Dubai`), a nonempty set of working weekdays, working hours metadata, explicit public holidays and project nonworking dates. No UAE weekend pattern is hardcoded.
- A normal task has integer duration **at least one working day**. Displayed start and finish are both inclusive; a one-day task starts and finishes on the same working date. A milestone has duration **zero** and one event date (`start = finish` for chart alignment).
- `W(date, n)` means moving `n` working dates from a valid working date; `W(date, 0) = date`. `finish(start, d) = W(start, d - 1)` for a task of duration `d ≥ 1`. Conversely, `start(finish, d) = W(finish, -(d - 1))`. Calendar-day distance never substitutes for working-day distance.
- Existing approved dates that fall on a nonworking day are **flagged**, not silently normalized. New/proposed normal task dates must be working dates. A required milestone date on a nonworking day is a conflict until explicitly resolved.
- Configured work hours inform display and future integration, but no fractional-day or hour-level scheduling is promised in release one. Holidays are explicit dates; the app does not infer public holidays from a country name.
- Dates generated in the project timezone remain stable across browser timezone and daylight-saving changes. `Project.due` stays the contractual/management target and is not the mutable forecast finish.

## Typed predecessor links

Each directed link has a stable ID, project ID, predecessor node, successor node, type `FS | SS | FF | SF`, and signed integer `lagWorkingDays`. Both endpoints are task or milestone IDs in the same project. Default is **FS + 0**. An approval/inspection condition is a different record and never implied by a temporal link. Multiple predecessors combine by the **latest** lower bound that they impose.

Let `P` be the predecessor and `S` the successor. For normal tasks, `P.start/P.finish` and `S.start/S.finish` are inclusive working dates.

| Type | Successor bound | Example with zero offset |
| --- | --- | --- |
| FS | `S.start ≥ W(P.finish, 1 + lag)` | Successor starts on the next working day after predecessor finishes. |
| SS | `S.start ≥ W(P.start, lag)` | Both may start on the same working day. |
| FF | `S.finish ≥ W(P.finish, lag)` | Successor may start earlier but cannot finish earlier. |
| SF | `S.finish ≥ W(P.start, lag)` | Advanced relation: successor finish depends on predecessor start. |

For FF/SF, convert the required finish bound to a required start using the successor's unchanged duration. A successor's actual proposed start is the maximum of its approved/revised release date, Start No Earlier Than constraint, and all converted link bounds. Its finish follows from its duration. A task with multiple predecessors must satisfy **all** bounds.

**FS lag convention:** FS +2 adds two *extra* working days after the ordinary next-working-day start; FS −1 allows the successor to start on the predecessor's finish date. SS +1 starts one working day after the predecessor starts. FF/SF offsets act directly on their respective anchor. Negative values are lead/overlap and require a visible warning and explicit confirmation; they do not imply inspection approval. The UI must show the computed first permitted date in addition to the `+/-` value.

Example with Friday and Saturday nonworking: if the predecessor finishes Thursday, FS +0 permits Sunday, FS +1 Monday and FS −1 Thursday, unless a configured holiday skips one of those dates. Tests must use explicit calendar fixtures rather than locale defaults.

## Graph integrity and deterministic order

Reject self-links, duplicate links for the same predecessor/successor/type/lag combination (and require explicit revision rather than a second competing link between the same endpoints), cycles, missing/deleted endpoints, and cross-project links. Task-parent membership is a visual/work-package hierarchy and is **not** automatically a dependency. Linked legacy task IDs are adapted once as FS +0. A milestone can be predecessor or successor. Validation runs both when importing saved data and when editing/submitting/approving; invalid original browser data remains exportable via existing recovery.

Topologically sort nodes with stable ID tie-breaking, so equivalent inputs produce the same proposal and test results. The affected set is the edited node plus reachable successors; predecessor branches not reachable from it remain unchanged. Unaffected successors may stay on their approved dates when their float absorbs a delay.

## Proposed schedule calculation

1. Capture a canonical source revision/fingerprint covering the project calendar, node IDs, approved dates/durations, actuals, constraints, dependency links and approval conditions relevant to the graph.
2. Apply the initiating edit in a **draft overlay**, leaving approved task/milestone records untouched. If duration changes without a new start, anchor its start and recalculate finish; the UI states this rule. A PM can explicitly choose a different anchor.
3. Validate the graph and calendar. Calculate predecessor bounds in topological order. Preserve each downstream task's approved duration unless its own duration is explicitly edited.
4. By default use **push-only** downstream movement: an unaffected successor starts no earlier than its current approved start. A separate opt-in may calculate pull-forward suggestions. A delay therefore does not move every successor.
5. Respect completed actuals: a completed task's actual/approved event is fixed for calculations. Do not move a started task before its actual start or change an actual finish. A conflict remains visible if these facts cannot satisfy a new link.
6. Apply constraints. Start No Earlier Than raises the lower bound; Finish No Later Than is a hard upper bound, not permission to shorten duration. Locked start/finish dates and required milestone dates are fixed. If bounds disagree, record an unresolved conflict and block submission/approval; never silently move a lock or compress work.
7. Recalculate milestone events only from their explicit link or condition rule. Existing linked milestone dates can move **only in the same approved change set** as their task, not via an independent side effect.
8. Produce a stable, reviewable change set: before/after dates and durations, direct versus indirect successors, milestone and project-finish delta, constraints, warnings, float/critical-path effects and unchanged successors that absorbed impact. No displayed example date may be hardcoded.

The project forecast finish is the latest finish/event among included terminal work/milestones, with the set defined in the data model. Compare it with the current approved finish, optional baseline finish and unchanged `Project.due`.

## Critical path and float

Use a generalized precedence network with start/finish event points per task and event points for zero-duration milestones. Duration and FS/SS/FF/SF links become working-day lower-bound inequalities. A forward longest-path pass computes earliest feasible event dates from project start, approved release dates and lower-bound constraints. A backward pass from the **approved project finish** computes latest allowable event dates. Total float is the number of working days an activity can slip from its earliest feasible start without moving that finish or violating a hard constraint. Zero-float activities form the critical network; show parallel critical branches if there are several. Calculate the proposed critical network separately against proposed completion.

Do **not** color a task critical merely because it is late, blocked or 0% complete. If fixed dates, actuals, upper-bound deadlines, or an impossible link make the graph infeasible, show explicit conflict details and suppress a definitive critical-path claim for that version. A feasibility check precedes every CPM result. A negative float indicates a deadline violation and is presented as a conflict, not a valid critical path.

The first release does not resource-level tasks or infer float from employee capacity. Inactive assignees create a warning and an assignment action, not automatic schedule movement.

## Progress and completion

Planned progress is a linear display curve over scheduled working dates: zero before start, `elapsed scheduled working days / duration` during the task, and 100% after finish. It is labeled **planned**, never written into actual progress. Actual progress is the reported 0–100% value with date, actor, note and optional existing evidence reference. A parent/work package rolls up leaf activity progress without counting its own percentage again. Default project planning progress is duration-weighted leaf-task progress; zero-duration milestones and summary rows are excluded unless an explicit positive weight is approved and shown.

Task work completion (100% / Completed) remains separate from any required document, site or QA inspection. A milestone condition may require both work completion and an explicit approval; it is not satisfied by the task's percentage alone. Existing `completedAt` is retained as legacy evidence; migration does not fabricate missing actual-start or actual-finish dates.

## Proposal decision rules

States: Draft Proposal → Submitted for Review → Approved or Rejected. Revise creates a new draft revision, preserving prior decisions. Submission requires a reason, an initiating node, no unresolved conflicts and a calculated impact set. PM approval identity is recorded as a **demo actor**.

Immediately before approval, recompute the source fingerprint and validate the complete change set. Any relevant task, milestone, link, calendar or constraint change makes the submission stale; it must be recalculated/re-submitted. Approval changes all approved dates and the proposal/history in one cloned-database `mutate` followed by one local-storage write. A thrown validation or failed `setItem` leaves memory and stored data unchanged. Rejection records the decision but never changes approved dates. Neither action changes baseline; rebaselining is a separate explicit authorized action with its own immutable previous-version history.

Browser-local storage cannot provide secure role enforcement or cross-tab/server transactions. The interface must say this in relevant approval context rather than imply enterprise-grade synchronization.
