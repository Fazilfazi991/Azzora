# Save feedback beside the action — 7 November 2026

Source branch: codex/azzora-nearby-save-feedback.
Tested/deployed application:921c73c7778b0ab2030d7cbeed0a14777d0644c4.
Preview:https://azzora-accounts-client-review-gumw7pc5u-faziils-projects.vercel.app/accountant.html
Deployment:dpl_6KcWcAZE5fud4sruG2HUGML3bcd1 (READY).

Draft-save confirmation and save errors now appear directly above Save Review Draft. The duplicate page-header confirmation is suppressed for document draft actions. A minimal nearest scroll keeps the feedback visible without returning to the header; no focus is stolen on save failure. Field-specific errors offer Go to affected field for deliberate focus/navigation. Errors retain all entered values and remain until retry/edit/review change; successful retry clears the prior error. New/opened/uploaded reviews clear stale feedback. Upload errors stay beside the upload controls. This Preview also includes the previously implemented extraction loading indicator.

No financial calculations, backend validation, posting, authorization, AI provider or persistence rules changed.

Verification:

-14 mocked browser UI groups passed with no page errors. Desktop/mobile screenshots inspected. Checks include success/error visible beside Save, retry, field navigation, entered-value preservation, loading feedback and reduced motion.
-TypeScript, configured source lint and production build passed. Existing chunk-size advisory retained.
-Hosted actual restricted-account/API verification:9 acceptance groups passed using a twelve-item fictional original and editable fields. Both controlled503 failure feedback and successful real save were fully in the viewport at390px. Refresh/reopen, raw units, blank/zero discounts, unchanged financial snapshots, stale409, malformed422, unauthorized403, eight forbidden financial writes and logout revocation passed. Width checks cover1440/1024/768/430/390px.
-The hosted request uses explicit manual original ingestion; the503 is an injected transport test. No new live AI extraction/accuracy is claimed and no paid model calls were made.

[Hosted results](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/nearby-feedback-hosted/results.json)

[Hosted nearby error](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/nearby-feedback-hosted/save-error-390.png) · [Hosted nearby confirmation](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/nearby-feedback-hosted/save-success-390.png)

Stable alias is not reassigned without owner approval; Manager production/GitHub main remain untouched. No production deployment, environment change, real-data migration or paid AI call occurred. The earlier baseline regression limitations remain documented separately; this focused UI release does not claim their repair.
