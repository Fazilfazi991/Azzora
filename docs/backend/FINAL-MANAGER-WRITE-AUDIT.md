# Final Manager write audit

Scope: the existing Manager screens in shared fictional staging. The accepted AZZORA layout, components, schedule rules and browser-local demo remain in place. The staging branch sends finite commands; it never sends a replacement browser database or a JavaScript mutation callback to the server.

## Nonfinancial command coverage

| Existing screen / action | Staging command | Payload | Preserved gate / behavior |
| --- | --- | --- | --- |
| Add / Edit Employee | `employee.save` | `employee` | Staffing metadata; the server derives the acting individual. An employee record does not grant login access. |
| Deactivate / Reactivate Employee | `employee.status` | `id, active, reason` | Historical assignments remain linked. |
| Project wizard: Create / Save as Draft | `project.create` | `project, team, standard, planMode, quotationId?` | Existing project creation validators and template review apply. Optional quotation linkage is atomic and Draft-only. |
| Edit Project | `project.update` | `project` | Existing approved dates and commercial values cannot be silently rewritten. Completion remains a handover action. |
| Settings: Save phase weights | `project.weights` | `projectId, weights:[{id,weight}]` | Exact project phases; nonnegative weights totaling 100. Existing dashboard weighting semantics remain unchanged. |
| Assign / Replace Person | `project.assign` | `assignment, personId, reassign` | Retains assignment history and explicit task-reassignment choice. |
| Remove Project Assignment | `assignment.remove` | `id` | Tasks and historical work remain available; server checks project scope. |
| Task Drawer: Save Changes / Mark Complete / comment | `task.save` | `task, comment, complete, progressDate, progressNote, scheduleReason, links, constraint, allowEarlier` | One atomic command mirrors the existing task/progress/child-completion workflow. Server authors comments; current approved task dates remain unchanged when drafting a proposal. |
| Task Drawer: Create Task | `task.save` | Same task payload | Existing reason requirement and `draftTaskCreation` proposal gate; no duplicate task record before approval. |
| Planning: Confirm fit-out template | `planning.template` | `projectId, preview` | Only an empty project can instantiate the reviewed template. No silent duplicate plan. |
| Planning: Draft calendar change | `planning.propose` | `projectId, initiatingNode, reason, edit:{calendar}` | Existing approved dates remain until approval. |
| Planning: Recalculate proposal | `planning.propose`, `task.save`, or `planning.milestone` | Existing edit payload, proposed task, or proposed milestone plus reason | Explicitly creates a new draft and preserves superseded history, including stale new-task/milestone drafts. Existing push-only default and explicit earlier-date choice are preserved. |
| Planning: Capture baseline | `planning.baseline` | `projectId, reason` | Explicit authorized capture; no automatic historical baseline. |
| Planning: Draft milestone | `planning.milestone` | `milestone, reason` | Stable draft ID is retained for retries; proposal approval required. |
| Planning: Confirm manual milestone condition | `planning.milestone-complete` | `id, reason` | Completion requires an explicit condition check, not merely the event date. |
| Planning: Submit proposal | `planning.submit` | `id, confirmLeadOverlap` | Conflicts block submission; negative-lag overlap requires explicit confirmation. |
| Planning: Approve proposal | `planning.approve` | `id` | Authenticated authorized scheduling approver; atomic existing approval rules. |
| Planning: Reject proposal | `planning.reject` | `id, reason` | Existing decision history and rejection reason retained. |
| Daily Site Update: Post / Resubmit | `site.save` | `update` | Server authorship and project scope; existing validated site record. |
| Site supervision: Approve / Request Corrections | `site.review` | `id, status, reason` | Existing independent supervisory decision rules. |
| Snags: Create / Edit / Assign / Rectify / Inspect / Close / Reopen | `snag.save` | `snag, status, reason` | Existing ordered transitions, responsible employee, inspection and closure evidence rules. |
| Document register: Save Draft | `document.save` | `document` | One file per revision; approved/history content is not overwritten. |
| Document: Submit Revision | `document.review` | `id, status:"Pending", reason, reviewerId, document` | Current draft save and submission are atomic; an independent reviewer is explicitly selected in staging. |
| Document: Approve / Reject Revision | `document.review` | `id, status, reason` | Separate authenticated reviewer; existing immutable revision rules. |
| Document: Create Revision | `document.revise` | `id, reason` | Opens the new server-confirmed family revision; previous approved files remain preserved. |
| Handover: manual checklist item | `handover.check` | `id, complete` | Automatic/derived criteria cannot be manually overridden. |
| Handover: Complete Project | `project.complete` | `id, reason` | Existing operational readiness and configured commercial closure gates. |
| Settings: quotation numbering | `settings.save` | `quotationNumbering:{prefix,next}` | Explicit staging Save; owner-only server validation and no historical number reuse. Financial/settings dispatcher is coordinator-owned. |

