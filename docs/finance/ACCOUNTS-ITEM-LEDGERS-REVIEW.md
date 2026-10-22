# AZZORA Accounts — Itemized documents and expense ledgers

Local owner-review handoff, 22 October 2026. No push, merge, deployment, production data access, paid AI service, or new infrastructure is authorized by this checkpoint.

## Revision and scope

- Branch: `codex/azzora-accounts-item-ledgers`.
- Final application revision: `6b33aa87a86b280049992095d1b3bc86b9a466c8`.
- Integration commit: `865f9c0154dad75dc5227a339845f5517da95dce`; PDF page-break correction: `6b33aa87a86b280049992095d1b3bc86b9a466c8`.
- Base: `3d539b9819fa08e5d279aba6b17425cc292fe311`, including purchase auto-fill implementation `e2cbe5de1ad36fadb99f9b93979763ce6f3a67ec`.
- GitHub was fetched before implementation. The newer local functional Accounts implementation was retained; the static design prototype was not substituted for the working application.

The item-entry and expense-entry workstreams contributed separate components. The coordinator owns shared finance commands, persistence, report mapping, PDF rendering, and reconciliation. Independent QA owns the combined browser acceptance harness and rendered evidence.

## Implemented behavior

Sales Tax/Normal/Proforma invoices and purchase bills share a practical item table: description, quantity, unit, rate, calculated line amount, add/remove, optional descriptive measurement details, subtotal, VAT status, and grand total. Quantities and rates accept four decimal places; exact integer arithmetic rounds each line half-up to fils. The server recomputes totals instead of trusting a submitted amount. The three-line client example totals AED 205.00.

Drafts reopen for editing with revision checks. Issuing a final invoice or purchase bill posts its stored snapshot once through the existing command boundary. Issued records cannot be edited; legacy documents, existing allocations, and original totals remain intact. Proformas cannot create ordinary revenue/receivables or accept ordinary invoice receipts. Purchase drafts are excluded from payables, aging and settlement. Project, supplier, customer, PO reference, supplier invoice reference and protected attachments remain available.

Comparable purchase-price warnings require the same stable product, supplier, unit, currency and VAT-free basis, using an earlier issued itemized bill. Catalog prices are separately labeled as references. Ambiguous, differently measured, draft or incompatible observations do not become historical price warnings.

Add Expense now offers **Expense Ledger** and inline **Create New Ledger**. Names are normalized and checked against existing ledgers/accounts; persistent stable IDs/codes and group mappings are assigned server-side. Creating a ledger creates no journal. The new ledger becomes selected without leaving the expense form and remains available after refresh in the existing isolated demo session.

| Expense group | Journal classification | Scope constraint |
| --- | --- | --- |
| Administrative Expense | Expense / operating expenses | Company |
| Direct Expense | Cost of Sales | Existing project required |
| Indirect Expense | Expense / operating expenses | Company or existing project |

Paid expenses use the existing bank/cash posting command. The ledger/group/project snapshot is retained with the expense and visible in its saved detail. Custom accounts appear in General Ledger and P&L; project-tagged costs appear in the project-cost summary. Creation of an account alone changes no balance.

Reviewed document items carry corrected descriptions, quantities, units and rates into the real purchase-bill command, preserving the original review and attachment links. Duplicate conversion is blocked. Document drafts themselves create no financial posting. Prepared suggestions remain explicitly synthetic; paid AI/OCR is disabled.

Invoice and bill PDFs render full items, totals, existing numbering/branding, repeated table headers and page numbers. A single oversized row can continue over pages without dropping text. Legacy documents retain their existing summary totals. No Manager quotation PDF template was changed.

## Policy and compatibility limits

