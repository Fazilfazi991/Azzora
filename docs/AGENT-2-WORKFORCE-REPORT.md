# AZZORA Agent 2 — Workforce, Site Operations & Approval Workflows

Completed 14 October 2026 (Asia/Dubai). Local React/Vite implementation; no deployment or merge.

## Git delivery and isolation

- Branch: `codex/azzora-workforce-approvals`
- Dedicated worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-workforce-approvals`
- Verified base: `ada782a21232b3072850889e3796c3bc5c8d5dd4`. Its `docs/COMMERCIAL-DELIVERY.md` records the prior passing baseline. The original checkout had unfinished changes and was left untouched; none were copied into this worktree.
- Implementation and evidence commit: `06b1ad206c94c7ad154c05ff4e5b079c2e1ada50`
- This report is committed separately after that implementation commit so it can reference an exact, immutable SHA.
- No reset, deletion, overwrite, cherry-pick or merge of another agent's work. No deployment, remote push or database provisioning.

## Features delivered

### Employee directory and workload

The existing `Database.people` collection is the employee directory. Add/Edit captures stable ID, optional employee code, name, email, phone, department, role, employment status, capacity and notes. Email/code uniqueness and capacity validation run in domain commands. Search, department/status filters and employee profiles expose current and historical tasks, project roles and change history.

Deactivation requires an explicit demo actor and reason. It retains every employee ID, project assignment, project manager reference and task owner. Inactive staff cannot receive new projects, task allocations or review actions. Existing task progress can still be recorded against its historical owner. Reactivation preserves ID/history. Away staff remain assignable.

Project assignment replacement retains the former assignment as Replaced, optionally transfers unfinished tasks and records each transfer. Completed task ownership remains unchanged. Project manager assignment changes update or clear the manager pointer. Assigning a task to a new project employee creates a project membership if needed. Workload uses the existing sum of unfinished leaf-task allocations on active projects; cards compare it with the employee's configured capacity.

### Documents and drawings

`Draft → Pending → Approved / Rejected`. Submission locks that revision's metadata and attachment. Approved and rejected revisions cannot be edited; Create Revision adds a separate stable ID, family ID, predecessor ID and incremented version. The new draft starts without an attachment so the author explicitly supplies the corrected file. Duplicate revision branches and manual revision identity changes are rejected.

The register shows latest family revisions by default, with Show all revisions, historical review details and per-version downloads. Approved versions and their bytes/history remain unchanged when a new revision is created. Self approval is rejected. Submit/review/revision actions require an active, explicitly selected demo actor and a note/reason. History snapshots retain actor names and Dubai-local timestamps.

Metadata-only records remain supported, including the existing seed documents. The UI states this explicitly; saving metadata alone does not manufacture a file.

### Site supervision and QA

Site updates submit for Pending review. A different demo supervisor approves them or requests changes with a reason. Returned records can be corrected and resubmitted. The prior record remains in history; approved records cannot be edited through this workflow. Completed work, date and whole-number manpower validation run before saving. Daily records document progress; existing task/phase calculations remain authoritative for project percentages.

QA supports Open → Assigned → Rectification → Ready for Inspection → Closed. Assignment changes, reasons, inspection notes, actors and prior values are retained. Skipped transitions are blocked. Closure requires an independent inspector and inspection notes. Failed inspections or reopened closed snags return to Rectification with a reason; old closure history remains and fresh inspection notes are required. Before/after attachments remain supported. The legacy `transitionSnag` API delegates to the same validated command.

### Operational handover

Three read-only derived criteria augment the existing applicable checklist:

1. All latest approval-requiring document revisions are Approved. Categories: Design Drawings, Approvals, Material Submittals, Handover and QA / Inspection. With no records in those categories this gate passes; existing manual document-delivery checklist items still apply.
2. At least one site record exists and every site record has supervisory approval. Legacy records without review status are treated as Pending, without inventing historical approvals.
3. All QA snags are Closed.

Readiness links open the project's document, site and QA registers. Completion rechecks the combined handover state and records a selected demo reviewer and confirmation note. Existing task completion, client checklist and commercial checklist requirements remain in force.

**Financial boundary:** no financial handover calculations or commercial checklist rules were added or altered. The base's manual Commercial card remains as supplied; Agent 1 must retain its newer financial logic during integration.

### UI and accessibility

Existing AZZORA Architectural Prestige tokens, typography, panels, form controls and drawers are reused. No new motion, navigation entries, global search, Quick Add or dashboard integration. The document register loads on demand to keep the main production bundle below Vite's 500 kB warning threshold.

Native dialogs now have accessible names and keyboard focus containment. Workflow/domain/storage errors render inside the modal, where users can read them while the native modal is open. Keyboard Tab/Enter/Escape, mobile reduced-motion interaction and responsive page/drawer checks passed.

## Routes

No new shell routes are needed. Features use the existing routes:

- `#/team`, `#/projects/:id/team` — directory, profiles and project assignments.
- `#/tasks`, `#/projects/:id/tasks` — employee task ownership and workload.
- `#/documents`, `#/projects/:id/documents` — document and drawing revision workflows.
- `#/site-updates`, `#/projects/:id/site-updates` — site submission and supervision.
- `#/snags-qa`, `#/projects/:id/snags-qa` — QA assignment, inspection and history.
- `#/handover`, `#/projects/:id/handover` — combined operational checklist and completion.

