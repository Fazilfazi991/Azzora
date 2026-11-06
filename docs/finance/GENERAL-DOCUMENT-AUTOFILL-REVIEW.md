# General document auto-fill — verified client-review checkpoint

6 November 2026. **GO for authenticated fictional-data review. NO-GO for real-company document processing or production accounting.**

The accountant can upload a new supported fictional bill, receive actual DeepSeek suggestions, edit every field and save a reviewed draft. A developer does not register its fingerprint first. Twelve previously unseen originals produced twelve fresh model responses; none was a prepared suggestion or cached replay.

## Review deployment and source

- Final Preview: https://azzora-accounts-client-review-iuhf6149u-faziils-projects.vercel.app/accountant.html
- Deployment: `dpl_AXWXbxHQAg2FNdNuzTTcpP2AEie8`, Vercel Preview, READY.
- Frozen application: `8570f1cd91517a409fa81b6bae3b4769c743d806`.
- Local branch: `codex/azzora-ai-general-documents`.
- Source commits: `906273a2a74f49a76212e746cfe8b01885d85251` (admission, normalization, preprocessing, shared integration and review UI); `771ff3c77815ef070135033ae8f7ca969f0a3dd0` (native Node packaging); `8570f1cd91517a409fa81b6bae3b4769c743d806` (printed department prompt and completed PDF-page readiness).
- Based on the shared-staging delivery `25d362c91afe98b034733f5959fd47122b7ee93a`.
- No GitHub push, main merge, stable alias reassignment or production deployment.

Open the Preview, use an existing individual fictional-staging Accountant account and its MFA, select Purchase bills & upload → Read a bill, confirm fictional processing consent, and choose Upload & Auto-Fill. Review highlighted fields, correct or select authorized records, confirm review and Save reviewed draft. The page requires AZZORA authentication, **not a Vercel login**. No real client invitations were sent; provision an individual client account only after the required owner approval. Do not share passwords or MFA seeds through this report.

## Why the old form stayed blank

1. The paid demo admitted only known document digests. A different uploaded file failed at preparation before inference. The old fallback then obscured that refusal behind manual/local-OCR wording.
2. Whole-response field validation could discard otherwise usable supplier and item data when an optional value had an unexpected type or was null.
3. The first new hosted candidate revealed an independent packaging defect: extensionless relative imports were preserved by TypeScript and failed under native Node. The reachable graph now uses explicit ESM extensions; the quotation reference JSON has Node's required import attribute. This was reproduced in runtime logs and checked with an actual unbundled native Node import, rather than relying on Vite.
4. The first ten genuine responses omitted five printed department labels. The textual instruction mentioned department, but the JSON example omitted that key. It now includes an empty department explicitly; two new originals verified JOINERY and MEP without changing the first ten results.
5. Browser inspection caught a PDF readiness race: a new page could briefly inherit the previous page's ready flag. Readiness now identifies the completed PDF, URL and page. Six actual final hosted canvases were nonblank at the first matching completed-page state.

## Implemented behavior and safeguards

- The server verifies the current individual identity, fictional company, Accountant workspace, Owner/Accountant role, MFA2 and `finance.draft`, plus explicit per-upload consent. Caller-supplied roles and forged authorization objects are rejected. The legacy shared-password API is unavailable in this Preview.
- Admission uses supported file signatures, type, size and operating limits. Hashes remain for duplicate prevention, private cache and audit; they no longer require developer admission of every new fictional upload.
- PNG/JPEG preprocessing bounds decode size, preserves originals and handles rotated input. Selectable PDFs use local text. Scanned or mixed PDFs render all pages locally for DeepSeek vision, including PDFs with misleading selectable headers/footers. No extra OCR provider was introduced.
- Each field and item is validated independently. Safe formatting and Arabic/Persian digits are normalized. Good fields survive an invalid or missing neighbor. Missing amounts remain missing; printed figures are not silently recalculated or replaced. Existing consistency checks flag discrepancies.
- AI IDs are removed. Matching and ledger suggestions use authorized existing records and approved category/account mappings. Ambiguous or absent matches remain for human selection; no supplier, product, project or ledger is invented.
- Original files, original extraction, provider request/usage evidence, consent, revisions and accountant corrections are retained. Duplicate uploads reuse records. Previously saved model omissions are not silently rewritten by a new prompt.
- UI states distinguish reading, partial or completed extraction, invalid response, unavailable provider, unauthorized processing and manual entry. A blank/manual result is never counted as successful AI extraction. Original and editable form remain side by side on desktop and stacked on mobile.
- Every general AI review is draft-only. It cannot issue an invoice, make a payment, convert into a purchase bill or post a journal. Quotations are identified as quotations. Save Draft was verified without financial changes.
- Server credentials remain private. Known configured private values were absent from tracked files and built assets; no `.env`, dependencies, temporary sessions or generated build directories are tracked.

