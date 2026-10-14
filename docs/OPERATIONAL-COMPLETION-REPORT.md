# AZZORA CRM — Operational completion report

Verified 14 October 2026. Phase 3 extends the existing React/TypeScript/Vite application and its approved visual language. The connected browser-local operational and financial journeys are implemented and tested. No backend, external services, authentication, push, merge or deployment was introduced.

## 1. Baseline and initial findings

Started from the verified commercial branch at `ada782a21232b3072850889e3796c3bc5c8d5dd4`, with a clean working tree. Created `codex/azzora-operational-completion`. The pre-implementation [audit](OPERATIONAL-AUDIT.md) records the gap assessment and sequence.

Existing customers, accepted contracts, quotations/BOQ, invoice snapshots, receipts/reversals, expenses, repository/store, attachments, reports, tasks and handover were reused. Missing modules were variations, supplier/procurement management, credits/refunds, budgets, shared approvals and company settings. Team was a fixed directory; documents could overwrite review metadata; commercial handover was a manual flag. The main integration risks were mixing contract net with VAT-inclusive variations, counting procurement twice, treating credits as receipts, changing historical branding and deleting historical assignments/revisions.

## 2. Completed modules

| Module | Delivered behavior |
|---|---|
| Variations | Contract-linked additions/deductions, BOQ, discount/tax, attachments, internal and client decisions, preserved revisions, immutable approval, revised net contract and positive-variation invoicing. |
| Suppliers | Add/edit/search/profile/archive/restore; contact, tax, bank, category and terms; Overview, Quotations, Purchase Orders, Bills, Payments and Projects tabs. |
| Procurement | Material requirements, purchase requests, multi-supplier RFQs, received quotations, comparison, explicit preferred approval, authorized POs/PDFs, partial deliveries, quantity-controlled supplier bills, partial/full payments and corrections. |
| Accounts adjustments | Item/amount credits, approval, issue/lock, PDF preview/download, reconciliation, valid credit-balance refunds and reversal history. |
| Company settings | Profile, local PNG/JPEG logo, bank/TRN/terms, AED, VAT/tax defaults, fiscal-year start, payment days, invoice/VO/PO/CN numbering and explicit handover policy. |
| Approvals | Shared inbox and per-record decisions with stage, requester, assigned active approver, dates, comments, selected demo actor, history and reassignment with reason. |
| Cost control | Original/revised budget by category/phase, committed and actual cost, open commitments, cost to complete, forecast profit/margin and overruns. |
| Team | Add/edit/deactivate/restore employees, departments/roles, assignments, tasks and workload; deactivation preserves historical IDs and ownership. |
| Documents | Categories, version families, reviewers, submission/review dates, comments, rejected/resubmitted drawings, immutable submitted/approved versions and retained attachments/history. |
| Closure | Separate operational completion and commercial obligations, closure CSV, final-account notes and immutable commercial-closure snapshot. Financial blocking is off by default. |
| Navigation/reporting | Connected dashboard metrics, ten operational reports, supplier/date/project/customer filtering where relevant, expanded global search and five new Quick Add forms. |

## 3. Routes and UI components

New global routes: `#/variations`, `#/variations/new`, `#/variations/:id`; `#/suppliers`, `#/suppliers/:id/:tab`; `#/procurement/materials`, `/requests`, `/rfqs`, `/comparison`, `/orders`, `/deliveries`, `/bills`, `/payments`; `#/accounts/credit-notes`, `/credit-notes/new`, `/credit-notes/:id`, `/refunds`; `#/budgets`; `#/approvals`.

Project workspace adds `#/projects/:id/variations`, `/procurement/:tab`, `/approvals`; existing `/financials`, `/documents`, `/team` and `/handover` are integrated. Existing dashboard, Settings, Accounts and Reports routes remain.

`src/operations/` contains `Variations`, `Suppliers`, `Procurement`, `Credits`, `Budgets`, `CompanySettings`, `EmployeeForm`, `DocumentControl`, `Closure` and shared `Controls` components. They reuse existing Modal, Field, Badge, DataTable, uploads and typography/color/spacing tokens. BOQ rendering and the existing responsive navigation are preserved. Tables scroll within their containers at narrow widths. No new motion was added.

## 4. Data models and stable relationships

One database remains under localStorage key `azzora-demo-v1`. The additive, idempotent `operations.version = 1` namespace adds collections without replacing existing customer, project, quotation, contract, invoice, receipt or expense records. It starts empty of new financial transactions. Representative demo role labels augment existing people.

