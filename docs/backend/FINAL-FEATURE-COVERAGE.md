# Final shared feature coverage

This matrix covers existing modules only. “Shared staging” means fictional records persisted through the same trusted command boundary in the authorized Supabase project. It does not authorize real financial posting. A source/action audit is distinct from exhaustive browser permutation coverage; actual journeys are recorded separately.

## Manager CRM

| Existing area | Shared integration and authority | Evidence / boundary |
| --- | --- | --- |
| Dashboard, search, reports | Company/project-scoped canonical read projection; unchanged original calculations | No local database is loaded in staging; existing browser demo remains separate |
| Customers | Typed customer save/edit with duplicate acknowledgment and history | Actual fictional create/edit; existing customer/quotation regressions |
| Projects / wizard | Atomic create, optional Draft quotation linkage, project edit, phase weights, assignment history | Actual create/edit and planning journey; approved dates/commercial values protected |
| Quotations / BOQ | Existing quotation commands, queued draft saves, explicit flush before decisions/export; existing accepted/revised snapshots | Existing quotation/BOQ/PDF regression; server preserves immutable snapshots |
| Contracts / milestones / invoices | Existing commercial domain, canonical source item/number projection, one journal on issue, approved milestone generation | Actual accepted quotation→contract→invoice→Accountant journey; tax-bearing issue423 pending policy |
| Receipts / corrections | Same settlement records and journal as Accounts; append-only reversals, independently approved credits | Actual receipt/credit/reversal/cancellation, historical reports and physical allocation proof |
| Suppliers / procurement | Supplier, material/request/RFQ/quotation/order/delivery/bill/payment commands and approvals | Actual procurement chain; original journals retained after corrections |
| Accountant-origin purchase bills | Existing Supplier Bills tab reads same Finance bill; one linked Manager project cost, no invented PO/receiving history or duplicate journal | Actual standalone bill plus payment/deduplication regression; no second writable bill register |
| Variations | Existing draft/revision/internal/client approvals and approved variation-invoice bridge | Finite staging commands reuse commercial domain; existing variation regression |
| Credits / refunds | Independent credit approval and zero-VAT credit against unpaid invoice; credits adjust shared AR/revenue | Refunds/customer credit balances remain explicit policy blocks, no guessed advance ledger |
| Budgets / company settings / closure | Typed budget/save, Owner settings and numbering, protected financial policy fields, existing closure checks | Existing operational validators; no financial-policy change inferred from a demo setting |
| Planning / Tasks | Same canonical task records; finite draft/proposal/approval/rejection/baseline commands; own-task progress | Actual task proposal approval/baseline, JSONB fingerprint regression; no automatic baseline/reschedule |
| Team / Employees | Employee metadata/status, assignments and reassignment; actual membership mapping | Job title never grants authentication. Historical assignments retained; self-deactivation/last Owner protected |
| Site operations | Authenticated staff submission and independent review/correction commands | Assigned-project boundaries and existing validation |
| Documents / approvals | Private original storage, protected downloads, immutable revision family, independent reviewer decisions | Actual private upload/download/anonymous denial, submit/approve/revise/reject |
| QA / snags | Existing create/assign/rectify/inspect/close/reopen domain transitions and evidence | Assigned staff versus supervisor permissions; no stage skipping |
| Handover | Existing derived/manual checklist and project completion gates | Automatic checks cannot be overridden by manual toggle; commercial gate retained |
| Configuration / data recovery | Owner-only backup, explicit numbering/config save, visible failures/request IDs | Fresh authorized business export and isolated PostgreSQL restore; no browser reset or production import |

Full nonfinancial action/payload audit: [Manager write audit](FINAL-MANAGER-WRITE-AUDIT.md). Remaining `mutate` callbacks are local-demo branches or the existing finite quotation compatibility adapter; generic staging replacement-database writes are rejected. Customer creation inside a quotation saves the customer then queues an explicit quotation edit; it is not a duplicate customer store.

## Independent Accountant Portal: nine basic areas

| Existing area | Shared staging behavior | Explicit restriction |
| --- | --- | --- |
| Financial dashboard | Journal-derived revenue, Cost of Sales, OpEx, gross/net profit; as-of AR/AP and cash | Period figures versus as-of balances labelled; fictional only |
| Sales invoices | Itemized Tax/Normal/Proforma drafts, edit/review, allowed demo issue and PDFs; Manager-source invoice projection | VAT policy pending; tax documents not legal/compliance evidence; Proforma does not post revenue |
| Purchase bills / document review | Itemized bills; upload original→local/prepared/manual review→editable classification/correction history→Save Draft | Paid AI disabled. Draft save never journals. Tax-bearing conversion blocked |
| Customer receipts | Explicit issued-invoice allocation, cash/bank, shared open balance | No unallocated advance/refund policy inferred; overpayment rejected |
| Supplier payments | Explicit bill allocations and shared AP/cash | No duplicate settlement or invented bank movement |
| Expenses / custom ledgers | Existing classification/default mappings, custom approved-type expense ledger reuse, independent shared expense submission review | No arbitrary AI ledger posting or real expense posting |
| Bank / cash | Existing bank/cash accounts and transfers, same authoritative journal | Fictional opening fixture only; no real bank feed or custody approval implied |
| General Ledger / Trial Balance | Same immutable entries and reversals, balanced controls | Does not certify real-company accounting policy |
| Financial statements / aging | P&L, Balance Sheet, customer/supplier aging, historical dates, available PDFs | Opening balances, recognition and cutover remain approval gates |

Separate Accountant entry point and navigation are preserved. An authenticated Accountant cannot enter Manager routes or make privileged Owner corrections. Operational Manager identity cannot enter Accountant APIs merely by changing a URL. User-provided actors, job titles or editable profile metadata cannot establish authority.

## Acceptance meaning

Local provider-backed HTTPS, actual fictional Supabase writes and isolated PostgreSQL tests verify the implementation. Protected Vercel hosted workflows remain pending Owner publication approval and tests on the exact deployed SHA. See the final coordinator report for exact test counts, diagnostics, screenshots, frozen source revision and GO/NO-GO.
