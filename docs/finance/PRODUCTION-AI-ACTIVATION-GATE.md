# Production AI activation gate

Reviewed 14 November 2026. This implementation reuses the tested DeepSeek reader; it does not activate a provider, introduce another model or OCR service, or send documents during verification.

## Processing evidence

DeepSeek's [Privacy Policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html), updated 10 February 2026, states that its general service collects uploaded inputs, describes model-improvement/training uses and opt-out rights, uses variable retention, and directly processes/stores personal data in China. Its introduction explicitly excludes processing rules for end users of downstream applications built using the Open Platform. Consequently those general statements do **not** establish AZZORA's API-specific retention period or binding no-training protection.

The [Open Platform Terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) are the relevant API terms; the research fetch timed out, so no unseen clause is relied upon. Account-specific API retention, no-training agreement or setting, deletion commitments, processing region and data-processing terms remain unverified. An owner request to activate AI is not evidence that the provider supplies those controls. Real-document processing stays disabled until genuine reviewed references exist, or the owner explicitly replaces the earlier no-training requirement after informed review.

The [official model/pricing page](https://api-docs.deepseek.com/quick_start/pricing/) confirms `deepseek-flash` vision support. The existing local image/PDF preparation is retained. Peak published token prices are used only for conservative usage estimates; they are not independently reconciled provider charges.

## Required server configuration

No secret values belong in source, browser configuration or this document.

- `DEEPSEEK_API_KEY`: server-only Production Secret in the dedicated Accounts project.
- `BLOB_READ_WRITE_TOKEN`: server-only credential for the **same existing private store**, not a new store or copied ledger.
- `AZZORA_AI_ENABLED`: keep `false` until gates pass; then explicitly `true`.
- `AZZORA_AI_PROVIDER=deepseek`, `DEEPSEEK_MODEL=deepseek-flash`.
- `AZZORA_AI_CLIENT_DEMO_APP_CAP=5`: retains the existing owner-approved shared application-cap mode; its legacy name does not create another allowance.
- `AZZORA_AI_NEW_REQUESTS_ENABLED=true`: explicit business paid-request activation; absent or false keeps business extraction unavailable. Existing saved production reviews remain available through normal authenticated storage.
- `AZZORA_AI_BUSINESS_APPROVAL_JSON`: strict server-owned object with `version:1`, the approved production `companyId`, and nonempty `ownerApprovalReference`, `processingPolicyReference`, `noTrainingVerificationReference`, `sharedBudgetVerificationReference`. These must reference actual evidence; invented placeholders do not satisfy release approval.

The global ledger path remains `ai-evaluation/shared-budget-v1.json` under the existing private ReviewStore prefix. Read and reconcile the latest authoritative ledger before activation; never import a stale demo snapshot, reset historical records, or create an empty production allowance. Older demo deployments can access this shared store, so production business extraction never reads or writes document contents, extracted fields or raw responses there. Its only shared-store path is the global budget. Results stay in request memory until the BFF saves the review in isolated authenticated production storage. A repeated digest remains blocked by its original reservation: reopen the saved review rather than send another paid request. Fictional cache and financial-session paths are not read by this adapter.

## Integration contract

`createProductionDocumentAuthorization(actor, processing, serverApprovedCompanyId)` requires a freshly verified eligible Accountant actor, current company, draft capability, accepted existing authentication policy and exact per-upload `{dataClass:"business", consent:true, policyVersion:"ai-business-v1"}`. The request cannot choose its authorization company. Grants are minted, immutable and cannot be reconstructed from JSON.

`await configuredProductionDocumentRuntime(store, expectedCompanyId, authorization?)` validates server configuration against the actual production company and existing ledger availability; `expectedCompanyId` must come from the production runtime, never a request. `documentAvailability(runtime)` supplies `processing:{dataClass:"business",policyVersion:"ai-business-v1",consentRequired:true}` and `reviewOnly:true`. A missing/incompatible/unavailable ledger blocks extraction without creating records. Every provider call still reserves the full model envelope with existing CAS, validates the live ledger again and preserves uncertain reservations on failures. There is no automatic paid retry or key-rotation allowance reset.

Originals remain in authenticated company storage under the existing BFF controls. Extraction suggestions remain editable review drafts; AI cannot create an accounting posting. No production activation, secret changes or paid calls were performed by these adapter tests.
