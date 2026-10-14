# Agent 2 corrective report — FIX-A2-01

Completed 14 October 2026 (Asia/Dubai). A3-002, A3-009 and A3-010 are fixed on the dedicated workforce branch. No merge, push, deployment or backend work occurred.

## Revision and scope

- Branch/worktree: `codex/azzora-workforce-approvals`, `C:/Users/USER/Desktop/Projects/Azzora/azzora-workforce-approvals`.
- Pinned starting SHA: `dd220dfaca1e0f072d84c5895e8a8c0639345297`.
- **Corrective implementation/test/evidence SHA: `c95a1cf022c70bdeed4f55fb1099036baa2f42b5`.**
- This report is a following documentation-only commit so it can reference that full implementation SHA.
- Only application file changed: `src/components/ui.tsx`.
- Added `tests/dialog-regressions.mjs`, eight PNGs and four JSON evidence files under `docs/agent-2-corrective-evidence/`.
- No edits to App.tsx, styles.css, loader/domain/operations/commercial/quotation code, package files, seed data or central coordination documents. No reset/delete of another agent's work or branches.

The installed interface-design skill and existing Architectural Prestige design system were read. This correction preserves AZZORA's brand, styles, accessible dialog names and existing controls. No motion was added.

## Corrections

| Issue                                          | Behavior after correction                                                                                                                          | Implementation                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A3-002: interior padding discards unsaved form | Clicking inside dialog padding retains the dialog and draft. A true outside backdrop click dismisses the intended dialog.                          | Backdrop detection first checks the event target, then checks pointer coordinates against the dialog rectangle.                                                                      |
| A3-009: closing drawer loses opener focus      | Escape and close buttons return focus to the captured opener when it remains connected. Successful child saves return focus to the parent trigger. | Capture active element before showModal; close and restore a connected opener during effect cleanup. Disconnected triggers are not focused.                                          |
| A3-010: child Escape discards parent wizard    | Escape closes only the topmost customer dialog. Project/quotation drafts survive; subsequent Escape closes the parent and restores its opener.     | Prevent native cancel default, stop React cancel propagation, then close the intended modal. Tab handling belongs to the current dialog and stops propagation into ancestor dialogs. |

Named dialogs and forward/backward manual Tab containment remain. The original Quick Add → New Project → Add New Customer path is explicitly tested, including replaced dialogs and focus restoration to the connected page trigger.

## Executed verification

All final browser suites targeted the freshly built production bundle at isolated `http://127.0.0.1:5187`, using disposable Chromium contexts. No normal owner browser data was used.

| Check                                      | Result                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| TypeScript `tsc --noEmit`                  | Passed                                                                            |
| ESLint `eslint src`                        | Passed                                                                            |
| Vitest                                     | 118 passed; 0 failed; 5 files                                                     |
| Production build                           | Passed; no warnings; main JS 496.67 kB / 140.72 kB gzip                           |
| New strict modal regressions               | **64 passed**, 16 at each of 1440/1024/768/390px; zero browser errors             |
| Existing route/viewport and delivery suite | 66 checks passed plus complete project-to-handover journey; zero overflow/errors  |
| Existing quotation browser suite           | Four-width journeys passed, including BOQ edits, PDF, print, lifecycle and reload |
| `git diff --check`                         | Passed                                                                            |

The new suite asserts employee draft retention after padding clicks; true backdrop dismissal; named dialogs; Tab and Shift+Tab containment; task Escape/close trigger restoration; nested project/customer Escape, close-button and successful-save transitions; the original Quick Add reproduction; quotation customer cancellation and save; quotation → project → customer cancellation; exact BOQ/terms/milestone/reference preservation and unchanged totals; reload persistence; and retained whitespace-only site-update rejection. Initial test authoring had one incorrect existing-customer field label; the selector was corrected before the passing runs. No application failure was hidden or downgraded.

Evidence:

- [Automated summary](agent-2-corrective-evidence/automated-results.json)
- [64 strict assertions](agent-2-corrective-evidence/browser-results.json)
- [Delivery results](agent-2-corrective-evidence/delivery-browser-results.json)
- [Quotation results](agent-2-corrective-evidence/quotation-browser-results.json)

Representative desktop and mobile screenshots were visually inspected; existing brand/layout remains intact. The eight screenshots show retained project drafts and retained quotation BOQ content after nested transitions:

