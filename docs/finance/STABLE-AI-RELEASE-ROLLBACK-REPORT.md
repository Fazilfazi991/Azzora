# Stable Accounts release: rolled back — NO-GO

Subsequent correction: [new Preview permission fix verified](CLIENT-DOCUMENT-PERMISSIONS-RELEASE.md). This prior release/rollback record is retained as history; the stable alias has not moved.

6 November 2026. The owner-approved alias switch was performed, tested on the actual stable hostname, and reversed after a critical authorization failure. No application rebuild, production promotion, main merge or Manager change occurred.

## Deployment state

- Stable URL: https://azzora-accounts-client-review-faziils-projects.vercel.app/accountant.html
- Restored deployment: `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy`. Vercel alias lookup confirms this exact deployment after rollback.
- Restored application's SHA is recorded in OWNER-DOCUMENT-REVIEW-2026-11-02.md as `039869b2fa563fea457a35a775c8f34fdd15b540`; the old Vercel deployment has no Git SHA metadata, so this is a local delivery record rather than independently supplied Vercel Git metadata.
- Rejected release candidate remains preserved: `dpl_FiNSszjSsMrVrnXBtCra3qxxxHis`, tested application `28a52f01b30a012620b0e1e3cd938dad26b059ad`, branch `codex/azzora-ai-client-release-gate`.
- Manager production remains `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`; GitHub main remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`.

## Critical failure and containment

Two ordinary offline authorization regressions failed: the restricted read/draft actor can execute create-expense-ledger and create-cash-account. No such records were created online. src/staging/domain.ts classifies these catalog writes as nonfinancial and admits them under finance.draft. The staging_company_commit SQL guard in migration 20261104134923 also admits nonfinancial Accountant writes under finance.draft. Therefore the existing permission is broader than document-review-only, even though invoice issuance and payment commands are denied.

The earlier permission check missed these two paths. Its GO recommendation is superseded. The alias was immediately restored; the exact fictional client's purpose metadata was reversibly changed to client-review-release-hold. The grant RPC now returns HTTP403/PT403 for that client. No password was changed, no other users were modified and no credentials were sent. Only this run's temporary QA MFA factor was retired; Yusuf must enroll his own authenticator after a corrected release. The private access packet is marked HOLD and must not be shared.

## Actual hosted results before rollback

Twelve workflow groups passed on the stable candidate, including thirty route/viewport checks at 1440 and390px, actual individual password/MFA login, refresh/logout, private originals and workspace boundaries, six denied financial commands, and unchanged financial balances after extraction and Save Draft. Zero browser errors were recorded. These positive checks do not override the two failed scope checks. Evidence from the original workflow run remains in ignored tmp/stable-release; its pass status describes that workflow run only.

A fresh, previously unseen fictional PNG produced one uncached DeepSeek result: request 0fe37724-a986-4028-b7bf-0d4e6e7290a8,1289 input and212 output tokens. Supplier/date/reference, both item rows and quantities/rates/totals matched. Classification was unknown and document discount blank; both were highlighted and corrected by the reviewer. Screenshots after correction must not be presented as unedited AI output. Original extraction and one correction were retained. Twenty journal entries and all transaction/catalog state remained unchanged by draft saving; the balance sheet reconciled to zero difference.

## Spending and data boundaries

Shared USD5 application ledger history was preserved:23 metered records, cumulative conservative exposure USD0.015082, remaining USD4.984918. The fresh call's peak-tariff upper estimate was USD0.000642, independently matched to actual token usage. These are metered usage estimates, not confirmed provider-billed charges. Provider-account controls remain unverified under the owner's application-cap exception. No additional paid calls or budget reset occurred during rollback. No real-company processing or financial posting was enabled by this release.

## Required correction before another release

Introduce a document-review-only permission and enforce it in both server command authorization and database commit boundaries. Deny catalog/account creation, invoice issuance and all transaction actions for this client. Re-run the two preserved ordinary denial regressions, direct API/SQL guards and hosted MFA/document/financial tests on a new frozen revision. Obtain approval for that corrected deployment before moving the stable alias again. Do not provide client access instructions or claim the restored older demo satisfies this new security gate.

The preserved deployment is the rollback option, not a newly accepted secure client-review release. Production accounting remains NO-GO.
