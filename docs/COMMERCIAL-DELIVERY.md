# AZZORA commercial foundation delivery

Completed locally on 14 October 2026 (Asia/Dubai). This extends the supplied React/Vite application and its approved AZZORA design; it is a browser-local CRM demo, not a production accounting system.

## Implemented and tested

1. **Customer Master:** sidebar directory; generated customer code plus stable ID; search by name/contact/mobile/email/TRN; add/view/edit/archive/restore; Individual/Company; contact person, phone, WhatsApp, email, billing/site addresses, city/emirate/country, TRN, notes, creation date and status; multiple additional contacts. Normalized name, international/local UAE mobile, email and TRN matching warns without merging. A separate customer requires explicit acknowledgement and a reason recorded in history. Legacy creation dates stay unknown.
2. **Customer profile:** Overview, Projects, Quotations, Invoices, Payments and Statement show shared, linked records. Invoice billing identity is deliberately historical; profile records use the current master.
3. **Project creation:** existing-customer selector and inline Add New Customer dialog; selection keeps the original customer ID. Standard/custom plan, team, scope, dependencies, progress and handover factories remain in use. Directory values show accepted net contracts when available and clearly labelled legacy estimates otherwise.
4. **Quotation creation:** customer-filtered project selector, inline customer creation with automatic selection, inline project wizard and automatic relationship linking. Existing populated BOQ survives both actions. Customer/project relationship checks run in domain commands.
5. **Quotation commercial lifecycle:** existing Finalized/Sent states represent issuance; Draft → Finalized → Sent/Accepted/Rejected/Expired remains supported. Accepted records cannot be reopened or reclassified. Proposed revisions are separate drafts. Issuance/reopening/acceptance preserve history snapshots. Existing BOQ nesting, decimal arithmetic, rows, reordering, payment schedule, terms, preview, print, numbering, revision controls and branded PDF remain. Added a fixed AED quotation discount applied before VAT and included in PDF totals.
6. **Acceptance conversion:** link the quotation’s existing customer/project or create a standard project from an unlinked accepted quotation. Contract preserves accepted BOQ JSON, original net/VAT/gross, payment terms, acceptance date and source revision. One contract per quotation family and project; repeated same conversion is idempotent. A quotation already linked to a valid project uses that project. Acceptance/conversion creates no invoice automatically.
7. **Accounts:** Overview, Invoices, Payments, Expenses, Receivables and Project Financials. Date/customer/project/status filters, contextual registers, search, useful empty states and native form dialogs. Financial collections start empty rather than inheriting fictional invoices or receipts.
8. **Invoices:** manual/project/accepted-quotation/milestone creation; draft edit; unique numbering; date/due/customer/project/quotation/description; multiple quantity/rate/tax rows; discount; exclusive/inclusive/zero-rated/exempt treatment; VAT/net/gross; terms and notes; issuance; preview, PDF and print; history; reasoned cancellation. Invoice lifecycle remains Draft/Issued/Cancelled; Paid/Partially Paid/Overdue are derived from allocations and due dates. Issued billing identity, project/company/quotation description and financial totals are preserved. Future-dated drafts can be saved but cannot be issued prematurely.
9. **Milestone billing:** accepted schedule amounts include VAT; inclusive conversion extracts VAT once. Drafts reserve milestones, cancelled invoices release them, full-quotation and milestone duplicates are blocked, and total linked billing cannot exceed accepted value. The supplied reference schedule is one fils short; the last invoice milestone explicitly reconciles it while leaving the accepted quotation unchanged. Differences larger than one fils require a corrected revision. Unlinked accepted quotations must be converted to a project before invoice generation.
10. **Payments:** dated partial/multiple receipts with method, reference, bank, notes and browser-local attachments; automatic invoice/customer/project association. Prevents invalid amounts, over-allocation, future or pre-invoice receipts, duplicate posting IDs and repeated active bank references. Reversal retains the receipt and reason, releases its allocation, updates all views and permits a correction receipt. Receipts against an archived customer’s existing issued invoices remain possible.
11. **Expenses:** generated/custom unique reference, project, category, supplier, date, description, net amount, VAT, paid gross amount, payment method and attachment/reference. Unpaid/part-paid/paid derives from gross liability versus paid amount. Corrections retain previous values; category/project/date/supplier filtering is available.
12. **Project Financials:** original/revised accepted contract, no unconfigured variations asserted, invoiced/collected/outstanding, recorded costs, estimated gross profit/margin and links to quotation, invoices, receipts and expenses.
13. **Dashboard:** existing delivery layout retained; dedicated linked financial section adds active project value, accepted quotation value, invoiced/collected this month, receivables, overdue invoice count/amount, expenses and estimated performance. Active project value distinguishes accepted contracts from estimates; one accepted value per quotation family avoids revision double-counting.
14. **Global search and Quick Add:** customer/project/quotation/invoice/payment search plus existing tasks/team/snags/documents. Six quick actions open working customer/project/quotation/invoice/task/expense forms. Mobile Quick Add has a persistent accessible name.
15. **Reports:** Customer Statement, Quotation Register, Quotation Conversion, Invoice Register, Receivable Ageing, Payment Collection, Project Expense, Project Financial Summary, Customer Outstanding, and retained Portfolio Delivery with progress/health. CSV for every report; generic paginated PDF export. Statements include opening balances, invoices, receipts, cancellations and reversals; ageing includes older balances at the selected cutoff. CSV escaping also neutralizes spreadsheet formula injection.
16. **Persistence protection:** additive commercial migration; stable legacy IDs and quotation history retained. Failed storage writes commit neither UI nor stored changes. Unreadable/incompatible saved data shows a read-only fallback and cannot be silently replaced; Settings can export the original raw record before an explicit reset. Sequential nested modal mutations use the latest committed state.

