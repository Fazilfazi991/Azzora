# AZZORA Accounts — conditional design review

Open the static prototype with `node docs/finance/portal-design/serve.mjs` from this worktree, then visit `http://127.0.0.1:5299/docs/finance/portal-design/index.html#/login`. The review entry opens `#/demo/dashboard`; every finance route lives under `#/demo/*` and carries an explicit **DESIGN DEMO · FICTIONAL DATA** notice. No password is checked, no session exists, and direct demo URLs remain viewable. The visible “Log out” action returns to the login concept; it does not revoke a real session. No CRM data, browser database, API or financial posting is used by these pages.

## Sitemap and functional status

| Route | Page | Prototype status | Existing AZZORA capability or blocker |
| --- | --- | --- | --- |
| `#/login` | Separate Accountant login | UI prototype | Real sign-in and MFA require an approved identity/backend. |
| `#/demo/dashboard` | Financial dashboard | Synthetic-only | Fictional journal metrics; no live CRM journal posting. |
| `#/demo/sales` | Sales invoices | UI prototype with fictional rows | Canonical invoice draft/issue/PDF works in the browser-local Manager CRM; document-type policy is pending. |
| `#/demo/invoice` | New invoice | UI prototype, save disabled | Must reuse canonical invoice commands after authorization and type/VAT approval. |
| `#/demo/purchases` | Purchase bills | Synthetic-only | Canonical PO-linked supplier bills work in browser-local Procurement; no portal connection yet. |
| `#/demo/receipt` | Customer receipt | UI prototype, save disabled | Legacy single-invoice payment works in Manager CRM; multi-document allocation is domain-tested only. |
| `#/demo/supplier-payment` | Supplier payment | UI prototype, save disabled | Legacy single-bill payment works in Procurement; multi-bill allocation is domain-tested only. |
| `#/demo/expenses` | Expense management | UI prototype with fictional submissions | Project expenses are browser-local; review and company-expense workflow need policy/backend. |
| `#/demo/expense` | New expense | UI prototype, submit disabled | Approved posting, attachment custody and segregation of duties are pending. |
| `#/demo/banking` | Bank and cash ledgers | Synthetic-only; staff cash unavailable | Custody/Thomas cash rules are domain-tested, not persisted or connected to real accounts. |
| `#/demo/ar-aging` | Receivable aging | Synthetic-only | Canonical read-only aging adapters exist; shared authorized data is unavailable. |
| `#/demo/ap-aging` | Payable aging | Synthetic-only | Canonical read-only aging adapters exist; shared authorized data is unavailable. |
| `#/demo/ledger` | General ledger | Synthetic-only | Balanced fixture lines only; no real CRM-to-journal bridge. |
| `#/demo/pnl` | Profit & loss | Synthetic-only | Derived from the same fictional journal; live recognition policy/opening balances blocked. |
| `#/demo/balance` | Balance sheet | Synthetic-only | Derived from the same fictional journal; live cutover and opening balances blocked. |
| `#/demo/access` | Role boundary explanation | Architecture proposal | No frontend role control is presented as security. Server enforcement is required. |

The navigation keeps the accepted independent AZZORA Accounts shell and groups **Overview**, **Transactions**, **Accounting**, and **Workspace**. It does not reproduce Manager CRM navigation. The menu scrolls between a fixed brand header and fixed footer, including at narrow/short viewports; its final Access model item remains reachable. The footer contains the visible design-demo exit.

## Financial basis and reconciliation

[`finance-fixture.mjs`](finance-fixture.mjs) is a deterministic, in-memory fictional journal in integer fils. The activity period is **1 January–21 October 2026**, covering the older August invoice and newer October invoice. The position date is **21 October 2026**. Dashboard metrics identify whether they are activity totals or as-of balances.

| Reconciliation | AED |
| --- | ---: |
| Revenue | 20,000 |
| Less cost of sales | (8,000) |
| **Gross profit** | **12,000** |
| Less operating expenses | (1,000) |
| **Net profit** | **11,000** |
| Bank plus petty cash | 52,000 |
| Receivables: 12,000 older + 3,000 newer | 15,000 |
| **Assets** | **67,000** |
| Payables: 5,000 first bill + 1,000 second bill | 6,000 |
| Capital plus year-to-date earnings | 61,000 |
| **Liabilities plus equity** | **67,000** |

All seven fictional journal events have equal debit and credit lines; the combined debit and credit totals are each AED 87,000. Expense submissions of AED 125 and AED 75 are excluded from posted expense. Draft normal and proforma documents are excluded from revenue and receivables. A receipt is applied only to the newer invoice; partial payment does not change either invoice’s original due-date age. No Thomas cash balance is invented. The operating expense comes from one company bill, while the project bill produces cost of sales once.

These are **design-fixture calculations**, not approved company statements. Existing finance selectors and journal rules are mapped in [`ACCOUNTANT-FUNCTIONAL-MAP.md`](../ACCOUNTANT-FUNCTIONAL-MAP.md); a real statement requires approved accounting policy, opening balances and an authorized posting bridge.

## Visual evidence

The [rejected Manager-shell screenshot](evidence/before-accountant-workspace.png) is retained for comparison. The separate [desktop login](evidence/login-1440.png), [mobile login](evidence/login-390.png), [desktop dashboard](evidence/dashboard-1440.png), [mobile dashboard](evidence/dashboard-390.png) and [mobile navigation](evidence/mobile-navigation-390.png) show the main before/after change. Each route in the sitemap has a screenshot at 1440 and 390 px under [`evidence/`](evidence/): sales, invoice, purchases, receipt, supplier-payment, expenses, expense, banking, ar-aging, ap-aging, ledger, pnl, balance and access.

The five-width capture checks 16 routes × 390, 430, 768, 1024 and 1440 px for errors, loaded branding and page overflow. It also clicks all 13 sidebar links and checks login-to-dashboard routing, demo exit, sidebar/footer clearance, invoice filters, visible fictional-data boundary and preservation of a sentinel `azzora-demo-v1` value in the prototype origin. [Machine-readable results](evidence/visual-checks.json) are committed with the screenshots. The standalone fixture tests verify the profit bridge, document controls, journal balance and balance-sheet equation.
