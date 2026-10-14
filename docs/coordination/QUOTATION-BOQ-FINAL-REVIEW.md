# AZZORA quotation BOQ final review

## Review boundary

This review concerns the client-approved quotation editor and document layout. It does not change the CRM backend, deploy the application, or merge the review branch into `main`. The integration starts from the preserved GitHub review head `cecd69ce247d054fc37e30e2715bddf959e1bef7`. The corrected application and browser-test freeze for final independent QA is **`e01903e55d3b4026080474b43a787ba2e2a8359f`**. All final development and production gates passed on this freeze. The delivery commit adds this report and synthetic screenshots without changing the tested source or tests.

The freeze contains source tree `6b17299ba4e6239f2b6c37d4fe91d26b1a035515` and test tree `a796ebf703d2b8adf6c55e1d778323db9f16776a`. Documentation and screenshots are added only after that source-and-test freeze; their delivery commit does not change the tested application.

The authority for the BOQ appearance is the seven-page client-supplied original, especially pages 2–6 (local SHA-256 `7E685396E8E70D318841DAFAE1778231DBE2CB0671ADEE1B1D02610FA9A847E8`). The original is US Letter; the owner explicitly selected **A4** for generated quotations. The original PDF is retained only in local review evidence and is excluded from the public repository because it contains client data.

## Integrated changes

| Area | Result | Source commit on integration branch |
| --- | --- | --- |
| BOQ model, pricing, calculations and PDF | A persistent parent role is separate from pricing type. A newly added parent defaults to By Client, accepts normally priced children, and cannot acquire an additional Normal Rate parent charge while children exist. By Client, FOC and Excluded display literal Rate/Unit and Amount labels and contribute zero to totals. Automatic category headings display `3.00` while internal numbering and historical quotations remain intact. | `dacaefd` (Agent 1 `71656e76202e59e2702ab8467498f0b391d6e656`) |
| Editor and linked records | One searchable Customer picker and one customer-scoped Project picker contain inline create actions. New records and quotation links save in one store transaction. Changing customer clears an incompatible project link; project creation checks duplicates. The document snapshot remains editable in collapsed advanced details. The BOQ editor displays category, parent, child and subtotal hierarchy, calculated amounts, compact row actions and responsive columns. | `000617d`, `f6df8bc` (Agent 2 `69314e4195cf98672452c0d10e62a930599a88cb`, `614763dc62e8bba10af108941377097a14affec9`) |
| Browser regressions | Existing quotation, commercial, dialog and operational browser scripts were adapted to the singular pickers without removing their workflow assertions. A new four-width inline selector and BOQ regression covers creation, atomic links, saved children, pricing labels, duplicate prevention and customer/project compatibility. | `77a0465` (Agent 2 `04e490f4f0abb96fa5aa5e721a00407cb8543fb2`) |
| Payment schedule reconciliation | Newly created and copied quotations carry an explicit policy for automatic percentage schedules. Displayed editor and PDF milestones, and the related invoice milestones, sum exactly to the quotation grand total through finalization and acceptance. A tiny `0.10` AED 50/45/5 schedule retains three positive amounts (`0.05/0.04/0.01`). Legacy/reference records and explicit amount overrides retain their source values. | `9d1e801` (Agent 1 `c0c4b3b1de86c8db3a37be6fdbc43f44f0f1daf6`), `e01903e` (Agent 2 `c4ee6111858769551a5930491d90e0f9b1eb79b6`) |

The new draft calculation for a child with quantity `6.1` and rate `90.00` is `549.00`. The client-original contains a different printed amount for that combination and repeats some displayed item numbers. Those source-specific historical values are retained as source exceptions, not treated as formulas for new drafts. Issued quotation snapshots and accepted financial totals were not rewritten.

## Visual evidence

These committed screenshots use synthetic test records. The client-original PDF, with its customer and commercial data, remains outside Git.

