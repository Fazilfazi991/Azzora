# Manager and Accountant canonical integration map

4 November 2026. Current implemented applications are preserved. This inventory describes the necessary adapter boundary; it does not claim the existing browser/demo applications already share a backend.

| Existing authority | Canonical integration requirement | Status |
| --- | --- | --- |
| `domain/repository.ts`, `store.tsx`: whole `Database` clones committed to browser key | Replace production read/write boundary with authenticated async entity queries/commands, versions, scoped loading/error states. Browser repository retained only for explicit demo/recovery | Pending UI connection |
| `commercial/repository.ts`, quotation domain and operations commands | Retain existing pricing, snapshots, credits/refunds/procurement/variation validators server-side; map customer/project/invoice IDs once | Existing business rules retained; trusted transport pending |
| `accounts-review/hosted.ts`: `HostedSession.finance` seeded by `createReviewState` at each login | Session stores identity/security only. Load company-owned canonical invoices/bills/accounts/journals, not a new fictional ledger per session | Demo untouched; production replacement pending |
| `accounts-review/domain.ts`: `applyReviewAction`, existing accounting core `postJournal` | Use one trusted transaction service: authorized source transition + settlement allocation + balanced journal + audit + idempotency result commit together | Canonical adapter pending; no second accounting engine permitted |
| `finance/settlement.ts`, `accounting/core.ts`, `accounting/reports.ts` | Reuse strict money/allocations/report calculations. Decimal AED at entry boundaries, integer fils internally. Reports query the same posted ledger and date basis | Pure rules reusable; backend selectors pending |
| Workforce/document/planning commands | Preserve assignments, approval authority, immutable histories and explicit schedule approval; validate same rules again server-side | Existing browser behavior preserved; trusted persistence pending |
| Review document entry and DeepSeek runtime | Private company-owned original and immutable raw extraction; corrections append-only; Save Draft creates no journal; explicit allowed conversion follows financial command path | Current allowlist/cap and review-only protections unchanged |

## Shared-record acceptance contract

Manager-issued invoice and Accountant view must resolve the same `(companyId, invoiceId, version)`, not copies sharing a display number. Receipt command requires authenticated current role, selected customer/invoice/account, positive integer fils, available amount, policy gates and a unique idempotency key. One database transaction locks relevant invoice/account rows, rejects stale versions, validates allocation and calls existing financial rules, then commits document/settlement/journal/audit atomically. Both apps reload the new invoice outstanding and reports from this same canonical state. No browser-issued approval or stale membership claim is sufficient. Do not read Manager `Database.people.role` as identity authorization.

Preserve accepted quote, contract and issued invoice snapshots as historical sources. Production schema/mapping must distinguish operational expense linked to supplier bill from a separately payable expense, preventing duplicate cost posting. No automatic journals may be reconstructed from historical browser records without accountant-approved cutover balances and policy.

## Independent availability/concurrency finding

`accounts-review/hosted-store.ts` currently stores a whole session finance document in private Vercel Blob, using ETag `ifMatch` compare-and-swap. It maps precondition failures to `ReviewConflict`. `hosted.ts` computes each action from the read session and writes the complete session with its expected version. This avoids blind overwrite but is not a relational multi-record financial transaction or permanent company ledger. A provider/network/storage exception can still surface as HTTP503; the prior diagnostic report preserves observed concurrent-write failures and explicitly says their underlying cause remains unidentified. Successful reruns are not proof of resolution.

Moving production writes to PostgreSQL transactions removes the Blob whole-session finance write path from production use; it does not retroactively diagnose those failures. Retain correlation-safe diagnostics, return explicit conflict errors for stale versions, and test duplicate-key plus distinct-key concurrency, connection-pool limits, aborted transactions, insufficient funds, timeout-after-commit recovery and idempotent response replay. Do not blanket-retry a financial command without its original idempotency identity. The unchanged demo can continue using Blob while production integration is developed separately.

## Outstanding independent checks

Production authentication/API deny tests, actual PostgreSQL concurrency/rollback, scoped private attachment access, backup-and-object restore, complete migration reconciliation, and browser workflows A–E against a real isolated backend remain required. Offline archive tests do not certify those capabilities. No production data or paid AI was used for this audit.
