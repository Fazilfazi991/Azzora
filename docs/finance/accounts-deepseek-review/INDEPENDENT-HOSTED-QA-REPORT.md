# Independent hosted Accounts QA

Candidate: https://azzora-accounts-client-review-ik4bhvqhz-faziils-projects.vercel.app/accountant.html
Deployment: `dpl_2NqTj4ngUQdqfLKh79Ez3gnAzm8x`.
Application revision under test: `50e60d2ca812b7b1077b5edca2740ca3c4c1619b` (deployment identity supplied by Coordinator).

## Actual hosted results

- 7/7 independent financial/workflow groups passed.
- 56/56 responsive checks passed: 14 routes at1440/1024/768/390px.
- 32/32 Axe scans passed with zero WCAG2A/AA/2.1AA findings (28 route scans, 2 login scans, 2 opened-editable-document-review scans).
- 4/4 authenticated PDF endpoints returned valid PDFs. All four one-page PDFs rendered using Poppler and were directly visually inspected.
- Zero browser errors.
- First supplied credential succeeded; no password guesses or Vercel authentication bypass were used.
- Login page was directly reachable; authenticated financial APIs required the Accountant session.
- Refresh retained balances/accounts; Manager browser-storage sentinel was preserved; logout revoked financial snapshot access.
- Runtime documentAi.enabled was false. No paid provider request or real document was used.

## Financial and document evidence

Thomas Cash creation at zero causes no journal posting. Internal transfer funds it without changing aggregate cash or P&L. Manual bill review retains original and editable fields. Save Draft preserves financial metrics. Explicit reviewed expense conversion creates one journal effect, preserves MEP/project attribution, pays from chosen staff cash and rejects a duplicate conversion. Draft/issue itemized invoices and bills plus document-specific partial customer/supplier allocations reconcile.

Final fictional workflow values match local reference: revenue AED20,060; Cost of Sales AED8,150; Gross Profit AED11,910; Operating Expenses AED1,000; Net Profit AED10,910. Assets and liabilities-plus-equity each AED66,970; reconciliation difference0. Thomas Cash AED50; second bank AED20. Invoice PDF total60/open40; purchase PDF100/open60. Printed documents label fictional client review and pending VAT policy.

Hosted desktop dashboard, mobile banking/dimension reports/login, opened original-document review and correction history, and all four PDF pages were visually inspected. The approved independent shell, spacing, colors and mobile stacking match the local reference; contained tables scroll horizontally. Prepared/manual data is explicitly distinguished from live AI.

## Harness correction retained

The first supplemental capture attempt created a draft through context.request but changed only the browser URL hash. Because this bypassed normal UI mutation refresh, the SPA still held its initial snapshot. An explicit reload after API setup corrected the supplemental harness. This is not an application defect; the full financial/responsive suite had already passed with its normal reload. Initial supplemental failure is retained as supplemental-before-harness-refresh.json. Full-page captures scroll to top before screenshot so sticky elements are captured in their intended position.

## Boundaries

These results establish a fictional client-review Preview only. No provider accuracy, latency, average cost, billing-cap verification or production accounting readiness is claimed. Paid AI remains disabled; provider spending evidence and any fresh server-side credential requirements remain Coordinator-owned release gates. QA did not deploy, push, change aliases, modify application source, access provider keys, or touch Manager production or real financial records.

Machine evidence: results.json and supplemental-accessibility.json. Images: 28 route captures, login1440/390, opened review1440/390. PDFs: invoice.pdf, purchase.pdf, pnl.pdf, balance.pdf; rendered pages in pdf-pages/.
