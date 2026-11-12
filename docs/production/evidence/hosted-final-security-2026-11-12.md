# Final hosted security and responsive checks — 12 November 2026

Tested application SHA: `b778dd75dc34f4b2101f38a66560b55efcafb60f`.
Protected Preview: `https://azzora-shared-staging-qbw0udtk4-faziils-projects.vercel.app`.
Deployment: `dpl_2p7wUjkt9fzufXJHydp9emJ1BzYs`. The coordinator independently confirmed actual function execution in `sin1`; this supersedes the first same-cycle Preview whose function ran in `iad1`.

## API acceptance

**74/74 checks passed; zero failed.** Requests used the exact Preview origin, its deployment-scoped protection cookie, real fictional individual logins and their application sessions. Credentials remained in memory/private ignored fixtures and were not passed as command-line arguments or printed.

- All eight Company A/B Owner, Project Manager, Accountant and Site Staff identities logged in, resolved to their expected company and entered their selected authorized workspace. The opposite workspace endpoint returned 403.
- Owner and Accountant completed existing MFA challenges. Manager and Site Staff followed their approved password sessions. All eight logged out; replay of each same revoked session returned 401. Anonymous session lookup returned 401. This verifies immediate revocation, not natural absolute token expiry.
- The restricted client-review identity signed in and read its authorized finance snapshot. Fourteen direct financial/master-data actions returned 403: ledger creation, cash-account creation, invoice creation/edit/issuance, bill creation/edit/issuance, receipt, supplier payment, expense, transfer, bill-from-review and expense-from-review.
- Its Manager expense-approval request and Owner-backup request each returned 403. Finance snapshot version remained 527 and metrics were identical before/after. There were no financial writes or paid AI requests in this sweep.

This final sweep does not replace the separate allowed-command, cross-company referenced-record, direct provider boundary and isolated RLS evidence. Application-owned hosted metadata correspondence is recorded in `application-security-comparison-2026-11-12.md`; direct client ACL denial is not labeled RLS execution.

## Browser acceptance

Direct Chrome used fresh browser contexts at 1440 and 390 pixels on the exact protected Preview. **14 route visits and four login/refresh/logout flows passed**, with zero page exceptions:

- Accountant at both widths: dashboard, invoices, purchase bills, General Ledger and Balance Sheet; existing MFA, reload persistence and logout/reload-to-login.
- Manager at both widths: dashboard and Accounts; reload persistence and logout/reload-to-login.

An initial Manager-390 logout attempt failed because the test unnecessarily opened the sidebar over the already-visible topbar Logout button. The original result was retained; the harness was corrected to open navigation only when Logout is not visible. Only that affected Manager-390 flow was repeated, passing its two routes and login/refresh/logout check (3/3). No application source was changed to resolve this test error.

Screenshots are retained locally in ignored `azzora-launch-integration/tmp/final-candidate-browser/`. Accountant desktop Dashboard, mobile Balance Sheet, and Manager desktop/mobile Accounts were visually inspected: separate workspaces and fictional/real-posting-disabled labels are visible; the mobile Balance Sheet is readable and balanced; Manager mobile recent-invoice detail uses the labeled horizontal table area. These viewport tests are not physical-device Safari/Android certification.

Sanitized raw results remain in ignored `tmp/final-candidate-security-results.json`, `tmp/final-candidate-browser/initial-results.json` and `tmp/final-candidate-browser/results.json`. The initial `iad1` deployment's result is retained separately and is not represented as the final deployment. No stable alias, production site, real financial record, MFA configuration or AI spending history was changed by this test package. Login/logout produced normal fictional audit/session activity.

## Final allowed-command and referenced-record follow-up

After the coordinator released the financial test window, the same final deployment was exercised with unique fictional fixture suffix `1c8f6b21`. No other writers ran during the sweep.

| Actual command/path | Actor | Result |
| --- | --- | --- |
| Create expense ledger and cash account | Owner, Accountant | Four HTTP 200 results; catalog entries present, metrics unchanged |
| Invoice draft then explicit `issue-invoice` | A Accountant | Both 200; issued amount/open receivable increased exactly one fils |
| Purchase-bill draft then explicit `issue-bill` | B Accountant | Both 200; issued amount/open payable increased exactly one fils |
| Submit project expense | A Site Engineer | 200; no financial metrics changed |
| Self-approve that submission | A Site Engineer | 403 |
| Independently approve that submission | A Project Manager | 200; no financial metrics changed |
| Post the approved source-linked expense | A Accountant | 200; one-fils expense present and bank reduced by one fils |
| Transfer bank to newly created cash account | A Accountant | 200; one transfer present, aggregate bank/cash and net profit unchanged |
| Issue/pay actual foreign B bill | A Accountant | Both 400; both company versions/metrics unchanged |
| Issue/receive against actual foreign A invoice | B Accountant | Both 400; both company versions/metrics unchanged |
| Read own known private original | A and B Accountants | Both 200 |
| Read that original through other company's authenticated endpoint | Opposite Accountant | Both 404; no original bytes returned |

Every returned finance snapshot reconciled its open documents, balanced Trial Balance and Balance Sheet. Final observed company versions were A 542 and B 18. These snapshot assertions are distinct from the coordinator's later direct-database journal/count reconciliation.

The coordinator subsequently executed the actual hosted read-only SQL reconciliation. Each of the four exact fixture IDs had one canonical record (`sales_invoice`, `supplier_bill`, `expense`, `transfer`, respectively), one journal, and equal one-fils debit/credit totals. Four catalog accounts existed and zero journals referenced the catalog-creation IDs. This supplements the snapshot assertions with database evidence; it is not an RLS-policy test.

The first run stopped after 23 passing assertions because its synthetic B bill omitted the required `poReference`. The unchanged domain validator independently reproduced the precise message: `Demo purchase reference is required (up to 140 characters).` This was an invalid fixture, not a bypassed application rule. Before continuing, a fresh hosted snapshot proved B version remained 16 and the rejected bill ID was absent. Only the unexecuted remainder resumed with an explicit fictional purchase reference and a new idempotency key; the already successful catalog/invoice commands were not repeated. The continuation passed 29/29 assertions, including 13 repeated authentication checks for fresh sessions. Original failure/results and all pre-submission plans were retained; no blind financial retry occurred.

Action IDs: A `QA-INV-1c8f6b21`, `QA-EXP-1c8f6b21`, `QA-TRANSFER-1c8f6b21`; B `QA-BILL-1c8f6b21`; A catalog `QA-LEDGER-{Owner|Accountant}-1c8f6b21` and `QA-CASH-{Owner|Accountant}-1c8f6b21`. Each financial fixture amount was one fils with zero VAT. No new receipt/payment allocation is expected for these four invoice/bill/expense/transfer fixtures. Private ignored plans/results are `tmp/initial-candidate-allowed-results.json`, `tmp/initial-candidate-allowed-pending.json`, `tmp/final-candidate-allowed-resume-results.json` and `tmp/final-candidate-allowed-resume-pending.json` in the integration worktree. All test sessions logged out. No real financial records, paid AI, production alias or application source changed.
