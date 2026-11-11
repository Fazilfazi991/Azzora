# Launch verification — 11 November 2026

Decision: **NO-GO for real accounting**. Existing production aliases, GitHub main, real financial posting and real-company records were not changed.

## Source and hosted environment

- Branch: `codex/azzora-production-launch`.
- Automated application tests ran on `f21a989` (the following commit `ffe7a1b19724c28d874595af0999b0e5adad2fbb` adds the fictional test identity helper and its runbook, not application behavior).
- Hosted Preview application: `93ab132b7d6d3a6e13773b71a6c276a7daa6f585`, deployment `dpl_5yGGA6LFUauGbnFeYaAKHfZdwdtq`.
- Staging database `hkhomrrvxtcxnxvdlkoh` contains fictional data. A guarded performance correction was applied directly to this staging database; it is **not recorded in Supabase migration history**. Reconcile migration history before any subsequent migration operation.
- The production database remains untouched. Production migration changes are candidates only, not a completed production migration or approval to activate posting.

## Verification

- On `f21a989`, 103 test files and 1,228 tests passed; TypeScript, ESLint and the production build passed. The build warned about bundle size and third-party comment annotations.
- The hosted financial API suite passed 49/49 checks, including reconciliation, policy restrictions, PDFs, concurrency and idempotency. An earlier quotation command failed with HTTP 503 and PostgreSQL SQLSTATE 57014 after approximately 18 seconds. A targeted optimization and later hosted requests succeeded, but the intermittent timeout root cause remains unproven.
- The direct browser journey passed seven steps through an issued invoice and the Accountant view. Its five-second reload assertion failed at the login screen. Subsequent read-only browser checks showed the invoice in both portals with one AED 10 fictional payment and AED 90 outstanding. This is not a clean pass of the original full browser run.
- Twelve-item document review passed 9/9 hosted checks across five viewport widths using controlled manual extraction fixtures, including a deliberately simulated server error. This is not a paid AI extraction test.
- Four Company B fictional users signed in; Owner and Accountant completed MFA. B snapshots excluded A customers, projects, invoices, receipts, supplier bills and supplier payments. A's 17 custom expense ledgers were absent in B; two common IDs were identical hard-coded defaults. Foreign-project write attempts were rejected in both directions without version changes. Each Accountant was denied a known private attachment belonging to the other company. Reverse invoice/payment isolation, direct provider-level RLS and cross-company report-value reconciliation remain unverified. The temporary B grant expires 12 November 2026 at 07:43:38 UTC; its authorization function ACL and original Company A definition were verified unchanged apart from the temporary branch.
- An encrypted, previously captured fictional staging backup was restored into an isolated in-memory database: 108 records, 20 journals including four reversals, and three original files. Source and restored business hashes matched, as did Trial Balance, Balance Sheet and P&L. This does not prove Auth or infrastructure restoration. A separate scheduled synthetic one-shot also restored successfully, but is not an operational offsite production backup.

## Remaining release blockers

1. Diagnose and resolve the intermittent hosted database timeout; repeat affected hosted workflows and the complete browser regression. Investigate the login/reload wait and run the full browser suite without a failing assertion.
2. Complete remaining hosted two-company reverse financial isolation, direct RLS and report checks, plus full desktop/mobile and role coverage.
3. Establish a scheduled encrypted backup to an approved offsite destination, independent freshness/failure alerts, key custody, retention and recovery objectives. Rehearse recovery including attachments, identity and infrastructure. Supabase Free does not provide the paid plans' daily managed backups.
4. Obtain accountant approval for the decisions in `ACCOUNTANT-APPROVAL-SHEET.md`, reconcile opening balances, and complete controlled import and cutover rehearsal. Do not infer accounting rules or enable real posting.
5. Verify and reconcile staging migration history, final production migrations, isolated production preflight and rollback. Obtain explicit final launch authorization before changing live deployments.

Detailed local evidence is under ignored `tmp/launch-independent-qa/` and is not committed. Do not publish test credentials or private fixtures.
