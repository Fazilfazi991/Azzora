# Accountant workspace — checkpoint 2 local preview

This workstream prepares journal-derived reports and a read-only Accountant workspace component. It does **not** create a secure login, authorize a user, post a real transaction, or connect the workspace to saved CRM data. Only the coordinator may wire shared navigation and persistence after the integration gates pass.

## Design intent

The Accountant reviewing a month-end close needs an unambiguous route from the journal to a reconciled statement. The interface uses AZZORA's Architectural Prestige palette, Space Grotesk headings, Inter data text, warm mineral surfaces, and restrained terracotta navigation. The report's date and provenance stay visible. The signature is a compact reconciliation line that ties Trial Balance and Balance Sheet to the same posted lines rather than decorative KPI cards.

Domain vocabulary: chart of accounts, source document, posting date, reconciliation, period, custody, receivable, payable. Color world: alabaster, limestone, terracotta, bronze, sage, ochre. Defaults rejected: generic blue dashboard, implied-login role switcher, and revenue cards calculated from unrelated CRM summaries.

The component is `src/accounting/AccountantWorkspace.tsx`. Its props are `db: Database`, optional `finance: { mode: "synthetic-demo"; accounting: AccountingState }`, optional `asOf: string`, optional `legacyArAp: LegacyArApView`, and optional precomputed `demoReports: AccountantDemoReports`. The structural `finance` type accepts the coordinator's `FinanceDemoState` without a dependency on its new file; only `mode: "synthetic-demo"` records are rendered as statements. The component reads no browser storage, makes no writes, and has no route guard. Its banner always states “Browser-local synthetic demo” and “no secure login.” Overview, General Ledger, Trial Balance, Profit & Loss and Balance Sheet render synthetic reports. The AR/AP section is explicitly labelled as **existing CRM document balances**; it renders coordinator-supplied legacy adapter rows and limitations, never synthetic GL balances as a substitute. Keyboard-operable report navigation, semantic tables/captions, focus styles, and mobile horizontal table scrolling are included. The host should provide an accessible route label and test at 390, 430, 768, 1024 and 1440 px after wiring; this isolated component has no application route.

## Accounting report contract

`reports.ts` validates the posted journal view, then derives all amounts from the same immutable AED journal lines in integer fils. It does not read sales summaries, mutate state, create opening balances, or infer postings for legacy documents.

| Report | Source and rule |
| --- | --- |
| General Ledger | Selected account's posted lines by date, timestamp and ID; debit-minus-credit opening and running balance. Reversal lines remain visible. |
| Trial Balance | Account debit-minus-credit balance as of a date, split into debit/credit columns. Aggregate totals must match. |
| Profit & Loss | Income less Cost of Sales and Expense within an explicit inclusive date range. Contra balances retain their sign. |
| Balance Sheet | Assets versus liabilities, posted equity and unclosed cumulative earnings as of a date. Difference is surfaced; it is never silently plugged. |

The selectors fail closed on unknown/non-postable accounts, invalid amounts/dates, duplicate account or journal identities, and unbalanced journal lines. They include all posted reversals. Report dates are required. Empty sections show no posted entries rather than invented zeros in account rows. TypeScript `string` fils and `bigint` internal arithmetic avoid floating-point rounding. Unit tests cover reconciliation, partial AR/AP settlement effects, Thomas cash custody transfer neutrality, running balances, reversal history, invalid views, and amounts above JavaScript's safe integer limit.

These reports are mathematical foundations, not approved statutory statements. Accounting basis, opening balances, VAT, revenue recognition, project cost allocation and period cutover remain B04/B05/B06/B10 gates. The P&L and Balance Sheet should remain synthetic-demo only until the coordinator's single posting boundary and owner policies are approved.

## Permissions and trusted boundary

`permissions.ts` records a **proposed** Owner/Admin, Accountant, Project Manager and Site Staff matrix. `proposed` means intended policy for review; `conditional` names unresolved B01/B02/B07/B10/B11 decisions; `none` means no intended permission. It is deliberately not an `authorize()` function. Browser role state, route hiding, localStorage, and frontend checks cannot protect finance data.

For future real access, a trusted command/query boundary must verify server-authenticated identity, current approved policy, company/project/party/custody scope and revocation on every request; deny before reading data or mutating state; audit grants, posting, reversals and period changes. Report export and direct URL/API access require the same boundary as on-screen queries. B11 must authorize backend identity and storage before a production Accountant account or secure session can exist.

## Next report adapters

These interfaces are pending and should be wired only after the settlement and expense adapters reconcile:

- **Customer receivables / supplier payables:** current `LegacyArApView` shows document ID/number, party name, due date and outstanding fils from the existing CRM document adapters. Future detail must add party ID, issue date, original amount, allocated amount, status and source links. Explicit allocation/reversal histories must agree with each balance.
- **Aging:** as-of date, each unpaid invoice or bill's due date, outstanding fils and day-bucket; partial settlement does not reset age. No automatic oldest-first allocation.
- **Project profitability:** approved project revenue and cost journal mappings, documented cost-allocation policy, project ID and period. No commercial-summary shortcut.
- **Bank/cash statements:** per-account journal movements, transfers, opening/closing balances and custody account ownership. Thomas Cash transfers are asset-to-asset; actual purchases are separate approved costs.
- **Expense analysis:** approved classification, category/account mapping, cost center, project, status and receipt provenance. A PO-backed supplier bill cannot create a second cost posting.
- **Purchase cost variation:** stable Product ID/SKU, comparable supplier/unit/currency/tax/discount basis, prior/current observation IDs and percentage change. History is immutable.

## Integration handoff

The coordinator can cherry-pick this isolated commit without shared-file conflicts. Connect a **synthetic** report fixture first, then use read-only selectors against validated finance state after the persistence integration is proven. Do not expose the workspace as an authenticated Accountant portal. Browser screenshots and accessibility checks must be repeated after the host app route and surrounding sidebar are integrated.