- B05 VAT/TRN and invoice-type tax policy is still open in the finance decision register. This review explicitly shows **VAT not applied — policy pending** and stores zero demo tax; it does not infer a 5% tax rule from the document type. These PDFs are clearly fictional and are not legal tax invoices.
- Measurement/weight details are descriptive. No area/weight multiplier has been invented.
- Existing issued summary-only documents are not backfilled with fabricated items. An old draft may be explicitly edited using a single equivalent line.
- Custom ledgers and uploads follow the existing isolated demo-session lifecycle, not shared company persistence. Production identity, authorization, accounting policies, cutover and retention remain separate gates.
- This adds no ERP modules, external provider, production posting path, or backend infrastructure.
- Review limits remain deliberately small: up to 80 items per document, 100 custom expense ledgers per isolated demo state, and 2 MB PNG/JPEG/PDF attachments.

## Verification evidence

Independent Accounts acceptance passed **9/9 workflow checkpoints**, with zero page errors. Existing Accounts regression passed **14/14 checkpoints**. Existing document-entry regression passed **21/21 checkpoints**. All tests use isolated fictional records and fresh browser contexts, never the owner's browser profile or real company data.

| Reconciliation example | Verified outcome |
| --- | --- |
| Itemized invoice AED 205.00 | Draft changes no revenue/AR; issue adds exactly AED 205.00 once |
| Receipt AED 100.00 | Only the selected invoice changes; AED 105.00 remains |
| Itemized bill AED 205.00 | Draft changes no AP/cost; issue adds exactly AED 205.00 once |
| Supplier payment AED 50.25 | Only the selected bill changes; AED 154.75 remains |
| Direct expense AED 75.00 | Cost of Sales +75.00; bank −75.00; selected project retained |
| Administrative and Indirect expenses AED 25.00 each | Operating Expenses +25.00 each; Cost of Sales unchanged |
| Create any expense ledger | Journal and financial metrics unchanged |
| After all commands | Trial balance and Balance Sheet remain balanced; Manager browser-data sentinel unchanged |

Five authenticated PDFs were downloaded, rendered and inspected: one-page itemized invoice, one-page itemized bill, six-page/60-item invoice, six-page/60-item bill, and two-page oversized-row invoice. **All 16 pages** retain their text within A4 bounds; all 60 item markers and all 1,500 oversized-row characters remain present. Repeating table headers always accompany item content. All 15 primary UI screenshots across **1440, 1024, 768, 430 and 390px**, plus four supplementary views, were visually reviewed. Mobile tables scroll internally; page width remains within the viewport.

Defects found and corrected during review:

1. An absolutely positioned hidden removal-column label escaped its scroll container at tablet width. A positioned containing block confines it without concealing the table or removing its accessible label.
2. An oversized PDF row could move after its table header. First-row sizing now precedes the header and oversized rows continue using the available page area.
3. Direct API receipt allocation to a Proforma was rejected explicitly, matching the UI and financial policy boundary.

Test-harness adjustments preserve assertions: invoice amount entry now uses the new rate field; status messages are distinguished from native output elements; attachment links are exact; API-seeded history is reloaded before UI assertions; select labels use unambiguous controls. The local hosted-handler harness ignores generated evidence paths to avoid Windows file-watcher errors. Initial runs interrupted by development-server restart/navigation were repeated against the frozen revision; these are reported separately from application assertions.

### Review artifacts

- [Invoice desktop](accounts-item-ledgers-evidence/invoice-items-1440.png) / [mobile](accounts-item-ledgers-evidence/invoice-items-390.png).
- [Purchase desktop](accounts-item-ledgers-evidence/purchase-items-1440.png) / [mobile](accounts-item-ledgers-evidence/purchase-items-390.png).
- [Expense desktop](accounts-item-ledgers-evidence/expense-ledgers-1440.png) / [mobile](accounts-item-ledgers-evidence/expense-ledgers-390.png).
- [Inline ledger desktop](accounts-item-ledgers-evidence/create-ledger-1440.png) / [mobile](accounts-item-ledgers-evidence/create-ledger-390.png), showing blank-name validation and preservation of the entered payee.
- [Invoice PDF](accounts-item-ledgers-evidence/itemized-invoice.pdf), [bill PDF](accounts-item-ledgers-evidence/itemized-bill.pdf), [60-item invoice](accounts-item-ledgers-evidence/multipage-invoice.pdf), [60-item bill](accounts-item-ledgers-evidence/multipage-bill.pdf), [oversized row](accounts-item-ledgers-evidence/oversized-row-invoice.pdf).
- [Independent workflow results](accounts-item-ledgers-evidence/results.json) and [per-PDF text/bounds evidence](accounts-item-ledgers-evidence/pdf-evidence.json).

