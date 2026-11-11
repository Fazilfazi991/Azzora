# Hosted manual business-backup rehearsal — 11 November 2026

Scope: fictional staging only. Protected Preview `dpl_8TPH976KS8YyRk5ZjphHEuMCKHWU`, source `73569ffcd7c340502e5c3a3eded59117edce452b`, URL `https://azzora-shared-staging-bp71zg2tb-faziils-projects.vercel.app`. Existing Manager and Accounts live aliases and production database were not changed. The deployment is protected; automation used a deployment-scoped protection cookie and the application's individual login and MFA, not a public bypass.

A new separately generated `AZZORA_STAGING_MANUAL_BACKUP_KEY` was set as a **sensitive Preview-only variable** on the dedicated fictional staging Vercel project. The project is not Git-connected, so Vercel refused branch-specific scope; the variable affects **future Preview deployments in this staging project**, not existing deployments or production. No existing variable was overwritten. The random fictional key and downloaded archive were held only in owner/SYSTEM-restricted local temporary folders, never in repository files, arguments or logs.

## Real browser download and isolated restore

- Direct Chrome at 1440 px: fictional Company B Owner signed in with MFA, opened Settings → Backup & Restore, selected Download Backup, received an `AES-256-GCM` encrypted business archive and saw the nearby download-started message. Screenshot, held locally and not committed: `C:/Users/USER/AppData/Local/Temp/azzora-mfa-test-aqqyQ6/fictional-backup-browser.png`.
- The **exact browser-downloaded file**, not a prepared fixture or the separate API test file, was decrypted using the separately stored fictional key, verified and restored to an isolated local PGlite database. The restored dataset had 15 records, 2 parties, 1 project, 4 journals and 1 original attachment at company version 9. Database counts matched the archive; the attachment SHA-256 matched; the trial balance, profit and loss and balance sheet matched the source, and journals balanced. Test: 1 passed, 8 unrelated imported fixture tests skipped.
- Independently, a direct authenticated API request returned an encrypted 33,770-byte fictional archive and that file was also restored and checked locally. This is not evidence that a real company has a verified backup.

## Critical limits

This is a **business-data export**, not complete disaster recovery. It does not contain PostgreSQL schema, migration history, Supabase Auth accounts, MFA factors or active sessions. The isolated restore uses locally installed migrations and replaces journal/snapshot actor IDs with a fictional local fixture identity; original actor identity and access/membership recovery were not restored or verified. The interface intentionally states that the last verified backup is unavailable; starting a download is not proof that a user kept or restored it. The test does not establish cross-service snapshot consistency under concurrent writes or real-company recovery.

Full backup/recovery acceptance, production key custody, accountant policies and hosted timeout/security gates remain open. No automated backup, scheduled monitor, real financial posting or real-company data import was enabled.