| Check | Evidence |
| --- | --- |
| Single customer selector after inline creation | [Selected customer, desktop](evidence/quotation-boq/customer-selected-desktop.png) |
| Customer-scoped project selection after inline creation | [Selected project, desktop](evidence/quotation-boq/project-selected-desktop.png) |
| BOQ editor with grey category, light-grey By Client parent and white priced child | [Desktop editor](evidence/quotation-boq/boq-editor-desktop.png), [mobile editor](evidence/quotation-boq/boq-editor-mobile.png) |
| Editor density and column alignment | [Before](evidence/quotation-boq/boq-before-desktop.png), [after](evidence/quotation-boq/boq-after-desktop.png) |
| A4 generated PDF with synthetic By Client, FOC, Excluded and Normal Rate rows | [Rendered PDF page 2](evidence/quotation-boq/pdf-after-page-2.png) |
| Future automatic schedule with exact one-fils reconciliation | [Rendered payment PDF page 2](evidence/quotation-boq/pdf-payment-rounding-page-2.png) |

Agent 3 rendered the frozen-SHA historical quotation to a seven-page A4 PDF and inspected pages 2–6 beside the seven-page Letter client original. Both use the AZZORA stationery, six-column BOQ order, medium-grey category and subtotal bars, light-grey bold parent rows, white priced child rows, right-aligned numeric columns and the existing Summary of Cost. The generated A4 version retains the original logo, fonts, watermark, totals, payment and terms sections. A4 shifts later categories and a parent continuation to subsequent pages without clipped text. The original's duplicate historical item numbers and source-specific nonformula amount remain in historical output. The corrected freeze's regenerated historical pages 2–6 were also compared pixel-for-pixel at 110 dpi with the earlier freeze's generated A4 pages; all five 910×1287 PNGs were identical. The same historical pages generated in production are pixel-identical to the development output. Agent 3 inspected a three-page synthetic short workflow PDF with a `225.00` subtotal, `11.25` VAT, `236.25` total, Summary of Cost, payment schedule and terms continuation; no clipping or overlap was observed. A second three-page synthetic PDF with multiple parent and child items shows `3,175.00` subtotal, `158.75` VAT and `3,333.75` grand total. Its final automatic payment is `1,666.68`, so all three displayed milestones sum to the grand total. The page-2 render before and after that correction differs only in the final payment amount glyphs. Visual review against the original is based on layout and content, not pixel-identical pagination. The local original and detailed generated PDF evidence are retained in ignored `tmp` directories for owner review.

## Verification

| Gate | Result |
| --- | --- |
| Coordinator integration checkpoint on corrected combined source | TypeScript passed; ESLint passed; 353/353 unit tests in 15 files passed; production build passed. |
| Agent 2 targeted browser checks | New selector/BOQ and BOQ visual checks at 1440, 1024, 768 and 390 px passed. Quotation workflow/PDF, commercial workflow (129 checks), commercial boundaries (6), dialog regressions (64), and reference/accepted print checks passed. Live preview reported 29 passing groups; duplicate long runs were stopped for independent QA. |
| Agent 3 focused corrected-freeze financial browser check | The new one-fils editor regression passed against both isolated development and fresh-production preview servers. Manual override mismatch remains visible. |
| Agent 3 full corrected frozen-SHA verification | Authoritative development browser gate passed **27/27 suites, 0 failed**; fresh-production browser gate passed **27/27 suites, 0 failed**. The gates cover quotation workflow, selector, hierarchy, live preview, PDF, native print, commercial and operational flows, dialogs, workforce and recovery. Each phase produced 56 parseable PDFs with 172 nonblank pages and no inventory error. Production's 15 served build files matched the cold `dist` bytes by SHA-256. Native/download print of the seven-page reference and two-page accepted workflow passed at 1440 and 390 px without changing saved data. The earlier `77a0465` development gate passed 26/26 suites but revealed a one-fils draft payment presentation defect during visual QA. Its production diagnostic was stopped after 21/26 passing suites, with 0 failures; the interrupted next suite is not counted. Only the corrected `e01903e` run is authoritative. |

## GitHub delivery and limitations

The existing [PR #1](https://github.com/Fazilfazi991/Azzora/pull/1) targets `main`. The verified branch update is limited to the existing `codex/azzora-final-crm` review branch and preserves the prior review commit as an ancestor. The browser-local database remains a demonstration boundary; production authentication, shared persistent storage, server-side authorization and backups require later backend work. No backend work is included here. Automated browser coverage used Chromium and synthetic local data; physical printer, other browser engines and owner aesthetic acceptance remain outside this QA certificate. The production build emitted its existing non-failing bundle-size advisory. Agent 3 found no remaining critical defect.