Relationships are explicit IDs: customer → project → accepted contract → variation; project → budget/material requirement; material requirement → purchase request → supplier RFQ → supplier quotation → PO → deliveries/bills → supplier payments; invoice → receipts/credits/refunds. Supplier bill → one linked expense uses `supplierBillId`; variation invoice uses `variationId`. Documents use family/revision IDs, with approver IDs referencing preserved people. Approval and closure snapshots retain the underlying record state.

Domain commands live in `operations/repository.ts`, calculations in `calculations.ts`, migration in `migration.ts`, report mapping in `reports.ts` and closure rules in `closure-domain.ts`. The existing store clones and validates mutations before persistence; a storage failure leaves visible state unchanged.

## 5. Accounting and calculation rules

- Monetary input is parsed as decimal strings and calculated in integer fils with BigInt. Rates/quantities use the existing decimal-safe machinery; procurement allocation quantities use a six-decimal integer scale. Malformed and negative financial input is rejected where inappropriate.
- Tax treatments are Exclusive, Inclusive, Zero Rated and Exempt. Standard demo VAT defaults to 5%; inclusive pricing extracts VAT. The original accepted contract's VAT percentage governs its variations. Delivery charges follow an exclusive tax line at the PO percentage.
- **Revised contract net = original accepted contract net + signed approved variation net.** Draft, rejected and superseded revisions do not contribute. A deduction cannot reduce the contract below zero. Approved revisions are immutable; one family cannot be applied twice.
- A positive approved variation can reserve one linked invoice matching its approved net/VAT/gross and project/customer. Negative variations reduce the contract and can be associated with eligible invoice credits; they do not create negative invoices or unbilled cash refunds.
- **Invoice position = issued invoice gross − issued credits − non-reversed receipts + non-reversed refunds.** Receivable is the positive part; customer credit is the negative part. The paid column remains actual receipts. Credits and refunds have separate columns and statement events.
- Credit drafts reserve eligible billed value. Item credits are capped at the discounted billed item value and use that item's tax treatment. Amount credits allocate original VAT proportionally; final full credit reconciles the remaining VAT fils. Credits cannot exceed the invoice, and approved deductions cannot be linked repeatedly.
- Refunds require a current negative invoice position and cannot exceed the credit balance. Refund reversal restores that balance and preserves the record/reason; receipt history remains separate.
- Delivered quantity excludes reversed deliveries. A PO is fully received only when every ordered row is covered. Bill quantities cannot exceed received, unbilled quantities. Supplier invoice references are checked for duplicates per supplier.
- Partial bill prices/VAT use cumulative PO pricing less prior active bills, so fractional allocations reconcile to the PO total. A partial correction that would create negative net/VAT is rejected with an instruction to correct the cancelled allocation together or cancel the remaining unpaid bill first.
- **Supplier outstanding = active bill gross − active supplier payments.** Partial/full payments update the linked expense's paid amount. They never enter customer receipt collections. Overpayment, repeated posting and unsupported cancellation/reversal are blocked.
- **Actual net cost = non-cancelled incurred expenses.** Each supplier bill creates exactly one expense; it is never added a second time as a separate actual. Cancelled bills retain their linked expense with cancellation metadata and are excluded from actual cost.
- **Committed net = approved active POs; open commitment = max(committed − active billed net, 0).** Budget remaining = revised budget − actual. Original budget lines are retained during revisions.
- **Cost to complete = max(open commitment, entered remaining cost estimate); forecast final cost = actual + cost to complete; forecast gross profit = revised contract net − forecast final cost.** Forecast margin divides profit by positive revised net contract; absent contract produces no margin. The remaining estimate is a total remaining-cost estimate, not an amount to add again to open POs.
- Cost/profit estimates exclude recoverable VAT and do not perform revenue recognition or a general ledger. Budget/forecast reports are current snapshots; dated ledgers use transaction dates, opening balances and reversal/cancellation events.
- New financial documents capture current company/counterparty details when issued/approved. Existing invoice/quotation branding, including the original-logo fallback, remains historical after Settings change. Reference allocation checks collisions when a sequence is changed.

## 6. Workflow behavior

**Variations:** draft request/BOQ → internal submission/decision → send to client → recorded client decision → approved immutable variation → revised contract → eligible invoice. Submitted/rejected revisions can be revised without overwriting earlier content/decisions. “Client approval” is explicitly a recorded demo decision, without an external client portal or delivery claim.

