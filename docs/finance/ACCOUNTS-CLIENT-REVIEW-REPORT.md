# AZZORA Accounts — local client-review candidate

**Review date:** 22 October 2026. **Scope:** a separate, fictional Accountant workspace for owner review. No GitHub push, merge to `main`, deployment, real credential, production database, or browser-record migration is part of this candidate.

## Run the review

Install the locked project dependencies, then in PowerShell set an operator-chosen password of at least 16 characters for this process and start the local server:

```powershell
$env:AZZORA_REVIEW_PASSWORD = '<operator-generated-review-password>'
npm run dev:accounts
```

Open `http://127.0.0.1:5277/accountant.html`. Sign in as `accountant@review.azzora.test` using that review password. The app binds to loopback. All records, attachments, sessions and action keys are held in process memory; a restart resets the fictional scenario. The API returns 503 if the password is missing or too short. The local review server needs no `.env` file or committed credential.

## Functional coverage

| Basic module | What works in this local review | Real-use gate |
| --- | --- | --- |
| Financial dashboard | Period-labeled revenue, cost of sales, operating expenses, gross profit and net profit; as-of receivables, payables and bank/cash. Values derive from posted journal and open documents. | Approved recognition, opening balances, VAT and shared ledger. |
| Sales invoices | Create draft; issue once; issue atomically posts receivable and revenue in fictional AED fils. Existing issued demo documents cannot be edited. | Canonical CRM document adapter, approved invoice types/numbering, VAT, immutable PDF and cutover. |
| Purchase bills | Record a fictional PO-referenced bill and one cost/payable journal; optionally attach a PDF/PNG/JPEG. | Canonical procurement PO/delivery match, authorized supplier and real attachment storage. |
| Customer receipts | Apply a partial/full receipt to an explicitly selected issued invoice; bank/cash and receivable journal update together. | Shared settlement persistence and approved allocation/advance policy. |
| Supplier payments | Apply to an explicitly selected bill; bank/cash and payable journal update together. | Shared payment authorization, banking integration and reconciliation. |
| Expenses | Record a paid fictional operating expense with optional evidence; expense and bank/cash journal update together. | Expense approval, category/VAT policy, duplicate-cost control and custody scope. |
| Bank & cash | Show as-of balances and bank ledger lines from the same journal. | Real account connections, bank reconciliation and owner-approved cash controls. |
| General ledger | Select account and inspect dated debit/credit entries, running balance and closing balance. | Shared immutable audit, period locks, grants and financial posting controls. |
| Basic reports | P&L, balance sheet, trial-balance reconciliation, and document-level AR/AP aging. Gross profit is separate from net profit. | Signed accounting policies, legacy cutover, financial-statement validation and controlled exports. |

The mobile bill workflow is part of Purchase bills: capture/select file, review supplier/amount/PO reference, and record. The server accepts only PDF/PNG/JPEG signatures up to 2 MB; it does not perform OCR. Attachments require an Accountant session to download. No file is uploaded to a cloud service.

The new workspace calls the existing tested `src/accounting/core.ts`, `src/accounting/reports.ts`, and `src/finance/settlement.ts` domain rules. A local transaction clones the fictional state, validates settlement and balanced journal, reconciles AR/AP to ledger controls, then commits the new in-memory state. API writes require a CSRF token and idempotency key; retries with the same key do not post again. This is **not** the canonical Manager CRM write store. It intentionally never reads or writes the browser key `azzora-demo-v1`; existing customers, quotations, projects, invoices and other Manager records remain where they are.

## Authentication boundary and production plan

The local review has a separate Accountant login page, server-verified password, loopback-only API, server-held sessions, `HttpOnly; SameSite=Strict` cookie, 20-minute idle/8-hour absolute expiry, CSRF and origin checks, rate limiting, logout revocation, and an Accountant-only API check. This is **review access for fictional data**, not secure multi-user production authentication: it runs over local HTTP, has one operator-supplied demo password, no MFA, no shared persistent identities, no tenant isolation, no production session store and no complete Manager/API role policy. The production build includes the separate Accountant page but not this development-only API, so it cannot make live finance writes.

The owner still needs to approve B11 (identity/backend/shared storage/attachment architecture) and the open accounting decisions B01–B10/B12 in [`DECISION-REGISTER.md`](DECISION-REGISTER.md). The proposed provider/session/API/migration architecture is in [`ACCOUNTANT-AUTH-ARCHITECTURE.md`](ACCOUNTANT-AUTH-ARCHITECTURE.md). A production implementation must use a trusted identity provider, HTTPS, current server-side role/tenant checks on every route, durable atomic documents/allocations/journals/audit, private attachment storage, backups, reconciled browser-data cutover and tested revocation. No browser records should be imported automatically.

## Verification evidence

The latest local review run passed:

- TypeScript, ESLint and multi-page production build (`accountant.html` plus existing CRM `index.html`).
- 467/467 Vitest unit tests across 31 suites, including five new review-ledger tests; separate Node fixture tests 2/2.
- Accountant browser workflow: 12/12 recorded checks, zero page errors. It covered wrong-role/unauthenticated denial, login/logout, draft and issued invoice, bill image/PDF upload, receipt, supplier payment, paid expense, CSRF/idempotency, P&L/balance/ledger/aging, Manager localStorage sentinel, and desktop/tablet/mobile widths 1440/1024/768/390px.
- Existing CRM browser suites: 66 general route/viewport checks; 129 commercial journey checks; 6 commercial boundary checks; 136 operational journey checks; 18 operational boundary checks; 35 corrective financial/accessibility checks. Quotation browser workflow/PDF lifecycle passed, and BOQ visual checks passed at 1440/1024/768/390px.

Generated screenshots are local, ignored test artifacts in `tmp/accounts-review/`: `login-390.png`, `dashboard-1440.png`, `dashboard-390.png`, `invoices-1440.png`, `bills-1440.png`, `bills-390.png`, `banking-1440.png`, `ledger-1440.png`, `pnl-1440.png`, `balance-1440.png`, and `aging-1440.png`. The captured pages were visually inspected. They retain the approved Accountant visual direction and do not show page-level horizontal overflow on checked widths.

## Remaining limitations for owner review

This is a **working local demonstration, not ready for real financial use or production acceptance**. It does not persist past process restart, write canonical Manager invoices/POs, provide production invoice/PDF/tax treatment, enforce real individual roles, perform OCR, reconcile an actual bank, export controlled financial statements, or implement approved historical opening balances. The dated fictional period is fixed to 22 October 2026. A real production rollout requires B11 infrastructure approval, accounting-policy signoff, canonical adapter/atomic storage work, migration/reconciliation and security/financial acceptance tests. The next owner review should focus on the nine workflows and the approved interface before authorizing that separate production phase.
