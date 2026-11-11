# Controlled migration and encrypted recovery —11 November2026

Implemented source, not permission to import real records or activate financial posting. No cloud migration, production restore, real-data import, invitation, paid resource or deployment was performed by this workstream.

## Production migration contract

`supabase/production-migrations/manifest.json` is the reviewed sequence: existing `20261104081228_canonical_backend_foundation.sql` followed by `20261111090000_runtime_identity.sql`. File hashes use explicit UTF-8/LF-normalized SQL source (portable across Git CRLF checkout) and are validated in isolated production-format restore. Business archives, issued snapshots and original file bytes are never normalized. The full ordinary staging migration chain must **not** be run against production: it seeds a fictional-company identity and staging-only rules.

The production contract is pinned to the Owner-created project `zwjiztnsxenluqybxhhz`, Singapore `ap-southeast-1`; it seeds no company, membership, bucket, approval, transaction or balance. The explicit DBA environment registry requires separate company identity, exact Vercel project/origins, configuration evidence and private bucket. Its financial/real-document flags are immutable false in this candidate. Owner skipped business policy/opening-balance inputs, so no activation is inferred.

Production RPCs reuse the existing canonical tables, compare-and-swap version/idempotency protocol, allocation projector and immutable-history constraints. Actual private roles cannot execute them; only service-role BFF access is granted. The registry proof lists installed RPCs dynamically. Auth grant requires verified/confirmed individual user, trusted production app metadata, active membership and company; Owner/Accountant require live provider MFA. The former client-review identity and staging email namespace are excluded. Nonfinancial writes can initialize an empty explicit workspace and commit atomically; every financial transition remains423 pending separate approved policy/cutover work. No password-only production exception or Owner-assisted staging recovery RPC is installed.

The migration helper is source preparation only. Supabase management identity and actual registered approval/bucket/secrets must be verified before any cloud apply. Current [Supabase function guidance](https://supabase.com/docs/guides/database/functions) was consulted; empty search paths and closed grants are preserved. The changelog was reviewed; no hosted CLI command or migration pipeline was run.

## Import workbench

`src/backend/import-plan.ts` accepts explicitly mapped JSON records for customers, suppliers, projects, outstanding sales invoices/bills, bank/cash/staff petty cash, opening balances, historical quotations and documents. It retains original UTF-8 source bytes and SHA256, target IDs, original numbers, payload snapshots/history and exact integer-fils controls. It reports unresolved relations, absent balances, duplicate source/target IDs, duplicate issued numbers and unbalanced opening lines; zero or balancing amounts are never invented. Credentials/non-JSON fields are rejected.

Review approvals must bind the exact company/source/mapping digest and reconciled controls. Independent Owner and Accountant receipts plus verified target-company backup evidence are mandatory. `stageApprovedImport` revalidates the current Owner/MFA, company/environment, expected version and actor-bound idempotency receipt. Synthetic data is rejected for a production queue. The SQL adapter writes one immutable reviewed package into **existing** `azzora.migration_batches`, audit and receipt, in one transaction; it changes no party/project/issued document, journal, allocation or financial balance.

All import packages remain **quarantined**. This implements review/dry-run/approval queueing, not an active-data cutover. The public import endpoint and publication/posting of opening balances remain blocked until explicit source mapping, cutover policy, signed controls and production approval. No historical source is silently posted or transformed into a new journal.

Executable offline commands:

```powershell
node scripts/launch-import-recovery.mjs prepare-import --input private-source.json --output private-review.json
node scripts/launch-import-recovery.mjs verify-import --input private-review.json
node scripts/launch-import-recovery.mjs encrypt --input reviewed-business-backup.json --output protected-backup.json --key-file OWNER-MANAGED-KEY.bin --company APPROVED-COMPANY-UUID --key-id OWNER-KEY-REFERENCE --captured-at CANONICAL-UTC-TIMESTAMP
node scripts/launch-import-recovery.mjs decrypt --input protected-backup.json --output private-restored-archive.json --key-file OWNER-MANAGED-KEY.bin --company APPROVED-COMPANY-UUID --key-id OWNER-KEY-REFERENCE
node scripts/launch-import-recovery.mjs restore-rehearsal --input protected-backup.json --output restore-proof.json --key-file OWNER-MANAGED-KEY.bin --company APPROVED-COMPANY-UUID --key-id OWNER-KEY-REFERENCE
```

These commands have no network/import/apply/posting action. Existing files are never overwritten (`wx`). Plaintext originals/reviews/decrypted outputs must be protected offline, never committed or publicly uploaded. Keys are read from the explicit Owner-managed file, never printed, embedded in envelopes or stored in Git. All five commands were actually exercised with synthetic source and a disposable QA key; the restore completed in new in-memory PostgreSQL.

## Encrypted production capture and restore

`createProtectedProductionBackup` is the server-only integration API. Current Owner/Admin + AAL2 + `access.manage` and exact company scope are required. It invokes the new explicit production-format `createProductionBusinessBackup`, validates canonical scope/private-original MIME/size/hash/history and returns only an AES-256-GCM envelope. There is no plaintext production HTTP response through this wrapper; missing/invalid independent Owner backup key must fail closed in the BFF. Staging APIs and their fictional format remain separate and cannot verify a production archive.

The encrypted header binds company, key reference, capture time, plaintext SHA256 and length as authenticated associated data. Random96-bit nonces and128-bit tags protect each archive; wrong key, company, ciphertext, tag, hash or metadata is rejected. The key must be independently generated/retained by the Owner; no fallback to a session, staging, AI or service key is allowed.

`rehearseEncryptedBusinessRestore` always constructs a new local in-memory PostgreSQL instance. Staging-format archives use the ten staging migrations; production-format archives use only the two reviewed seedless production migrations and their hashes. It validates/decrypts before restoring canonical records, journals, snapshots and private originals, and compares logical business hashes plus Trial Balance/Balance Sheet reconciliation. It cannot connect to a live cloud database. A fresh isolated QA identity is constructed for SQL FK integrity; source Auth credentials/sessions are not exported or restored.

Actual evidence:

- Synthetic financial archive:8 records,2 journals,1 private original, capturedversion42, equal source/restored SHA256, balanced Trial Balance/Balance Sheet;10 staging migrations.
- Production-format synthetic archive:2 records,0 journals,1 private original, capturedversion1, equal source/restored SHA256;2 production migrations; no fixture opening balance seeded.
- CLI decrypt/re-encrypt/isolated restore also passed. Exact hashes/counts are in [evidence](evidence/).

## Verification and limits

New test groups:9 PostgreSQL production-contract cases,8 import review/SQL queue cases,3 encryption/financial restore cases,2 production encrypted-capture/restore cases. Existing six staging backup cases were rerun after format generalization. Tests cover current authorization, revoked grants, no seed rows, replay/conflict, competing versions, interrupted-write rollback, forged financial transitions, credentials, tampering, key/scope failures, original/history retention and reconciliation.

Dependency lockfile audit against the npm registry on11November2026 found zero production critical/high matches. One moderate development-only minimatch10.2.6 advisory remains; no forced incompatible major override or shared dependency mutation was made. This is advisory matching, not penetration-test certification. See the committed audit receipt.

Free tier is Owner-approved. No claim is made that it supplies PITR, offsite copies, disaster recovery, approved retention or verified RPO/RTO. Real infrastructure/Auth/Storage backups, schedule/destination, key custody/rotation, retention/deletion and an actual production recovery drill still require operational decisions and verification. Business-archive encryption alone is not a complete production backup service. Real opening balances, legal/VAT policy and migration/cutover approval remain deferred and cannot be guessed.
