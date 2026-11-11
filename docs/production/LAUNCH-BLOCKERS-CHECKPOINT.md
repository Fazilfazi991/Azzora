# Launch blockers checkpoint

Application revision `c04563c`; protected fictional Preview `dpl_Fcmz8La7HEg2oFcTsJ5rdFnuWici`. No existing live alias or GitHub main was changed. No production migration, real company import, posting or onboarding occurred.

## Fixes and checks

- An actual hosted Manager project creation failed with 403 because the wizard chose the first active person (an engineer), while the backend correctly requires a Project Manager to assign themselves. The wizard now defaults to and locks the signed-in Project Manager in both steps; Owner and browser-local behavior stay unchanged. The labelled field remains accessible. The corrected Preview passed direct Chrome project creation and refresh at desktop and 390px.
- Direct hosted Chrome with Vercel-issued automation bypass (no request proxy) passed a fictional Manager customer, project and quotation draft, and Accountant invoice/receipt. An issued AED 200 invoice showed AED 150 after an AED 50 receipt and refresh. A test initially expected the wrong success-message wording; the issued state and balance were independently verified. Earlier direct browser route smoke covered 19 Manager and 13 Accountant routes at desktop and mobile on the prior Preview, not complete transaction regression.
- Actual production migrations in an isolated synthetic database deny foreign-company access and references and reject expired/revoked sessions. Hosted two-company access remains unverified because the authorized staging auth contract explicitly pins one fictional company; changing that boundary has not been authorized or deployed.
- Import review detects customer/supplier namespace collisions, wrong party types and blank issued numbers. An offline historical-original check compares supplied bytes and names with reviewed hashes. It does not authorize publication, prove backup, or copy anything into production; packages remain quarantined.
- An offline encrypted production-business-backup check verifies integrity, scope and an explicitly selected maximum age. It does not configure a schedule, offsite storage, alerts, recovery keys or infrastructure/Auth restoration. A synthetic isolated restore has been reconciled separately.

The integrated source passed 1,203 unit tests in 97 files, TypeScript and ESLint. Its Vercel Preview build passed. Tests use fictional data only. Relevant synthetic evidence is retained under ignored `tmp/launch-independent-qa/`; no credentials or private sessions are committed.

## Real launch remains blocked

Production is **NO-GO**: actual offsite backup scheduling, alerting, key custody, retention, RPO/RTO and an infrastructure/Auth/Storage recovery drill are not established; real accounting policies, legal invoices, opening balances and accountant-approved cutover are unresolved; production import publication and the policy-dependent real posting path are not enabled; full hosted workflow and hosted cross-company acceptance remain incomplete. Free-tier availability and privacy limitations must be understood by the owner before permanent daily use. No synthetic test is approval for real finance or real document processing.

See `ACCOUNTING-DECISIONS.md`, `MIGRATION-RECOVERY.md`, `BACKUP-CUTOVER-RUNBOOK.md`, and `FINAL-HOSTED-READINESS.md` for the decision sheet, controlled migration, rollback and earlier test evidence.
