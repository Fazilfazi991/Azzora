# AZZORA Accounts — final client Preview for owner approval

Historical Preview checkpoint. The owner subsequently approved the stable alias reassignment; see [the verified stable client release](ACCOUNTS-STABLE-CLIENT-RELEASE.md) for the current shareable URL and fresh acceptance results.

22 October 2026. **READY for owner review.** This is a separate Vercel Preview. The existing stable client-review URL has not been replaced.

## Review URL and access

**[Open the new Accountant Preview](https://azzora-accounts-client-review-6swvalds8-faziils-projects.vercel.app/accountant.html)**

Sign in with `accountant@review.azzora.test` and the existing privately supplied Accountant demo password. **No Vercel login is required.** The application login, authenticated financial/file APIs, private session storage, CSRF and idempotency checks remain enabled. This shared demo identity is not production individual-user authentication.

Use fictional records and documents only. Each login starts a fresh demo ledger. Refresh preserves the current session for up to eight hours; logout revokes the session and deletes its dataset. This is not permanent company storage.

## Deployment provenance

| Item | Verified value |
| --- | --- |
| Dedicated Vercel project | `azzora-accounts-client-review` / `prj_inNGMsufKkeDUTS1Sn5whmwIVWuw` |
| Team | `faziils-projects` |
| Deployment | `dpl_7F7DwZXXLWHsz8WjXUePuDsN4KTb`, READY |
| Environment | Preview; target `null`, no production URL, no assigned aliases |
| Local branch | `codex/azzora-accounts-item-ledgers` |
| Original tested application SHA | `6b33aa87a86b280049992095d1b3bc86b9a466c8` |
| Deployed packaging commit | `e360f4bca2e82c3d5955667fbfb896202ef0922b` |
| Identical application source tree | `3fe7117bc64da3979d91ebcbc25e48c7b84e425e` |

The deployed `src` tree is exactly the original tested application tree. Subsequent changes are deployment exclusions and Function packaging only. Deployment was made from the local branch using an explicit CLI Preview target; no GitHub push or merge was needed.

The source upload dry run retained the required approved design stylesheet and API source while excluding local credentials, environment files, generated builds, test exports, screenshots, owner reports and private access notes. No paid AI keys were added.

## Hosted functional verification

All five suites ran against the immutable URL above, with fresh browser contexts and fictional isolated sessions. **56 recorded grouped checks passed; zero browser page errors.** The navigation suite includes **52 route/viewport cases**; these are part of its grouped result, not additional independent suites.

| Hosted suite | Result |
| --- | --- |
| Itemized documents and expense-ledger acceptance | 9/9 passed |
| Existing Accounts workflows | 14/14 passed |
| Existing bill upload/document review | 21/21 passed |
| Hosted auth, concurrent writes, isolation and navigation | 8/8 passed, including 52 route/viewport cases |
| Additional Tax/Proforma, asset parity and real PDF text reading | 4/4 passed |

Verified behavior includes:

- Separate Accountant login, refresh/session persistence, protected originals, server-side logout revocation and no Vercel sign-in redirect.
- Item-wise Tax, Normal and Proforma invoice entry, saved draft reopening, explicit issue, immutable issued snapshots and correct non-posting Proforma behavior.
- Supplier purchase items, PO/reference/project fields, saved drafts, purchase-price comparison, attachments and supplier payments.
- Inline expense-ledger creation, duplicate/invalid-name rejection, immediate selection, persistence/reuse after refresh, and all three expense groups.
- Customer receipts and supplier payments target the selected document; concurrent distinct writes preserve both updates and duplicate commands post once.
- General Ledger, P&L, Balance Sheet, bank/cash and aging remain connected to the same demo journal. Gross profit and net profit remain distinct.
- Original document preview, editable classification/items, confirmation, correction history, draft saving, duplicate detection and mobile upload are preserved. Saving a review draft does not post financially.
- Fresh selectable-text PDF extraction works on Vercel and is explicitly labeled local PDF text extraction, not AI. Unregistered images remain manual; prepared samples remain labeled synthetic replay.

Financial examples passed online: the three-line invoice/bill example totals AED 205.00; an AED 100.00 receipt leaves AED 105.00; an AED 50.25 supplier payment leaves AED 154.75. Direct expense AED 75.00 increases project Cost of Sales and reduces bank by AED 75.00. Administrative and Indirect expenses of AED 25.00 each increase Operating Expenses, not Cost of Sales. Creating a ledger changes no financial balances. Trial balance and Balance Sheet remain balanced after these commands.

## Desktop/mobile comparison and PDFs

The hosted entry JavaScript and stylesheet are **byte-identical** to the tested local Accounts build. Fifteen matching local/hosted invoice, purchase and expense screenshots at **1440, 1024, 768, 430 and 390px** have identical dimensions. Pixel differences are at most **0.0435%** with a 20-channel-value comparison tolerance, arising from generated demo identifiers. Actual desktop/mobile screens and comparison sheets were visually inspected; the approved independent Accounts layout is preserved.

**11 hosted PDFs / 22 pages** were rendered and visually inspected: itemized invoices/bills, 60-item multi-page documents, an oversized row, explicit Tax/Proforma examples, legacy invoice/Proforma, P&L and Balance Sheet. Item columns, descriptions, repeated headers, totals, footers and page breaks remain aligned. The oversized row retains all 1,500 characters and both 60-item documents retain every item. Demo tax documents carry the fictional/non-production disclaimer and pending-tax wording.

- [Desktop local/hosted comparison](accounts-final-preview-evidence/local-hosted-desktop.png)
- [Mobile local/hosted comparison](accounts-final-preview-evidence/local-hosted-mobile.png)
- [Ledger creation on mobile](accounts-final-preview-evidence/create-ledger-390.png)
- [Tax item entry](accounts-final-preview-evidence/tax-items-1440.png) / [Proforma on mobile](accounts-final-preview-evidence/proforma-items-390.png)
- [PDF contact sheets 1](accounts-final-preview-evidence/pdf-contact-1.png), [2](accounts-final-preview-evidence/pdf-contact-2.png), [3](accounts-final-preview-evidence/pdf-contact-3.png), [4](accounts-final-preview-evidence/pdf-contact-4.png)
- [Itemized invoice](accounts-final-preview-evidence/itemized-invoice.pdf), [purchase bill](accounts-final-preview-evidence/itemized-bill.pdf), [multi-page bill](accounts-final-preview-evidence/multipage-bill.pdf), [P&L](accounts-final-preview-evidence/pnl.pdf), [Balance Sheet](accounts-final-preview-evidence/balance.pdf)
- [Consolidated hosted results](accounts-final-preview-evidence/verification-results.json)

Full hosted screenshots, PDF renders and run logs remain in ignored `tmp/accounts-final-hosted-v2/`. The existing local baseline remains 606 passing unit tests, two fixture tests and 18 selected browser suites, as recorded in [the implementation handoff](ACCOUNTS-ITEM-LEDGERS-REVIEW.md). Those local unit tests were not rerun merely for unchanged application source; the final Vercel build reran TypeScript and the production build, followed by the hosted suites above.

## Hosting correction found and verified

The first candidate Preview passed the core financial workflows but failed actual selectable-text PDF reading with HTTP 503. PDF.js loads its server worker dynamically, and that worker was omitted from the Function bundle. `vercel.json` now explicitly includes `node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`. No application logic, authentication check, financial rule, UI or dependency was replaced.

The corrected Preview passed a fresh PDF API smoke test and the entire 21-check document workflow, including the non-prepared text-PDF case. All other hosted suites were repeated on the corrected URL. The first candidate is not the approved review URL. The corrected deployment's error/fatal runtime-log scan returned no entries during acceptance. Optional PDF.js graphics-polyfill notices do not prevent server text reading or browser preview; both were tested.

## Preserved boundaries and limitations

- Stable client alias remains on `dpl_DM4WvXZFDXGWrq3YCA5xp2G9hMNt` at its prior `5bwkp7c0v` Preview. No alias replacement or promotion occurred.
- Manager production at `azzora-seven.vercel.app` remains `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`, SHA `fd7754dfe0022f9b64bf875313bd9679cb0144eb`.
- GitHub `main` remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`, checked before and after. No GitHub writes were performed.
- Paid AI remains disabled. No Qwen/DeepSeek calls, model training, new service or real-data migration occurred.
- B05 VAT policy remains pending. Zero demo tax is explicitly labeled; these are not compliant legal tax invoices or production accounting statements.
- Measurements are descriptive. No weight/area formula was invented. Uploads remain limited to 2 MB/file, 6 MB/session, PDF/PNG/JPEG; text reading supports up to five PDF pages, with no image OCR. Item documents support up to 80 rows. Existing demo action/session limits remain in force.
- Individual identities, real-company posting rules, shared permanent records, statutory compliance, backup/retention and expired-session object cleanup remain production requirements outside this review.

**Owner approval is required before replacing the existing stable client-review URL.** This Preview is ready for Yusuf to review using fictional data; it has not been promoted to production.
