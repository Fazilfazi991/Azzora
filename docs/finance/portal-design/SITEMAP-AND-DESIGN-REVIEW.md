# AZZORA Accounts — visual design gate

Open `index.html` through `node docs/finance/portal-design/serve.mjs` from the worktree root, then visit `http://127.0.0.1:5299/docs/finance/portal-design/index.html#/login`. This is a static visual prototype. It does not authenticate, persist, issue documents, transfer money, post journals or use saved CRM data. The sign-in concept opens the design for review only. Transaction and export actions are intentionally disabled.

## Sitemap

| Prototype route | Intended portal page | Primary task |
| --- | --- | --- |
| `#/login` | Accountant sign-in | Enter the separate finance workspace after trusted authentication is approved |
| `#/dashboard` | Financial overview | Read posted period metrics and open items |
| `#/sales` | Sales invoices | Find tax, normal and proforma documents by search, type or status |
| `#/invoice` | New invoice | Set document type, customer, dates, items and terms |
| `#/receipt` | Customer receipts | Allocate a receipt to specific open invoices |
| `#/expense` | Expense entry | Capture project/company cost and supporting evidence for review |
| `#/ledger` | General ledger | Trace posted entries by account and reference |
| `#/pnl` | Profit & loss | Inspect revenue, cost and profit for a period |
| `#/balance` | Balance sheet | Review assets, liabilities and equity at a date |

The proposed production navigation groups **Overview**, **Transactions**, and **Accounting**. Purchase bills, supplier payments, banking, chart of accounts, journal entries, trial balance, aging and deeper reports belong in this finance workspace as later routed views; they are outside this first visual gate. The Manager CRM navigation is not reproduced in the portal.

## Design direction

The accountant is reviewing open balances, allocating a payment or tracing a journal reference. The interface therefore behaves like a compact financial work surface, with amounts right aligned, dates and references grouped in tables, and one primary task per page. The familiar AZZORA mark and architectural rust maintain brand continuity, while a separate `ACCOUNTS` lockup and finance-only rail make the workspace boundary obvious.

The visual vocabulary comes from invoices, receipt books, ledger lines, reconciliations and architectural specification sheets. Alabaster, chalk, limestone, terracotta, bronze and sage match the project's `DESIGN.md`. The signature element is the report-like treatment of every finance surface: small tracked section labels, clear account references, quiet hairline dividers and tabular amounts. We avoided the previous Manager sidebar, the stacked synthetic-scenario card wall, and a report-tab strip carrying unrelated operations.

The desktop sign-in is a calm split composition. At mobile width it becomes a single-column form. The finance rail is fixed on desktop and opens as a labeled overlay on tablet/mobile, with a close button, backdrop and Escape dismissal. Wide financial tables scroll inside their own panel on narrow screens; a visible hint explains horizontal scrolling. Focus outlines, form labels, semantic tables and a reduced-motion-safe static design support keyboard and assistive use.

## Fictional accounting fixture

All names and amounts are invented for the design. Two issued invoices total AED 20,000. A AED 5,000 receipt is allocated only to the newer AED 8,000 invoice, leaving AED 12,000 on the older invoice and AED 3,000 on the newer one. Draft normal and proforma documents do not affect posted revenue. Supplier costs are AED 9,000, supplier payments AED 3,000, and payables AED 6,000. The dashboard and statements show revenue AED 20,000, cost AED 9,000, profit AED 11,000, bank AED 52,000 and receivables AED 15,000. The balance sheet reconciles: assets AED 67,000 = liabilities AED 6,000 + equity AED 61,000. Expense submission examples are excluded from posting.

These numbers illustrate hierarchy and reconciliation only. Finance domain logic and tax policy still govern any future implementation.

## Visual evidence and checks

The rejected screenshot is preserved as [`evidence/before-accountant-workspace.png`](evidence/before-accountant-workspace.png). The redesigned prototype has screenshots for every route at 1440 and 390 px, plus login/dashboard captures at 1024, 768 and 430 px and [`evidence/mobile-navigation-390.png`](evidence/mobile-navigation-390.png). Key views: [`login-1440.png`](evidence/login-1440.png), [`login-390.png`](evidence/login-390.png), [`dashboard-1440.png`](evidence/dashboard-1440.png), [`dashboard-390.png`](evidence/dashboard-390.png), [`sales-1440.png`](evidence/sales-1440.png), [`invoice-1440.png`](evidence/invoice-1440.png), [`receipt-1440.png`](evidence/receipt-1440.png), [`expense-1440.png`](evidence/expense-1440.png), [`ledger-1440.png`](evidence/ledger-1440.png), [`pnl-1440.png`](evidence/pnl-1440.png), [`balance-1440.png`](evidence/balance-1440.png).

`evidence/capture.mjs` ran 45 direct route/viewport combinations (9 routes × 5 widths: 1440, 1024, 768, 430, 390 px). All rendered without page errors, missing images or page-level horizontal overflow. The mobile navigation opened and closed; route navigation, invoice-type filtering and status filtering returned the expected results. Results are in [`evidence/visual-checks.json`](evidence/visual-checks.json). No production route, source module, database, authentication provider or deployment was changed by this design work.
