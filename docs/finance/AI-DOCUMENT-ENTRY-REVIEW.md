# Accounts document entry — local review

Review date: 22 October 2026. Branch: `codex/azzora-document-entry`, based on the Accounts client-review delivery `b4ddaa2f63808ac8bda36dfb531de2e451ff0011`. This candidate has not been pushed, deployed or merged. The existing live Accounts demo and Manager production are unchanged.

## Delivery status

The upload → suggestions → classification → editable review → draft workflow works locally. Known fictional sample files replay explicitly labeled prepared suggestions. Other PDF/photo uploads open a blank manual review. **No live AI extraction, paid connection, or measured model-quality result is claimed.** Provider adapters and a 40-document evaluation harness are ready for an owner-approved synthetic evaluation.

Use the existing operator-supplied local Accountant login. Start with `AZZORA_REVIEW_PASSWORD` set to an operator-chosen value of at least 16 characters, then run the existing Vite development command on a free loopback port. Open `/accountant.html#/bills`, choose **Read a bill · save draft**, download one of the three fictional examples and upload it. The new route is `/accountant.html#/document-entry`. No secret or password is committed.

## What works

- Authenticated PDF, PNG and JPEG upload with the existing file-signature validation and 2 MB file / 6 MB session limits. Exact file retries reopen the existing review. The hosted handler retains its session, CSRF, Origin, role and atomic Blob version checks; these changes are tested locally with a memory store, not deployed.
- Original image preview and local PDF.js rendering with previous/next page controls. PDF parsing runs in a local worker, loaded only for PDF previews; no document is sent to an external viewer.
- Editable supplier, date, reference, currency, item description, quantity, unit, rate, item/document tax, subtotal, total, source project/customer names, matched entities, classification and category.
- Separate supplier bill, project expense and company expense suggestions. Exact normalized matches use the current review supplier/customer records and a reference-catalog adapter. Because the isolated portal has no canonical project/product directory, its fallback project/product references are explicitly fictional; it never reads Manager browser records. Ambiguous product/project/customer matches remain unassigned.
- Missing-field, unknown-match, line arithmetic, subtotal, tax, total, possible duplicate and comparable supplier/product/unit price-change warnings. Integer fils and half-up quantity/rate rounding are used. Document totals remain editable; incorrect printed totals are flagged rather than silently replaced. Discounts, mixed-currency bills and specialized tax policies require manual review.
- Human confirmation is required before **Confirm & save draft**. Editing any extracted value clears confirmation. Saved drafts preserve the original extraction, all saved before/after corrections, category/account mapping and revision history. Stale revisions are rejected. Existing action idempotency prevents duplicate saves on an API retry.
- Optional, explicit supplier classification/category/project defaults apply to later reviews. They remain local demo-session rules; they do not train or fine-tune a model. A conflicting explicit classification is not overwritten by a remembered default.
- Extracted taxes are evidence only. Saving a document draft cannot issue a purchase bill, pay an expense, create an entity, change a journal or settle a transaction. Drafts remain outside reports, invoice aging and balances.

## Existing finance mapping

The feature reuses `ExpenseCategoryMapping` from `src/finance/expense-submissions.ts` and validates each selected category against active, postable cost/expense accounts. The UI and AI cannot supply a ledger account or journal command on the draft route.

| Review category | Scope | Existing review COA mapping |
| --- | --- | --- |
| Project materials | Project | 5000 — Project cost of sales |
| Site consumables | Project | 6000 — Operating expenses |
| Company expenses | Company | 6000 — Operating expenses |

These reuse the established **demo** account structure and the existing project/company expense boundary. They do not approve a new production Chart of Accounts or VAT posting policy. A future real-data adapter must receive approved mappings and authorized references from the shared backend. No arbitrary AI ledger posting exists.

## Candidate comparison

First-party documentation was checked on 22 October 2026. Prices below are published tariffs, not charges observed in this work. Regional availability and the selected account's current price must be reconfirmed before any paid run.

| Candidate | Published cost | Proposed use | Measured accuracy / latency / cost |
| --- | --- | --- | --- |
| Qwen 3.7 Flash, pinned `qwen3.7-flash-2026-07-15` | Singapore ≤32K tier: USD 0.030 per million input tokens, USD 0.130 per million output tokens | First candidate for direct photo extraction and structured fields. PDF path requires approved OCR. | Not run; no credentials connected. |
| DeepSeek Flash, `deepseek-flash` | Cache-miss input/output: USD 0.15/0.60 per million off-peak; USD 0.30/1.20 peak | Compare the same schema and corpus; current alias can change model version, so record actual returned version in a real evaluation. | Not run; no credentials connected. |
| Mistral OCR | Published OCR 4.1 standard tariff USD 4 per 1,000 pages, before any regional premium | Optional PDF OCR followed by one of the structured extractors. This adds both OCR and LLM cost. | Adapter tested with mock transport only. |
| Qwen VL OCR | Exact model/region/price not selected | Optional alternative if direct vision/PDF fallback results justify it. No unnecessary second service added. | Not implemented or benchmarked. |

