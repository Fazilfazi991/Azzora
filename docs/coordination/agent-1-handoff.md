# COORD-A1-01 — Agent 1 read-only triage and integration handoff

14 October 2026. **Ownership acknowledged:** Agent 1 owns the delivered operational/financial branch. This handoff makes recommendations only; no feature code, branch, worktree, push, merge, backend or deployment was changed. This report is the only authored file for this task.

## Exact inspected revisions

| Delivery | SHA |
|---|---|
| Shared base / current integration HEAD | `ada782a21232b3072850889e3796c3bc5c8d5dd4` |
| Agent 1 implementation | `26eb5002ed826acd5101bf138dacdabf662a6210` |
| Agent 1 final delivery, `codex/azzora-operational-completion` | `8b7992156a2f97e6f8d9d38b98a4b120ad2793a9` |
| Agent 2 implementation | `06b1ad206c94c7ad154c05ff4e5b079c2e1ada50` |
| Agent 2 final delivery, `codex/azzora-workforce-approvals` | `dd220dfaca1e0f072d84c5895e8a8c0639345297` |
| Agent 3 implementation/test changes | `7b9c26d03146a58dd5d602e37c708abf0c148d60` |
| Agent 3 final QA delivery | `11da92566fe5bbb524e36a3128937756ce506204` |

The integration branch is still at the shared base. Findings below distinguish standalone Agent 1 behavior from simulated coexistence; they do not certify a combined application.

## A3-005 — confirmed, including issuance

**Still applicable. Integration blocker; Agent 3 classified it P1.** Reproduced against Agent 1 HEAD using the actual bundled domain exports in memory, without editing source: three quantity-1 Inclusive lines at AED 0.01, VAT 5%, discount AED 0.02.

Observed totals in fils: `subtotal=3, discount=2, net=2, vat=-1, grand=1`. Both `saveInvoice` and `issueInvoice` accept it and persist a snapshot with `vat="-1"`. The discount remainder exceeds the last row's capacity. `invoiceItemTotals` duplicates that allocation: the last item throws on its resulting negative base. `operations.price`/variation pricing reuse the affected invoice calculation, so correction must cover those consumers too. The separate supplier-bill cancellation rounding guard does **not** fix invoice discount allocation.

Recommended Agent 1 follow-up: one deterministic, capacity-bounded discount allocator shared by invoice totals and item-credit bases; enforce non-negative line bases/net/VAT before issuance and approval. Test one-fils/near-full discounts, zero rows, mixed tax treatments, item credits and signed variations. Preserve existing issued snapshots; do not silently recalculate historical documents. Remove `.fails` from A3-005 only after its ordinary assertion passes.

## A3-006 — exact reproduction changed; broader recovery gap remains

**Missing `people`: no longer accepted at Agent 1 HEAD.** The exact Agent 3 fixture now throws during `initializeOperations`: `Cannot read properties of undefined (reading 'forEach')`. That occurs inside `localRepository.load`, so the existing Provider catch should select its protected read-only fallback and retain raw storage. This was a loader reproduction/source trace, **not a fresh browser certification** of fallback/export. Agent 3's unchanged `it.fails` assertion expecting a throw will unexpectedly succeed on Agent 1 and must be reclassified rather than counted as an unresolved exact reproduction.

**Broader incomplete-shape protection is still open.** Separate initialized-seed fixtures missing `phases`, `assignments`, `milestones`, `updates`, `snags`, `documents`, `handover` or `activities` all return successfully from `load()`. A partially present `operations={version:1}` throws an incidental `invoicePrefix` TypeError before the explicit collection check. Loader validation still does not establish complete shapes or stable-reference integrity before render.

Recommended coordinated follow-up: Agent 2 owns required workforce/operational shape validation; Agent 1 owns financial/operations namespace compatibility. Use one repository bootstrap validator, ordered additive migrations and useful incompatibility errors. Preserve the original raw string, disable fallback writes and keep original export reachable. Agent 3 should test every missing/invalid collection and malformed references, plus actual fallback rendering/export and quota failure. Do not fill missing core collections with seed data or reset automatically.

## Single workforce/document write boundary

Prefer **Agent 2's `workforce/commands.ts` and readiness selector** for employee/assignment/document/site/QA mutations. Keep Agent 1's financial commands, `operations.approvals`, pricing, procurement and `closure-domain.ts`. Shared approvals need an adapter through the canonical document command; two independent status writers are unsafe.

Fresh in-memory coexistence checks demonstrate the conflict:

- Agent 1's editable document draft has `status=Pending, reviewState=Draft`; Agent 2's draft editor rejects it as already submitted.
- Submit a document through Agent 1, then approve it through Agent 2 with the assigned different reviewer: document becomes `Approved`, but `reviewState` remains `Submitted`, shared approval remains `Pending Approval`, and `closureSummary.pendingApprovals=1`.

