# Hosted persistence and concurrency investigation

Candidate application: 50e60d2ca812b7b1077b5edca2740ca3c4c1619b.
Immutable deployment: dpl_2NqTj4ngUQdqfLKh79Ez3gnAzm8x (ik4bhvqhz).

## Ledger UI timing

Original feedback suite failed a default5000ms visibility assertion while its ledger fieldset remained disabled/Creating. With hosted-only30000ms assertions, the full9-group suite completed with exit0, no browser errors,5PDFs/16pages and ledger persistence/reuse verified. QA-only commit ce848d4cf36c8d5b23d6acb09818ca8408b7066a retains local5000ms assertions. Three independent measured ledger writes returned200 in1145/1470/1561ms; UI completed in1194/1529/1601ms, no financial metric change. The original delay's underlying cause was not reproduced; it cannot be conclusively attributed to Blob.

## Unresolved concurrency availability gate

Two strict hosted-acceptance executions failed on503, first during concurrent duplicate keys (line110) and independently during concurrent distinct keys (line81). Neither503 was accepted as a passing result. Generic deployed Error.name logging did not identify underlying error class/code.

14 targeted groups (three current-date distinct/duplicate rounds, three exact historical-date distinct/duplicate rounds, one immediate-after-login distinct/duplicate round) returned only200/409. Replaying each unique key produced exactly one committed receipt per key;21unique AED1 receipts across disposable sessions reconciled exactly, with trial balance and balance sheet balanced. All28concurrent probe responses were200/409. This proves preserved posting counts in those successful probes, not universal hosted availability.

A third, instrumented strict full suite completed exit0 with8hostedgroups+52route-widthchecks. It retained the original200/409 expectation and captured response request IDs. Later passing executions do not resolve or erase the two503 failures.

Current conclusion: no duplicated or missing committed receipt was demonstrated. Intermittent hosted service availability remains unexplained and must be corrected with safe native error classification/retest, or clearly reported as an outstanding hosted release blocker. Do not automatically reassign the stable alias on the strength of the later passing run.

Evidence directories: accounts-feedback-browser (original), accounts-feedback-browser-timeout-corrected, accounts-hosted-acceptance (original), accounts-hosted-acceptance-strict-rerun, accounts-hosted-acceptance-instrumented, concurrency-probe, concurrency-probe-exact-fixture, concurrency-probe-immediate.

## Fresh hosted PDF visual checks

All16PDFpages from the corrected hosted feedback suite plus2tax/proforma PDFpages from accounts-final-preview-browser were independently rendered with Poppler70dpi and visually inspected.6-page invoice/bill repeatedheaders,2-page oversized description flow, columns/totals and explicit fictional/pendingVAT notices are clean. Render artifacts and contacts are in each run's poppler-pages directory. No TLS evidence was substituted for these hosted files.

No paid AI call, real financial document, stable alias modification, production record modification, implementation change or deployment was performed by independent QA.