## Existing features modified

Shell/sidebar, global search, Quick Add, Settings raw backup, project wizard and value labels, workspace tabs, quotation selectors/lifecycle/discount/PDF totals, dashboard additions and Reports extension. Operational scheduling, task completion, team assignment, dependencies/blockers, site updates, QA, documents and handover rules were preserved. Cross-platform browser detection replaces hardcoded macOS Chrome paths; generated test downloads no longer overwrite the supplied reference PDF. Heavy PDF code loads only on demand.

## Routes

- `#/customers`
- `#/customers/:id/{overview,projects,quotations,invoices,payments,statement}`
- `#/accounts` and `#/accounts/{overview,invoices,payments,expenses,receivables,project-financials}`
- `#/accounts/invoices/:id`
- `#/accounts/payments/:id`
- `#/accounts/expenses/:id`
- `#/accounts/project-financials/:projectId`
- `#/projects/:projectId/financials`

Existing dashboard/project/planning/task/team/update/QA/document/quotation/handover/report/settings routes remain. Creation/editing uses existing modal and drawer conventions rather than redundant standalone routes.

## Data relationships and workflow

`Database.clients` remains Customer Master; no second customer dataset exists. `Project.clientId` and `Quotation.customerId` reference it. Draft quotation `projectId` must match the selected customer. Accepted quotations reference projects through their original project ID or an immutable Contract association after conversion; conversion never rewrites accepted BOQ content.

Contract → quotation ID/family/revision snapshot, customer, project and payment terms. Invoice → customer, optional project, accepted quotation and optional payment-term ID. Receipt → one issued invoice with the same customer/project; each receipt represents one allocation. Multiple receipts can settle an invoice. Expense → project; its customer is derived from that project. All entities have stable IDs, explicit references and recorded activities in the existing `azzora-demo-v1` database. Commercial schema marker is `commercialVersion: 1`; original database version/key stay compatible.

The user selects or adds a customer, creates/selects its project and prepares the quotation. Issuance freezes content; acceptance enables contract conversion. The user separately generates a full/milestone invoice, saves and issues it, then posts collections. Receipts and reversals update invoice, customer, project, dashboard and reports together. Project costs feed financials independently of cash collections.

## Calculation and invoice/PDF details

