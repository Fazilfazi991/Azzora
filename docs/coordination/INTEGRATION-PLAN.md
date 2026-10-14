# Controlled integration plan

## Pinned inputs and preparation

Common base: `ada782a21232b3072850889e3796c3bc5c8d5dd4`.

- A1 delivery: `8b7992156a2f97e6f8d9d38b98a4b120ad2793a9`; implementation `26eb5002ed826acd5101bf138dacdabf662a6210`.
- A2 delivery: `dd220dfaca1e0f072d84c5895e8a8c0639345297`; implementation `06b1ad206c94c7ad154c05ff4e5b079c2e1ada50`.
- A3 delivery: `11da92566fe5bbb524e36a3128937756ce506204`; isolated implementation `7b9c26d03146a58dd5d602e37c708abf0c148d60`.

Integration branch/worktree: `codex/azzora-integration` / `C:/Users/USER/Desktop/Projects/Azzora/azzora-integration`, created at the common base. Native Git is used because the chat parent is not a repository and these source worktrees are native Git worktrees. Source checkouts are preserved. No remotes exist.

Before any merge: refresh clean status and SHAs, read all three handoffs, inspect source diffs and financial/migration contracts, and require committed fixes. Branch cleanliness proves absence of uncommitted changes, not readiness. Do not merge unfinished branches. Review new commits explicitly rather than silently using moving branch tips.

## Proposed merge sequence (gated, not executed)

Agent 1 and Agent 2 handoffs now agree on Agent 2 workforce/document/site/QA authority and Agent 1 financial/procurement/closure authority. The Coordinator accepts this integration direction. The detailed adapter remains to implement and independently verify: map A1 document `reviewState` into canonical status, retain assigned reviewers and immutable source history, synchronize shared document approval lifecycle atomically, preserve old employee values without inventing missing data, exclude the legacy manual Commercial checklist and recheck both operational gates and configured finance inside `completeProject`. A1's in-memory coexistence probe confirmed that leaving both writers produces an approved document with a pending shared approval.

1. Agree INT-01 authority map using A1/A2 handoffs; reject duplicate employee/document write APIs and choose compatible actor/review/revision semantics.
2. Integrate reviewed A1 delivery as the financial/procurement baseline, preserving reports/settings/calculations/snapshots.
3. Integrate reviewed A2 delivery with deliberate reconciliation of six shared source paths. Preserve employee history/inactive guards, independent site/QA reviews and derived operational gates alongside financial closure. No whole-file preference for either branch.
4. Integrate A3 isolated upload/harness fixes and audit evidence. Reconcile `.gitignore` and `tests/browser.mjs`; retain explicit actor transitions and one consistent isolated server URL contract. Treat the dialog patch as a candidate only, never blindly apply it.
5. Integrate narrowly reviewed critical fixes under scheduled ownership; promote A3-005/006 expected failures to ordinary assertions once fixed.
6. Freeze and record an integration SHA. Agent 3 runs the complete combined gate; record exact counts, known failures and visual limits against that SHA. Final owner review follows; no merge to main without approval.

## Compatibility requirements

- Keep `azzora-demo-v1` and stable IDs. Preserve `commercialVersion: 1`, additive `operations.version = 1`, old quotation/invoice histories and issued document snapshots.
- A2 adds optional person/workflow fields rather than replacing existing collections. Legacy document family defaults and Pending review semantics must agree with A1's document controls and approval inbox.
- Validate required base collections before rendering; protect original malformed/incompatible raw data and expose backup recovery. Idempotent migrations must preserve populated legacy records and both newer branches' saved records. Do not reset data to make tests pass.
- One accepted contract source; signed approved variations applied once; full/milestone/variation invoices from valid sources. Bounded discount allocation and non-negative tax/base totals.
- Customer receipts separate from supplier payments. Credits reduce invoice position; refunds restore it toward zero. Supplier bills create one expense; PO commitments convert to actual costs without duplication. Net profitability excludes recoverable VAT consistently.
- One employee/document write boundary. Preserve self-review protections, actor validity, approval assignment, rejected/superseded revisions, attachments, prior history and commercial closure snapshots.
- Operational completion and commercial closure are separate. Default financial policy must remain explicit; pending document/site/QA gates cannot be bypassed through an alternate completion command.

## Independent combined gate

