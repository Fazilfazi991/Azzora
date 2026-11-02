# Auto-Fill correction and hosted acceptance — 2 November 2026

## Delivery

Client-review Preview: https://azzora-accounts-client-review-af6f0qfl5-faziils-projects.vercel.app/accountant.html

- Deployment: `dpl_3MUZve7FwHh6aMo6SrF3mtdisTuv`, READY, Preview (`target: null`).
- Tested application: `0ce35ec2c007eeb829b110831b9ab4aced254049`.
- Branch: `codex/azzora-accounts-autofill-fix`.
- Implementation commit: `06b93d445f1e2c64cb79f2a37b89e531d0213b94`; final commit adds the existing approved image07 and scanned-PDF12 download links/assets.
- Existing Accountant login works without Vercel authentication. Open Purchase bills & upload → Upload & Auto-Fill. Download the sample bill or scanned PDF, upload, review the suggested details, confirm the category/project and save a draft.

## Root cause and authorization

The owner's original event was independently retrieved from Vercel: `2026-11-02T10:09:22.276Z`, request `fg4j2-1793614161240-fa8512b6f37c`, stage prepare, elapsed1ms, HTTP/usage null. In that version, configuration and digest authorization are the only gates before asynchronous preprocessing/storage. Its ready status and the screenshot's non-fixture document identify the digest authorization guard as the rejection. The original photo itself was not supplied for byte-level hash comparison; no original financial content was retrieved or transmitted for this investigation.

The pictured supplier quotation is not an identified authorized synthetic corpus document. It remains unauthorized for external AI processing. A screenshot or an upload to the portal does not authorize sending a real supplier document to DeepSeek.

The UI bug was that all extraction exceptions became a blank `mode: manual` result and the UI labelled it “no local OCR engine.” Reproduction on the original hosted deployment using a valid but deliberately unapproved fictional image produced that exact misleading fallback. No provider request or spending reservation is needed for that failure.

The correction preserves rejection and the uploaded original, but now records and displays a safe reason: not authorized, configuration required, budget/prior-attempt blocked, preparation failed, provider unavailable, response invalid, or protected storage unavailable. Manual selection is separately recorded. A failed Auto-Fill is never labelled as completed AI extraction. Logs contain only static reason codes, stage, bounded counts and safe validation paths; no filename, digest, financial fields, provider body or secret.

## Additional fixes

- Scanned-PDF rendering uses a statically traced native canvas wrapper, explicit canvas factory and required PDF globals. The Vercel include list contains the wrapper and Linux native package. Actual hosted scanned-PDF preparation was verified before paid inference was enabled: one prepared image, stage reserve, no HTTP/usage,2.129 seconds; the temporary authorization hold stopped before reservation/provider access.
- Optional null due date, PO reference, discounts, department and ledger match are normalized to empty unknown values and flagged uncertain. Missing optional values remain unknown. Required amounts, invalid numeric types, arbitrary entity IDs and incomplete responses remain rejected; no missing amount is calculated or invented.
- Earlier HTTP200/schema failures are distinct from preparation failures. The original earlier response with two invalid types predates raw-response preservation, so its exact two paths cannot be reconstructed honestly. Current safe path diagnostics and private immutable raw responses permit strict revalidation without recharging. Missing internal product IDs default to no match; nonempty unverified IDs remain rejected.
- Document type is an editable additive field. The extraction instruction recognises quotation/“Not Official Bill”; uncertain type requires review. Quotation warnings and both server-side conversion routes block financial posting, including attempts to relabel a quotation already identified in immutable extraction history. Quotation drafts remain reviewable. Automatic quotation recognition was not separately live-benchmarked using a newly approved quotation fixture.
- The review shows real input/output usage and request ID. Provider-billed dollar cost is explicitly unverified, rather than invented.

## Uncached live acceptance

The owner renewed the USD5 application-cap exception before these two paid calls. Provider-account cap/top-up controls remain unverified; no false account-level verification was created. The same private global budget, full-envelope reservation, conditional writes, previous spending/uncertain records, forty-digest allowlist and no-automatic-retry rules remain intact. No allowance was reset. Neither file was expanded into the allowlist; both already belonged to the approved corpus.

| Approved file | Actual provider request | Input / output tokens | Result |
| --- | --- | --- | --- |
|07.png, new image upload|`f220e63d-18bd-47a9-bb36-0509bbbcd7ff`|968 /196|Uncached real DeepSeek output populated editable supplier, date, reference, descriptions, quantities, rates, tax and totals|
|12.pdf, new scanned PDF upload|`95832999-1e2e-4129-8c54-e8feda9ef616`|1114 /211|Uncached real DeepSeek vision extraction, one OCR/prepared page, same populated editable fields|