The same evidence directory includes every requested primary viewport plus horizontally scrolled mobile invoice/bill views. Full rendered page PNGs and broader CRM run logs remain locally under ignored `tmp/accounts-feedback*` directories.

### Automated and build checks

| Check | Result |
| --- | --- |
| Complete Vitest run (`src` and `tests`) | 606 passed in 37 files; zero failures |
| Standalone fictional finance-fixture tests | 2 passed; zero failures |
| TypeScript | Passed |
| ESLint (`src`) | Passed |
| Combined Manager + Accounts production build | Passed on final application source |
| Accounts-only production build | Passed; Manager entry excluded |
| Independent item/ledger browser acceptance | 9 passed; zero page errors |
| Existing Accounts browser regression | 14 passed; zero page errors |
| Existing document-entry browser regression | 21 passed; zero page errors |

The final Accounts acceptance and complete unit/type/lint verification ran after the PDF corrective commit. Broader Manager tests exercise unchanged CRM/quotation source; no files outside `src/accounts-review` were changed under `src` by these feature commits.

| Existing CRM/quotation browser suite | Final result |
| --- | --- |
| Main CRM project-to-handover journey | 66 route/viewport checks passed; full operational journey passed |
| Commercial workflows | 129 checks passed |
| Commercial boundaries | 6 checks passed on recheck |
| Operational workflows | 136 checks passed |
| Operational boundaries | 18 checks passed |
| Financial/accessibility corrective suite | 35 checks passed |
| Workforce | 40 checks passed on correctly configured port |
| Saved-data recovery and rollback | 25 cases passed |
| Finance checkpoint | 27 checks passed |
| Base quotation workflow | Passed: desktop/mobile workflows, PDF downloads, print, lifecycle and persistence |
| Guided quotation UX | 64 groups passed on recheck |
| Quotation print/PDF | 4 desktop/mobile reference/accepted cases passed; 18 native + 18 downloaded pages nonblank; saved data unchanged |
| Quotation live preview | 29 groups passed |
| Quotation hierarchy | 28 groups passed |
| Quotation payment rounding | One-fils schedule and manual-override warning passed |

Initial failed invocations are retained in local logs: the first Manager browser startup timed out; development-server restart interrupted the first commercial-boundary and quotation-UX runs; the first workforce invocation pointed to its historical default port instead of this isolated worktree. Rechecks preserved the original assertions and passed on the frozen source. No CRM feature was modified to accommodate these harness/environment failures.

### Deployment requirements

Ready for local owner review: all 18 selected browser suites passed after the recorded rechecks. There are no remaining failing checks in this review. Publishing requires separate owner authorization. Keep the existing Accounts-only build selection, server-only review password hash, private demo persistence/attachment access, HTTPS session cookie, CSRF and idempotency controls; rerun hosted acceptance before sharing a new client URL. Do not expose credentials in browser code or commit ignored access files.

No existing hosted alias, Manager production deployment, GitHub branch, or real financial record has been changed. This review does not authorize a production merge or release. Real accounting use still requires approved authentication/shared persistence and accounting policies, including B05 VAT treatment. Paid AI remains disabled.

Consolidated machine-readable evidence: [regression-results.json](accounts-item-ledgers-evidence/regression-results.json). Complete unit output: [unit-results.txt](accounts-item-ledgers-evidence/unit-results.txt).
