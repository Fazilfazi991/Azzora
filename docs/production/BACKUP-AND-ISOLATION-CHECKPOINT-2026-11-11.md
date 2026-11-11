# Backup and isolation checkpoint — 11 November 2026

Production decision: **NO-GO**. Automatic backups and alerts are not configured. No live deployment, production database, real records, posting or AI processing was changed.

The approved private Drive folder received a fictional encrypted archive. Downloaded bytes matched SHA-256 `45f365d365eb82e951b3114b99e875f9157dd113d6c5ecff8bdecb9662952cf2`; an isolated restore recovered 8 records, 2 journals and 1 attachment with matching source/restored hashes, Trial Balance, Balance Sheet and P&L. This was a manual test, not an automated production backup or Auth/infrastructure restore. No alert email was sent.

An unexposed backup capture candidate and isolated, test-only SQL authority now exercise scoped grants, database-clock expiry, revocation, duplicate-run reservation, and audit. They are not a production migration, route, deployed identity, scheduler or Drive/Gmail integration. The credential digest is bearer-equivalent and must not be logged. Independent security review, protected immutable audit, owner MFA grant management, scoped snapshots and originals, OAuth, secret custody, scheduling, independent monitoring, alert delivery and an end-to-end hosted recovery drill remain necessary.

Hosted fictional cross-company follow-up verified that both Accountants' attempts to allocate receipts to the other company's invoice returned HTTP 400 with versions, financial metrics and receipt counts unchanged. The Company A Accountant could not see Company B's new invoice or receipt, and B's fictional reports reconciled. Direct provider endpoint checks covered only the stated identities and routes, not all RLS policies or roles. See `evidence/hosted-cross-company-followup-2026-11-11.md`.

An additional hosted fictional quotation save succeeded once in 5.48 seconds. Earlier PostgreSQL 57014 timeouts remain unexplained; the new success does not establish a fix. No production timeout or transactional guarantees are inferred.

Integrated source application and tests at `b7f8d8b`: 105 test files / 1,239 tests passed; TypeScript, ESLint and Vite production build passed. The first concurrently loaded run had 1 timeout among 1,239 tests; the disk-backed restart test alone was given a 30-second harness timeout without weakening assertions, reproduced and passed under load, and the full suite was rerun successfully. This is not a hosted acceptance result for the new prototype.

Accountant policy decisions, opening balances, complete hosted security/browser regression, approved cutover and production rollback remain open. See `ACCOUNTANT-APPROVAL-SHEET.md`, `BACKUP-CUTOVER-RUNBOOK.md` and `URGENT-LAUNCH-VERIFICATION-2026-11-11.md`.
