# AZZORA finance architecture contracts — local design checkpoint

Baseline: `fd7754dfe0022f9b64bf875313bd9679cb0144eb` (`origin/main`, 21 October 2026). This document defines additive local interfaces; it does not authorize migration or posting of existing browser records.

## Authority and storage

- Keep `azzora-demo-v1` and the existing validated, recoverable browser record intact. Any finance data is an optional versioned addition with an explicit migration, relationship validation and backup/recovery test before it is connected to `Database`.
- One coordinator-owned transaction boundary updates business documents and accounting state atomically. Existing commercial/procurement commands remain the authoritative source for their document lifecycles. A single accounting posting API accepts typed, immutable source events; no component or independent agent writes journal rows directly.
- Integer fils are the monetary source of truth. Reject nonfinite values, excess decimal precision, negative allocations and unbalanced entries. Display formatting happens only after calculations.
- Existing issued invoice, approved quotation, purchase order, bill and credit snapshots stay immutable. Legacy documents are read through adapters; they are not rewritten merely to populate new ledgers.
- Do not automatically post historical invoices/bills/expenses. Opening balances, tax treatment and cutover reconciliation require B04/B05/B10 decisions.

## Accounting core

`Account` has stable ID/code, classification (Asset, Liability, Equity, Income, Cost of Sales, Expense), currency, active state and explicit control role where applicable. `JournalEntry` has immutable ID, source type/ID, posting key, posting date, actor, lines with account ID and nonnegative debit/credit fils, and optional reversal linkage. A `Period` defines dates and lock status. Posting validates active accounts, one-sided lines, balanced totals, valid date/period, unique posting key, and any required source/account mappings before returning a new state. Reversal appends a counter-entry and preserves the source entry. Account balance, Trial Balance, P&L and Balance Sheet must derive from the same posted journal view.

Chart mappings distinguish receivable, payable, each bank/cash/staff custody account, revenue, cost/expense, tax and advances. Custody transfers debit one asset and credit another; they do not create expenses. Bills, expenses, payments, receipts and credits each have one accounting event adapter with duplicate-source protection. Procurement's existing bill-linked expense is the canonical cost record; it cannot trigger a second expense posting.

## Commercial settlement

Legacy `Payment.invoiceId` and `SupplierPayment.billId` remain readable. New receipt/payment headers carry stable IDs, party ID, amount, date, receiving/paying account, reference and immutable allocation/reversal events. Each allocation explicitly identifies an eligible invoice or bill and an amount in fils. Validation enforces same party, total allocations no greater than the header, no document overpayment, no duplicate allocation ID and no automatic oldest-first behavior. Unallocated balance is an advance requiring a separate approved accounting policy. Reversal and reallocation append events; they never edit historical allocations. Aging uses each document's due date and outstanding balance as of the requested date; partial settlement does not reset age.

The existing invoice with no type flag remains the legacy final-invoice behavior. New Tax, Normal and Proforma kinds need separate sequences and issue snapshots. Proforma must be excluded from ordinary AR/revenue/output-VAT posting and ordinary invoice settlement. Converting a proforma creates a linked new final invoice; it does not mutate the proforma. The exact VAT behavior of a Normal Invoice requires B05. Document PDFs must render from issued snapshots.

## Purchasing, expenses and products

Reusable `Product.id`/SKU is distinct from project-specific `Material.id`. A price observation records product, supplier, source bill/PO, date, base unit, currency, discount/tax basis and comparable unit price. Compare only normalized equivalent units/currencies; a name match is insufficient. Preserve every observation and show both increases and decreases.

Expense submissions distinguish project/site and company cost center. Category-to-account mappings are administered, versioned and validated. A site submission remains a draft/pending review until an authorized approval command creates one canonical payable/expense event. Photo upload may attach the original to a draft; field extraction must report actual capability and confidence, with manual entry on failure. Historical quotation PDF import is a separate review workflow and cannot alter issued quotation history.

## Roles and security boundary

Proposed roles: Owner/Admin, Accountant, Project Manager, Site Staff. The requested permission matrix is in the owner brief and remains subject to B01/B02/B07. Accountants may prepare financial drafts, allocations and reports; owner controls posting overrides, period reopening, mappings, opening balances and permission grants. Project Managers have assigned-project operational access and only specifically approved financial views. Site Staff may submit their own assigned-project expenses and view only permitted custody data.

The current app has no authentication server, secure session or trusted shared storage. Browser role switching/route hiding can demonstrate navigation only. It cannot enforce data-level permissions against direct URLs or manipulated local state. Secure Accountant login, cross-role isolation, revocation and session tests cannot be accepted as production features until B11 authorizes identity and backend architecture. No UI should describe a demo selector as secure login.

## Integration gates

1. Pure-domain invariant tests and explicit shared contracts pass.
2. Additive schema and saved-data recovery tests demonstrate no modification of original records on failed load/migration.
3. One transaction adapter handles posting, reversals and idempotency for each approved source, with reconciliation against receivable/payable and custody controls.
4. UI and exports read only the authoritative selectors; reports reconcile to the same journal and document balances.
5. Full CRM, financial, desktop/mobile, PDF and authorization tests pass on a frozen combined SHA. Production security tests remain blocked until a trusted backend exists.
