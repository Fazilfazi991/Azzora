# Timeline test and acceptance plan

**Status:** Test contract for a future approved implementation. No application code or tests are added in this documentation phase.

## Deterministic engine fixtures

Use ISO local dates, a declared `Asia/Dubai` timezone and explicit calendars in every fixture. Never use the machine's timezone or today's date as an expected schedule value. Unless stated otherwise, the examples below use Monday–Friday working days, no holidays, inclusive task finish and FS +0 as next working day.

| Case | Fixture | Required assertion |
| --- | --- | --- |
| Inclusive duration | One-day task on Mon 2 Nov 2026; three-day task starts same day | Finishes Mon 2 Nov and Wed 4 Nov respectively; milestone duration 0 is an event, not a one-day task. |
| Weekend/holiday | Predecessor finishes Fri 6 Nov; Mon 9 Nov is a configured holiday | FS +0 successor starts Tue 10 Nov; no UTC/browser-timezone drift. |
| Four types | FS, SS, FF and SF using separate two-task fixtures | Each bound matches [rules](DEPENDENCY-SCHEDULING-RULES.md), including finish-bound-to-start conversion for FF/SF. |
| Lag/lead | Predecessor finishes Tue 3 Nov | FS +2 starts Fri 6 Nov; FS −1 starts Tue 3 Nov and warns for overlap. SS +1 advances exactly one working day. |
| Multiple predecessors | A finishes Tue 3 Nov, B finishes Thu 5 Nov, C depends FS +0 on both | C starts Fri 6 Nov; deleting one link cannot ignore the other. |
| Integrity | Self, duplicate, cycle, missing/deleted, cross-project and invalid milestone links | Reject before save and on saved-data load; preserve original browser bytes for export if load fails. |
| Parallel network/float | A: Mon 2–Tue 3; B: Wed 4–Fri 6 after A; C: Wed 4–Thu 5 after A; D: Mon 9 after B and C | A/B/D are critical; C has one working day of float. Delay C by one working day moves no approved downstream date. |
| Milestone | Zero-duration inspection event Tue 3 Nov with FS +0 successor | Diamond is on Tue 3 Nov; successor earliest Wed 4 Nov; milestone completion still depends on explicit condition. |
| Locked/actual | Delay predecessor until successor's fixed start becomes impossible | Proposal reports unresolved conflict; no lock/actual date shift and no automatic task shortening. |
| Constraint | SNET and FNLT on a two-day task; required milestone date | Earliest date respects SNET; infeasible FNLT/required date blocks approval and suppresses valid-CPM claim. |
| Proposal set | Initiating task, direct and indirect successors, one float-absorbing successor | Before/after rows, causes and project-finish impact match engine output; unchanged successor is explicitly listed. |
| Source stale | Submit then change task dates, duration, link, calendar or actual date | Approval refuses stale proposal and preserves approved records; recalculate creates a new revision. |
| Decision atomicity | Approve valid multi-task proposal; reject another; throw on local-storage save | Approval updates all affected approved dates/history once; rejection changes no approved date; failure changes no stored or in-memory record. |
| Baseline | Capture baseline, approve later proposal, explicitly rebaseline with reason | Initial baseline is immutable through approval; rebaseline appends a new snapshot and retains old one. |
| Progress | Two leaf tasks weighted 2 and 6 working days at 100% and 0%, plus parent and unweighted milestone | New planning progress is 25%; parent/milestone are not double-counted. Planned curve never overwrites reported actual. |
| Approval separation | Task 100% with pending inspection; independent QA/doc condition incomplete | Task work may be complete while inspection/milestone remains pending. Invoice payment cannot satisfy physical milestone. |
| Legacy migration | Valid saved v1 project, old string predecessor IDs, off-calendar task, no baseline | IDs and original dates unchanged; FS +0 links adapted; baseline shown “Not set”; off-calendar issue is flagged without rewrite. |

The expected critical path in the parallel fixture is a **network calculation**, not a styling assertion. Add another case with an infeasible lock or negative float and assert that the UI does not label it a valid critical path.

## Browser acceptance journeys

1. **Full PM path:** Create a project task from the existing Tasks/Planning register → assign an active employee → add typed predecessor and lag → delay the initiating task → inspect direct/indirect impact, float, milestone and project finish → submit → approve as project manager demo actor → verify all new approved dates together, baseline unchanged, proposal/history and task/activity log persisted after reload.
2. **Rejection:** Submit a valid proposal → reject with reason → reload → approved task/milestone dates unchanged, immutable rejection history visible.
3. **Stale:** Submit → edit a source task/link/calendar in another allowed path → attempt approval → stale error, no partial write, Recalculate action works.
4. **Conflict:** Lock successor or set an impossible finish deadline → create upstream delay → conflict names violated task/date/bound; Approve disabled; no misleading critical highlight.
5. **Milestone/inspection:** Work reaches 100% while inspection pending → task work status and milestone/approval state remain distinct; explicit approval updates only appropriate condition.
6. **Template:** Preview 12 fit-out phases, remove and add one activity, retain parallel branch, confirm → one task record per chosen activity, all link endpoints stable IDs, no phantom template tasks.
7. **Recovery:** Load malformed or incompatible optional planning data → read-only recovery and original export; valid legacy data opens without a storage write; storage quota failure rolls back a proposal approval.

## Visual and accessibility acceptance

At 1440, 1024, 768 and 390px capture the actual existing baseline and the new result with identical task fixtures. Verify no clipped task names, header overlap, narrow/unusable bars, disappearing task pane during horizontal scrolling, divergent vertical row positions, or hidden chart access on mobile. Test long names, short bars, dozens of rows, phase collapse, filter change, zoom, week/month grouping, today marker, baseline/approved/proposed overlays, dependency arrows, milestone diamond and critical/conflict distinction. Verify a short-height 390px viewport too.

Keyboard-only users must be able to open task/milestone detail, create/remove/change every dependency type and lag, review and decide proposals, operate filters and chart scale, and return focus to the opener when drawers close. Full names and dates are available on focus; color is never the sole status signal. Screen-reader labels distinguish approved, baseline and proposed dates and identify a critical task only under a feasible schedule. Reduced-motion users receive no essential information through motion.

The referenced screenshot was absent from the pasted attachment. The first implementation QA step records source-state screenshots at all four widths before any UI changes, then compares the same fixtures.

## Integration and regression gate

Run TypeScript, ESLint, relevant new unit tests, the full existing unit suite, production build, and all applicable existing browser suites on a frozen SHA. Record exact counts and any stopped/failed attempts separately. The last verified CRM baseline had 338 unit tests and 25 development plus 25 production browser suites; future totals must be measured, not copied.

Retest quotation editor/PDF and accepted snapshot immutability, financial VAT/discount/credit/refund/report calculations, contracts and invoice payment schedules, variations and procurement, workforce assignments, document approvals, QA and handover, backup/recovery and the original database key. Scheduling must not mutate commercial records or convert a procurement event into an approved date shift without a proposal.

For every critical failure, assign the owning domain/UI area a correction, then rerun its deterministic tests and affected integration journey. Independent QA signs off only on the full frozen SHA after corrections. No publish, deploy, main merge or backend work is part of this plan.

## Acceptance gate before coding

Owner approval must cover the six decisions in [functional scope](TIMELINE-FUNCTIONAL-SPEC.md), the date/lag/critical-path semantics in [rules](DEPENDENCY-SCHEDULING-RULES.md), the additive migration in [data model](PLANNING-DATA-MODEL.md), and the responsive mobile design in [Gantt UX](GANTT-UX-SPEC.md). Until then, these are review documents only.
