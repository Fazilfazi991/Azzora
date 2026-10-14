# Client demo walkthrough

Status: **Ready for owner/client demo acceptance.** The fictional journey, actual screenshots and PDFs are verified on full SHA `861db54bcbb171fe3ac4f8a36b604333b4595e67`. Use a fresh disposable browser context. Keep the owner's saved workspace intact; do not reset or overwrite it to rehearse this demonstration.

## Fictional job and verified figures

Customer: **Olive Courtyard Interiors LLC**. Contact: **Maya Reed**. Project: **Marina Courtyard Apartment Refresh**, a fictional Dubai apartment.

| Work category | Priced item | Quantity | Unit rate | Calculated line amount |
| --- | --- | --- | --- | --- |
| Painting | Prepare and paint internal walls | 40 m² | AED 35.00 | AED 1,400.00 |
| Flooring | Supply and install flooring | 25 m² | AED 90.00 | AED 2,250.00 |
| Joinery | Supply and install joinery units | 2 Nos | AED 650.00 | AED 1,300.00 |

Subtotal **AED 4,950.00**, discount **AED 150.00**, net **AED 4,800.00**, VAT at 5% **AED 240.00**, quotation grand total **AED 5,040.00**.

| Milestone | Percentage | Amount |
| --- | --- | --- |
| Advance on acceptance | 50% | AED 2,520.00 |
| Progress stage | 40% | AED 2,016.00 |
| Handover | 10% | AED 504.00 |
| Total allocation | 100% | AED 5,040.00 |

The demonstration uses one full accepted-scope invoice for AED 5,040.00. A partial receipt of AED 1,000.00 leaves **AED 4,040.00 outstanding**. Net contract value and collected cash remain separate measures. The independent final public-UI journey verified these figures; no manual posting overrides were used.

## Meeting sequence and narration

| Step | Action in the application | Owner's short explanation |
| --- | --- | --- |
| 1 | Customers → Add New Customer. Enter the fictional company/contact and save. | “We keep the customer once, so their quotations, invoices and balances stay together.” |
| 2 | Create the fictional project, select this customer, enter its Dubai location and complete the existing project wizard. | “This project connects the site, scope, contract and invoices for one job.” |
| 3 | Quotations → New quotation. In Customer & Project, select the customer and project. | “The five steps show one part of the quotation at a time. You can return to earlier steps without losing the draft.” |
| 4 | Continue to Scope of Work / BOQ. Keep Simple mode. Add Painting, Flooring and Joinery using Add Work Category. | “A work category is simply a group of related work. A straightforward quote does not need subcategories or headings.” |
| 5 | Open each category and use Add Priced Item. Enter the three descriptions, quantities, units and rates above. | “Enter how much work and its price per unit. Line amounts calculate automatically. Open one item at a time to keep the scope easy to read.” |
| 6 | Open Pricing Summary. Enter discount 150, keep VAT enabled at 5%, and review the calculated cards. Expand a category to inspect quantity × rate and line amount. | “The summary separates the scope subtotal, discount, VAT and final amount. This quotation totals AED 5,040.” |
| 7 | Open Payment Schedule & Terms. Use three milestones of 50%, 40% and 10%; enter due conditions. Review terms in their separate panel. | “These stages divide the same AED 5,040 into AED 2,520, AED 2,016 and AED 504. They do not add another charge.” |
| 8 | Open Preview & Issue. Inspect the actual branded pages, download the quotation PDF and use Finalize; confirm, then record Sent through the status control. | “This is the actual quotation document. Issuing locks this version; later changes use a revision so the agreed history stays intact.” |
| 9 | Record Accepted, choose Convert to Project, select the already linked project and confirm. | “Acceptance connects the agreed quotation to the project contract without retyping the scope or creating a duplicate project.” |
| 10 | Accounts → Invoices → New Invoice. Select From accepted quotation, keep Full accepted scope, save the draft and Issue Invoice. | “The invoice comes from the accepted quotation. This demonstration bills the full scope once; milestone billing remains available.” |
| 11 | On the issued invoice, choose Record Payment. Enter amount 1000 and a fictional reference, then Post Receipt. | “A receipt records money received. It reduces the amount owed without increasing or rewriting the quotation.” |
| 12 | Review the customer statement/outstanding and the linked project's financials. | “The customer owes AED 4,040. Net contract value is AED 4,800 and cash received is AED 1,000. Contract, billing and collections are distinct.” |

For a longer scope, briefly show Advanced scope controls: a subcategory groups work, Heading (No Price) groups items without a charge, and Item Breakdown is separately priced. A priced parent and its priced breakdowns all contribute to the total. Return to Simple mode to continue the meeting; no existing data is removed or repriced.