## Genuine extraction results

Ground truth and document bytes were frozen before calls. Fixtures were not used as prompts or an admission registry. Each original was uploaded once, with no automatic paid retry.

| Test batch | Source / deployment | Genuine fresh responses | Accuracy | Financial/quantity mistakes | Average upload response |
| --- | --- | --- | --- | --- | --- |
| G01–G10, ten layouts | `771ff3c`, `dpl_HLrBfEcou3P9X8eWfisGunj33RP3` | 10/10 | 362/367 facts, 98.64% | 0 monetary or quantity/rate mistakes | 8.6421 s |
| G11 image and G12 PDF, final prompt | `8570f1c`, `dpl_AXWXbxHQAg2FNdNuzTTcpP2AEie8` | 2/2 | 51/51 facts, 100% on these two samples | 0 | 8.3455 s |

The initial ten covered a multi-item VAT/discount bill, thermal receipt, simulated mobile photograph, 90-degree rotation, Arabic/English invoice, two-page selectable PDF, two-page scanned PDF, two-page mixed PDF, quotation marked not an official bill, and degraded receipt with an unreadable quantity. All ten item counts and classifications were correct. All 140 printed monetary facts and 61 printed quantity/rate facts matched. No unprinted field was filled. The five misses were printed departments on G01, G03, G05, G06 and G07; they were left uncertain. Their historical extractions and scores remain unchanged. G11/G12 specifically verified department extraction after correction, rather than claiming those historical misses never happened.

Across both batches: **12/12 successful fresh extractions, zero browser errors, zero observed native HTTP503 failures, zero paid retries and zero financial postings.** The small synthetic set demonstrates the workflow; it is not a universal accuracy guarantee or an evaluation of real supplier documents.

## Usage, spending and cost limitation

| Batch | Actual provider-reported input/output tokens | Peak-tariff upper estimate | Upper estimate per document |
| --- | --- | --- | --- |
| First ten | 13,822 / 2,575 | USD 0.007241 | USD 0.0007241 |
| Final two | 1,850 / 377 | USD 0.001008 | USD 0.000504 |
| Total new calls | 15,672 / 2,952 | USD 0.008249 | USD 0.0006874 |

