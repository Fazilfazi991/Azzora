# AZZORA finance cycle — coordinator report

## A. Baseline and audit

21 October 2026, Asia/Dubai. Repository: `https://github.com/Fazilfazi991/Azzora.git`. Fetched `origin/main` and confirmed it is `fd7754dfe0022f9b64bf875313bd9679cb0144eb`, matching the clean verified timeline worktree before this cycle. New local integration worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-finance-integration`, branch `codex/azzora-finance-integration`. Existing worktrees were neither reset nor deleted. No new code was pushed, merged or deployed.

The app is a React/TypeScript/Vite browser-local CRM. Its sole database key is `azzora-demo-v1`; load validates shape/relationships and offers read-only recovery/export for incompatible records. No backend, trusted authentication, secure shared storage or multi-user authorization exists. Existing `App.tsx` explicitly describes those limits. Quotation, accepted-contract, issued-invoice, purchase-order and planning histories already have preservation rules; they are not candidates for wholesale replacement.

Existing financial functionality: one sales invoice kind with immutable issue snapshot; one-invoice customer receipt and reversal; due-date AR aging; PO/delivery-linked supplier bill, single-bill supplier payment and reversal; bill-linked project expense; credit notes/refunds; project cost and commercial registers; CSV/PDF report exports. `reports-data.ts` builds commercial views directly from records. These views are useful but are not a general ledger, P&L or Balance Sheet. The source of truth for bills is `operations/repository.ts`, for sales documents `commercial/repository.ts`, and for browser transactions `store.tsx`.

Baseline validation on this checkout: TypeScript passed; ESLint passed; 17/17 unit test files and 384/384 tests passed; Vite production build passed with the existing >500 kB main-chunk warning. Browser tests were not rerun for the documentation/pure-domain checkpoint and are required after UI/repository integration. Dependency installation via bundled pnpm emitted an ignored-build-scripts diagnostic, but direct TypeScript/ESLint/Vitest/Vite executions above completed successfully. No generated dependency/build output is tracked.

## B. Requirement coverage at checkpoint 0

| Requirement | Baseline coverage | Gap / gate |
| --- | --- | --- |
| Dedicated Accountant login and permissions | Missing | No trusted identity/backend; proposed matrix documented, secure login blocked by B11. |
| Focused accountant workspace | Missing | UI can be prototyped only as clearly marked browser demo after domain/report contracts. |
| Tax/Normal/Proforma invoices | Partial | One final invoice kind; distinct sequences, tax policy, proforma non-posting and PDFs missing; B05/B08. |
| Supplier purchase invoices | Partial | PO/delivery-backed bill with duplicate-reference guard; standalone bill/attachments/PDF and policy need design. |
| Products and purchase price history | Missing | Project material IDs exist but no global SKU, normalized observations or warnings. |
| Customer receipts and supplier payments | Partial | Single-document settlement/reversal; no many-to-many allocations, advances, receiving account or receipt PDF. |
| AR/AP aging | Partial | AR due-date aging exists; AP outstanding exists but no full as-of due-date payable aging. |
| Project and company expenses | Partial | Project-only expense with fixed categories; no company cost center, approval or CoA mapping. |
| Bank/cash/staff-holder ledgers | Missing | Free-text payment bank fields; no custody account/transfer/reconciliation model. |
| Chart of Accounts and journal | Missing | No balanced postings, periods, opening balances or general ledger. |
| P&L, Balance Sheet, Trial Balance | Missing | Existing project summaries are not accounting statements. B04/B05/B10/B12 block production claims. |
| Mobile site submission | Missing | Existing full CRM responsive shell only; no scoped staff finance workflow. |
| Receipt photo extraction | Infrastructure/approval gate | Local attachment upload exists; no OCR service or verified extraction. B03/B11. |
| Historical quotation PDF import | Missing / later checkpoint | Existing quotation model and PDF export, no import review. B09. |
| Preserved browser data/recovery | Implemented baseline | Any additive finance schema still needs explicit compatibility tests before connection. |

## C. Workstream assignment and ownership

| Agent | Workstream | Branch / files | Dependency | Status |
| --- | --- | --- | --- | --- |
| Agent 1 | Accounting core and invariants | `codex/agent-finance-core`, new `src/accounting/*` only | Shared contract, then owner B04/B05/B10 for real posting | Local pure-domain implementation in progress |
| Agent 2 | Invoice/bill settlement and aging | `codex/agent-finance-settlement`, new `src/finance/settlement*` only | Existing document adapter later | Local pure-domain implementation complete; integration review pending |
| Agent 3 | Expense submission/category rules | `codex/agent-finance-expenses`, new `src/finance/expense-submissions*` only | B02/B06/B07 and core posting adapter later | Local pure-domain implementation in progress |
| Coordinator | Architecture, role/security/reporting contract, integration, QA | `codex/azzora-finance-integration`, docs and controlled cherry-picks | Agent commits; owner policy decisions | Checkpoint 0 complete; checkpoint 1 underway |
| Future Agent 4 scope | Accountant portal, navigation and reconciled reports | Unassigned until core/domain interface review | Trusted auth B11 for security acceptance | Backlog |
| Future Agent 5 scope | Mobile submission, actual extraction and historical import | Unassigned until expense/API and service decisions | B02/B03/B09/B11 | Backlog |

No agents own or have edited shared `Database`, migration, commercial/operations repositories, `App.tsx`, or existing report files. Those integration points remain coordinator-owned to avoid duplicate write paths.

## D. Technical decisions and contracts

The [shared architecture contract](ARCHITECTURE-CONTRACTS.md) defines an additive finance namespace, integer-fils journal, single posting boundary, immutable reversals, explicit document allocations, stable product identity, category/account mapping, and compatibility adapters. The [decision register](DECISION-REGISTER.md) tracks B01–B12. These are implementation contracts, not approval to use real financial data or provision infrastructure.

## E. Risks and controls

| Risk | Control / current limit |
| --- | --- |
| Wrong revenue/VAT or historical opening balances | Do not auto-post legacy transactions; B04/B05/B10 and accountant reconciliation required. |
| AR/AP or cash double counting | Single source event and posting key; procurement bill-linked cost is canonical; transfer is not expense. |
| Data loss on schema change | Additive optional model only, validated load, read-only recovery and saved-data fixtures before migration. |
| Unauthorized financial access | Browser demo cannot enforce security; secure Accountant login/data isolation blocked by B11. |
| Tax/legal misrepresentation | Configurable treatment and explicit review; no compliance claim. |
| UI and PDF regressions | Existing flows untouched during pure-domain checkpoint; full browser/PDF gate after integration. |

## F. Current validation and next checkpoint

Current exact baseline results are above. The new pure-domain agent branches require coordinator source review, cherry-pick, combined TypeScript/ESLint/unit/build, and cross-domain invariant tests before checkpoint 1 can be called integrated. Checkpoint 2 will connect approved business events through one transaction adapter and additive migration; it cannot be accepted until policy decisions and reconciliation fixtures are defined. Secure login and production financial statements remain infrastructure/business-policy gates, not completed features.

The next concrete task is to review and integrate the three isolated domain commits, prove balanced posting, explicit settlement and expense-approval invariants on one SHA, then define a legacy-preserving schema adapter. The full client-review candidate, browser validation and owner acceptance are later gates.