The built-in worked example is optional and separate from this three-category demonstration. Viewing it changes nothing. Its explicit append action adds one fictional painting category; do not append it to this demo unless you intend to add that extra scope and amount.

## Actual visual walkthrough and verification

The independent final gate passed TypeScript, ESLint, 304 unit/domain tests, the cold production build and all 21 browser suites on both development and production. The complete fictional journey passed at 1440, 1024, 768 and 390px, including exact totals, milestone wording, issue/accept/contract, invoice/receipt, outstanding, reload and immutable revision history. Actual captures and documents are linked below; no generated mockup substitutes for the implemented application.

Full tested SHA: **`861db54bcbb171fe3ac4f8a36b604333b4595e67`**. [Independent certificate](../AGENT-3-QUOTATION-UX-QA.md) · [Consolidated delivery](QUOTATION-UX-DELIVERY.md). Owner/client acceptance readiness: **Ready for review**; human visual/usability signoff is still required. Completion documentation/evidence commits retain the tested application/test/configuration trees.

This is a browser-local fictional demonstration. No real client data, backend/authentication, production database, push, deployment or main merge is involved.

## Actual screenshots and document

These are clean captures of the implemented application on frozen `861db54bcbb171fe3ac4f8a36b604333b4595e67`, with the same fictional figures and public UI actions used by the independent journey. Every stage is available at 1440, 1024, 768 and 390px. The table links desktop and mobile examples; the capture manifest lists all 60 images and their hashes.

| Meeting step | Actual desktop | Actual mobile |
| --- | --- | --- |
| 1 — Customer | [Customer](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/01-customer-1440.png) | [Customer](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/01-customer-390.png) |
| 2 — Project | [Project](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/02-project-1440.png) | [Project](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/02-project-390.png) |
| 3 — Customer & Project | [Step 1](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/03-quote-step1-1440.png) | [Step 1](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/03-quote-step1-390.png) |
| 4 — Work category | [Category](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/04-category-1440.png) | [Category](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/04-category-390.png) |
| 5 — Priced items | [Scope](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/05-priced-items-1440.png) | [Scope](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/05-priced-items-390.png) |
| 6 — Pricing | [Pricing](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/06-pricing-1440.png) | [Pricing](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/06-pricing-390.png) |
| 7 — Milestones & terms | [Payments](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/07-payments-terms-1440.png) | [Payments](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/07-payments-terms-390.png) |
| 8 — Preview & issue | [Issued preview](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/08-preview-issued-1440.png) | [Issued preview](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/08-preview-issued-390.png) |
| 9 — Accepted contract | [Contract](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/09-accepted-contract-1440.png) | [Contract](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/09-accepted-contract-390.png) |
| 10 — Invoice | [Invoice](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/10-invoice-1440.png) | [Invoice](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/10-invoice-390.png) |
| 11 — Partial receipt | [Receipt](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/11-receipt-1440.png) | [Receipt](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/11-receipt-390.png) |
| 12 — Outstanding & financials | [Statement](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/12-statement-1440.png), [Project financials](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/13-project-financials-1440.png) | [Statement](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/12-statement-390.png), [Project financials](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/13-project-financials-390.png) |

[Actual accepted quotation PDF](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/olive-accepted-download-1440.pdf) · [Actual native-print PDF](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/olive-accepted-native-1440.pdf) · [Capture manifest](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/browser-results.json) · [Capture provenance](../integration-evidence/quotation-ux/client-demo/861db54bcbb171fe3ac4f8a36b604333b4595e67/capture-provenance.json).

The coordinator's supplementary capture replay retained all 64 business check groups and all four widths; it only scrolled to the top and awaited fonts before screenshots. This avoids full-page sticky-header capture artifacts. It passed with zero errors and produced 60 actual PNGs and 16 PDFs/48 pages. Those supplemental counts are separate from Agent 3's independent 21-suite gate and do not inflate that certificate. Original raw suite screenshots and hashes remain preserved. No generated image or edited mockup is used.

The [populated project financial summary PDF](../integration-evidence/quotation-ux/final/861db54bcbb171fe3ac4f8a36b604333b4595e67/supplemental-report-pdf-owner-preview/olive-public-ui-Project-Financial-Summary.pdf) and [invoice register PDF](../integration-evidence/quotation-ux/final/861db54bcbb171fe3ac4f8a36b604333b4595e67/supplemental-report-pdf-owner-preview/olive-public-ui-Invoice-Register.pdf) independently confirm the same fictional contract, invoice, collected and outstanding figures. The separate 60-row stress register is a disposable pagination fixture, not a client billing scenario.

Local acceptance preview: [Open Quotations](http://127.0.0.1:5225/#/quotations). All 15 served files match the independently tested cold build. The preview opens ordinary browser-local data; it does not automatically import or overwrite the owner's workspace. Use the steps above in a separate profile to rehearse the fictional job.
