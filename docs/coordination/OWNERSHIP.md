# Ownership and shared-file control

Current domain authority after controlled integration: Agent2 workforce/documents; Agent1 financial/procurement/variation/commercial closure; Coordinator recovery/adapters/atomic integration. Original parallel work is preserved in its source branches and committed history. Source is frozen at db6bb1148effb35e32ee39c120013a588b468813 for independent QA.

| Owner       | Exclusive domain                                                                                                      | Shared paths needing coordinator scheduling                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Agent 1     | Commercial calculations/repository, operations financial/procurement/variation/credit/budget/company modules          | `src/App.tsx`, `src/store.tsx`, `src/styles.css`, Dashboard, Workspace, global search/Quick Add, commercial reports/settings |
| Agent 2     | `src/workforce/*`, employee/assignment controls, site supervision, QA, operational document and handover requirements | Team, Operations, Handover, TaskDrawer, Wizard, `src/components/ui.tsx`                                                      |
| Agent 3     | Independent `tests/agent-3-*`, QA evidence/reports; isolated fixes only after ownership check                         | Browser runtime and existing browser journeys; `.gitignore`; uploads                                                         |
| Coordinator | `docs/coordination/*`, integration branch, conflict resolutions after agreed module contracts                         | Shared domain model/logic/repository, migrations and final merge composition                                                 |

Agent-specific handoff files are temporarily owned by their corresponding agents. No agent edits another handoff or other central docs while these tasks run. Initial read-only handoffs were followed by explicit owner authorization for allocated local corrections and integration. During the current freeze, only reports/evidence may change; source/test corrections wait for a safe checkpoint and new freeze.

## Observed overlaps

Agent 1 / Agent 2 both changed:

- `src/components/Handover.tsx`
- `src/components/Operations.tsx`
- `src/components/Team.tsx`
- `src/domain/logic.ts`
- `src/domain/model.ts`
- `src/domain/repository.ts`

Agent 1 / Agent 3: `.gitignore`. Agent 2 / Agent 3: `tests/browser.mjs`.

Semantic overlap exceeds these paths: Agent 1's `src/operations/EmployeeForm.tsx`, `DocumentControl.tsx`, approval/closure commands overlap Agent 2's separate workforce commands/documents/readiness. Reconcile state enums, optional person fields, revision families, actor/reviewer rules and persisted history. Do not retain two conflicting write APIs for the same entity.

## Allocation policy

One active owner per file in a worktree. Cross-domain changes create dependency tasks; owning a separate branch does not remove eventual semantic conflicts. Shared integration edits are serialized. Completed COORD-A1-01/A2-01 handoffs established authority; deliberate integration/adapters resolved model and migration overlaps. Agent 3's final review follows a frozen combined SHA, never an unfinished source branch.

## Unassigned or deferred modules

No required initial browser-local module lacks an owner. Combined migration compatibility, cross-domain approvals and closure reconciliation belong to Coordinator with Agent 1/2 handoffs; final accessibility/PDF/financial QA belongs to Agent 3. Optional future date-based workforce scheduling/timesheets, retention-release ledger, supplier price-variance matching/inventory/debit notes, multi-invoice receipt allocations, general ledger and broad Unicode PDF support have no implementation assignment. They are backlog/deferred, not completed. Backend/auth/cloud storage/multi-user/deployment are explicitly postponed.
