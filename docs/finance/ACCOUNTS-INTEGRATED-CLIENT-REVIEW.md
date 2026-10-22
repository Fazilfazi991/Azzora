# AZZORA Accounts — integrated client review

22 October 2026. The owner’s follow-up request to share the latest demo without a Vercel login authorizes this Accounts Preview publication. No Manager production deployment or main merge is authorized or performed.

## Delivery

- Tested/deployed application: `8e549ff9dba7c82a4c93d4303a51fca9a0e29956`.
- Branch: `codex/azzora-accounts-integrated-review`.
- Client link: https://azzora-accounts-client-review-faziils-projects.vercel.app/accountant.html
- Immutable deployment URL: https://azzora-accounts-client-review-cg0l8erjo-faziils-projects.vercel.app/accountant.html
- Preview deployment: `dpl_9Y8YVYhgY15xYdxrCWY2xBH6n89n`, READY, target Preview (`null` in the API), production URL absent.
- Dedicated project: `prj_inNGMsufKkeDUTS1Sn5whmwIVWuw`, team `faziils-projects`.

The client link opens the separate Accountant sign-in screen without Vercel authentication. Sign in as `accountant@review.azzora.test` using the existing privately supplied Accountant demo password. No credential or access token is included in this report. Financial APIs and uploaded originals require the server-verified Accountant session. A public login screen does not make the ledger or uploads public.

The local `/docs/finance/portal-design/index.html#/demo/sales` screenshot is the design prototype. The published functional application is `/accountant.html`; it preserves the approved independent visual direction and provides the working finance commands and document review.

## Integrated functionality

| Module | Client-review behavior |
| --- | --- |
| Dashboard | Journal-derived period revenue, cost of sales, operating expenses, gross profit and net profit; separately labelled as-of AR/AP and bank/cash. |
| Sales invoices | Fictional draft, explicit issue, receivable/revenue posting once, refresh and marked demo PDF. |
| Purchases | Fictional bill, PO reference and evidence upload, cost/payable posting; entry to separate document review. |
| Customer receipts | Selected-invoice partial/full allocation, overpayment checks and bank/cash ledger update. |
| Supplier payments | Selected-bill allocation and bank/cash/payables update. |
| Expenses | Fictional paid expense with evidence; receipt-review entry point. |
| Bank/cash | Journal balances and running ledger. |
| General ledger | Account-specific debit, credit and running balances. |
| Basic reports | P&L, balance sheet, trial-balance control and AR/AP aging; marked report PDFs. |

All nine modules use the same fictional ledger within a login session. The fixture P&L is revenue AED 20,000 minus cost of sales AED 8,000 = gross profit AED 12,000; operating expenses AED 1,000 give net profit AED 11,000. As-of assets AED 67,000 equal liabilities AED 6,000 plus capital AED 50,000 plus earnings AED 11,000. Receivables AED 15,000 and payables AED 6,000 agree with open documents. These are demonstration policies and figures, not company balances.

Document entry supports PDF/PNG/JPEG uploads, original image/PDF preview including multiple PDF pages, editable fields/items, supplier/product/project/category matching, explicit classification, uncertainty/math/duplicate/price warnings, human confirmation and Save Draft. Supplier defaults are session-only. Saved reviews preserve the original suggestions and append before/after corrections; the correction history is now readable in the interface. Cancelled navigation and logout retain unsaved document edits. Manager browser storage is untouched.

**Live AI is disabled.** Known synthetic files replay labelled prepared suggestions; unregistered files open blank for manual entry. Provider adapters are not selected from environment variables. No paid benchmark was run, no client document was submitted to an external model, and credentials/spending-control verification remains deferred. Document draft saving never creates a supplier, bill, expense, payment or journal. Conversion of a reviewed draft to a posted purchase remains a separate future reviewed workflow; the normal explicit fictional bill form is available now.

## Verification