| Width | Project draft retained                                       | Quotation BOQ retained                                         |
| ----- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1440  | [PNG](agent-2-corrective-evidence/project-retained-1440.png) | [PNG](agent-2-corrective-evidence/quotation-retained-1440.png) |
| 1024  | [PNG](agent-2-corrective-evidence/project-retained-1024.png) | [PNG](agent-2-corrective-evidence/quotation-retained-1024.png) |
| 768   | [PNG](agent-2-corrective-evidence/project-retained-768.png)  | [PNG](agent-2-corrective-evidence/quotation-retained-768.png)  |
| 390   | [PNG](agent-2-corrective-evidence/project-retained-390.png)  | [PNG](agent-2-corrective-evidence/quotation-retained-390.png)  |

Reproduction in a normal Node/npm environment:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Terminal 1
npm exec vite preview -- --host 127.0.0.1 --port 5187 --strictPort
# Terminal 2
$env:AZZORA_TEST_URL = 'http://127.0.0.1:5187'
node tests/dialog-regressions.mjs
node tests/browser.mjs
$env:QUOTATION_URL = 'http://127.0.0.1:5187'
node tests/quotation-browser.mjs
```

This session used the bundled Node executable directly with those project entrypoints because npm is absent from PATH. No dependency or lockfile changes were needed. Development checks also passed before the final production run.

## Canonical document model and atomic adapter requirements

These are requirements for the coordinator's integration task, **not changes made in this correction**:

1. Keep Agent 2's `saveDocumentDraft`, `reviseDocument` and `reviewDocument` as the single canonical document write path. `DocumentRecord.status` is `Draft | Pending | Rejected | Approved`; retain stable `id`, `projectId`, `familyId`, `previousRevisionId`, `version`, attachment and WorkflowEvent history. Submitted/approved content remains locked; correction creates a separate revision.
2. Map Agent 1 legacy `reviewState`: Draft → Draft, Submitted → Pending, Revise & Resubmit → Rejected, Approved → Approved. Legacy status without reviewState retains Pending/Approved. Map `revisionOf` to `previousRevisionId`. Preserve reviewer assignment, reviewComments, decisionAt, old generic approval snapshots and original source data; do not fabricate missing actors/timestamps or overwrite approved bytes. Contradictory states require protected handling rather than silent approval.
3. Retain optional assigned reviewer metadata when adapting Agent 1 records. New workforce review must use an active explicitly selected actor, differ from the submitter and honor a retained assigned reviewer. An old self-assigned pending review needs explicit reassignment; do not silently approve it. Historical decisions remain historical.
4. Generic `submitApproval` / `decideApproval` calls for Document must route through the canonical command via one compatibility adapter. In one `Store.mutate` transaction, validate entity/family/latest revision, actor, assignment, independent review, transition and reason; update canonical state, the corresponding legacy approval projection and history together; save once. A failed write or invalid transition commits neither side. Repeated decisions must not create duplicate events or diverging states.
5. Preserve legacy Document approval ledger records for audit. Define an explicit historical/read-model marker or projection so already translated entries cannot remain stale active Pending Approval blockers. Do not erase them or manufacture rejection actions to clear counts. New document decisions must have one authority even if the generic pending-approval report still displays a projection.
6. Keep Agent 1's financial/procurement approval engine and monetary calculations unchanged. `closureSummary` currently counts generic pending approvals and all latest document categories; reconcile its read model with canonical latest documents without silently changing its commercial scope. Keep Agent 2 supervision/document/QA gates independent and keep Agent 1's optional `blockOperationalForFinance` check in both UI and completion command. Do not reintroduce the inherited mandatory manual Commercial checkbox.
7. Before combined acceptance, test both legacy schema variants, approved-version immutability, rejection/resubmission, stale historical approval entries, assigned/inactive/self reviewers, duplicate/repeated decisions, storage failure rollback and reload. Test operational blockers with clear finance, and unpaid invoices with financial policy off/on.

## Remaining ownership and limitations

A3-006 protected loading remains open and outside this correction; the coordinator owns loader/model/atomic-adapter work. Agent 1 owns the sidebar, contrast and sticky invalid-field CSS changes. This report does not claim those fixes or combined-branch acceptance.

Chromium emulated desktop/tablet/mobile checks passed. Physical devices and Firefox/Safari remain broader acceptance work. The existing browser-local demo/identity limitations remain. The coordinator should integrate the pinned original branches first, then review/apply this corrective implementation and following report commit, and run strict regressions again against the actual combined SHA.
