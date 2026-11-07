# Document extraction loading feedback — 7 November 2026

- Branch: codex/azzora-extraction-loading.
- Tested/deployed application SHA: caee3b1b532af5b3c547718a924cbae74293a0fe.
- Preview: https://azzora-accounts-client-review-ck1nlsxu9-faziils-projects.vercel.app/accountant.html
- Deployment: dpl_5Wo4WFgX9ru8gvrU7G7Z2RZDSBdc (READY).

Added a prominent indeterminate spinner, filename, Extracting document details status and keep-page-open guidance. The upload control changes to Processing document; duplicate upload/manual actions and the old review fields are disabled during processing. Loading clears on success or failure. The status is announced politely, and the spinner becomes static for reduced motion. No invented completion percentage or server-stage milestones are shown.

The screenshot's file-rejection message was independent of loading. Oversized files now explicitly identify the existing2MB limit; unsupported types explicitly request PDF/PNG/JPEG. Neither rejection triggers a provider request or a false ongoing extraction state. The limits themselves are unchanged.

Motion assessment: one spinner for waiting feedback; no other transitions or delays. Existing AZZORA tokens, layout and fonts retained. No AI provider, financial calculation, authorization or persistence changes.

Verification:

-13 mocked document UI contract checks passed, including held pending request, filename, disabled controls, completion, provider failure, invalid files and reduced motion.
-213 document domain tests passed across12 files.
-TypeScript, configured source ESLint and production build passed. Existing large-chunk build advisory retained.
-Hosted Preview: individual login, visible pending card at1440/390px, filename, disabled duplicate actions, reduced motion, successful real original-ingestion API completion, cleared loading, editable review, logout and private API revocation passed. Financial snapshots unchanged; no page errors.
-No paid model calls: the browser held the request to inspect loading, then explicitly sent the fictional file through manual original ingestion. Mocked/local and hosted boundary testing is not claimed as a new DeepSeek extraction benchmark.
-Desktop/mobile screenshots rendered and visually inspected. Mobile uses browser emulation.

[Hosted evidence](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/extraction-loading/hosted/results.json)

[Desktop screenshot](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/extraction-loading/hosted/loading-1440.png) · [Mobile screenshot](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/extraction-loading/hosted/loading-390.png)

Stable Accounts remains dpl_GPQuwvkgkn6WCzgAmC8MV3TPqZbK; Manager production remains dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp. Neither alias was modified. This new Preview awaits owner approval before any stable-link replacement, following the existing release rule. No production promotion, GitHub push/main merge, or paid provider use occurred.
