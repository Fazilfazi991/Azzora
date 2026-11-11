# Accounts production readiness checkpoint

## Environment

- The owner-created production Supabase project is `zwjiztnsxenluqybxhhz`, in Singapore (`ap-southeast-1`), on the free plan. It is separate from fictional staging `hkhomrrvxtcxnxvdlkoh`.
- Vercel configuration targets Singapore (`sin1`). A separate protected shared-staging project was prepared; it is not the current Manager or Accounts live project.
- The production database was observed healthy and empty. No production migrations, company records, user invitations, financial postings, or data imports were applied at this checkpoint.

## Implementation and limits

The candidate uses the existing shared commands and finance engine, with a separate production identity and empty initialization. Financial writes, legal tax invoices, and external processing of real documents remain blocked pending the required policy and operating approvals. The import workbench preserves source data and queues reviewed packages; it does not publish real company records. Encrypted backup and isolated restoration are implemented, but Auth/infrastructure backup, retention, key custody, monitoring, and a production recovery drill are still required. See `ACCOUNTING-DECISIONS.md`, `BACKEND-RUNTIME-READINESS.md`, and `MIGRATION-RECOVERY.md`.

The Accounts review draft comparison was corrected to ignore object-key ordering without changing field values. New unsaved task drafts now start on a working day, without modifying approved task dates. A weekend browser run progressed through proposal approval but failed later in task completion; the full weekend workflow is not verified.

## Verification status

At application commit `6d533bb`, 1,185 automated tests in 93 files passed, TypeScript and ESLint passed, and the Vite production build completed. The existing synthetic local browser runs passed 136 operational checks and 21 document-entry checks before the final backend additions. The production-format recovery check initially failed on Windows line endings; SQL-source hash normalization was added and the focused recovery/import rerun passed 13 tests. These counts are checkpoint results, not a claim that the final hosted production system has passed acceptance.

The separate protected shared-staging Preview `dpl_Hk6FTx3kLtz4ZpL4CPN9vr6As5DL` was packaged from `6d533bb`, with the staging Vercel configuration in its deployment package. Its staging build preflight passed and functions report Singapore `sin1`. Unauthenticated access redirects to Vercel authentication. A protected session request returned HTTP 400 at the transport stage, so hosted login and shared workflows remain unverified. A CLI-only deployment does not establish the expected protected branch origin; this needs investigation without weakening the origin check.

Vercel automatically classified the first deployment of the new staging project as production, even though no production deployment flag was used. Earlier deployments also used the wrong build command because the repository's default Vercel configuration was packaged. They were isolated to the new SSO-protected staging project, with no production-company credentials configured, and did not target the existing Manager or Accounts projects. Subsequent deployment packaging included the staging configuration and passed its preflight. No earlier deployment is considered an acceptance build.

The full combined suite, hosted role isolation, real email recovery/invitations, hosted cross-portal workflows, and live backup operations require final verification on a frozen revision. No real company data or paid AI is needed for those tests.

## Decision

**NO-GO for real accounting and production cutover.** Accounting policies and opening balances remain deferred by the owner, legal invoice and other policy-dependent features remain incomplete, production recovery operations and hosted security/workflow acceptance have not been verified, and financial posting is disabled. The owner and accountant must approve the documented policies and a reconciled migration plan before any final request to enable real posting and switch live traffic.