| Check | Result |
| --- | --- |
| Vitest | 546/546, 34 suites passed. |
| Node finance fixtures | 2/2 passed. |
| TypeScript, ESLint, diff whitespace | Passed. |
| Combined build and Accounts-only build | Passed. |
| Node 24 API bundle/import | Passed; missing server credentials fail closed with 503. |
| Built document browser workflow | 20/20, zero page errors. |
| Hosted API smoke | 7/7: no Vercel redirect, auth, private upload, no-post draft save, persistent corrections/isolation, PDFs, logout revocation. |
| Hosted document browser workflow | 20/20, zero page errors. |
| Hosted Accounts workflows | 14/14, zero page errors: invoices, bills, allocations, expenses, ledgers/reports, PDFs, mobile upload, refresh/logout and isolation. |
| Hosted navigation/access/concurrency | 8/8 grouped checks, including 52/52 route/viewport cases, conditional concurrent writes, idempotency, Secure cookie/logout revocation and Manager entry exclusion. |
| Client alias browser check | 8/8: 1440/390px login without Vercel, refresh, private PDF upload/render, prepared suggestions and logout. |
| Existing CRM browser regression | 482 numerical checks across nine suites plus quotation desktop/mobile/PDF/print/lifecycle/persistence journeys, all passed. |
| Hosted PDFs | Invoice, P&L and balance sheet downloaded; all three rendered and visually inspected. |
| Publication scan | No tracked environment files, dependencies, build output, local test state, key files or detected credential patterns. |

CRM numerical groups: routes/handover 66; commercial 129 plus boundaries 6; operational 136 plus boundaries 18; corrective finance/accessibility 35; workforce 40; recovery 25; finance checkpoint 27. The first development PDF check timed out at five seconds without a page error. The built and hosted PDF workflows passed with a 20-second render allowance. Poppler reported local optional-font configuration warnings while producing the three readable, visually inspected report renders.

Local evidence: ignored `tmp/accounts-integrated-review/`, including `crm/results.json`, `hosted/results.json`, API smoke results, PDF renders, desktop/tablet/mobile screenshots, correction history and Arabic/English/multipage samples. Screenshots were inspected at desktop and mobile sizes. Browser runs use fictional sessions and fresh contexts; no saved company records are used or reset.

## Hosting and boundaries

Node 24 Request/Response handler, HTTPS-only Secure/HttpOnly/SameSite=Strict host cookie, server-side Accountant checks on every API request, write-origin/CSRF validation, rate limiting, conditional writes and idempotent finance commands remain enabled. Private Vercel Blob retains per-session state and attachments across Function instances; no process-memory persistence shortcut is used online. Only Preview has `AZZORA_ACCOUNTS_PREVIEW`, sensitive `AZZORA_REVIEW_PASSWORD_HASH` and encrypted `BLOB_READ_WRITE_TOKEN`. No paid model key is required or enabled.

Each new login starts a fresh fictional ledger. Refresh retains that session for up to eight hours; logout revokes and deletes it. Different logins have separate records and originals. Limits: 2 MB/file, 6 MB/session, 40 document reviews and 100 accepted actions. Abandoned expired private objects still require an operational cleanup policy. The loopback Vite development server remains a process-memory demo; its storage behavior is not the hosted persistence guarantee. A separate local HTTPS handler harness is provided in `tests/accounts-review-preview-server.mjs` for future testing; this release's complete browser acceptance ran on the real Vercel handler and private store.

Vercel’s outer SSO remains off as requested; the Accountant application login protects the demo data. This is one shared demonstration identity, not production individual-user authentication or verified multi-user roles. Client testing must use fictional documents only. Real-company persistence, individual identities/MFA, retention/backups, approved VAT/recognition/expense policies, production accounting compliance and Manager procurement synchronization remain outside this review. No production-readiness claim is made.

There is no remaining blocker to sharing the verified demo link. Future releases must retain the dedicated Accounts project, Preview-only environment values, private Blob access, Accounts-only build flag and disabled live extraction. Do not promote to production or enable paid AI without separate approval and checks. An immutable older deployment URL will continue to show its older revision; use the stable client alias above for this delivery. The alias is explicitly mapped to this tested Preview, not to a Manager or production deployment.

Manager production remains `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`, SHA `fd7754dfe0022f9b64bf875313bd9679cb0144eb`, at `azzora-seven.vercel.app`. GitHub main remains that SHA. No merge, force-push, production promotion, real-company data change or paid AI enablement occurred.

## Source checkpoints

The existing hosted finance implementation (`a3da2fa749144ee94f4a28eaddee9048af64ff08`, certified by `b4ddaa2f63808ac8bda36dfb531de2e451ff0011`) is retained. Document entry: `499d80b61c46fb26003336d0c2b4eeecbd8d1a4d`; company bill scope: `6ef1be48e556c46024479c7325daf61fe0c19f08`; delivery notes: `ab239bd5ecab4fe3faa0b80d60a309f871d3f32b`; deferred benchmark preparation: `f73242956e48ee6339d731079c8bc885117aa1d1`; visible history/navigation safeguard and harness: `bc5acd2f0633429cde20d3025bacc89811327042`; client login-only acceptance tests: `8e549ff9dba7c82a4c93d4303a51fca9a0e29956`.
