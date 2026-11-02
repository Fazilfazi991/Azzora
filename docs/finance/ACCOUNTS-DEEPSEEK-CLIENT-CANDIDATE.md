# AZZORA Accounts — integrated client-review candidate

Review date: 2 November 2026. This is an isolated fictional Accounts demonstration. It is **not production accounting, an approved tax-invoice system, or a verified live AI release**.

## Candidate and preserved deployments

- [Latest immutable Accounts Preview — owner review only](https://azzora-accounts-client-review-2o12ggich-faziils-projects.vercel.app/accountant.html)
- Deployment: `dpl_DcXXap7LkU1rKTehRmvgMPSCxTfW`, READY, Preview target; application SHA **`188f4efec89d1e8eb324b946bdbbdf5ac2529fed`**.
- Earlier complete integration checkpoint: `50e60d2ca812b7b1077b5edca2740ca3c4c1619b`, deployment `dpl_2NqTj4ngUQdqfLKh79Ez3gnAzm8x`. The latest application adds only secret-safe server diagnostics and their unit tests. It does not change transaction/status/retry behavior. Entry JavaScript and CSS are byte-identical between these application revisions and the hosted builds.
- [Source branch](https://github.com/Fazilfazi991/Azzora/tree/codex/azzora-accounts-deepseek): `codex/azzora-accounts-deepseek`.
- The login page opens without Vercel authentication. The existing separate, server-verified Accountant demo login is required for private financial APIs. Use the existing privately supplied demo credential; no password is included in this report or repository.
- The stable Accounts alias remains on `dpl_7F7DwZXXLWHsz8WjXUePuDsN4KTb`. It has not been replaced.
- Manager production `azzora-seven.vercel.app` remains on `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`, source `fd7754dfe0022f9b64bf875313bd9679cb0144eb`.
- GitHub `main` remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`. No production promotion, main merge, DNS change or real-data migration occurred.

## Recovery and integration

Recovered the transferred worktree rather than recreating the Accounts application from older GitHub code. Verified application commit `6b33aa87a86b280049992095d1b3bc86b9a466c8` and packaging commit `e360f4bca2e82c3d5955667fbfb896202ef0922b` both exist. Recovery HEAD `6aa83cf5b30d6e4b4366545db423d86abca4e2c6` had exactly the same `src` tree as the packaging commit: `3fe7117bc64da3979d91ebcbc25e48c7b84e425e`.

The clean recovered baseline passed **606/606 unit tests across 37 files**. Integration was isolated in a new worktree; existing agent worktrees and backups were preserved. Coordinator reconciled shared schemas, handlers, classification and reports; one existing document-processing pipeline and one journal posting path remain authoritative.

Key integrated source commits:

| Root integration commit | Purpose |
| --- | --- |
| `4ae7666eb1186609400fd74d23755f37c179b709` | Document discounts, validated departments and known-ledger mappings |
| `e2085a4` (Agent source `b34dcd315bea0e898a6c66fbf505c98beca0a0a6`) | Banking, departments, reviewed-expense conversion and reconciliation |
| `ee40d74` (Agent source `c83fc3369a129a24a3d98941b7f7fbbd2718f290`) | Gated DeepSeek transport, PDF/vision and shared budget |
| `f3502d2` (Agent source `3e6c33944e220e4ca26005b58342bd29e3ebb7a4`) | Full-context cost reservation and failed-response metering |
| `f6d1da7` (Agent source `de730eb9c67cc05de00397fb282c4739cc1ade00`) | Accountant banking/forms/document interface |
| `2604f42e7eb54c6cd920dda51ab9b55fa507e912` | Hosted runtime, explicit manual fallback and consistent report dates |
| `1210f8aa821f477e5db6d28521a58ba716d52d22` | Deterministic same-day posting order without rewriting history |
| `0956a85`, `8869cda` | Accountant text contrast and keyboard-accessible table scrolling |
| `50e60d2ca812b7b1077b5edca2740ca3c4c1619b` | Frozen tested application; chronological balance regression expectation |
| `188f4efec89d1e8eb324b946bdbbdf5ac2529fed` (Agent source `1cf231b587f9a56c3220b6e134572e0885d908bd`) | Latest frozen application: allowlisted storage-error diagnostics, without messages, URLs, paths, document contents or credentials |

Four later QA-harness changes were incorporated before the diagnostic freeze: root `5a54001`, `cd36130`, `f66c164`, `0d7b825`. These align settlement fixtures with their issued dates, update discount-aware warning text, pin the fixed timeline scenario clock, and allow a bounded hosted assertion timeout. They do not alter the deployed application UI or financial rules.

## Functional coverage

All functionality below operates only on isolated fictional demo records. Existing nine-module coverage and independent navigation are preserved; reports and document entry are accessible within that workspace.

| Module / workflow | Verified behavior | Boundary |
| --- | --- | --- |
| Financial dashboard | Revenue, Cost of Sales, Gross Profit, Operating Expenses, Net Profit, receivables, payables and cash reconcile with journal | Period activity distinguished from as-of balances |
| Sales invoices | Itemized Tax/Normal/Proforma entry, save/reopen/issue behavior, PDFs, invoice-specific partial/full allocations | Proforma has no revenue/AR posting; VAT policy remains pending; demo PDFs are not legal tax documents |
| Supplier purchase bills | Itemized drafts/issue, supplier/PO references, price-change warnings, bill-specific payments and PDFs | Tax-bearing reviewed uploads stay drafts pending approved posting policy |
| Customer receipts | Customer/outstanding-invoice selection, partial/full allocation, receiving account and reference | Validated explicit command; no automatic allocation across unrelated invoices |
| Supplier payments | Supplier/outstanding-bill selection, chosen bank/cash/staff source and reference | Validated explicit command |
| Expenses and custom ledgers | Project/company expense, Administrative/Direct/Indirect grouping, Create New Ledger, refresh/reuse, MEP/CIVIL/JOINERY | Only known postable ledger mappings; direct expense maps to Cost of Sales |
| Bank and cash | Multiple zero-balance bank/cash/staff accounts, Thomas Cash, internal transfers, history and running balances | Transfers move assets and never become expenses; insufficient funds rejected |
| General Ledger / Trial Balance | Same journal source, deterministic posting order, balanced debits/credits | Receipt/payment voucher PDFs are not implemented; existing invoice/bill/P&L/Balance Sheet PDFs are retained |
| P&L / Balance Sheet / Aging | Consistent selected reporting dates, period revenue/cost/profit versus as-of positions | No unapproved tax policy inferred |
| Project/department reports | Project profitability, project/department expense summaries, Unassigned buckets reconcile | No extra ERP, inventory or payroll module |
| Document entry | PDF/JPEG/PNG upload, original preview, local selectable-PDF text, prepared demo suggestions, editable classification/fields, warnings, history, supplier defaults, Save Draft | Photos/scans are manual while live AI is disabled; saving a draft never posts |
| Explicit reviewed conversion | Separate reviewed-bill or paid-expense action, selected payment account, immutable extraction/original and correction history, duplicate-conversion prevention | Nonzero tax or printed discount remains draft-only; no silent financial adjustment |
| Separate login | Real server-side password verification, private session storage, Secure/HttpOnly/SameSite Strict cookie, origin/CSRF checks and logout revocation | Shared demo identity is not production multi-user authentication |

Hosted independent fictional reconciliation example: revenue **AED20,060**, Cost of Sales **AED8,150**, Gross Profit **AED11,910**, Operating Expenses **AED1,000**, Net Profit **AED10,910**. Assets and liabilities plus equity each **AED66,970**, difference **0**. Thomas Cash **AED50**, second bank **AED20**. Saving a reviewed document leaves all financial metrics unchanged; explicit conversion posts once.

## DeepSeek implementation and actual evaluation status

The existing interchangeable provider adapter uses the official `https://api.deepseek.com` endpoint and `deepseek-flash`, server-side credentials, structured JSON and strict schema/entity validation. Credential presence in Preview configuration was verified; no provider authentication request was made, so key validity is unverified. Selectable PDFs use the existing text reader. Scanned/mixed PDFs render all accepted pages before vision submission, with bounded page count, dimensions and bytes. Provider failures retain the original document and manual review. Incorrect or missing amounts are flagged rather than silently repaired.

The portal and benchmark share a persistent CAS-protected budget object (`ai-evaluation/shared-budget-v1.json`), rather than separate per-session spending allowances. A conservative full-context reservation occurs before a paid request; duplicate document digests cannot be charged again. Valid reported usage is retained even when returned JSON fails validation. Unknown failed-request cost is unknown, never presented as zero. Runtime rejects missing/stale account approval evidence and mismatched key fingerprints.

**The deployed candidate explicitly sets `AZZORA_AI_ENABLED=false` at build and runtime. No paid API calls were made.**

| Actual paid-model measurement | Result |
| --- | --- |
| Prepared corpus | 40 synthetic documents; selectable PDFs and synthetic image/photo-style examples |
| Actual provider requests | **0** |
| Actual spend during this work | **USD0** |
| Average cost per processed document | **Unmeasured** |
| Extraction/classification accuracy, amount errors | **Unmeasured** |
| Provider latency, retries, reliability, correction rate | **Unmeasured** |
| Qwen versus DeepSeek / external OCR recommendation | **No measured comparison; no justified winner or OCR decision yet** |

Provider transport, JSON, scanned/mixed-PDF rendering, accounting mapping, shared spending reservation, concurrency and failure behavior are unit-tested with controlled fixtures/mocked transport. Those results are **not real AI accuracy evidence**. Fresh hosted selectable-text PDF extraction was tested successfully at zero provider cost; that is local PDF parsing, not DeepSeek inference.

### Activation blockers

1. A DeepSeek key was configured as a server-side Preview secret. A key-creation popup unexpectedly appeared during billing-console inspection and exposed the rotated value in tool output. The popup was closed and the owner was notified; a further key rotation and secure Preview-secret replacement are required before activation. No key values are retained in source, report, screenshots or benchmark evidence. Do not inspect the provider key popup again.
2. Observed prepaid balance: **USD0.67**. Manual top-up was visible; the setting inspected was an email balance alert, which is not an enforced spending cap. A dedicated benchmark account, enforced total exposure at most USD5 and disabled automatic top-ups have **not** been independently verified. An account balance alone does not establish the required controls.
3. No approval-evidence JSON has been fabricated to unlock paid calls. After the owner supplies verifiable controls and a fresh secret, configure truthful server-side `AZZORA_AI_APPROVAL_JSON` matching the runtime schema, current tariff, approved fictional-document hashes, reconciled prior spend and key fingerprint. Only then run the approved bounded evaluation and report actual metering/provider billing separately.
4. Real client documents additionally require provider processing-region, privacy/retention and accounting-policy approval. No external model training is configured.

Conservative peak reservation is **USD0.324404/request** for the full 1,048,576-token input envelope plus bounded output. This is a safety reservation, **not observed document cost**. The shared USD5 allowance may intentionally stop a 40-document run early when a conservative reservation no longer fits; do not weaken safeguards to finish a corpus.

## Verification evidence

Application checks, with revision provenance:

- Latest application **188f4ef**: **684/684 unit tests passed across 45 files**; TypeScript, full `src` ESLint and Accounts production build passed. Four added diagnostic tests verify that arbitrary error messages, secrets, paths and unknown codes cannot enter the structured diagnostic output.
- Complete integration checkpoint **50e60d2**: **680/680 unit tests passed across 44 files**; TypeScript and full `src` ESLint passed.
- Accounts-only production build passed. Combined Manager + Accounts production build also passed to an isolated output directory.
- Existing portal fixture tests: **2/2** passed.
- Independent local Accounts: **7/7** workflow groups, **56/56** responsive checks, **32/32** Axe scans with zero findings, **4/4** PDFs rendered/visually inspected; zero browser errors.
- Real hosted handler over local TLS: **51 named groups across four existing suites**, plus **52 route/width checks**. This establishes local handler behavior, separately from Vercel tests.
- Independent actual Vercel Preview: **7/7** workflow groups, **56/56** responsive checks, **32/32** Axe scans with zero findings; **4/4** PDFs rendered/visually inspected and zero browser errors. Login/refresh/logout, session isolation, draft/no-posting and Manager browser-storage sentinel passed.
- Hosted final-preview checks: **4/4** passed, including local/hosted entry JS and CSS byte parity, itemized Tax/Proforma PDF behavior, and a fresh selectable-text PDF parsed by the actual Vercel handler with no financial posting.

The full CRM run reached **33/33 suites passing after corrected reruns**: 30 initially passed; three initial harness failures used the wrong operational-fixture directory or a fixed October scenario without a deterministic October browser clock. Both operational and composed financial/workforce checks passed against the original journey fixture; the timeline UI passed with the fixture clock pinned. The independent critical suite additionally passed **38/38 checks in final mode**, source SHA `50e60d2ca812b7b1077b5edca2740ca3c4c1619b`.

Existing hosted suites also passed Accounts review **14/14**, feedback **9/9**, document entry **21/21**, and final-preview **4/4**. Feedback produced five PDFs/16 pages; final-preview produced two more PDFs/two pages. Every one of those 18 hosted pages was rendered and visually inspected, separately from the four independent PDFs. The first feedback run timed out after five seconds waiting for ledger creation; an unchanged-application rerun with a bounded 30-second hosted assertion timeout passed. A subsequent three-write sample completed in about 1.2–1.6 seconds; it did not reproduce or prove the cause of the original delay.

**Earlier intermittent hosted HTTP503 errors remain unexplained.** Two strict attempts on the 50e60d2 deployment observed HTTP503 during concurrent writes, first for an identical idempotency key and then for distinct keys. Later instrumented acceptance passed **8/8 groups plus 52 route/width checks**, and targeted probes preserved exact committed receipt counts and rejected duplicates. These later passes do not erase the earlier failures.

The latest **188f4ef** Preview adds secret-safe diagnostics, without changing retry/conflict/HTTP-status semantics. It passed:

- The exact original immediate-login concurrency sequence in **5/5 fresh browser processes**, retaining every original request and 200/409 assertion before the responsive loop.
- Additional immediate-login probes in **6/6 fresh sessions, 12 concurrency groups**.
- The same original strict sequence in **2/2 simultaneous isolated client sessions**.
- The full original hosted acceptance suite **8/8 groups plus 52 route/width checks**, while a separate normal UI/PDF workflow ran alongside it.
- Final-preview workflow **4/4 groups**, including actual fresh PDF parsing, itemized document PDFs and local/hosted asset parity.
- Both latest Tax/Proforma PDF pages were rendered and directly visually inspected; fictional-document and pending-VAT labels, item rows and totals were clear.
- No error-level runtime logs during those latest-deployment checks. Its rendered desktop dashboard and mobile banking page were also directly inspected.

No HTTP503 was reproduced in the diagnostic deployment tests. The underlying cause of the earlier failures is therefore **unidentified, not claimed fixed**. No blanket retry, weakened assertion, overwrite, or relabeling of failed tests was introduced. Shared-provider rate pressure was considered as a hypothesis; ordinary overlapping clients did not confirm it. The earlier deployment's trace API returned403, so it did not supply a retrospective cause. Keep the stable alias unchanged while the owner reviews this evidence and the unresolved availability risk.

Root causes corrected during integration: API/PDF reporting dates previously diverged from UI selection; wrappers now carry one validated selection. Same-day financial entries could sort by unrelated IDs; new postings receive monotonically ordered timestamps while immutable earlier entries remain unchanged. Converted reviews are now read-only. Low-contrast muted/login text and non-focusable scroll regions received narrow Accountant-only accessibility corrections. The approved overall visual direction remains intact.

## Screenshots and evidence locations

Selected hosted screenshots and machine results are in `accounts-deepseek-review/` beside this report. The original screenshots/independent report are explicitly tied to 50e60d2; `latest-*.png` and `latest-*.json` identify 188f4ef captures/results. They show actual hosted fictional data, including desktop/mobile document review, correction history, login, banking and reports. They do **not** depict live paid AI extraction.

Complete local working evidence (not uploaded wholesale): `tmp/deepseek-verification/`. Independent report: `independent-hosted/INDEPENDENT-HOSTED-QA-REPORT.md`. Initial failures and corrected results are retained separately. No saved browser authentication state or credential files are part of the handoff.

Quick review: [latest desktop dashboard](accounts-deepseek-review/latest-route-dashboard-1440.png), [latest mobile banking](accounts-deepseek-review/latest-route-banking-390.png), [desktop document review](accounts-deepseek-review/document-review-open-1440.png), [mobile document review](accounts-deepseek-review/document-review-open-390.png), [latest test summary](accounts-deepseek-review/FINAL-VERIFICATION.json). Document-review captures show manual corrections and prepared/local reading with live AI disabled.

Source controls were checked before both Preview uploads: the latest deployment manifest contains 200 source files (2,509,789 bytes), including the API handler and approved stylesheet, excluding environment files, dependency/build directories and private test data. Pattern scanning found no provider keys, recognized tokens or private keys in tracked text, and no server credentials/configuration in client JavaScript. These checks are limited scans, not a guarantee about every historical commit or arbitrary secret format.

## Limitations and next decision

- The latest candidate is available for **owner visual/functional review with AI disabled**. A complete live-AI release is blocked, and replacing the stable client alias is not recommended while the earlier intermittent availability errors remain unexplained. Passing diagnostic reruns are evidence of observed behavior, not an availability guarantee.
- Each hosted login creates an isolated fictional ledger. Refresh persists its session; the hosted session expires after eight hours. New login is not shared real-company persistence. Uploads are limited to 2 MB/file and 6 MB/session, with 100 demo actions/session.
- The document-entry form is intentionally simple and remains a long editable form on mobile. Tables use contained horizontal scrolling. Device checks are browser viewport tests, not physical-device camera certification.
- PDF vision input is limited to five pages/1300px edge/6 MB rendered content. Embedded raster detection is conservative: even a logo may select vision and raise potential cost. Real mobile-camera and unseen Arabic/English provider accuracy remain unverified.
- The production dependency audit reports **five inherited findings: four high and one critical**, involving DOMPurify and the Zod/Vercel Blob dependency chain. No broad upgrade or unrelated refactor was attempted. These require targeted remediation and retesting before production readiness; a passing build is not a clean security audit.
- Production requires individual identities/authorization, shared company persistence, verified financial/tax/posting policies, real-data privacy approval, operational controls and dependency remediation.

The existing stable Accounts deployment remains the rollback option because its alias was never moved. Owner visual acceptance and separate authorization are required before replacing that alias. No production release is requested or implied by this report.
