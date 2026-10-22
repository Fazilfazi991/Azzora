# AZZORA Accounts — protected hosted client review

Historical checkpoint. The latest integrated demo, current client link and login-only access verification are recorded in [ACCOUNTS-INTEGRATED-CLIENT-REVIEW.md](ACCOUNTS-INTEGRATED-CLIENT-REVIEW.md). The Vercel share-link instructions below describe the original protected release, before the owner's subsequent request for access without Vercel login.

Verified 22 October 2026. The live client-review application is **READY** as a Vercel **Preview** in the dedicated `azzora-accounts-client-review` project. It has not been merged or promoted to production.

- Repository: https://github.com/Fazilfazi991/Azzora
- Branch: `codex/azzora-accounts-client-review`
- Tested local baseline: `4bc4dc33fecbd02ace9265a97a3046575f81fe9f`
- **Hosted application SHA:** `a3da2fa749144ee94f4a28eaddee9048af64ff08`
- Deployment: `dpl_7tzodUBDKgcFY3x3wFo2aHEkdJxs`
- Protected URL: https://azzora-accounts-client-review-4jz1o4kak-faziils-projects.vercel.app/accountant.html
- Vercel project: `prj_inNGMsufKkeDUTS1Sn5whmwIVWuw`; team `faziils-projects`.

## Client access

Use the owner-delivered seven-day Vercel share link, then sign in as `accountant@review.azzora.test` with the separately supplied demo password. No Vercel account is required for this share-link flow; it was tested in fresh browser contexts. The link expires **29 October 2026 at 10:37 Dubai time**. The credential and share token are intentionally absent from this Git-tracked report. The local owner access note is `tmp/CLIENT-ACCESS.txt` and is ignored by Git and Vercel uploads.

Vercel Authentication protects the deployment. Raw access without an authorized share link was denied. The app also verifies its Accountant password on the server, stores only a salted scrypt hash in a sensitive Preview environment variable, uses a Secure/HttpOnly/SameSite=Strict host cookie, validates write origins and CSRF tokens, and checks the current private session on every API request. Logout deletes that session; a copied old cookie was rejected after logout. This remains one shared **demo** identity, not production individual-user authentication or a complete production role policy.

## Hosted functionality

| Basic module | Verified online behavior |
| --- | --- |
| Financial dashboard | Journal-derived revenue, cost of sales, operating expenses, distinct gross/net profit, AR/AP and bank/cash; period versus as-of labeling. |
| Sales invoices | Create fictional draft, issue once, preserve issued document, update receivable/revenue, refresh, download marked demo PDF. |
| Purchase bills | Record fictional PO-reference bill and cost/payable atomically; validate and privately retain PDF/PNG/JPEG upload. |
| Customer receipts | Explicit single-invoice partial/full allocation, overpayment rejection, bank/cash and AR journal update. |
| Supplier payments | Explicit single-bill payment, payable and bank/cash update. |
| Expenses | Paid fictional operating expense and evidence upload, bank/cash and expense journal update. |
| Bank/cash | As-of journal balances and running bank ledger. |
| General ledger | Account selector and dated debit/credit/running-balance rows from posted journals. |
| Basic reports | Reconciled P&L, balance sheet, trial-balance control and AR/AP aging; marked P&L and balance-sheet PDFs. |

The mobile bill workflow was exercised at 390px with a real file-input upload and refresh. Uploaded files are served only through the authenticated API and only within the originating review session. Each login receives a fresh fictional fixture, stored in a dedicated **private** Vercel Blob store; refreshes and separate Function instances retain it. Different browser sessions do not share documents or attachments. Each accepted command saves its source changes, allocations, balanced journal, reconciliation and idempotency result in one conditional object write. Concurrent receipts and duplicate submissions were exercised against the hosted URL with no lost or duplicate posting.

The Accounts-only build excludes the Manager application entry point. Its API does not import or write `azzora-demo-v1` or connect real company records. Existing Manager browser data was protected with a sentinel test. Manager production remained at `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`, SHA `fd7754dfe0022f9b64bf875313bd9679cb0144eb`; GitHub `main` remained at that same SHA before and after delivery.

## Verification results

| Check | Final result |
| --- | --- |
| Vitest | **473/473 passed**, 32 suites, including hosted boundary and existing CRM/quotation/finance tests. |
| Separate Node fixture tests | **2/2 passed**. |
| TypeScript / ESLint | Passed. |
| Hosted Vercel build | Passed; deployment READY; Preview target, no production URL. |
| Hosted workflow script | **14/14 recorded checks passed**, zero browser page errors. |
| Additional hosted security/concurrency checks | **4/4 passed**: Vercel protection, concurrent/idempotent writes, Manager build exclusion, secure cookie/logout revocation. |
| Route/viewport matrix | **48/48 passed**: 12 Accountant routes at 1440, 1024, 768 and 390px; no page-level horizontal overflow. |
| PDF downloads | **3/3 passed**: invoice, P&L, balance sheet; each one A4 page, rendered and visually inspected. |
| Runtime error scan | No error/fatal log entries found for the final deployment during the acceptance window. |
| Production dependency audit | Zero reported vulnerabilities with development dependencies omitted. |

Evidence is retained locally under ignored `tmp/accounts-hosted-review/`: `results.json`, `hosted-acceptance.json`, route/width screenshots and the three PDF downloads/renders. The deployed desktop/mobile interface and the rendered PDF pages were visually inspected. This delivery does not claim a fresh execution of the previous full Manager browser journey scripts; their prior results are recorded in `ACCOUNTS-CLIENT-REVIEW-REPORT.md`. The current full unit suite, isolated hosted workflows and unchanged production deployment were freshly verified.

## Hosting corrections and safeguards

The original Vite middleware used process-memory sessions and could not run as a durable Vercel API. The hosted adapter uses a real Node Function and private per-session storage. Three detected deployment issues were corrected and retested: explicit ESM `.js` import resolution; retaining the approved design stylesheet in build uploads; and requesting uncompressed Blob reads so conditional writes use a strong ETag rather than the compressed response's weak ETag. The conflict guard remains enabled. The first connector deployment request was unexpectedly labeled Production despite a Preview request; it was canceled while queued, before build, in the isolated review project. All successful delivery/testing used an explicit CLI Preview deployment.

Only source changes, locked dependencies and documentation were pushed. `.env*`, `.vercel`, dependencies, build output, access notes, uploaded bills and generated test evidence are excluded from source publication. Synthetic test sessions were removed before client handoff. No real records, production credentials, Supabase project, production database, Manager deployment settings or `main` merge were involved.

## Client limitations

This is a working, protected demonstration of the nine modules, **not production-ready accounting**. Every login starts fresh; the demo session lasts up to eight hours and logout deletes its dataset. No shared company ledger or permanent client records are provided. Upload limits are 2 MB per file and 6 MB per session, with 100 actions per session. PDF/PNG/JPEG only; manual capture, no OCR. The sample reporting date is fixed at 22 October 2026. VAT, tax-invoice compliance, real expense approval roles, canonical Manager PO/document synchronization, bank reconciliation, individual identities/MFA, accounting-policy approval, migration and production backup/retention remain outside this review. Expired sessions are inaccessible; any abandoned expired private test objects require later cleanup. Use fictional data only.
