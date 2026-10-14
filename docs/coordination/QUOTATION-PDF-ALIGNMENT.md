# Quotation PDF alignment correction

The client-supplied AZZORA quotation template remains the design authority. This change is limited to the document layout function and its regression tests. It does not change the quotation editor, saved records, reference data, fonts, font sizes, colors, grey fills, borders, logo position/size, watermark, headings, column order, financial calculations or issued snapshots.

## Corrections

- Aligned the Sl.No, description, quantity, unit, rate and amount headings with their respective cell anchors. The Amount heading previously sat off-center over its column.
- Wrapped item descriptions and long quantity/unit/rate/amount cells within their column widths. Multi-line values can continue across A4 pages without crossing the footer.
- Aligned section numbers, section headings, priced rows and subtotal labels. Long subtotal labels wrap within the label area, away from their amounts.
- Tightened empty space around the subtotal/VAT/grand-total block, amount in words, Summary of Cost and payment/terms sections; monetary rows retain their approved styling and ordering.
- Repeated BOQ headers after explicit and automatic page breaks. Kept a parent heading with the child row when a break is requested. Repeated the Summary of Cost header on summary continuation pages and terms/payment headings on their continuation pages.
- Kept the historical QTN-AF-26049 reference at **seven A4 pages**. Its source/manual numbering and figures are unchanged.

## Disposable PDF examples and visual review

Five examples were generated before and after from in-memory quotation objects. No browser database or issued quotation record was written. Poppler rendered every PDF page to PNG; every final content page was visually reviewed for clipping, alignment, background, repeated headings, payment and terms placement. The cover page image for each example was byte-identical before/after. For each example, page 2 has a side-by-side before/after PNG. Generated PDFs and screenshots are local ignored review artifacts at `tmp/pdf-alignment/{before,after,review}` and are excluded from GitHub history.

| Example | Before → after | Coverage |
| --- | ---: | --- |
| Short BOQ | 2 → 2 pages | Approved cover plus one-page BOQ, discount, VAT, words, Summary, payment and terms |
| Four-section long BOQ | 6 → 6 pages | Long descriptions, multi-line section title/subtotal, explicit break, multi-line milestones |
| Oversized description/term | 8 → 7 pages | Deliberate row and term continuation; removal of formerly orphaned terms page |
| Thirty-five categories | 7 → 8 pages | Multi-page Summary of Cost; extra page is required to repeat its table heading and keep rows within bounds |
| Supplied QTN-AF-26049 | 7 → 7 pages | All 110 reference rows; demolition, tiling, gypsum, plumbing, totals, Summary, payments and conditions |

For every example, the computed subtotal, VAT and grand total before/after are byte-identical. The five cover renders are pixel-identical. Source objects are confirmed unchanged by generation.

## Checks

- The existing 23 quotation tests pass unchanged, including the seven-page QTN-AF-26049 expectation.
- Six new layout regressions pass for stationery geometry, headings, explicit page breaks, long descriptions/subtotals, long unit cells, Summary continuation and oversized payment/terms content.
- TypeScript and ESLint passed for the PDF change before integration. Agent 3 must rerun the full combined quotation/PDF/browser gate against the frozen integration SHA.

The original template always includes a cover page, so the short example is a one-page BOQ inside a two-page quotation. No attempt was made to suppress that approved cover solely to create a one-page complete document.
