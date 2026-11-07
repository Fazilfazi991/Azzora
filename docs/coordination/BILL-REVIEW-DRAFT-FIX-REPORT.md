# Accounts bill-review corrections — 7 November 2026

Decision: the requested review-draft workflow is ready for owner review on the separate immutable Preview. No stable alias replacement is authorized or performed. A blanket full-CRM regression clearance is withheld because two older browser checks also fail on the untouched baseline.

## Delivery

- Source branch: codex/azzora-bill-review-drafts.
- Tested/deployed application SHA: b300282284363a793eb194d4ef868adc95fa8ff5.
- Immutable Preview: https://azzora-accounts-client-review-m7smvz0gq-faziils-projects.vercel.app/accountant.html
- Deployment: dpl_GPQuwvkgkn6WCzgAmC8MV3TPqZbK; Vercel READY; dedicated Accounts project; Preview environment.
- Use the existing individual restricted client-review login. No credentials are included in this report. No new invitations were sent.
- Stable Accounts remains dpl_8z1ZPMgRgJDkzpzfYeDazjKZwdFo. Manager production remains dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp. GitHub main remains fd7754dfe0022f9b64bf875313bd9679cb0144eb. No GitHub push/merge or production promotion occurred.

## Reproduced root cause

The controlled 12-item form was submitted to the existing stable application's real API, with its original image stored privately. The request returned HTTP 400 and “Review the entered fields and try again.” Financial snapshots were identical before and after.

At baseline d9ff1c4, src/accounts-review/documents/review.ts:358 rejected reviews missing supplier/date/reference/positive AED total or a known classification. It also enforced posting-ready category/account/project/product selections. The synthetic document deliberately had an unclear date and unknown classification, which triggered this guard. src/staging/server.ts:577 replaced the underlying business error with the generic message. Empty discounts were ALREADY valid in fieldsSchema; they were not the root cause of this reproduced save failure. Unmatched blank product IDs and arithmetic discrepancies were warnings rather than the first blocking condition.

Separately, DocumentEntry.tsx:244 applied extraction uncertainty and parent-row warnings to all row fields, including an absent optional discount. The original global focus rule added a clay/red outline and shadow. The captured blank item-discount wrapper was entry-uncertain even though its value was empty. These combined to make an optional value look required/invalid. The original video/reference is unavailable; this evidence establishes the controlled reproduction, not the contents of an inaccessible historical request.

Corrected code locations: review.ts:405 (authorized structural draft save), review.ts:640 (strict posting readiness), model.ts:85 (draft schema), review-errors.ts (safe status/field messages), staging/server.ts:547 (typed API errors), DocumentEntry.tsx:265 (optional uncertainty), DocumentEntry.tsx:408 (save/error retention), UnitAutocomplete.tsx (free-text accessible unit input).

## Implemented behavior

- Unit combobox supports free text, prefix search, Arrow Up/Down, Enter, Escape, pointer/touch selection and ARIA listbox/active-option semantics. D offers DRM. Suggestions combine common units, units from the authorized saved review snapshot and the current form. They deduplicate normalized case/spacing; raw saved values are unchanged, including “ drm ”. Saving the review persists its units in shared authorized storage, so suggestions return after refresh. There is no global browser cache or new unit-management module.
- Item Discount (Optional) and Document Discount (Optional) accept empty values. Absence remains distinct from an explicitly printed/saved 0.00. No printed discount or financial amount is invented. Empty unprinted values use neutral styling; focus is blue/slate, structural errors use red, review uncertainty remains amber/bronze.
- Existing integer-fils and half-up calculations are retained. Negative/excess discounts and changed source discounts are warnings in draft review; malformed nonnumeric values remain structurally blocked. Signed unresolved discount values cannot pass strict posting validation.
- Line 8 shows the entered AED 125.00 versus calculated AED 120.00 at its total field and in review warnings. Subtotal discrepancy, unknown classification, absent optional information, unmatched products and uncertain supplier/OCR fields can remain in a confirmed draft.
- Draft saving preserves original attachment, original extraction, raw entered values, unresolved warnings, revision number and correction history. Supplier defaults change only when their mapping is valid and explicitly requested.
- No permission changes were introduced. Unavailable/unauthorized resource selections remain blocked. Strict posting readiness is checked again in both conversion commands; review-only originals remain review-only. Draft saving never issues bills, pays suppliers, posts expenses or creates journals/masters.
- Safe API failures identify field paths and corrective messages. 409 responses explain stale revisions; 503/network uncertainty preserves edits and retry identity. Errors do not clear the form. Field errors receive invalid semantics and focus/scroll when their field is available.
- DeepSeek extraction, provider admission, originals, departments, permissions and shared spending storage were preserved. Hosted snapshot confirms AI remains enabled. This task used NO paid extraction requests and did not change credentials or provider controls.

## Verification

| Check | Result |
|---|---|
| Complete Vitest suite on frozen source | 1,132 passed; 85 files; 0 failed |
| Document-domain subset | 213 passed; includes four new multi-item/draft/unit regression tests |
| TypeScript | Passed |
| Configured ESLint (src) | Passed, no source issues |
| Production build | Passed; existing large-chunk advisory retained |
| Native ESM/package and financial-fixture node tests | 3 passed, 0 failed |
| Real local restricted-account 12-item form/API/storage | 9 acceptance groups passed, no browser errors |
| Real hosted restricted-account 12-item form/API/storage | 9 acceptance groups passed, no browser errors |
| Hosted mobile file picker/manual-entry regression | 7 groups passed; one fictional manual draft saved; zero extraction calls |
| Mocked general-document UI contracts | 10 checks passed; explicitly mocked, no provider calls |
| Broader browser suite set | 6 passed / 2 failed; both failures reproduced on untouched d9ff1c4 |
| Private-value/artifact scan | 1,101 tracked/build files scanned; zero known private-value matches or forbidden tracked paths |

