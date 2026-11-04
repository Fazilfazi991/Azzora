# Fictional-only Supabase staging runbook

4 November 2026. This is the operating plan for the specifically approved staging project, not production release authorization. The owner-approved boundary is fictional data only, no real financial posting, and no changes to either live Vercel application. This runbook itself applies no SQL and records no claim that a cloud action succeeded.

## Target and hard boundaries

- Organization: AZZORA, `kyhishmkityakkdcyhzk`.
- Supabase project: `hkhomrrvxtcxnxvdlkoh`, supplied project URL `https://hkhomrrvxtcxnxvdlkoh.supabase.co`.
- Verified project region: Singapore `ap-southeast-1`; this is not UAE residency. Observed Free/Nano plan is not a production availability/backup guarantee.
- The dashboard may label its default database branch `main · PRODUCTION`. That provider label does not authorize AZZORA production use. Retain a separate application-owned synthetic-staging marker; do not promote/rename deployments or attach existing live application environments.
- No real browser exports, supplier documents, opening balances, financial policy approvals, client records or paid AI calls belong in this rehearsal. Preserve the existing approved-document DeepSeek restrictions in the unchanged applications.
- Do not open/copy API-key screens or put credentials into SQL, logs, screenshots, Git, client bundles or chat. This plan does not require an application service key.

## Preflight before any migration

One designated operator serializes cloud changes. Confirm exact organization/project/region from the current selected dashboard and compare against this runbook. Stop on a different project, pre-existing application schema/objects, unexpected user data, or unknown migration history; do not make an existing schema appear empty by dropping/resetting it.

Record a redacted before-inventory: schemas and application table names/counts, exposed API schemas, table/function privileges, RLS/policies, managed migration-table existence, Auth user/session metadata counts, private bucket metadata, security/performance advisors and backup availability. Do not open actual data rows. Managed Auth/Storage schemas and their migrations are expected; they must not be described as an entirely empty database or modified to fit the application.

Keep the original locally tested migration file unchanged once applied. Record its filename/version, exact source Git SHA, raw UTF-8 file SHA256, optionally a separately named LF-normalized SHA256, byte length, operator, target project, execution method and UTC application time. A pasted SQL Editor script may normalize line endings; do not claim a source-file checksum proves remote execution bytes. Verify resulting catalog definitions, policies, grants, functions, triggers, constraints and indexes independently after execution.

## Application method and migration history

Preferred long-term method is a single authorized CLI operator applying reviewed versioned migrations to the verified project. Discover current CLI commands/flags with `--help`; confirm link identity before use and inspect a dry run. Never use database reset, migration down, history deletion, forced replay or a broad push to repair an uncertain state.

If current access only permits the approved dashboard SQL Editor, execute the literal reviewed migration as its complete `BEGIN` to `COMMIT` unit, once. A failed transaction must roll back as a whole; do not rerun selected statements to force partial success. Verify catalog state and absence of unintended objects after any error. Preserve exact error class/code safely, not credentials/document contents.

**SQL Editor execution does not register that migration in `supabase_migrations.schema_migrations`.** Passing catalog checks and a dashboard success message are not proof CLI history is synchronized. Never manually insert/update/delete Supabase's managed history table. A separate private application registry can record deployment provenance, but is not a replacement for CLI history.

The coordinator-owned staging migration may create an application audit registry under private `azzora`, for example `schema_migration_audit`. Required fields: migration version, filename, source commit, source SHA256 with defined normalization, application method, target project, time and operator. Revoke anonymous/authenticated/application mutation access, enable RLS, preserve append-only records and reject duplicate versions with different hashes. Record only already verified migrations; no “applied” row before success. The registry cannot hash itself without a self-reference problem: use an independently hashed post-application attestation for its creating migration, or record that creating migration in a later reviewed attestation. Do not fabricate a zero hash or claim SQL execution was cryptographically verified solely from an operator-provided hash.

### Later transition to tracked CLI releases