**Procurement:** material requirement → purchase request approval → RFQs to selected suppliers → received supplier quotes → comparison of price/VAT/delivery/lead time/terms/remarks → explicit preferred approval → PO approval/PDF → partial receipts → controlled bills → partial payment → settlement. The test deliberately selects the more expensive supplier. Approved PO cancellation is limited to unreceived/unbilled orders; reversal/cancellation keeps audit history and guards allocations.

**Documents:** v1 submission → reviewer rejects with comments → v2 resubmission → approval; v1 remains. A later revision supersedes an older pending review instead of allowing an obsolete approval. Approval requires the assigned active actor and comments. Reassignment preserves the prior assignment and reason.

**Handover:** task/snags/manual operational checklist govern operational completion. Commercial obligations separately show approvals, latest document reviews, deliveries, open commitments, supplier payables, unbilled milestones/variations, customer receivables/credit and configured retention allowance. An unpaid invoice does not block operational completion under the default policy. Commercial closure requires obligations to clear and records final-account notes/snapshot once.

## 7. Existing financial and reporting integration

Project directory, project financials and dashboards use the revised accepted net contract. Customer statements include credit, refund and reversal ledger events without changing receipt semantics. Procurement commitments become actual expenses exactly once; payment affects cash-paid fields without creating another cost.

All ten existing commercial report types remain. New report types are Variation Register, Purchase Order Register, Material Delivery Status, Supplier Statement, Supplier Outstanding, Purchase Commitment Report, Project Budget vs Actual, Forecast Profitability, Credit Note Register and Approval Pending Report. CSV and existing branded report-PDF paths use the shared calculations. Search resolves suppliers, variations, PRs, POs, bills and credits; Quick Add opens actual Supplier, Variation, Purchase Request, Purchase Order and Credit Note forms.

## 8. Verification results

Final successful runs: **zero failed or skipped unit tests; zero browser console/page errors in the recorded journeys.** The original 90 unit tests remain, with 51 additions (50 operational plus one historical-logo PDF regression).

| Verification | Passed | Failed | Evidence |
|---|---:|---:|---|
| Domain/task/dependency unit tests | 13 | 0 | `src/domain/domain.test.ts` |
| Quotation unit tests | 23 | 0 | `src/quotation/quotation.test.ts` |
| Commercial unit tests | 51 | 0 | `src/commercial/commercial.test.ts` |
| Commercial PDF unit tests | 4 | 0 | `src/commercial/document.test.ts` |
| Operational unit tests | 50 | 0 | `src/operations/operations.test.ts` |
| **Total unit tests** | **141** | **0** | Five files; no pending tests |
| Existing commercial browser checks | 129 | 0 | `tests/commercial-browser.mjs` |
| Existing route/viewport checks and delivery journey | 66 | 0 | `tests/browser.mjs` |
| Existing commercial boundary checks | 6 | 0 | `tests/commercial-boundaries.mjs` |
| Quotation browser journeys | 4 widths | 0 | Create/edit/BOQ/lifecycle/PDF/print/persistence |
| BOQ visual/interaction regression | 4 widths | 0 | `tests/boq-visual.mjs`, exit 0 |
| New operational journey/viewport checks | 128 | 0 | `tests/operational-browser.mjs` |
| New operational boundary checks | 18 | 0 | `tests/operational-boundaries.mjs` |
| TypeScript | 1 run | 0 | `tsc --noEmit` |
| ESLint | 1 run | 0 | `eslint src` |
| Production build | 1 run | 0 | Vite build; warning below |

Responsive journey coverage is **1440, 1024, 768 and 390px**. The operational journey creates an accepted project contract, approves an AED 100 net variation, issues its AED 105 gross invoice, receives AED 80, issues an AED 50 credit and refunds the resulting AED 25 credit balance. Supplier delivery/billing splits 10 units into 4 + 6, bills AED 42 + 63 and settles partial payments. Actual cost remains AED 100 net once; customer receipts remain AED 80. A budget of AED 350 with AED 270 remaining estimate forecasts AED 370 and highlights overrun. Team deactivation, document rejection/revision, operational completion with an unpaid milestone, closure CSV, all ten operational CSVs and historical branding are checked through the UI.

Boundary checks cover five Quick Add forms/Escape, six search entities, supplier-payment and refund reversals, inactive-approver reassignment, local logo/historical snapshots, new invoice numbering/tax/terms, explicit financial blocking and Settings access after initial-actor deactivation. Their fixture is created by the operational journey in an isolated browser context. Run the operational journey first; the boundary test's setup imports domain commands through the Vite development server.