Both returned `mode: live`, model `deepseek-flash`, nonzero actual usage, unique provider IDs, no cached-result label and zero retries. The two Vercel extract requests returned HTTP200 at `10:42:50.804Z` and `10:43:04.042Z`. These are real extractions, not synthetic suggestion replay or merely cached results. Later repeats deliberately reuse labelled real results without another paid request.

All32 checked supplier/date/reference, document-figure and item-description/quantity/rate/tax/total comparisons matched the originals. Units were present and visually checked. Classification was1/2 against fixture expectations:07 suggested project expense instead of supplier bill;12 correctly suggested company expense. Classification uncertainty is highlighted and requires human review. Document type was also uncertain, not invented.

Both reviews were edited, explicitly confirmed, saved as drafts, and reloaded. Original extraction and correction history were preserved, and financial metrics remained unchanged. No bill, expense, payment or journal was automatically posted. Login, refresh, logout/401, image/PDF previews and390px/1440px layouts passed. Actual desktop/mobile forms and originals were visually inspected.

### Cost evidence

The two observed token counts produce conservative peak-token upper estimates of USD0.000526 and USD0.000588, combined USD0.001114, using the published USD0.30/M uncached input and USD1.20/M output rates. These upper estimates are **not provider billing receipts**; caching/off-peak rates may reduce actual cost. Actual charged account dollars remain unverified and `costUsd` remains null. The shared USD5 application ceiling covers previous history as well, not a fresh USD5 allowance for this release. [DeepSeek published pricing, checked 2 November 2026](https://api-docs.deepseek.com/quick_start/pricing/).

## Regression results

- Final application SHA:757/757 unit tests,51/51 files; TypeScript and full source ESLint passed. Vercel production build for the Preview passed.
- Failure-status Preview:11 hosted workflow checks passed, including real unauthorized rejection, scanned preparation with paid hold, explicit manual selection, original preservation, quotation draft/conversion block, session and logout. Provider-unavailable/invalid-response UI cases were explicitly fault-injected, not claimed as live provider failures.
- Existing hosted Accounts suite:14/14 checks passed. Existing itemized invoices/purchases/custom-ledger suite:9/9 checks passed, producing five PDF documents/16 pages. These ran on implementation06b93d4; final0ce35ec changes only two public sample assets and their links. Final0ce35ec separately passed all757 units and the real uncached hosted tests.
- Source and browser-bundle credential scan: no findings. No new dependencies or committed credentials.
- Before/after desktop/mobile screenshots were inspected. No browser JavaScript errors in final hosted runs.

## Preservation and remaining limits

Stable Accounts alias remains `dpl_7F7DwZXXLWHsz8WjXUePuDsN4KTb`; Manager `azzora-seven.vercel.app` remains `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`; GitHub main remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`. No push, merge, stable-alias reassignment or production promotion occurred. Browser data and immutable original history remain preserved.

This is approved-fictional-document testing only. The owner's pictured supplier quotation is not identified as an approved fictional sample; whether it is fictional is unverified. It remains blocked pending document/data-processing approval. Classification/type still require review. Actual billed cost is unverified. VAT policy and production accounting readiness remain pending. The earlier unrelated concurrent Blob503 is not claimed fixed by this work; current scoped hosted tests passed.

## Evidence

- [Before: reproduced old fallback](../../tmp/autofill/before/unauthorized-desktop.png)
- [After: explicit authorization rejection](../../tmp/autofill/after/unauthorized-status.png)
- [Uncached image original and usage](../../tmp/autofill/live/07-original-evidence.png)
- [Uncached image editable fields](../../tmp/autofill/live/07-fields-contact.png)
- [Uncached scanned PDF original and usage](../../tmp/autofill/live/12-original-evidence.png)
- [Uncached scanned PDF editable fields](../../tmp/autofill/live/12-fields-contact.png)
- [Scanned PDF mobile form](../../tmp/autofill/live/12-mobile-contact.png)
- Machine results: `tmp/autofill/live/results.json`, `tmp/autofill/after/results.json`, `tmp/autofill/regressions.json`, `tmp/autofill/live-sha-unit.txt`.
- Sanitized logs: `tmp/autofill/original-owner-event.jsonl`, `tmp/autofill/runtime.jsonl`, `tmp/autofill/live/extraction-request-evidence.json`.

Evidence is ignored local material and was not uploaded. This documentation follows the frozen tested application commit; no application rebuild is required for it.
