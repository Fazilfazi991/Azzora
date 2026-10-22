# Synthetic AI benchmark — approved, awaiting provider setup

22 October 2026. Owner authorization: synthetic-only Qwen-first / DeepSeek-second evaluation, maximum **USD 5 combined**, no automatic financial postings and no production push, merge or deployment. The owner subsequently deferred providing credentials until later. Authorization is recorded; paid execution is deferred, not completed.

## Actual results so far

| Item | Verified status |
| --- | --- |
| Synthetic source documents | 40, with original corpus SHA-256 checks |
| Offline preparation | 20 PDFs rendered into 21 JPEG page images; 20 original PNG/JPEG examples retained |
| External model / OCR calls | **0** |
| API spend | **USD 0** |
| Qwen and DeepSeek extraction accuracy | **Not measured** |
| Classification accuracy / mistakes | **Not measured** |
| Actual average API cost per document | **Not measured** |
| Model processing speed / reliability | **Not measured** |
| Best model / need for paid OCR | **Undetermined pending the live comparison** |

Prepared examples include the existing generated mobile-photo scenes, Arabic/English documents, missing references, multi-item bills and a two-page invoice. These are synthetic fixtures, not real client records or actual phone-camera validation. No prepared ground truth is sent to a model as part of its input.

## Safeguards prepared locally

- Both model processes share one persistent spend ledger with an immutable maximum of **5,000,000 millionths of USD**. Each network request must reserve its conservative maximum input/output charge **before** it is sent. Both provider allocations and the combined cap are checked.
- The ledger survives process restarts. Duplicate request IDs are rejected; an exclusive file lock prevents concurrent benchmark processes from independently spending the same balance. Failed requests, timeouts, missing usage and interrupted requests retain their maximum reservation. Only valid returned metering can release unused reservation. Metered tariff bounds remain distinct from actual billed costs.
- The old `AZZORA_BENCHMARK_ACCOUNT_CAPPED=yes` checkbox-style environment gate was removed. Execution additionally requires a fresh, independently verified account-cap record bound to the account identity and key fingerprint, account-level scope, disabled auto-top-ups, a dedicated benchmark account, actual evidence references and a current verified worst-case model tariff. No such verification record has been created or fabricated.
- No automatic top-up, automatic retry or unverified third-party OCR fallback exists in the benchmark runner. The renderer uses local Poppler, not an external OCR service. Direct vision extraction can receive every rendered PDF page in one request, up to five pages, to test whether paid OCR is necessary.
- Source PDF and prepared page digests are checked before submission. The provider credential stays in the server process. `.env.benchmark.local` is ignored by Git and excluded from deployment uploads; no provider key is configured or committed.
- The live provider interface remains disconnected from the normal portal. Its existing review/draft path still requires human confirmation and cannot post a bill, payment or journal. Provider results and uncertain fields will be preserved in the synthetic benchmark evidence for later review without paying to repeat successful extraction.
- The response ceiling is 8,192 tokens to accommodate multi-item examples, with a 60-second extraction timeout. Spending evidence must use the matching ceiling and the verified model's entire input-token envelope, not optimistic average document sizes.

The provider-level cap is still an external prerequisite. Local code cannot establish that a cloud account really has a hard stop or that automatic top-ups are disabled. Alibaba explicitly documents delayed budget stopping and possible charges during the delay; a budget alert or that switch alone cannot be treated as proof of a strict hard ceiling. [Alibaba budget management](https://www.alibabacloud.com/help/en/model-studio/budget-management). DeepSeek documents insufficient-balance responses, but that does not verify the settings or credit exposure of this owner's account. [DeepSeek balance error documentation](https://api-docs.deepseek.com/quick_start/error_codes/).

## Verification of this preparation

- **546/546 complete unit tests across 34 suites passed** after the budget and local PDF-input changes.
- **84/84 targeted tests across four suites passed**, including shared dollar limits, per-provider limits, restart history, timeout exposure, duplicate reservations, monetary rounding, validated extraction, draft-only finance behavior, hosted session boundaries and PDF page images with mocked transport.
- TypeScript and targeted ESLint passed. All three benchmark/preparation JavaScript modules passed Node syntax checks.
- The no-credential runner reports `approved-blocked-provider-setup-required`; it makes no paid call.
- An explicit attempt without cap evidence was rejected before any network call.
- Offline preparation completed all 40 sources / 21 PDF pages without an OCR service.

These tests establish local guard behavior and compatibility. They are **not** provider-billing validation, model accuracy measurements, hosted verification or production accounting approval. The earlier Accountant/UI/CRM regression evidence remains in [the workflow review](AI-DOCUMENT-ENTRY-REVIEW.md).

## Resume when credentials are available

1. Configure Qwen and DeepSeek keys server-side in `.env.benchmark.local` as `QWEN_API_KEY` and `DEEPSEEK_API_KEY`. Do not put keys in chat, frontend variables, Git or documentation. Keys can be configured locally or in a protected Preview environment before a production rollout.
2. Verify account billing controls directly: combined provider exposure no more than USD 5, automatic top-ups disabled, no unrelated traffic and no unbounded overdraft/postpaid exposure. A possible allocation is USD 2.50 per provider. If a provider cannot be safely capped, skip its paid run and report why.
3. Record genuine evidence in ignored `tmp/document-entry-evidence/provider-cap-evidence.json`. Record account/key identity using a SHA-256 key fingerprint, hard-stop and top-up verification, timestamp/verifier/evidence references, cap allocation and current worst-case tariff. Never create a record solely to make the script pass.
4. Reuse the verified synthetic corpus and prepared images. Run `tests/document-model-benchmark.mjs` with `AZZORA_BENCHMARK_PROVIDER=qwen`, then `deepseek`, using the same shared ledger. Do not delete/reset that ledger to retry failures. The program loads `.env.benchmark.local` only in the server-side benchmark process.
5. Reconcile request IDs, returned token metering and actual provider billing, including failed calls and any account fees. Report actual billed cost separately from tariff estimates. Evaluate amounts, classifications, uncertain values, required corrections, failures and latency before recommending a model.
6. Submit the comparison and recommendation to the owner before enabling live portal extraction or making any hosted/production deployment. The owner has not authorized either activation or deployment in this checkpoint.

No paid benchmark, production deployment, GitHub push, merge, real client upload, financial posting or production record change occurred.
