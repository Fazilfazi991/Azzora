# Hosted fictional security regression — 11 November 2026

Protected Preview source `93ab132b7d6d3a6e13773b71a6c276a7daa6f585`, deployment `dpl_5yGGA6LFUauGbnFeYaAKHfZdwdtq`; project `hkhomrrvxtcxnxvdlkoh` is fictional staging. No production changes, real company records, real money, keys, passwords, sessions or MFA secrets are included in this evidence. Temporary B admission expires 12 November 2026 at 07:43:38 UTC.

## Role, MFA, logout and session boundaries

Four Company B role scenarios passed after one test-harness correction: Owner, Project Manager, Accountant and Site Staff each logged in, obtained their own company session, passed the expected Manager/Accounts workspace status checks, logged out with HTTP 200, and received HTTP 401 when retrying the revoked session. Owner and Accountant completed MFA; Manager and Staff used their configured password session.

| Active workspace | Role | Manager snapshot | Accounts snapshot | Logout | Old session |
| --- | --- | --- | --- | --- | --- |
| Manager | Owner | 200 | 403 | 200 | 401 |
| Manager | Project Manager | 200 | 403 | 200 | 401 |
| Accounts | Accountant | 403 | 200 | 200 | 401 |
| Manager | Site Staff | 200 | 403 | 200 | 401 |

This is 4/4 completed role scenarios, including 2/2 MFA challenges, 8/8 workspace status assertions, and 4/4 local session revocations. An initial test assumed an Owner authenticated into Manager could call the Accounts workspace and failed when the service returned 403; the test was corrected to reflect the workspace-scoped session and rerun. This does not independently verify the Owner's separate Accounts login, global provider revocation, recovery, every command's authorization, or mobile/browser operations.

## Cross-company reads and writes

All 4 B roles loaded their own workspace snapshots with HTTP 200 and were denied access to a known Company A file through `/files` (404). The A attachment through `/accounts/attachment` returned 404 for the B Accountant and 403 for the remaining three roles: 8/8 expected foreign-file/attachment denial assertions. Previous testing separately verified Company A Accountant denial for a known B private attachment and authorized own-company access.

Both fictional Accountant sessions attempted receipt allocation against the other company's invoice. Both requests returned HTTP 400: 2/2 denied mutations, with each company's version, exposed financial metrics and receipt counts unchanged. This test does not cover every write type, every ledger command or a complete direct RLS audit.

## Direct provider exposure

For a B Manager provider token, four access checks were denied as expected: anonymous `staging_auth_grant` 401; authenticated `staging_auth_grant` 403; authenticated `staging_company_read` 403; and private-schema REST query 406. The Storage bucket list returned HTTP 200 with zero visible buckets, which is a successful empty result, not a denial. This is 4/4 expected endpoint denials plus one verified empty list, not proof of complete provider RLS coverage for every identity, table or operation.

No test here establishes production launch readiness, expected behavior after B's expiry, direct URL access for all routes, mobile usability or full report reconciliation. Prior hosted evidence is in `hosted-cross-company-followup-2026-11-11.md` and `URGENT-LAUNCH-VERIFICATION-2026-11-11.md`.