- Decimal inputs are strings; arithmetic uses BigInt fractions and integer fils with half-up rounding. Persisted BigInt totals are decimal integer strings, avoiding JSON precision loss.
- Quotation discount reduces the taxable base. Invoice discounts allocate proportionately across entered row values; mixed exempt/taxable rows retain their respective treatment. Inclusive rows reverse VAT from their gross amount.
- Receivable = issued gross invoice total − active allocated receipts. Overdue means positive balance and due date before today. Payment status does not overwrite lifecycle status.
- Estimated gross profit = accepted contract net − recorded expense net. Margin = profit / accepted contract net. Input VAT is assumed recoverable for this estimate. No accepted contract means no profit claim; collections are never used as revenue for profit.
- Overview date filters select each entity’s transaction date; current outstanding totals refer to the filtered invoice population. Clear date filters to see all current receivables. Ageing instead uses the To date as an as-of cutoff and intentionally ignores From. Cancellation/reversal entries preserve historical statement balances. Date boundaries use Asia/Dubai.
- Original quotation stationery/font/rendering is retained. Invoice/report PDFs are vector text, A4, AZZORA rust/bronze, supplied logo, wrapped cells, repeated table/page headers and page numbers. Invoice PDFs include billing snapshot, TRN if supplied, net/discount/VAT/gross, current paid/balance, terms and notes. Browser print uses the same invoice preview content. Output is a commercial demo invoice, without a tax-compliance certification claim.

## Actual verification results

| Check | Passed | Failed | Evidence |
| --- | ---: | ---: | --- |
| Strict TypeScript | 1 | 0 | `tsc --noEmit` |
| ESLint | 1 | 0 | `eslint src` |
| Unit/domain/PDF tests | 90 | 0 | 4 Vitest files; 36 retained tests + 54 commercial/PDF tests |
| Existing route/viewport checks | 66 | 0 | `tests/browser.mjs`; full project-to-handover journey also passed |
| Quotation browser workflows | 4 | 0 | 1440/1024/768/390; BOQ nesting/reorder/duplicate/delete, VAT, terms, save/reload, PDF/print, issue/locks/revisions/reopening |
| Commercial journey/responsive checks | 129 | 0 | `docs/commercial-evidence/browser-results.json`; zero browser errors |
| Conversion/storage/keyboard boundary checks | 6 | 0 | `docs/commercial-evidence/boundary-results.json` |
| Focused BOQ visual/browser checks | 4 | 0 | `tests/boq-visual.mjs`; no page overflow |
| Production build | 1 | 0 | Vite static build; PDF library split into an on-demand chunk; no chunk-size warning |

The tests exercise customer add/edit/search/duplicate/archive, all six quick actions, existing/inline project customer selection, inline quotation customer/project creation without BOQ loss, existing/new conversion, accepted locks, snapshot identity, milestone billing/duplicate prevention, manual invoice/overdue/cancellation, partial/full/reversed receipts, over-allocation, incurred/paid costs, margin, dashboard consistency, statements, all ten CSV reports, PDF download/print, storage failures, reload persistence and the retained operational delivery journey. Long multi-page financial tables and a single exceptionally long PDF cell retain their last content in PDF tests.

Browser scripts use isolated QA fixtures, not the user’s normal Chrome data. Early failures (test selector ambiguity, mobile button naming and invalid history HTML nesting) were corrected; reported counts are from passing runs. Final focused portfolio export verification is recorded separately after restoring progress/health columns.

## Screenshots and output evidence

Generated evidence is intentionally Git-ignored and available locally under `docs/commercial-evidence/`. The screenshots show fictional QA transactions produced by the browser tests, not financial seed data.

- [Desktop Accounts](commercial-evidence/accounts-1440.png)
- [1024px Accounts](commercial-evidence/accounts-1024.png)
- [768px Accounts](commercial-evidence/accounts-768.png)
- [Mobile Accounts](commercial-evidence/accounts-390.png)
- [Desktop Customer](commercial-evidence/customer-1440.png)
- [Mobile Customer](commercial-evidence/customer-390.png)
- [Desktop Project Financials](commercial-evidence/financials-1440.png)
- [Mobile Project Financials](commercial-evidence/financials-390.png)
- Invoice/report downloads and rendered page PNGs in the same directory.
- Existing compact BOQ screenshots at all four widths under `docs/boq/`.