Employee editing, review actions and revision details use dialogs/drawers on those routes.

## Automated verification

All final browser runs used the production build served locally at `http://127.0.0.1:5177`. Development runs at port 5176 also passed. Test browsers use isolated contexts, not the user's normal browser data.

| Check                                       | Result                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| TypeScript, `tsc --noEmit`                  | Passed                                                                                                               |
| ESLint, `eslint src`                        | Passed                                                                                                               |
| Vitest                                      | 118 passed, 0 failed, 5 files; includes 28 new workforce tests                                                       |
| Workforce production browser checks         | 40 passed, 0 failed; zero browser console/page errors                                                                |
| Existing delivery production browser checks | 66 route/viewport checks passed, plus complete project-to-handover journey; zero overflow/errors                     |
| Requested widths                            | 1440, 1024, 768, 390px; five operational screens and revision drawer checked at each width                           |
| Production build                            | Passed; document register split into a 5.94 kB on-demand chunk; main JS 496.31 kB, gzip 140.59 kB; no chunk warnings |
| `git diff --check`                          | Passed                                                                                                               |
| Financial/navigation scope check            | No changes to commercial, quotation, App, dashboard or workspace files                                               |

Coverage includes employee add/edit/deactivate/reactivate, uniqueness and capacity validation, project/task assignment, stable IDs, historical assignment retention, manager changes, inactive-person restrictions, drawing submission/rejection/correction/resubmission/approval, immutable prior versions/files, explicit reviewer/reason and self-review protection, site return/resubmission/approval, QA creation/assignment/resolution/reopening, derived handover gates, completion, reload, storage-write failure and keyboard behavior.

Evidence:

- [Automated summary](workforce-evidence/automated-results.json)
- [Workforce browser results](workforce-evidence/browser-results.json)
- [Retained delivery browser results](workforce-evidence/delivery-browser-results.json)