**Actual provider-billed charges and actual billed average remain unverified.** These figures use real response usage with the conservative tariff; they are not billing receipts. No billing value was fabricated. The official [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) and [vision documentation](https://api-docs.deepseek.com/guides/vision/) informed the implementation. No separate paid OCR service was needed for these tested documents.

The same historical shared USD5 application ledger was used throughout; it was never reset. Before: 8 metered records, USD0.004857 exposure. After: 20 metered records, USD0.013106 total exposure, **USD4.986894 remaining**. All twelve new records were metered; none is an unresolved reservation. The owner's exception permits this application cap while provider-account controls remain unverified. Full-context reservations and atomic budget writes occur before transport, and missing historical state fails closed. This is not an independently verified provider-account spending cap.

## Regression and hosted verification

| Check | Result / exact scope |
| --- | --- |
| Final unit suite | **1,022/1,022**, 79 files, final application source |
| Portal financial fixture tests | **2/2**, final source |
| TypeScript / ESLint | Passed, final source |
| Default combined build / Accounts staging build | Both passed; final hosted build READY |
| Native Node server startup | **1/1**, 79 reachable source files/assets, final source |
| Full existing browser regression | **9/9 suites** on `771ff3c`: CRM66, commercial129, operational136, workforce40, recovery25, Accounts14 = **410 explicitly numbered checks**; quotation and both timeline suites also passed without a numeric total |
| Final affected browser regression | On `8570f1c`: **10 document UI groups** with mocked transport plus **14 local Accounts groups**, zero browser errors |
| Final real hosted identity/security | Genuine individual MFA2 login and **7/7** checks: unauthenticated denial, legacy API404, CSRF/origin restrictions, preserved authorized session, Manager API denial for Accountant, authorized general-AI snapshot |
| Final hosted PDF originals | **6/6 pages** across selectable/scanned/mixed PDFs, exact completed-page state, actual nonblank canvas pixels, desktop/mobile inspection |
| Genuine hosted extraction | First ten + final two as separately versioned above; never count mocks or cached responses as fresh AI |
| Draft/history/financial boundary | Original extraction and correction retained; Save Draft and extraction leave financial metrics and authoritative transactions unchanged |
| Refresh/logout | Authenticated refresh and retained document history passed; logout revoked subsequent API access |
| Desktop/mobile | Hosted1440/390 screenshots and inspection; existing broader CRM responsive suites retained |

The full browser gate was not rerun indiscriminately after the final prompt/PDF-only correction: the affected document/Accounts UI, real hosted PDFs, final unit suite, types, lint and builds were rerun. The exact source scope is recorded rather than claiming all earlier checks ran against the last SHA.

Disclosed failed attempts: the first hosted candidate `dpl_Byw9nPELZRDieKhkpLxGP9EWUe8w` could not start because of ESM imports; no inference occurred there. An early regression run was contaminated by concurrent Vite HMR edits. A subsequent isolated Windows QA server hit `EBUSY` watching a generated PDF; the ignored QA helper excluded generated evidence and affected suites passed on the unchanged source. Initial sticky-element PDF screenshots and the readiness-race evidence were preserved; final verification exported actual completed canvas pixels. Two old time-dependent financial tests were given their intended November4 fixture clock; financial implementation was not changed.

## Screenshots and evidence

- [Final desktop: original plus populated form and department](evidence/general-autofill-2026-11-06/independent/G11-fields-1440.png)
- [Final mobile: populated document details](evidence/general-autofill-2026-11-06/independent/G11-fields-390.png)
- [Final mobile: editable item fields](evidence/general-autofill-2026-11-06/independent/G11-items-390.png)
- [Final PDF page two in the actual desktop interface](evidence/general-autofill-2026-11-06/pdf-final/G08-page-2-viewport.png)
- [Initial ten exact results and mistakes](evidence/general-autofill-2026-11-06/first-ten-results.json)
- [Final two exact results](evidence/general-autofill-2026-11-06/final-supplement-results.json)
- [Final PDF pixel/render proof](evidence/general-autofill-2026-11-06/final-pdf-rendering.json), [security checks](evidence/general-autofill-2026-11-06/hosted-security.json), [legacy regressions](evidence/general-autofill-2026-11-06/legacy-regressions.json), [final affected browser checks](evidence/general-autofill-2026-11-06/final-focused-browser.json)
- [Shared budget before](evidence/general-autofill-2026-11-06/shared-budget-before.json) and [after twelve calls](evidence/general-autofill-2026-11-06/shared-budget-after-twelve.json)

All originals in the new corpus are fictional. Curated evidence contains no credentials, MFA seeds, cookies, CSRF tokens or private login state. Initial screenshots remain labeled with their batch; their old department omissions are not presented as final prompt accuracy.

## Limits and remaining approvals

- Preview only: authorized fictional company and individual Owner/Accountant access, explicit fictional consent. The attestation does not prove a document is fictional and does not grant approval to send real records.
- Supported upload limits: PDF/PNG/JPEG, 2,000,000 bytes; PDFs up to five pages and40,000 text characters; image decoding up to16megapixels; up to80 reviewed item rows,40 reviews and6MB attachments in this demo. Oversized/unsupported/unreadable documents require manual review or splitting; no silent complete-success claim.
- Low-quality, cropped, handwriting-heavy or complex documents can still be partial or incorrect. Uncertain fields and unmatched records require human correction. Currency beyond AED cannot be saved as an AED draft without correction; no exchange conversion was introduced.
- Previously cached results remain historical evidence. Changing a prompt does not silently repair old extractions; use normal reviewed corrections.
- Approvals still required before real-document use: provider processing region/retention/training/privacy and processing terms, real-data consent and authorization, operational budget/monitoring, user provisioning, retention/deletion policy and production security acceptance. Actual billing reconciliation is also outstanding.
- VAT/TRN, legal invoice treatment and real financial posting remain blocked by the separate accounting-policy gates. These samples are not compliant legal tax invoices.
- **Owner approval is still required to replace the stable Accounts client-review alias.** This checkpoint publishes only a new immutable Preview.

## Preservation and rollback

Rechecked after the hosted tests:

- Accounts stable alias remains on `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy`.
- Manager `azzora-seven.vercel.app` remains on `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`.
- GitHub main remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`.

No live rollback is needed because no stable alias or production configuration was changed. The earlier immutable candidates and previous stable deployment remain available. Stop using the new Preview if an acceptance issue is found; do not promote it or enable real accounting automatically.