Desktop, tablet and mobile screenshots were visually inspected. Invoice/report PDFs were rendered with Poppler and inspected. Physical printer output and owner approval remain separate from automated verification.

## Implemented but not fully verified

Screen-reader navigation beyond native semantics/keyboard checks; Firefox/Safari; physical printing; large real customer/financial datasets; repeated long-term browser quota limits; all possible international-script PDF glyphs. Representative invoice/report pages were visually reviewed; every possible report/data combination has not been visually reviewed. This does not imply production acceptance.

## Not implemented and production blockers

No approved-variation workflow (original/revised value is identical until one exists), double-entry general ledger, accrual/revenue recognition, credit-note/refund workflow, supplier payment subledger, cheque clearance, nonrecoverable VAT model, issuer TRN configuration/certified tax invoice workflow, or one receipt allocated across several invoices. Receipt correction uses a complete reversal followed by a replacement; expense payments are a gross paid amount with correction history, not a separate payout ledger. Broad international PDF font coverage needs a supplied Unicode font.

Browser storage/demo identity remain: no authenticated server permissions, database transactions/concurrency controls, multi-tab/multi-user synchronization, cloud attachment storage, durable backups or cross-device access. Attachments retain the existing 750 KB per-file demo limit. A future PostgreSQL backend must enforce relationships, immutable snapshots, unique milestone reservations/idempotency keys and monetary transactions server-side. No PostgreSQL/Supabase resource was connected or migrated. These are production blockers, not claims that the local demo is production-ready.

## Blocked / deployment status

No remote or safe hosted-preview configuration exists in the supplied copy. No hosting resources were created, no deployment or push was attempted, and no production URL exists. Local Vite was used for QA. The supplied archive had no `.git` metadata; earlier historical SHAs remain only in the old documentation and cannot be reconstructed. This did not block local implementation.

## Git delivery

- Branch: `codex/azzora-commercial-accounts`
- Supplied-copy baseline: `c191498` (`chore: preserve supplied Azzora CRM baseline`)
- Domain commit: `a4cd36d` (`feat: add connected customer and commercial domain foundation`)
- Implementation commit: `fb483565f802e780e13a9b274e42e64fc695e6d4` (`feat: integrate customer accounts workflows reports and verified UI`)
- A following documentation-only commit records this report/README/validation evidence. Its SHA is reported in chat; a commit cannot contain its own SHA.
- No merge to main, force-push, remote history rewrite, production deployment or database change.

## Files added or modified

Added: `docs/COMMERCIAL-AUDIT.md`, `docs/COMMERCIAL-DELIVERY.md`, `docs/commercial-validation.json`; `src/commercial/Accounts.tsx`, `Customers.tsx`, `Registers.tsx`, `Reports.tsx`, `calculations.ts`, `commercial.test.ts`, `customer-domain.ts`, `document.ts`, `document.test.ts`, `migration.ts`, `model.ts`, `reports-data.ts`, `repository.ts`; `tests/browser-runtime.mjs`, `tests/commercial-browser.mjs`, `tests/commercial-boundaries.mjs`.

Modified: `.gitignore`, `README.md`, `package.json`, `src/App.tsx`, `src/store.tsx`, `src/styles.css`; `src/components/Dashboard.tsx`, `Projects.tsx`, `Wizard.tsx`, `Workspace.tsx`; `src/domain/model.ts`, `repository.ts`, `seed.ts`; `src/quotation/Quotations.tsx`, `calculations.ts`, `document.ts`, `model.ts`, `quotation.test.ts`, `repository.ts`; `tests/browser.mjs`, `tests/quotation-browser.mjs`, `tests/boq-visual.mjs`.

Original Stitch HTML, screenshots, ZIP, logo PDF, font assets, reference quotation data and supplied reference PDF are unchanged. Generated evidence/dependencies/build output remain ignored.