Reproduction with a normal Node/npm environment:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
# Terminal 1
npm exec vite preview -- --host 127.0.0.1 --port 5177 --strictPort
# Terminal 2
$env:AZZORA_TEST_URL = 'http://127.0.0.1:5177'
node tests/workforce-browser.mjs
node tests/browser.mjs
```

In this session npm was absent from PATH. Verification used the bundled Node executable directly with the project TypeScript, ESLint, Vitest and Vite entrypoints. Dependencies were installed by importing the existing package-lock into a temporary pnpm lock; neither package.json nor package-lock changed, and the temporary pnpm files were removed. No dependency was added.

## Screenshots and visual review

Twenty-four screenshots are committed under `docs/workforce-evidence/`: Team, Documents, Site, QA, Handover and Revision drawer at each requested width. Representative desktop, tablet and mobile screenshots were visually inspected for clipping, wrapping, readable hierarchy and modal placement. Capture resets scroll and disables transition capture so fixed navigation and drawers appear at their settled positions.

| Screen          | 1440                                         | 1024                                         | 768                                         | 390                                         |
| --------------- | -------------------------------------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Team            | [PNG](workforce-evidence/team-1440.png)      | [PNG](workforce-evidence/team-1024.png)      | [PNG](workforce-evidence/team-768.png)      | [PNG](workforce-evidence/team-390.png)      |
| Documents       | [PNG](workforce-evidence/documents-1440.png) | [PNG](workforce-evidence/documents-1024.png) | [PNG](workforce-evidence/documents-768.png) | [PNG](workforce-evidence/documents-390.png) |
| Revision drawer | [PNG](workforce-evidence/review-1440.png)    | [PNG](workforce-evidence/review-1024.png)    | [PNG](workforce-evidence/review-768.png)    | [PNG](workforce-evidence/review-390.png)    |
| Site            | [PNG](workforce-evidence/site-1440.png)      | [PNG](workforce-evidence/site-1024.png)      | [PNG](workforce-evidence/site-768.png)      | [PNG](workforce-evidence/site-390.png)      |
| QA              | [PNG](workforce-evidence/qa-1440.png)        | [PNG](workforce-evidence/qa-1024.png)        | [PNG](workforce-evidence/qa-768.png)        | [PNG](workforce-evidence/qa-390.png)        |
| Handover        | [PNG](workforce-evidence/handover-1440.png)  | [PNG](workforce-evidence/handover-1024.png)  | [PNG](workforce-evidence/handover-768.png)  | [PNG](workforce-evidence/handover-390.png)  |

## Files changed

New feature files:

- `src/workforce/commands.ts` — employee, assignment, revision, review, site and QA commands.
- `src/workforce/readiness.ts` — latest revisions and operational handover selectors; independent of financial rules.
- `src/workforce/Documents.tsx` — versioned document register and review drawer.
- `src/workforce/Employees.tsx` — employee add/edit/status dialogs.
- `src/workforce/ui.tsx` — explicit demo actor selector, inline errors and history.
- `src/workforce/workforce.css` — scoped operational layout styles; no global token changes.
- `src/workforce/workforce.test.ts` — 28 domain/relationship/persistence tests.
- `tests/workforce-browser.mjs` — full workforce and approval journey, keyboard/storage boundaries, responsive screenshots.

Existing files modified:

- `src/components/Team.tsx` — employee directory/profile and validated project assignment integration.
- `src/components/Operations.tsx` — site supervision, QA workflow/history and lazy document-register adapter.
- `src/components/Handover.tsx` — operational criteria, links and explicit completion actor/note.
- `src/components/TaskDrawer.tsx` — inactive assignee filtering/label and inline validation.
- `src/components/Wizard.tsx` — inactive-person filtering and active default manager only.
- `src/components/ui.tsx` — dialog accessible name/focus containment and valid confirmation content wrapper.
- `src/domain/model.ts` — additive optional employee/workflow fields; Inactive employee and Draft/Rejected document statuses.
- `src/domain/logic.ts` — append derived operational criteria to handover; financial calculations untouched.
- `src/domain/repository.ts` — active assignee/project/phase validation, task-to-project membership, optional recorded actor, validated QA compatibility adapter, completion actor/note.
- `src/domain/domain.test.ts` — existing handover test now supplies supervisory approval.
- `tests/browser.mjs` — retained journey selects explicit actors and uses the actual submission/review transitions; optional test URL.

Documentation/evidence: this report, three JSON results and twenty-four PNG screenshots in `docs/workforce-evidence/`.

No changes to `src/commercial/*`, `src/quotation/*`, `src/App.tsx`, `src/components/Dashboard.tsx`, `src/components/Workspace.tsx`, `src/store.tsx`, `src/styles.css`, package files, seed data or supplied design assets.

## Integration instructions for Agent 1 / Agent 3

1. Review the finished branch against the stated base. Integration must happen in a separate integration checkout after the other agents' work is ready; do not replace their working files with this worktree's complete versions.
2. The new `src/workforce/` directory can be integrated as a unit. Preserve its commands as the UI write boundary and its readiness selector as the operational source of truth.
3. Reconcile additive type edits in `src/domain/model.ts`. Keep Agent 1's financial types/fields intact. Existing employee/task/project IDs, database key `azzora-demo-v1` and `version: 1` stay unchanged. Optional fields need no destructive migration; legacy document family defaults to its existing ID, and missing site review status means Pending.
4. Reconcile `handoverState` and Handover UI deliberately. Keep **both** Agent 1's financial readiness and these operational gates. Derived `operational-*` items are never persisted and must stay disabled in checklist controls; only stored manual items may be mutated. Keep Agent 1's newer Commercial card and financial closure explanation. No operational command should set commercial flags or calculate money.
5. Retain repository guards for inactive new assignments and task-to-project membership. `record` adds an optional final actor ID; `completeProject` adds optional actor/reason parameters. Earlier signatures remain callable. `transitionSnag` retains compatibility but delegates validation/history to `saveSnag`; new UI calls `saveSnag` with an explicitly selected actor/reason.
6. `Operations` preserves its existing three named component exports. Documents is an on-demand adapter; App/Workspace imports need no edits. If another agent created a parallel operations module, reconcile the commands and state transitions rather than keeping competing write paths.
7. Merge shared modal changes as small accessibility fixes. Preserve Agent 1's commercial modals and any newer safeguards. No global navigation/search/Quick Add integration is required for these features.
8. Agent 3 should rerun typecheck, lint, all unit tests, both browser scripts and production build on the combined branch. Include a project that has both financial blockers and pending operational approvals. Resolve blockers independently and confirm neither subsystem can bypass the other.

No integration, merge or deployment was performed by Agent 2.

## Known limitations

- Browser-local demo persistence and explicit demo identities remain; there is no authenticated authorization, server-side workflow enforcement, multi-user/multi-tab concurrency or cloud file storage. Role labels do not implement permission-based access.
- Existing attachment size limits and browser quota apply. Storage-write failure retains the last saved state and shows a visible error; long-term large file/history volume was not load-tested. Change snapshots omit embedded binary data and nested history to avoid recursive duplication; approved revision files remain on their immutable records.
- Legacy approved document metadata is retained as supplied and is not presented as a newly performed review. Previously unreviewed site records require a real demo review before handover.
- Workload is allocation-based rather than a date-sliced scheduling or timesheet model. Departments and employee codes are optional on legacy records until edited; no fictional employee data was invented.
- Chromium desktop emulation was verified. Physical devices, Firefox/Safari and full assistive-technology testing remain for broader QA. Owner visual acceptance and Agent 3's independent combined-branch audit are still separate steps.
- Agent 1's unfinished financial handover implementation was intentionally not imported or tested here. Its combined behavior must be verified after integration.
