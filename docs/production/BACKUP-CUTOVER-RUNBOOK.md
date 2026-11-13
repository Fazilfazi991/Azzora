# Backup, restore and cutover runbook

## Current production setup release — 13 November 2026

This section supersedes historical preparation below. **Company setup is authorized;
financial cutover is not.** Stay on Supabase Free, retain manual encrypted local
downloads, keep Manager and Accountant workspaces separate, and install no backup
scheduler or Google Drive integration. No historical financial import is required:
the client will enter customers, suppliers, opening balances and outstanding
documents manually. Missing opening figures are not zero balances.

The dedicated production setup project is Vercel `azzora-accounts-live`,
`prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV`. The final setup application is
`5f562ea3855167e297d5731634aa83927f606af1`, READY deployment
`dpl_2hNnNG1p3U47cDSFu37JfsAiohML`, immutable hostname
`azzora-accounts-live-dmix49t52-faziils-projects.vercel.app`. All **263/263**
uploaded source-file SHA-1 values match the reviewed production package; the full
source and tests remain preserved separately. The exact deployment now owns
`https://azzoracrm.vercel.app` (Manager `/`, Accountant `/accountant.html`), with
the original `https://azzora-accounts-live.vercel.app` retained. The new hostname
serves the individual login with HTTP 200 and no Vercel authentication gate;
unauthenticated private API requests return 401. API execution is verified in
`sin1`. **Authenticated human acceptance on the new hostname remains pending**;
do not equate its reachable login page with a completed individual sign-in.
It uses only production Supabase `zwjiztnsxenluqybxhhz`,
Singapore `ap-southeast-1`, company `fc525d78-bc83-4845-96f1-fb402bb07465`.
The empty General Ledger render defect was corrected in the final application.
Local fresh-empty-company acceptance covered GL, P&L, Balance Sheet, Trial
Balance, aging and project reports (eight focused UI checks, no page errors).
The actual hosted Accountant GL correction passed on the retained original
hostname using its persisted session; logout also passed. No financial logic or
Auth change was made for that render fix. Preserve earlier setup deployment
`dpl_HF3uAsoNiR69SvwpGb1NBSAx3zbX` / application
`b473ef53b9faa6e4d49b0671de7b3ea7b3ce7b73` as historical release/rollback
evidence, not the final source. Existing Manager production
`dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`, Accounts client demo
`dpl_6KcWcAZE5fud4sruG2HUGML3bcd1`, and GitHub main
`fd7754dfe0022f9b64bf875313bd9679cb0144eb` remain unchanged.

Exactly two initial production identities are approved:

| Account | Supabase Auth user ID | Current access evidence |
| --- | --- | --- |
| Owner `info@azzora.ae` | `86d914dd-1f39-4860-87d0-b671dd39eb00` | Actual password sign-in, empty-workspace initialization, refresh and logout verified on the original production setup hostname. New-hostname authenticated acceptance pending. |
| Accountant `accounts@azzora.ae` | `c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3` | Actual individual password login without MFA verified on the original production setup hostname. Opening setup notes saved with blank date and no balance rows, retained after refresh; setup PDF download and 390 px navigation passed. Hosted GL correction and logout passed. New-hostname authenticated acceptance pending. |

The owner subsequently approved email/password-only access for these exact two
identities. Their actual assurance remains **AAL1**, not MFA. No password or
authentication secret belongs in source, chat, backup or this runbook. Manual
Owner backup requires fresh password sign-in within 15 minutes. Do not use the
fictional staging password-only exception as a production grant or invite other
users without approved membership and access scope.

Preserve all five reviewed SQL files together: the three-file baseline in
`supabase/production-migrations/manifest.json` and the two company/password-policy
files in `supabase/production-migrations/initial-setup-manifest.json`. Retain their
recorded hashes, applied migration/configuration evidence, matching application
source and production-only environment/key references. Never run fictional
staging fixtures or local recovery-control migrations against production.
The separately reviewed and applied sixth migration is
`supabase/production-migrations/20261113174923_production_crm_hostname.sql`, with
its exact scope/hash recorded in
`supabase/production-migrations/production-hostname-manifest.json`. It authorizes
the new CRM hostname while retaining the original hostname. Its configuration
approval is `owner-production-hostname-20261113` and both exact HTTPS origins are
authorized. It changes no
memberships, posting/AI flags or financial records. Keep this later configuration
change distinct from the five-migration backup restore point below.