Run TypeScript, ESLint, all domain/unit/quotation/BOQ/commercial/financial/procurement/workforce tests and production build. Review `.fails` cases separately; zero exit code does not establish those requirements passed.

Run existing delivery, commercial, commercial-boundary, quotation, BOQ, operational, operational-boundary and workforce browser suites plus Agent 3 strict regressions against the same combined checkout/server. Resolve fixture assumptions and `AZZORA_URL` / `AZZORA_TEST_URL` contracts explicitly. Operational boundaries require the UI-created operational fixture and development module imports. Use disposable browser contexts only; never reset owner browser data.

Cross-domain scenarios: legacy reload/migration twice; malformed storage/reachable original backup; storage quota/write failure; contract + positive/negative variations + invoices/credits/receipts/refunds; fractional deliveries/billing/payments/cancellations; budgets/commitments/expenses/dashboard/report consistency; inactive staff/reassignment; immutable document versions and independent review; project with financial blockers and pending operational approvals, clearing each independently; commercial closure history.

At 1440/1024/768/390px, inspect real browser output, keyboard traversal, named dialogs, interior click, nested Escape, opener focus, hidden navigation, invalid-field visibility, contrast, reduced-motion behavior and overflow. Render representative quotation/invoice/PO/credit/report PDFs, inspect multi-page tables and historical branding. Record exact test counts, errors, screenshots, PDFs, environment and source SHA. Owner visual acceptance remains a separate review step.

## Rollback and release

Before each integration step, record the current commit and keep committed checkpoints. If a merge conflicts before resolution, use `git merge --abort` only in this coordinator's integration worktree after checking its state. Never reset/delete/clean another agent's worktree. After committed integration, rollback uses new revert commits on this branch, preserving audit history. Preserve any test database exports used for migration evidence; do not downgrade owner storage.

Integration is local and disposable relative to source branches. No push, deployment, production database migration or automatic merge to main. The owner approves a concrete tested combined revision before main changes.

## Executed checkpoints in authorized corrective cycle

- 7223620: clean coordination checkpoint after owner authorization.
- Operational pinned 8b79921 merged with a merge commit; inspect git log for its full SHA.
- e136489: A2 pinned dd220df merged with deliberate per-hunk shared-file reconciliation.
- a539358: A3 pinned11da925 merged; retained workforce-aware delivery actions and configurable target URL.
- 8d7a277: coordinator protected loading, exact-original backup, canonical document/approval writes and lossless compatibility adapters.
- A2 corrective c95a1cf/report94c568b reviewed and merged; only shared modal app code changed.
- f6f7e04: pre-freeze 25-case recovery/rollback browser evidence and visual review.
- A1 corrective a4620eb and A3 prep b88191b discovered; final source handoffs/review required before merging them.

Agent2 independently reviewed coordinator source/probes. Unknown optional legacy states, requester self-review and orphan approval targets were confirmed; all three now have guards and ordinary regression cases. Application source currently passes 198 unit cases, TypeScript and lint. This is a checkpoint, not final QA; the integration branch is not frozen.

### Newly confirmed financial gate

INT-REVIEW-A1 reproduced silent legacy item-credit reallocation and cumulative amount-credit VAT overrun (six0.11 credits on1.05gross/0.05VAT produce0.06VAT, then final0.39 fails). FIX-A1-02 assigned to Agent1 on its own branch. Freeze/finalQA waits for reviewed corrective commit. Original issued snapshots must remain unchanged; invalid historical bases require explicit review rather than silent repair.

## Final gate composition

Reviewed/merged financial follow-up857b57cd4e0519606d5be143b6851260b773c0a4 and reportd4d251fe6674f2354a40aaee5a08569f5d0cc9e2. QA compositione48ef9c31d93649f2345e944cc2d610f86376748 is committed in integration: operational boundary/atomic harnesses now use public canonical UI and source-bound fixtures; dev-only module imports are retired. Coordinator validates new optional posted allocation metadata before rendering.

Pre-freeze full unit run:303 ordinary tests,0 failed/pending,13 files. TypeScript/lint pass. Production/browser/PDF gate is not yet certified. Final dev target5195 has an integration-local optimizer cache; old shared-cache5193 environment failures are retained as failed setup probes, not passing business checks. Final production preview must be built fresh from the same frozen SHA on another strict port. No source/test changes or commits while final gate runs; failures require reviewed correction and refreeze. Reports/evidence may be written, then committed after the gate with source/test tree equality checked.
