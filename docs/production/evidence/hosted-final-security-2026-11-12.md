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
