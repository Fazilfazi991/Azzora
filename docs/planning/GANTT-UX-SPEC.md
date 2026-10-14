# Planning and Gantt UX specification

**Status:** Proposed design contract; no UI code changes yet. Reuse AZZORA's [Architectural Prestige design system](../../stitch_azzora_fit_out_crm_shell/architectural_prestige/DESIGN.md), existing task drawer, project routes and accessibility conventions.

## Design intent

The primary user is a Project Manager checking whether a fit-out handoff can occur on time, then reviewing a specific delay before approving any move. The screen should make the **cause of a date change** as legible as the date itself. Domain language is phases, trades, handoffs, inspections, authority approvals, material delivery and client handover. The visual vocabulary remains AZZORA's warm stone surfaces, terracotta action/variance accents, bronze structural lines, sage approved states, Space Grotesk headings and Inter data text. The signature interaction is a readable **handoff path**: selecting a task shows its predecessor conditions, affected successors and approved-versus-proposed dates without turning the chart into a wall of colored bars.

Avoid a generic rainbow Gantt, a giant fixed task pane, and tiny text forced inside short bars. Use the existing 8px spacing rhythm, hairline separators, tabular dates and restrained semantic color. Do not redesign unrelated pages.

## Page hierarchy

1. Project selector and programme heading with current approved finish, optional baseline finish, proposed finish (only when a proposal exists), and unchanged project target.
2. Action strip: Add task/milestone, Calendar, Template, proposal status/Review, day/week/month scale, Today, zoom, assignee/status filters, and column visibility.
3. Warnings summary: overdue, blocked, date conflict, pending approval, at-risk milestone, critical delay, missing predecessor, inactive assignee, nonworking date. Each count opens an actionable list; no external-notification claim.
4. Main plan: phase/work-package/task rows in a compact table aligned one-for-one with the timeline. Phase and summary rows expand/collapse. A linked milestone appears as its own event row only when useful, with a task association label, not a duplicate work task.
5. Context drawer: selected task or milestone, full title/details, progress history, predecessor/successor list, constraints, inspection blockers and actions. The existing `TaskDrawer` remains the task editor; planning-specific controls call one shared schedule command layer.

## Main chart and row contract

Use a **single vertical scrollport** for table and timeline so rows cannot desynchronize. The task pane remains visible during *horizontal* timeline scrolling; the date header and table header are sticky below the page toolbar and never cover rows. Shared row IDs/heights, measured geometry and one scroll owner replace separate unsynchronized DOM maps and hardcoded SVG Y coordinates. When expanded rows need more height for accessible text, both halves use the same height. Empty phases and filtered views retain honest alignment and meaningful empty states.

At 1440px, aim for a task pane around 360–440px with configurable secondary columns, leaving most space to the date grid. At 1024px, start around 300–340px and collapse optional columns. At 768px, prioritize task/name plus approved dates and a scrollable chart. At 390px, present a task-first view with a horizontally scrollable timeline rail or an explicit Tasks/Timeline switch; keep milestone, dependency and proposal information reachable without hover. The chart must not disappear silently. Exact pixels are acceptance-tuned in the browser; no fixed width may make the bars unusably narrow.

Default table columns: Task/phase, assignee, approved start, inclusive finish, working-day duration, reported progress, status. Optional columns include planned progress, total float, constraint, baseline dates and proposal delta. Dates align numerically; long names wrap or expand to detail, never overlap neighbors. Short bars may omit internal text, but their visible/focusable control exposes full name, dates, duration, progress, type and blocking reason through an accessible label and detail panel.

## Visual layers and semantics

| Element | Presentation | Accessible meaning |
| --- | --- | --- |
| Approved task | Solid warm-neutral bar; reported progress fill | Task name, approved local dates, progress and status |
| Baseline | Thin outline/marker behind approved bar | “Baseline” with explicit captured date/revision |
| Proposed | Dashed outline or offset ghost layer; visible only in proposal mode | Proposed dates and day delta; no implication it is approved |
| Milestone | Distinct diamond on the event date | Milestone name, due/actual date, explicit completion/approval condition |
| Dependency | Restrained connector path, highlighted on selection | Typed FS/SS/FF/SF + signed working-day lag in detail list |
| Today | Fine vertical marker with text in header | Today in project timezone |
| Critical | High-contrast line/border and “Critical” text/chip | Zero-float task under a feasible schedule only |
| Conflict/blocked | Warning icon/pattern + text, not color alone | Specific violated bound, missing link, lock or approval requirement |
| Actual start/finish | Small event ticks on bar | Recorded actual dates, clearly separate from planned progress |

Day/week/month scale changes date-grid labeling and column grouping, not stored task dates. Week/month views keep accurate day-position alignment beneath their grouped headers. Chart and table use the same local-date formatter and inclusive-finish rule. Proposals with unresolved conflicts show the conflict layer and disable approval; they do not display a confident critical path.

## Interaction and review

- Row, bar and milestone controls are keyboard focusable. Enter/Space opens details; arrow-key chart navigation may be added only if focus behavior remains predictable. Explicit buttons handle Add/Remove predecessor, type, lag, constraints and proposal submission; drag interaction is optional and never the sole route.
- Changing an approved task's date/duration or a dependency opens a draft **schedule proposal**. Nothing silently commits approved dates. A drag, if later implemented, produces the same draft.
- The review panel presents a before/after table for the initiating task, direct and indirect successors, unchanged float-absorbing tasks, milestones and project finish. It shows reason, actor, source revision, critical-path difference, warnings/conflicts and a link to each affected task.
- Submission records the draft revision. Approve, Reject and Revise are distinct actions. A stale submission offers Recalculate and does not enable Approve. Rejection leaves approved bars unchanged. After approval, focus returns to the proposal trigger, and the approved bars update together.
- Negative lag/lead requires an explicit warning and confirmation describing the overlap. A link and an inspection requirement are visually and textually distinct.
- Template selection opens an editable preview of the 12 fit-out phases and parallel dependency branches. The PM can add/remove/rename activities and inspect links before confirming. Stable IDs are assigned once on instantiation; template preview does not create tasks.
- Progress report action asks for percent, local update date, actor and notes; optional site evidence uses existing attachment/reference rules. 100% work completion does not imply inspection approval.

## Current UI defects and acceptance

Current [Planning](../../src/components/Planning.tsx) maps left and right rows separately and fixes SVG connector positions to 48px assumptions. Current [CSS](../../src/styles.css) fixes the left pane at 610px (525/440px at narrower widths), clips names with ellipsis, scrolls the right pane horizontally, and hides the chart below 768px. The implementation must remove the fixed-space bottleneck, keep one vertical scroll position, make headers sticky without overlap, and preserve full task names in row detail/focus. The Add Task action must handle a project with no phase instead of assuming `phases[0]` exists.

Capture before/after browser views at **1440, 1024, 768 and 390px**, including a long task name, one-day bar, many rows, collapsed phase, multiple dependencies, a proposed overlay, conflict, milestone, keyboard focus and horizontal/vertical scroll. The screenshot mentioned in the owner specification was not included in the text attachment, so the first implementation step should capture the actual baseline in the current app. Mobile acceptance requires reaching the chart and review actions; a static list alone is insufficient.

No motion is proposed in this specification. If implementation later adds motion, first perform the required read-only animation-opportunity assessment, then implement only purposeful, reduced-motion-safe transitions in a separate step.