The actual Owner encrypted business archive was downloaded and hashed:
`8591939a4e44bb80e259b37b4c3a70b4da50d256887622eac8d88885913196b9`.
The capture contains **3 business records, 0 journals, 4 audit events, 2 memberships
and 0 originals**. This is the observed initial setup snapshot, not evidence that
the company has zero financial balances. The business-v2 archive must be paired
with its matching source/schema/migration package and separately held recovery
key. The archive's embedded application revision is
`e89d6bc50f4769312c3dac81d2c0fc51e27cb55d`; the hosted candidate at recovery was
`b473ef53b9faa6e4d49b0671de7b3ea7b3ce7b73`, with the retained UI-only source
continuity evidence. Preserve these precise attributions rather than relabeling
the older archive as a final-deployment capture. It contains no passwords,
sessions or MFA secrets. The **actual downloaded
archive plus matching five reviewed migrations/source** passed **49/49 isolated
application-recovery checks**, recorded in
`evidence/owner-downloaded-production-recovery-2026-11-13.json`: exact business,
journal and audit attribution; memberships; supported local Auth user recreation
with original UUIDs and fresh credentials; actual approved AAL1 login; Owner and
Accountant workspace restrictions; provider access denials; and exact Trial
Balance, Balance Sheet and P&L reconciliation. The isolated original-file
inventory is empty because the downloaded archive contains zero originals; no
attachment bytes or financial transactions were invented. This proves the
application recovery workflow for that captured inventory, not a hosted cloud
clone, restoration of original credentials, or recovery of files/financial
transactions absent from the archive. Downloading alone does not prove recovery.

The coordinator's final read-only production check confirms **3 business records,
0 journals, 2 memberships, 2 Auth users and 1 hostname-approval event**. The saved
opening setup notes update existing metadata rather than adding a financial
record. Real posting and real AI flags remain false. These current counts are
distinct from the earlier archive capture and do not approve zero company balances.

Real financial posting, legal invoice issuance and external AI processing remain
disabled. Manual setup/opening drafts do not create journals or approve balances.
Before financial cutover, obtain Owner/accountant decisions for VAT/TRN, legal
invoice rules, posting and expense authority, advances, revenue, project costs,
the complete reconciled opening trial balance and outstanding documents, and the
effective cutover date. Then obtain explicit cutover authorization, capture and
verify the required manual backup, apply only approved records/rules, reconcile,
and verify actual individual access and shared records without inserting
synthetic transactions into the real ledger. Stop further writes on failed
acceptance; an application rollback does not undo committed financial records.
Do not blindly restore a database over newer transactions.

Retain the distinction between hosted checks, isolated mid-transaction rollback
tests and simulated lost-response tests. The original intermittent 503 cause
remains **unknown**; verified transaction safeguards do not establish its cause
or claim that it was fixed.

## Previously frozen candidate and cutover preparation — 12 November 2026

Application `720240abd8c5adbb66d32357cb1d779cada1fb06` and evidence
`60e73ea88f3663768d9bdacd4d1c9fef060450e0` are frozen. The matching recovery
package and final downloaded archive are identified by
`evidence/final-recovery-provenance-720240a-2026-11-12.json`. Preserve those
artifacts and their hashes; documentation preparation does not change the tested
application. The current owner decisions supersede the historical scheduling,
Google Drive, upgrade and incomplete-recovery proposals below: **Supabase Free,
manual encrypted local downloads only, no scheduler or Google Drive integration.**

