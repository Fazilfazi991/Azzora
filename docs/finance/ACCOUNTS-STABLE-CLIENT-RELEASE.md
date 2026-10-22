# AZZORA Accounts — approved stable client demo

22 October 2026. **Ready to share with Yusuf.** The owner-approved alias reassignment and stable-URL acceptance are complete.

**[Open the stable Accounts client demo](https://azzora-accounts-client-review-faziils-projects.vercel.app/accountant.html)**

Sign in as `accountant@review.azzora.test` with the existing privately supplied demo password. No Vercel login is required. The separate Accountant login continues to protect financial APIs and uploaded originals.

## Exact assignment and rollback

| Boundary | Final verification |
| --- | --- |
| Stable Accounts alias | `azzora-accounts-client-review-faziils-projects.vercel.app` |
| Exact approved deployment | `dpl_7F7DwZXXLWHsz8WjXUePuDsN4KTb`, READY |
| Immutable deployment URL | `azzora-accounts-client-review-6swvalds8-faziils-projects.vercel.app` |
| Environment | Preview, target `null`; no production promotion |
| Deployed source package | `e360f4bca2e82c3d5955667fbfb896202ef0922b` |
| Approved application source | `6b33aa87a86b280049992095d1b3bc86b9a466c8`; identical application tree |
| Previous deployment retained | `dpl_DM4WvXZFDXGWrq3YCA5xp2G9hMNt`, still READY |
| Rollback URL retained | `azzora-accounts-client-review-5bwkp7c0v-faziils-projects.vercel.app` |
| Manager production | `azzora-seven.vercel.app` unchanged on `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp` |
| GitHub main | Unchanged at `fd7754dfe0022f9b64bf875313bd9679cb0144eb`, checked before and after |

Only the existing Accounts alias was reassigned. No application source, deployment settings, environment credentials, other alias, deployment history, real financial data or GitHub branch was modified. No build, deployment or promotion command was run. This local release note and its evidence do not change the deployed application.

Automatic alias rollback was armed for any acceptance failure. All acceptance suites passed, so rollback was not required. The previous deployment was neither deleted nor rebuilt.

## Stable-URL acceptance

All five suites ran against the stable alias, using fictional isolated sessions and fresh browser contexts. **56 recorded grouped checks passed, zero browser page errors.** The security/navigation suite includes **52 route/viewport cases** within its eight grouped checks.

| Suite | Passed |
| --- | ---: |
| Existing Accounts workflows | 14/14 |
| Itemized documents and expense-ledger acceptance | 9/9 |
| Tax/Proforma entry, local asset parity and fresh PDF text reading | 4/4 |
| Bill upload and document review | 21/21 |
| Hosted security, concurrency and navigation | 8/8 |

Verified on the stable URL:

- Login opens directly with HTTP 200 and no Vercel authentication redirect. Secure/HttpOnly session cookie, refresh persistence, logout revocation and session isolation pass.
- Itemized Tax, Normal and Proforma invoices, supplier purchase bills, draft reopening, explicit issue, immutable issued history and selected-document payment allocations pass.
- Create New Ledger from Add Expense validates names, prevents duplicates, selects the created ledger, persists/reuses it after refresh, and maps Direct expenses to project Cost of Sales and Administrative/Indirect expenses to Operating Expenses.
- General Ledger, P&L, Balance Sheet, bank/cash and AR/AP aging remain connected to the demo journal. Trial balance and Balance Sheet remain balanced. Ledger creation alone posts nothing; Proformas and unissued drafts do not post ordinary revenue/payables.
- Document upload, original preview, editable fields/classification, correction history, confirmation and Save Draft pass. Unregistered photos remain manual; actual selectable-text PDF reading works without paid AI. Saving a review draft does not post financially.
- Concurrency/idempotency and Manager-entry exclusion pass. The Accountant test contexts preserve their Manager browser-data sentinel.
- Responsive checks at 1440, 1024, 768, 430 and 390px pass, including internal item-table scrolling and accessible form actions. Fifteen local/stable screenshots have identical dimensions; hosted entry JavaScript/CSS are byte-identical to the approved local build.

**11 PDFs / 22 pages** were downloaded from the stable application, rendered and visually inspected. Itemized tables, long descriptions, repeated headers, multi-page documents, oversized-row continuation, demo Tax/Proforma wording, P&L and Balance Sheet pass. All 60-item markers and all 1,500 oversized-row characters remain intact. The corrected deployment's error/fatal runtime-log scan returned no entries for the acceptance window.

### Evidence

- [Stable acceptance results](accounts-stable-release-evidence/acceptance.json)
- [Alias, rollback and production boundary checks](accounts-stable-release-evidence/release-boundaries.json)
- [Visual/PDF inventory and comparison metrics](accounts-stable-release-evidence/visual-evidence.json)
- [Desktop comparison](accounts-stable-release-evidence/local-hosted-desktop.png) / [mobile comparison](accounts-stable-release-evidence/local-hosted-mobile.png)
- [Mobile ledger creation](accounts-stable-release-evidence/create-ledger-390.png)
- PDF contact sheets: [1](accounts-stable-release-evidence/pdf-contact-1.png), [2](accounts-stable-release-evidence/pdf-contact-2.png), [3](accounts-stable-release-evidence/pdf-contact-3.png), [4](accounts-stable-release-evidence/pdf-contact-4.png)

Complete stable-URL screenshots, raw PDFs, renders and individual suite logs are preserved locally in ignored `tmp/accounts-stable-acceptance/`. No credential, cookie, access token or real client document is included in the saved evidence.

## Client-use boundaries

This remains the fictional Accounts client demo. Paid AI stays disabled. VAT policy stays pending; demo tax documents are not compliant legal invoices. Each login starts a fresh fictional ledger; refresh preserves the current session for up to eight hours and logout deletes it. Use only fictional data and files. This is not approval for production accounting, real financial posting, permanent company storage or real-data migration.