Raw reproducible run output is local under ignored `docs/operational-evidence/`, including browser/boundary/unit JSON, QA data, PDFs, CSVs and all-width screenshots. [Tracked validation summary](operational-validation.json) and selected screenshots/PDFs below travel with the repository. No tests use the owner's normal browser profile or reset its data.

Vite reports a non-blocking main-chunk size warning: **585.22 kB minified / 162.63 kB gzip**, above its 500 kB threshold. PDF generation remains in lazy chunks. No deployment or production load test was performed. Print/PDF download paths and rendered pages were checked; physical printers were not tested.

## 9. Screenshots and document samples

The screenshots below are real UI states from the isolated end-to-end journey. Full-page mobile captures include the existing fixed bottom navigation. Desktop/tablet/mobile layouts and rendered PDF pages were visually inspected; this does not substitute for the owner's design review.

![Approved variation and revised contract](operational-screenshots/variations-1440.png)

![Supplier profile](operational-screenshots/supplier-1440.png)

![Explicit supplier comparison](operational-screenshots/comparison-1440.png)

![Approved purchase order](operational-screenshots/purchase-order-1440.png)

![Received supplier bills and settlement](operational-screenshots/supplier-bills-1440.png)

![Issued credit and invoice reconciliation](operational-screenshots/credit-notes-1440.png)

![Project financials, actual costs and forecast](operational-screenshots/budget-forecast-1440.png)

![Employee directory and workload](operational-screenshots/team-1440.png)

![Preserved drawing versions and decisions](operational-screenshots/documents-1440.png)

![Operational handover and commercial obligations](operational-screenshots/handover-1440.png)

![Company settings](operational-screenshots/company-settings-1440.png)

Additional responsive evidence: [390px variations](operational-screenshots/variations-390.png), [390px handover](operational-screenshots/handover-390.png), [390px settings](operational-screenshots/company-settings-390.png), [768px PO](operational-screenshots/purchase-order-768.png), [1024px comparison](operational-screenshots/comparison-1024.png).

Rendered and visually reviewed samples: [authorized PO PDF](operational-screenshots/purchase-order-1440.pdf), [issued credit-note PDF](operational-screenshots/credit-1440.pdf). These are demo commercial documents, without legal tax certification.

## 10. Known limitations and deferred work

- Browser-local persistence is single-device demo storage. It provides no authentication, secure role enforcement, concurrency protection, cloud backup, cross-device sync or tamper-proof audit trail. Export through Settings before clearing/resetting the browser. No backend migration was attempted.
- Attachments and logos are local data URLs; attachments are limited to 750 KB each and the shared localStorage quota still applies. Seeded document entries can be metadata-only. No cloud/document recovery service exists.
- Approval identities, client decisions and supplier RFQs are local records; no real email, client portal, supplier transmission, banking or external payment integration occurs.
- Supplier bills allocate the approved PO prices/tax to received quantities. Independent supplier-price variance matching, inventory/stock valuation, supplier debit notes and three-way tolerance rules are future extensions.
- Retention is a configured estimated allowance shown at closure. A retention release/payment subledger is not implemented. Closure does not infer that retention was paid. Budgets and forecasts depend on the entered remaining estimate.
- Production statutory VAT compliance, certified tax documents, general ledger, revenue recognition and multi-currency accounting remain outside this demo. Payroll, biometrics and authentication remain deferred as requested.
- Large-register performance, multi-user conflict handling, durable attachment storage, server-enforced authorization, formal audit retention and production deployment require a later backend phase. The bundle-size warning is a future optimization item.
- Automated verification and selected visual review passed; owner acceptance/design review remains a human review step. No implementation/test blocker remains for the requested browser-local journeys.

## 11. Branch and commits

- Branch: `codex/azzora-operational-completion`.
- Base: `ada782a21232b3072850889e3796c3bc5c8d5dd4`.
- Final verified implementation SHA: `26eb5002ed826acd5101bf138dacdabf662a6210` — complete source, domain tests and browser suites.
- The following documentation/evidence commit contains this report, README, validation summary and screenshots. Its final repository SHA is delivered in the completion message and can be read with `git rev-parse HEAD`; no source changes follow the implementation SHA above.
- All work remains local. No push, merge, deployment, backend or external service was performed.