The verified hosted target is fictional staging only: Vercel project
`prj_qmXTiKoqwMc2mgJ6QSkYDLrYEoch`, deployment
`dpl_2Tf7fBxtVai2X6Wtb9eF3TadS9Qf`, Supabase `hkhomrrvxtcxnxvdlkoh`, with
Manager at `/` and Accounts at `/accountant.html`. Its staging configuration pins
`api/staging.ts` explicitly to `sin1`, uses the Preview environment and protection,
and sets non-secret `AZZORA_RELEASE_SHA` to the frozen application SHA. Production
must not reuse staging credentials or the temporary fictional identity mappings.

The intended production database remains `zwjiztnsxenluqybxhhz`, Singapore
`ap-southeast-1`, as pinned in `supabase/production-migrations/manifest.json` and
the production build/runtime guards. The Manager and Accounts workspaces remain
separate. Exact production Vercel project/origin assignments, the real company
identity and named user/role mapping are not supplied by the financial approval
sheet and remain awaiting owner confirmation. Existing Manager production and
Accounts client-demo aliases must remain unchanged before cutover authorization.
The existing production-candidate configuration deliberately targets a protected
Preview with posting disabled; it is not authorization to promote or enable posting.

Prepared execution gates, **not executed**:

1. Obtain the existing accountant sheet's signed decisions, reconciled openings,
   outstanding-document inventory, migration scope and effective cutover date;
   then obtain separate explicit cutover authorization. Unknown balances are not zero.
2. Reconfirm exact source, target project/company, separate application projects,
   allowed origins, individual user mapping, MFA and production-only secret/key
   references. Confirm effective function execution in Singapore.
3. Verify every production-manifest file hash and migration ledger. Exclude all
   fictional staging/recovery-control migrations and fixture data. Preserve
   approved source/mapping/import hashes, original documents and historical actors.
4. Stop competing writes at the agreed freeze point; capture current deployment,
   alias and database state. Download and verify the Owner-only encrypted manual
   backup, retain its matching recovery package and keep its key separately.
5. Apply only the reviewed, authorized migration/import; reconcile opening
   debits/credits, bank/cash/petty cash by account, AR/AP by original document,
   journals, reports and original-file hashes. Do not infer company balances from
   an empty database, and do not insert synthetic financial transactions.
6. Release only the approved production-intended configuration; verify actual
   users/permissions, shared Manager–Accounts records, approved financial flows,
   reports and backup download. Enable real posting only for the approved scope.
7. If acceptance fails, stop further writes and preserve evidence. An application
   rollback does not undo committed financial transactions: reconcile first and
   follow the existing authorized recovery/compensating-entry procedure, never a
   blind database overwrite or non-idempotent retry.

Evidence remains separated: hosted checks, isolated mid-transaction rollback,
and simulated lost-response tests. The original intermittent 503 cause is
**unknown**; retained diagnostics and verified transaction safeguards are not a
claim that its cause was fixed. No new technical investigation is initiated here.

## Historical preparation and evidence

Status: **not operational; launch blocked**. This runbook prepares the work without authorizing real-company imports, postings, user invitations, cloud restoration or traffic changes. Production project `zwjiztnsxenluqybxhhz` is separate from fictional staging `hkhomrrvxtcxnxvdlkoh`. Confirm the exact project, region and account again before every operation; do not infer a target from the active CLI link.

## Manual business export candidate

Settings → Backup & Restore requests an encrypted business archive only for an Owner/Admin with a currently verified TOTP within 15 minutes. An expired/missing provider MFA timestamp is rejected; sign out and sign in with the authenticator again. The production archive uses the separately configured owner-managed backup key. Fictional staging requires a distinct `AZZORA_STAGING_MANUAL_BACKUP_KEY` (canonical base64url 32 bytes), never the production, session or service key. A missing key fails closed. Keep each key securely separate from its downloaded archive and never commit it.

The download contains application business records, journals and referenced originals with checksums, but **does not include PostgreSQL schema/migration history or Supabase Auth/MFA factors**. It is not a complete disaster-recovery backup and does not by itself establish account restoration. The browser can confirm only that a download was started, not that the file reached disk or was successfully restored; it must not report this as a verified backup. To rehearse recovery, use the existing `scripts/launch-import-recovery.mjs` decrypt and restore-rehearsal commands in an isolated environment using the correct separately held key and company/key identity. Compare archive counts, journal totals and original hashes before relying on it. Reprovisioning identities and restoring schema/migrations require a separately approved, independently tested recovery process.

