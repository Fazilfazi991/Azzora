# Accounts stable client-link release — 7 November 2026

Owner approved the previously verified bill-review Preview. Only the existing Accounts alias was reassigned; no rebuild, production promotion, environment modification, source change or GitHub push/merge occurred.

- Stable URL: https://azzora-accounts-client-review-faziils-projects.vercel.app/accountant.html
- Approved/current deployment: dpl_GPQuwvkgkn6WCzgAmC8MV3TPqZbK.
- Exact deployed application revision: b300282284363a793eb194d4ef868adc95fa8ff5.
- Rollback retained: dpl_8z1ZPMgRgJDkzpzfYeDazjKZwdFo, https://azzora-accounts-client-review-ngay2ki52-faziils-projects.vercel.app/accountant.html.
- Manager production remains dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp at azzora-seven.vercel.app.
- GitHub main remains fd7754dfe0022f9b64bf875313bd9679cb0144eb.

## Actual stable-host verification

- Nine document-review acceptance groups passed: individual password login, actual private original ingestion, twelve editable fixture rows, DRM keyboard/pointer autocomplete, optional blank/zero/nonzero discounts, discrepancy warnings, successful draft save, refresh/reopen and unchanged financial snapshots.
- Widths 1440, 1024, 768, 430 and 390px passed the form overflow check. Desktop/mobile screenshots were captured and inspected.
- Controlled 503 recovery retained edits; real stale requests returned409; malformed discount/missing confirmation returned422; inaccessible draft and eight financial write commands returned403. These deliberate negative tests passed; no critical acceptance test failed.
- Seven mobile regression groups passed: chooser supports files without forced camera capture; Enter Manually opens a blank form without camera/file chooser; manual draft saves/reopens; financial write restrictions and logout remain intact. Mobile uses browser touch emulation, not a physical phone.
- All thirteen navigation destinations opened: dashboard, sales invoices, purchase bills, receipts, supplier payments, expenses, bank/cash, General Ledger, P&L, Balance Sheet, Trial Balance, aging and project/department reports. Session refresh and mobile menu navigation passed.
- Invoice, P&L and Balance Sheet PDF endpoints returned200 with valid PDF headers and nonempty content.
- Stable hostname opens the Accountant login without Vercel authentication. Private API access returned401 after logout. Use the existing restricted individual client-review credentials; no credentials are included here.
- Financial ledger, statements, balances, allocations, transaction lists and master records were identical before/after document draft operations and read-only navigation.
- AI remains configured/enabled. No new paid provider calls were made: synthetic values exercised the real form and server using explicit manual original ingestion. No new live-AI benchmark is claimed. Shared cap/history were neither reset nor modified; most recent ledger inspection retained30 metered records and a USD5 application cap.
- Real financial posting remains disabled; test writes were fictional document drafts only. No real-company document processing was enabled.

Evidence:

- [Stable document acceptance](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/stable/results.json)
- [Stable mobile acceptance](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/stable-mobile/results.json)
- [Navigation and PDF results](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/stable/navigation-pdf-results.json)
- [Stable login screenshot](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/stable/stable-login-1440.png)
- [Stable mobile dashboard screenshot](C:/Users/USER/Desktop/Projects/Azzora/azzora-ai-client-release-gate/tmp/bill-review-fix/stable/stable-dashboard-390.png)

The prior checkpoint's two baseline browser-test limitations remain documented in BILL-REVIEW-DRAFT-FIX-REPORT.md. This alias-only release does not claim those legacy checks were repaired or rerun successfully.

Result: approved stable alias replacement verified. No rollback was required; the previous immutable deployment remains available. Ready to share as the restricted fictional-data client demo.