Sources: [Alibaba model pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [Alibaba vision API guide](https://www.alibabacloud.com/help/en/model-studio/vision), [DeepSeek models and pricing](https://api-docs.deepseek.com/quick_start/pricing/), [Mistral API pricing](https://docs.mistral.ai/inference/pricing).

For illustration only, **4,000 input + 1,000 output tokens** would cost about USD **0.00025** with the cited Qwen tier, **0.0012** with DeepSeek off-peak, or **0.0024** at peak. These figures exclude image token variability, OCR, retries, taxes, caching and failed requests. They are not average document costs. A one-page Mistral fallback adds approximately USD 0.004 at the listed standard tariff, before regional premiums and the extraction call.

**Provisional recommendation:** evaluate Qwen first because its published tariff is lower for the same illustrative token counts. Keep DeepSeek as the comparator and OCR as a measured fallback. There is no verified accuracy/cost winner until the paid benchmark passes. Do not replace reliability evidence with token-price estimates.

## Actual benchmark status and acceptance gates

The no-network readiness run produced:

| Metric | Actual result |
| --- | --- |
| Authored synthetic documents | 40: 10 clear-scan style, 10 simulated mobile-photo style, 10 multi-item, 10 Arabic/English group; an extra bilingual example is among clear scans |
| PDF/photo mix | 20 PDFs, 20 PNG/JPEG images; includes a two-page bill |
| External model/OCR calls | 0 |
| Actual API spend | USD 0 |
| Average API cost per processed document | Not measured — zero live documents processed |
| Model field / amount / classification accuracy | Not measured |
| Model response time, retries, human corrections | Not measured |

The sample replay is built from the corpus ground truth. Its passing tests validate schema, arithmetic warnings and workflow behavior; they **do not measure extraction accuracy**. Phone-photo examples are generated rotated/blurred scenes, not actual camera captures. Real-world lighting, Arabic numeral variants and supplier layouts still need authorized validation.

`tests/document-model-benchmark.mjs` defaults to a no-network readiness report. The future paid path requires an explicit owner approval reference, server-process credentials, provider-account spend cap confirmation and exact input digest allowlists. It records per-document successes/failures, exact field comparisons, incorrect amounts, classification correctness, tokens, latency, retries and required corrections. Provider errors are not silently retried. API USD is deliberately left unknown until account billing is reconciled, including OCR and failed calls. The review audit supplies actual saved user corrections, distinct from predicted corrections against ground truth.

Before selecting a provider, require at least 98% exact printed monetary-field accuracy, at least 95% on other populated fields, at least 90% correct basic classification, all missing/uncertain values exposed for review, and zero unreviewed financial postings. Count refusals and failed documents separately rather than excluding them from acceptance. Compare mean and p95 latency, correction count and billed cost per successful reviewed document, including failures/OCR/retries. These are proposed evaluation gates, not achieved results or approved accounting policy.

## Privacy, region and spend review before real documents

- **Qwen:** proposed adapter targets Alibaba's international endpoint, intended for a Singapore evaluation account. Alibaba documents default prompt/response retention up to 30 days and workspace/model-specific ZDR controls. ZDR has its own cache/stateful-feature exceptions. Obtain the account's processing-region confirmation, DPA, no-training terms and applicable model's enabled ZDR evidence; none is configured here. [Retention and ZDR policy](https://www.alibabacloud.com/help/en/model-studio/data-retention-policy).
- **DeepSeek:** the published policy describes mainland-China storage. API-specific residency, retention, training usage and any opt-out/DPA have not been verified for this owner's account. Restrict any approved comparison to fictional samples until these are resolved. [Provider privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html).
- **Mistral:** the prepared fallback uses the EU regional endpoint. Regional model availability and account terms require confirmation; default API retention and eligible stateless OCR ZDR differ. ZDR must be requested/confirmed, not assumed. [Regional inference](https://docs.mistral.ai/inference/regional-inference), [ZDR coverage](https://docs.mistral.ai/admin/monitor-comply/zero-data-retention), [privacy policy](https://legal.mistral.ai/terms/privacy-policy/).
- A proposed synthetic comparison budget is USD 5 maximum, enforced at the provider accounts as well as by the harness request counts and timeouts. This is **not authorized spend**. Keep keys server-only, disable automatic top-ups, log metering without raw documents, and agree attachment/default retention and deletion before real use. No client financial data is sent for external model training.

## Verification and evidence

Final results and application revision are recorded in the delivery checkpoint below after verification. Screenshots are in ignored `tmp/document-entry-evidence/`: `01-upload-desktop.png`, `02-review-{1440,1024,768,390}.png`, `03-draft-mobile.png`, `04-pdf-desktop.png`, `05-bilingual-desktop.png`, `06-multipage-desktop.png`, `07-multipage-mobile.png`. They show the rendered application, not design mockups. PDF samples are rendered independently with Poppler for inspection.

## Remaining limitations

This is ready for a **local workflow review**, not acceptance of production AI or real accounting. Live extraction benchmarking, billing evidence, privacy/region approval, canonical project/product mappings, persistent per-user supplier defaults and a production posting/approval path remain gated. Existing local review state is process-memory only; the already deployed demo uses its existing private session store, but this feature has not been deployed there. No real record migration or automatic data import occurs.