## What the selected free plan provides

On 11 November 2026, [Supabase's backup guidance](https://supabase.com/docs/guides/platform/backups) states that automatic daily backups are provided on Pro, Team and Enterprise and recommends off-site CLI exports for Free. Its [Free-plan answer](https://supabase.com/kb/faqs/platform/free-plan-backups) says Free has no automatic database backup and PITR is a paid-plan add-on. The project was previously observed on Free with no dashboard backups. Recheck actual plan and dashboard before launch; do not claim managed backups, offsite copies, PITR or disaster recovery exist.

A database backup does **not** contain Storage object bytes. The [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump) states a default dump is schema-only and excludes managed schemas such as Auth and Storage, plus custom roles; data and roles need deliberate separately reviewed handling. Supabase CLI v3 defaults to the local database and changed hosted targeting; inspect the installed CLI help and target before any use. Do not treat a schema dump or the AZZORA business archive as a complete infrastructure, Auth, access-control or object backup.

## Before the first real transaction

The owner selected Google Drive account `fazil4fazi@gmail.com` as the separate encrypted backup destination and the same address for failure alerts. The folder [AZZORA Accounts Encrypted Backups](https://drive.google.com/drive/folders/1KovOXn8MzI6wuBS5fJq-seUIFjsddcMd) was created and its owner-only sharing verified on 11 November 2026. It is not an operational backup or notification system.

On 11 November 2026 an explicitly named **synthetic test only** encrypted archive was uploaded manually to that private folder. The downloaded bytes matched the original SHA-256 (`45f365d365eb82e951b3114b99e875f9157dd113d6c5ecff8bdecb9662952cf2`). Using its disposable test key, an isolated restore reproduced 8 records, 2 journals and 1 original; restored and source business hashes and financial reports matched. No real records or cloud database were involved. The test file remains in the folder. This manual test did not exercise an unattended scheduler, continuous backup, Auth/infrastructure recovery or alert delivery. Gmail connector identity matched the selected account, but no message was sent and no delivery mechanism was configured.

The owner selected a daily backup time of **2:00 AM India Standard Time**, equivalent to **12:30 AM Dubai time** and **20:30 UTC on the previous calendar day**. This is a scheduling preference only: no scheduled job is installed or active.

Record the operator and independent restore reviewer, escalation, retention and deletion rules, capacity, RPO/RTO, and drill frequency. Those details remain undecided and unverified; daily encrypted capture and an isolated restore before launch are proposals, not approved guarantees. Account for the free plan's limits and inactivity behavior. No scheduled job, monitoring alert, or retention policy is currently established.

Provision a separate independently generated 32-byte owner-managed backup key and key ID using a secret manager or equivalent protected process; do not reuse the database, Supabase service, session or AI keys. Store recoverable key material separately from encrypted files, restrict access, record rotation and recovery custodians, and test key recovery. Losing the key prevents decryption. Never commit or print credentials, backup plaintext, source documents or keys.

The candidate backend requires current Owner/Admin MFA (AAL2), `access.manage` and exact company scope for its `GET /api/staging/manager/backup` route, which the candidate Vercel configuration rewrites to the separate production handler; an independently configured backup key is mandatory. The endpoint returns an AES-256-GCM encrypted business archive, not a complete platform backup. Its production configuration is not deployed or tested against the production project. Obtain the encrypted file through a protected, authenticated session, confirm format, company/key ID, timestamp, successful decrypt and expected counts, then place it in the approved private offsite destination and verify an independent copy. Treat proof files and their aggregate financial totals as confidential. Do not write a plaintext export to a public folder or source control.

The current endpoint requires a live human Owner/Admin MFA session; the offline monitor does not generate or fetch backups. A persistent unattended job therefore also requires a separately reviewed, least-privilege backup service identity and narrowly scoped, revocable capture mechanism, with audit and independent monitoring. Do not store a reusable human MFA session or bypass the existing authorization check. No such unattended production capture is implemented or enabled.

An offline, unexposed `unattended-backup.ts` candidate exercises a single-company, backup-only grant and prevents release until audit finalization rechecks authorization. A separate **isolated test-only SQL authority**, not a migration, now demonstrates transactionally reserved unique runs, database-clock expiry, revocation checks, role restrictions and audit insertion using fictional data. It has never been applied to hosted staging or production and is not connected to any route. Actual deployment still requires independent security review; owner-MFA grant provisioning/revocation; audited storage protection and alerting on missing runs; access to verified consistent snapshots and private originals; rate limits; and a least-privilege scheduler identity. No production service identity or API endpoint exists yet. Existing Owner MFA authorization remains unchanged.

The interactive Drive/Gmail connector cannot be assumed to supply a token to an unattended process. A real scheduler requires separately authorized noninteractive credentials, secret rotation and revocation, access restricted to the approved Drive destination, and an independent notification mechanism addressed to the approved recipient. Drive and Gmail access do not establish that the endpoint can autonomously capture an archive, nor that missing scheduler runs are detected. Do not enable a schedule until those end-to-end controls and restoration from a scheduled offsite copy have been verified with fictional data.

Google's [Shared Drive guidance](https://developers.google.com/workspace/drive/api/guides/about-shareddrives) says service accounts cannot own files and must use a shared drive or OAuth on a human user's behalf. This is a personal My Drive folder, so a separately approved Google OAuth client, offline consent and securely managed refresh credential are needed; do not copy an interactive connector token. The narrowed `drive.file` scope can require the folder to be explicitly selected/authorized for that OAuth application; an existing folder created by a different application is not automatically visible to every `drive.file` client. The appropriate consent flow, scope, secret manager and durable hosting must be selected and tested. Independent watchdog hosting is still unspecified.

An **unwired and undeployed candidate** combines the existing encrypted business-capture verifier with Google resumable upload, owner/private-folder checks, bounded independent download, SHA-256 comparison and a second authenticated archive/manifest verification. It rechecks file ownership, private sharing and exact parent plus the folder's privacy following upload. It deliberately refuses envelopes larger than 180 MiB and does not automatically retry ambiguous uploads. A separate watchdog candidate checks signed freshness and a typed, signed restore proof binding company, key ID, file, digest, capture and restore times. The restore-proof key and trusted expected file/digest must be independently protected; signing a statement is not evidence that a real restore occurred. A genuinely independent restore verifier still needs to be built and hosted. Gmail acceptance is explicitly not delivery confirmation. Mocked-provider tests do not prove OAuth scope, privacy, network delivery, actual scheduling, restoration of schema/Auth/infrastructure or alert delivery. The separate watchdog must be hosted and monitored independently of the backup scheduler; all live security and failure behavior requires review and fictional hosted testing before enabling it.

The offline helper now supports a fail-closed health check for one already captured encrypted production business archive:

```powershell
node scripts/launch-import-recovery.mjs verify-production-backup --input <private-encrypted-archive.json> --key-file <owner-managed-key-file> --company <company-uuid> --key-id <key-id> --max-age-seconds <approved-positive-age-limit>
```

The operator must choose the age limit; no RPO is implied or configured. The command authenticates/decrypts the archive, verifies its production format, company/key scope, original-file and canonical manifest, inner/outer capture time, and freshness against the local system clock. It returns JSON and exit code 0 only when those checks pass; a missing, invalid, future-dated, tampered or stale archive returns a nonzero exit. Keep the clock synchronized and treat process/OS access to the key and encrypted file as privileged. This helper does not fetch or create a backup, check any offsite location, install a schedule, send a notification, verify Auth/infrastructure recovery or prove disaster recovery. A separately authorized operator must securely wire and test those services and alert on failures or absence; a scheduler that simply never runs is not detected by this command alone.

For a future operator-configured scheduler and a separately scheduled watchdog, the same offline tool can write and check a signed status receipt. Both require an owner-selected absolute status path in an already existing private directory, independently protected access to the same owner key, and explicitly approved backup and monitor age limits:

```powershell
node scripts/launch-import-recovery.mjs monitor-production-backup --input <private-encrypted-archive.json> --key-file <owner-key-file> --company <company-uuid> --key-id <key-id> --max-age-seconds <approved-backup-age> --status-file <absolute-private-status.json>
node scripts/launch-import-recovery.mjs watch-backup-monitor --key-file <owner-key-file> --company <company-uuid> --key-id <key-id> --max-age-seconds <approved-backup-age> --max-monitor-age-seconds <approved-monitor-age> --status-file <absolute-private-status.json>
```

The monitor verifies the archive, then atomically writes a signed pass or fail receipt; it returns nonzero on a failed check. The watchdog rejects absent, tampered, failed, future or stale receipts and checks that the recorded backup has not aged past the approved limit. Its nonzero exit can be connected to an independently managed alerting system. It does not itself send an alert, fetch the backup, prove that offsite storage remains accessible, or verify Auth/infrastructure restoration. Both commands must be separately scheduled and their exit codes and missing invocations independently monitored; a watchdog on the same powered-off computer cannot alert about that outage. Set and test OS file ACLs—the file mode alone is not a Windows ACL. A stranded `.lock` after interruption deliberately prevents a new monitor write; investigate the running job before an authorized operator removes that lock. No scheduler, notification recipient or production status destination is installed or selected by this code.

Separately establish and test the recovery of database schema and data, custom grants/RLS/RPCs, private object bytes and metadata, Auth identities/MFA recovery, environment secrets, DNS and runtime configuration. Revoke overly broad default privileges and validate deny-by-default policies on an isolated target before connecting any users. Do not infer that a copied database dump or business archive can restore these services. Log each capture's source project, company, version, file checksum, manifest, locations, permissions, operator and time without credentials.

`prepareIdentityRecoveryReview` is an offline, review-only planning helper. It accepts a separately obtained count and digest for historical members and a noncredential inventory of journal actor UUIDs, snapshot actor UUIDs and audit-event UUID references/content hashes. It flags missing actors, duplicate mappings and inconsistent inventory counts; original historical actor IDs stay distinct from proposed replacement sign-in IDs. It rejects unexpected password/MFA/session fields and applies no grants, creates no users and performs no restore. The separate v2 capture candidate is documented in `AUTHORITATIVE-BACKUP-CANDIDATE.md`; it has not been deployed or verified against production, and an exact historical-actor foreign-key strategy for a real target remains a launch blocker. A historical-user list must include former/deactivated actors as well as active members.

An isolated PGlite rehearsal can additionally accept an explicit **fictional-only** provenance fixture. Its tests exercise exact original journal and snapshot actors and audit events with inactive, unconfirmed placeholder identities and no memberships. This demonstrates only a possible preservation technique when provenance is separately supplied; the existing production archive and API do not capture that provenance, this path cannot target a cloud database, and it does not recover live Auth users or permissions.

After an independently reviewed and approved target exists, recreate only specifically authorized staff identities using the provider's approved flow, with fresh credentials and MFA enrollment. New sign-in IDs must be mapped separately without overwriting immutable historical actor IDs or attributing all actions to a new administrator. Inactive users stay inactive; privilege grants require separate current owner approval, a verified role matrix and backend/RLS tests. Never import passwords, password hashes, MFA recovery material, TOTP secrets, provider sessions, cookies, tokens or service credentials through browser archives, and do not restore sessions. The proposed UUID map is a review artifact, not authorization or proof of a successful Auth restore.

## Restore rehearsal and incident procedure

1. On a scheduled drill, choose an isolated nonproduction target and explicitly verify it cannot reach the production project or live domains. Restrict access and use synthetic data for initial validation.
2. Recover the independently managed key; validate archive scope, tag and hashes. Run `node scripts/launch-import-recovery.mjs restore-rehearsal --input <encrypted-archive> --output <private-proof.json> --key-file <owner-key-file> --company <company-uuid> --key-id <key-id>`. The command uses an in-memory database only; it does not write a Supabase project. Never provide real credentials as command arguments or run it against live data without authorization.
3. Verify records, journal counts, original file count and business hashes match. Compare the restored and source Trial Balance, Balance Sheet and Profit & Loss, including amounts and rows—not merely whether reports balance. Check issued document history and authorized private originals. Proof output now contains financial totals and must remain private. **Legacy v1 business archives omit SQL `journals.actor_id`, `snapshots.captured_by` and `audit_events`; their rehearsal substitutes an offline fixture owner and does not preserve historical audit identities.** Matching v1 business hashes do not prove audit identity or audit-event retention. V2 is a local, unapproved candidate, not a verified production backup.
4. Record start/end, source capture time and elapsed time, operator, reviewer, results, residual data gap and any failed attachment or identity recovery. Compare with the separately approved RPO/RTO. A successful isolated business restore alone does not verify cloud infrastructure, Auth, Storage, operational monitoring or an RPO/RTO.
5. For a real incident, stop real financial writes, preserve evidence and the last known safe deployment and backup, notify the owner, and establish an isolated recovery target. Restore production or switch traffic only under the owner's explicit incident/cutover authorization, after verified reconciliation and a rollback plan. Do not automatically overwrite the source database.

## Migration and rollback checklist

1. Inventory each approved real source and retain its original bytes, document numbers, attachment hashes and export timestamps in the approved secure location. No actual real data has been imported or approved.
2. Use the existing offline `prepare-import` and `verify-import` commands on individually authorized sources. Record file and mapping digests. Review proposed customer/supplier matches, duplicates, unresolved relationships, historical quotations and original documents. Nothing should create, overwrite or merge a live record silently.
3. Accountant reconciles AR and AP by document, bank/cash/staff cash balances by account, opening debits against credits and the cutover date; owner and independent Accountant approve the exact reviewed source/mapping digest and controls. Missing figures remain unresolved. A review package is quarantined; publication into business records and financial opening postings are not implemented or approved.
4. Before a later cutover request, prove a recoverable backup and object/identity coverage, verify approved versioned migrations and production environment/secrets, train named operators, and record freeze time, old deployment IDs, DNS/alias state, migration revision, pre-cutover balances, verification and abort criteria. Do not use staging migrations containing fixtures against production.
5. Keep the prior Manager and Accounts deployments available. A deployment rollback can restore old application routing but **does not undo database writes**. If any live write occurred, quarantine further posting and reconcile with the accountant; use only a separately approved recovery or compensating-entry plan. Never reset or silently overwrite journals to simulate an app rollback.

## Synthetic rehearsal evidence — 11 November 2026

After the report-comparison improvement, 13 focused backup/import tests passed. The in-memory financial fixture restored 8 records, 2 journals and 1 private original, with identical source/restored business hashes; trial debit and credit each `10010000` fils, total assets and liabilities/equity each `10010000` fils, and net profit `10000` fils. These are **fictional** amounts including fixture opening balances. The production-format synthetic fixture restored 2 records, 0 journals and 1 original, with matching hashes and zero financial totals. Full Trial Balance, Balance Sheet and P&L output matched each source archive. No cloud database or real records were used; Auth identities and infrastructure were not restored.

An additional one-shot Windows Task Scheduler test on 11 November 2026 ran a fictional in-memory fixture at 12:26 local time, wrote an encrypted archive, reopened it from disk with a disposable synthetic key, and restored it into isolated in-memory SQL. The scheduled action exited 0; 2 records, 1 fictional original, 0 journals, matching source/restored hashes and equal zero-valued statements were verified. This temporary QA task was removed after the run. Its first PowerShell-wrapper attempt failed due the local script execution policy; the successful test used a direct Node action without changing that policy. This tests local scheduling only: neither source nor destination was an actual cloud service, no real company records were used, and offsite access, durable key custody, an ongoing scheduler, remote notification and production recovery were not verified. Sanitized evidence: `evidence/scheduled-fictional-backup-2026-11-11.json`.