Reconcile the six shared files deliberately:

| File | Preserve / reconcile |
|---|---|
| `components/Team.tsx` | Agent 2 employee profiles/history, deactivation reasons and `saveAssignment`; retire/delegate Agent 1 `EmployeeForm`/`saveEmployee` so Quick Add and every editor use the same boundary. Preserve IDs and `demoRole`. |
| `components/Operations.tsx` | Agent 2 supervised site/QA commands and lazy document adapter; replace Agent 1's competing `DocumentControl` writer with the canonical register/adapter. Preserve component exports. |
| `components/Handover.tsx` | Combine Agent 2 derived document/site/QA gates and explicit actor/note with Agent 1 CommercialClosure panel and configurable financial block. Derived checklist items stay non-editable. |
| `domain/model.ts` | Union additive fields: Agent 1 `operations`, `demoRole`, reviewer/decision metadata; Agent 2 employee metadata/history, workflow events and site/QA history. Keep one document state model. |
| `domain/logic.ts` | Agent 2 operational readiness plus Agent 1 exclusion of the legacy manual Commercial group. Preserve financial blocking off by default. |
| `domain/repository.ts` | Agent 2 actor/reason signatures, active-person/phase/project/task-membership guards and snag adapter; retain Agent 1 configured finance check in `completeProject`. Keep one loader and audit path. |

Normalize Agent 1 document states for the canonical workflow: `Pending+Draft → Draft`, `Pending+Submitted → Pending`, `Pending+Revise & Resubmit → Rejected`; preserve approved records and decisions. Map `revisionOf` to `previousRevisionId` compatibly. Keep existing activities, attachments and shared approval snapshots. Synchronize submission, decision, reassignment and supersession atomically; preserve assigned-approver enforcement and Agent 2 independent-review protection. Do not manufacture missing historical approvals. Submitted-revision supersession needs an explicit reconciled command, not an accidental bypass of Agent 2's review-first rule.

Employee migration also needs care: Agent 1 permits blank email/department and capacity above 100; Agent 2 editing requires email/department and capacity 1–100. Preserve legacy records and request corrections when editing rather than reject all stored data or invent values.

## Monetary and migration invariants to retain

Keep integer-fils calculations; signed **approved net** variations; original accepted VAT basis; immutable issuance/approval snapshots; unique variation invoicing/credit allocation; `invoice gross − credits − receipts + refunds`; refunds bounded by actual customer credit; supplier payments separate from customer receipts; received/unbilled quantity limits; one expense per supplier bill; and `forecast=actual+max(open commitment, remaining estimate)`.

Do not overwrite Agent 1's cancelled-expense exclusion, payment reversals, supplier/credit balance rules, historical logo fallback or retention limitation. Operational readiness and commercial closure remain separate; neither pending supervision nor financial policy may be bypassed by the combined completion command.

Fresh compatibility probes confirmed: complete legacy data gains the operations namespace idempotently; Agent 2 employee code/history and document rejection/predecessor/history fields survive Agent 1 loading unchanged (apart from additive `demoRole`); the raw storage string is not rewritten by loading. This is structural compatibility, not behavioral compatibility of the competing document state machines or validation of corrupt references.

## Evidence and dependency order

- Fresh Agent 1 Vitest run: **141 ordinary tests passed, 0 failed, 5 files**. They do not cover A3-005; the adversarial reproduction above fails the required monetary invariant despite that green suite.
- Fresh read-only probes: negative-VAT issuance, three item-credit bases, nine missing-core-collection cases, partial operations shape, idempotence, cross-delivery field preservation, and two document coexistence cases. Used esbuild `write:false` and in-memory storage; no feature/test files or normal browser profile changed.
- Agent 1's previously recorded 128 operational + 18 boundary checks and retained regressions remain historical standalone evidence. Agent 2's 118 unit / 40 workforce checks and Agent 3's report are inspected evidence, not rerun combined passes. No combined browser/build claim is made.

Coordinator dependencies, in order: **(1)** assign A3-005 allocator/issuance correction to Agent 1; **(2)** assign unified loader/recovery to Agent 2 with Agent 1 migration review; **(3)** integrate the single workforce/document boundary and approval adapter; **(4)** compose handover with both operational gates and configurable finance policy; **(5)** Agent 3 promotes corrected expected-failure tests and runs all domain, commercial, operational, workforce, PDF, recovery and responsive suites on the exact combined SHA. Include unpaid invoices with policy off/on and unresolved supervision with otherwise-clear finances. No fixes are implemented by this triage.