1. Obtain approved CLI/database access for this exact staging project, without exposing credentials. Verify linked ref, inspect `migration list` and back up current schema and application audit evidence.
2. Compare every manually applied migration with the immutable local files/source attestations **and actual remote catalog**. Verify private helper definitions, privileges, RLS, triggers, numeric checks, indexes and bucket settings; table names alone are insufficient. Resolve all discrepancies as reviewed forward changes before claiming equality.
3. Only when the exact migration is proven already applied, use the documented CLI `migration repair <version> --status applied` to register its history without replaying SQL. This changes tracking only; it neither applies schema nor fixes drift. The operator must have authorized scope for the target and record the action.
4. Run `migration list` again, then `db push --dry-run`. Expect only reviewed unapplied migrations. Stop if the initial `CREATE SCHEMA azzora` migration appears scheduled again or any unknown migration is pending. Do not delete historical local files or mark unknown migrations applied to silence an error.
5. All subsequent remote schema changes go through the same reviewed migration workflow with one operator. Do not mix ad hoc dashboard edits with tracked releases. Keep the independent audit registry for provenance, not as an alternate migration engine.

Official documentation confirms that manual remote changes bypass migration history and that `migration repair` changes tracking only: [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair), [CLI migration list](https://supabase.com/docs/reference/cli/supabase-migration-list). Reviewed 4 November 2026.

## Post-application checks and current security limits

Foundation migration must leave `azzora` unexposed to PostgREST, all application tables RLS-enabled, browser roles denied, and the restricted `azzora_api` role without direct writes. Financial accounts default inactive/nonpostable, periods locked, and policy approval/journal tables empty. No write RPC, app database login, actual app session, real opening balance or live Vercel configuration should be introduced by this step. Private attachments remain quarantined until an approved scanner/authorization flow exists. A private bucket without object authorization and a working trusted upload/download handler is not a completed file workflow.

Schema limits are intentional blockers before routes can be connected: stored assurance is not current MFA-factor verification; provider-session existence alone is not full revocation/idle policy; SQL single-role and TypeScript workspace/capability grants need explicit trusted mapping; record JSON requires existing typed validators and immutable-history verification; allocation/outstanding/party limits and multi-record transaction adapters remain unimplemented. Never broaden grants to make a failing demo work.

After each applied migration, record actual advisors and read-only assertions. Separately test scoped table denial with synthetic actors, no cross-company access, no direct financial mutations, private/quarantined object denial, immutable history, integer-fils/balance constraints and expected failure rollback. Use rolled-back synthetic fixtures or an explicitly isolated fixture company; fixtures must not be presented as actual business records. Local PGlite tests are useful preparation but cannot replace these hosted checks or real multi-connection concurrency tests.

## Backup, restore and rollback

Before first application, retain the exact migration files, source hashes, before-inventory and any existing schema dump in private controlled storage. Empty application tables are not evidence a provider backup exists. Verify current plan backup features in the dashboard; do not promise daily backups for the observed Free project. Supabase-managed database backups do not include Storage object bodies; [official backup scope](https://supabase.com/docs/guides/platform/backups).

For the fictional rehearsal, maintain separate database/schema and object-body manifests: project/environment, export time, table counts, relevant financial control totals, immutable record hashes, bucket/object names, sizes, MIME, SHA256 and authorization metadata. Encrypt private exports and restrict access. No credentials or financial originals go into Git. A storage metadata row without its object body is not a recoverable attachment.

Restore drills use an isolated local database or separately authorized disposable staging boundary. Never restore over the owner-supplied project, replace Auth/Storage managed internals or delete the approved project to demonstrate rollback. Restore database content and object bodies, then verify manifest hashes/counts, relationships, current access policies and financial controls independently. Record pass/fail and evidence; until performed, restore is **not verified**.

If this initial staging migration fails, stop and retain transaction/error evidence; a full rollback leaves the earlier database unchanged. If it commits but a post-check fails, disconnect/leave all applications unconnected and disable further staging writes. Prepare an additive repair; do not drop schema/tables or alter immutable history. No existing live application points at this backend, so keeping those routes unchanged is the immediate containment path. Later data-bearing cutover rollback requires its own owner-approved restore/forward-repair procedure.

## Exit criteria for this infrastructure checkpoint

Report exact project, files/source SHA/hashes, SQL execution method/time, private schema/table count, migration provenance and CLI-history status, bucket privacy, advisor findings, tests actually run and unresolved issues. Claim only the infrastructure established. Individual accounts/MFA/recovery, canonical application adapters, shared Manager-to-Accountant records, complete workflows A–E, private file roundtrips, backup restoration, load tests, accounting policies and production acceptance remain separate gates. No real-data or production permission follows from fictional staging approval.