## Entry points and remaining local branches

- Global/project Tasks open the same `TaskDrawer`; the list itself does not persist records. Quick Add Task creates an in-memory form only. Staging task creation requires an existing project phase; empty-plan projects direct the user to Planning instead of throwing or silently doing nothing. `My Tasks` uses the authenticated person ID in staging; the default demo identity remains local-only.
- Global/project Team, Documents, Site Updates, QA and Handover use the same command handlers.
- Global/project/new-project quotation linkage uses the atomic `quotationId` option. The browser callback remains only inside the existing local-demo fallback.
- The remaining `mutate` calls in `App.tsx` are behind explicit non-staging branches: local numbering autosave and local Quick Add quotation. Phase weights use a finite staging command.
- `Wizard.tsx`, `TaskDrawer.tsx`, `Planning.tsx`, `Workspace.tsx`, `Operations.tsx`, `Team.tsx`, `Handover.tsx`, `workforce/Employees.tsx` and `workforce/Documents.tsx` have no direct browser-database mutation call in their staging save path.
- Commercial registers, quotations, procurement, variations, credits/refunds, budgets, commercial closure and company settings have a separate coordinator-owned financial command audit. Their coverage must not be inferred from this table.

## Pending, failure and identity handling

`useStoreCommand` locks a form action synchronously while awaiting its command and always releases the lock after completion. Pending forms are inert and marked busy, preventing newer keystrokes from being discarded when the confirmed save closes the form. Callers clear forms, close drawers or open a created revision only after the command confirms success. Rejected/failed commands retain their draft values and show the existing Store/Workflow error surface. The coordinator owns global unsaved-draft recovery, version conflicts and snapshot refresh.

The shared `ActorField` renders an authenticated identity note in staging, never an impersonation selector. Resource/reviewer selections remain separate business choices. Server commands derive the acting person and enforce company/project permissions; hiding a client control is not the authorization boundary.

## Verification status

This is the source/action coverage matrix, not a claim that every route has passed full CRUD. TypeScript, existing regression suites and actual browser workflow evidence must be attached by the coordinator to the final frozen application SHA. Private attachment storage, protected download URLs, authentication/recovery and permission metadata are coordinator/security-agent integrations; uploaded financial or company data must never be included in this audit.

Implementation checks: scoped ESLint passed on the thirteen owned TS/TSX files. The existing workforce, planning and independent timeline suites plus the finite Manager command and staging client suites passed **79/79** tests across five files. These checks do not substitute for the final combined revision or actual hosted/backend browser acceptance.

Actual fictional-data browser acceptance on the shared Supabase staging backend through the local HTTPS BFF verified: employee creation/edit/deactivation; custom-plan project creation with real PM/Engineer assignments; read-only approved project dates; new-task proposal re-draft, submission and approval after JSONB roundtrip; explicit baseline; Staff own-task dated progress/completion with private evidence; site correction/resubmission and independent approval; private document draft, submission, approval, revision, rejection and corrected revision approval; Staff QA rectification with private before/after evidence and independent PM closure; manual handover gates and designated-PM project completion. All approved/rejected document versions were retained.

Two initial acceptance failures were retained in the raw evidence: unstable planning fingerprints after JSONB object-key reordering (fixed with canonical key serialization and explicit proposal recalculation), and an attempted Staff assignment of an Open snag (correctly denied; UI now clearly reserves assignment to the PM). The final handover workflow completed, but its trailing read-only financial comparison was interrupted by an expired Accountant session; financial reconciliation is verified separately by the coordinator/domain acceptance. This matrix does not claim that every listed command received full browser CRUD testing. Final route/responsive checks and exact tested SHA are recorded in the consolidated integration report.