The 12-item fixture includes DRM reuse, blank discounts, explicit zero, a nonzero discount, a deliberate line mismatch, a subtotal discrepancy, unknown classification, missing date and unmatched products. It traversed actual individual login, original upload, review form, save API and private shared persistence. To avoid unnecessary paid AI, the browser test explicitly sends the original-ingestion request in manual mode and fills the editable fields from the synthetic fixture; it does not claim this is a new AI extraction result. Real server-side validation/storage/authentication are not mocked. The 503 failure is an explicitly injected transport test, followed by a genuine successful save.

Local and hosted tests verified refresh/reopen, all twelve values, blank versus explicit-zero discounts, spaced raw units, warnings, and unchanged General Ledger, Trial Balance, P&L, Balance Sheet, balances, transactions, allocations and financial master records. Real API checks: stale revision 409; malformed line-8 discount 422 with items.7.discount; missing confirmation 422; inaccessible review 403; eight financial/master write attempts 403. Original downloaded privately with HTTP 200 and SHA-256 identical to the synthetic upload. Correction history was retained. Logout revoked access.

Widths rendered and inspected: 1440, 1024, 768, 430 and 390px. No page overflow in the acceptance check. Additional hosted mobile context used touch/mobile emulation and verified that upload offers a file chooser without forced capture and Enter Manually opens a blank form without a camera/file chooser. A physical iOS/Android device was not used.

Broader passing suites: workforce-browser, recovery-browser (25 cases), accounts-review-browser (invoices/purchases/receipts/supplier payments/expenses/reports/PDF/login/mobile), timeline-independent-browser and timeline-date-position-browser, plus general-document-ui-browser. The two non-green checks are:

1. operational-browser.mjs:321 cannot locate Submit for PM review in the planning proposal. Same timeout at the same line on the untouched baseline.
2. document-entry-browser.mjs:318 expects a blank supplier after an unregistered image upload but sees the prior Sample Supplier B. Same expected/actual failure on the untouched baseline. The new warning presentation also required scoping a price-warning assertion to its summary because the message is now visible beside the field as well.

Initial broad runs affected by development-server hot restarts were discarded; the final frozen run and baseline controls are the results above. These older failures were not silently marked passing or fixed by changing unrelated Manager/AI functionality. They remain follow-up regression work before claiming a completely green system release.

## Evidence and screenshots

- [Controlled stable-build reproduction and request result](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/before/reproduction.json)
- [Before: generic save error, desktop](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/before/save-failure-before-1440.png)
- [Before: misleading blank-discount focus](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/before/discount-before-1440.png)
- [After: desktop item mismatch and neutral optional discount](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/items-1440.png)
- [After: mobile item review](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/items-390.png)
- [After: unit suggestions, desktop](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/unit-suggestions-1440.png)
- [After: unit suggestions, mobile](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/unit-suggestions-390.png)
- [After: saved review details, desktop](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/saved-details-1440.png)
- [After: saved correction history, mobile](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/saved-history-390.png)
- [Local acceptance results](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/local/results.json); [hosted acceptance results](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/results.json); [hosted mobile results](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/mobile-hosted/results.json)
- [Frozen browser suite results](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/frozen-regressions/results.json); [baseline planning control](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/baseline/results.json); [baseline document control](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/baseline-document/results.json)
- [Frozen complete unit log](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/unit-frozen.log); [original integrity/configuration evidence](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/hosted/original-integrity.json)

Additional screenshots for all five widths remain in tmp/bill-review-fix/hosted. Evidence is local and excluded from deployment/GitHub; screenshots may contain existing authorized review-list information and are not public assets.

## Modified files

- src/accounts-review/client.tsx
- src/accounts-review/documents/DocumentEntry.tsx
- src/accounts-review/documents/UnitAutocomplete.tsx
- src/accounts-review/documents/classification.test.ts
- src/accounts-review/documents/documents.test.ts
- src/accounts-review/documents/draft-review.test.ts
- src/accounts-review/documents/entry.css
- src/accounts-review/documents/manual-entry.test.ts
- src/accounts-review/documents/model.ts
- src/accounts-review/documents/review-errors.ts
- src/accounts-review/documents/review.ts
- src/accounts-review/domain.ts
- src/accounts-review/hosted.ts
- src/accounts-review/http.ts
- src/accounts-review/server.ts
- src/staging/client.ts
- src/staging/server.ts
- tests/bill-review-browser-helpers.mjs
- tests/bill-review-draft-browser.mjs
- tests/document-entry-browser.mjs
- tests/fixtures/bill-review-12.mjs
- tests/general-document-hosted.mjs
- tests/general-document-ui-browser.mjs

The later handoff commit changes only documentation and the duplicate-warning test selector; the deployed application remains the exact SHA above.

## Remaining approvals/limitations

- Stable client link remains unchanged pending owner approval of this Preview.
- The two baseline browser failures prevent claiming every legacy CRM regression is green.
- Physical-device/screen-reader acceptance remains an owner/device check; keyboard interaction and touch-emulated mobile behavior were tested.
- No new live-AI accuracy/billing benchmark was performed. Provider-account spending controls and confirmed provider billing remain unverified; the existing owner-approved shared USD 5 application-cap exception and ledger remain in force.
- This is fictional-data review staging. Real financial use, real-company document processing, VAT policy and production accounting approval are outside this release.
