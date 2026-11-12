# Downloaded archive application recovery

This versioned package comprises the matching application source/lockfile,
`scripts/launch-import-recovery.mjs`, `scripts/recovery-local-operator.mjs`, the
reviewed `supabase/migrations` baseline and `supabase/recovery-local/*.sql`.
The connected command deliberately accepts only isolated fictional loopback
targets. It cannot apply these controls to hosted staging or production.

1. Retain the actual Owner-downloaded encrypted archive and its separately held
   encryption key. Verify the archive using this release's existing verifier.
   A v3 archive contains its reviewed migration bytes; verify these against the
   matching source catalog. Apply **all** matching application migrations, in
   order, to a clean local Supabase environment with fresh Auth and private
   Storage services. Do not copy platform credentials or Auth secrets.
2. Verify the standard target `extensions.pgcrypto` prerequisite first:
   `select to_regprocedure('extensions.hmac(bytea,bytea,text)');` must return a
   function. On a fresh isolated database, its administrator must provision
   `pgcrypto` in the `extensions` schema if absent. Do not silently relocate an
   existing extension. This prerequisite was exercised in the final recovery.
   Apply `supabase/recovery-local/000_target_authority.sql` through `004...sql`
   in filename order. These are isolated recovery controls, not hosted migrations.
   The target administrator provisions a dedicated recovery operator through
   supported Auth administration, verifies fresh MFA, and independently records
   its UUID, exact Docker service IDs, loopback ports and database name in
   `azzora_recovery_control.authority`. Supply a fresh 32-byte seal key through
   private parameterized administration, never command arguments or logs.
   Auth and Storage schema ownership/service grants must follow the local
   Supabase service baseline; do not widen application browser grants.
3. Recreate the explicitly approved replacement users through supported Auth
   administration. Require new credentials and verified MFA. Keep the mapping
   file to explicit `originalUserId`/`newUserId` UUID pairs; email matching alone
   never grants access. This implementation activates only archived Owner and
   Accountant roles. Original memberships are retained **inactive** and original
   project assignments retain original identities. Other staff access is not
   silently activated.
4. Run `verify-local-recovery-operator` with the encrypted input, Auth origin,
   container, database, DB port, target UUID, operator token file, mapping file,
   company and fresh nonce. Independently review its archive SHA and mapping
   digest against the approved pairs and target. The digest also binds exact
   pinned Auth/DB/Storage containers and ports. A replacement service invalidates
   that approval; do not reuse it.
5. Run `recover-local-application` with the same arguments, plus `--key-file`,
   `--key-id`, `--seal-key-file`, the reviewed `--approval-digest` and a distinct
   `--confirmation-nonce`. Local credentials come only from
   `AZZORA_RECOVERY_LOCAL_DB_PASSWORD` and `AZZORA_RECOVERY_LOCAL_SERVICE_KEY`;
   operator token/seal/key files must be private absolute non-symlink paths.
   Never commit these files or pass credentials in process arguments.
6. The command validates the private bucket before business restore, creates
   disabled historical identities through supported Auth administration,
   transactionally restores business history and inactive memberships, restores
   and hashes originals, then grants only the approved mapped memberships and
   records operator confirmation. No passwords, sessions or MFA seeds are read
   from the archive. Historical audit/journal actors are not rewritten.
7. Independently sign in each recovered role through the actual application,
   require fresh MFA enrollment, open an original, compare canonical data and
   reports with the archive, and test foreign-company denial. The command's
   output correctly leaves `applicationAccessVerified:false` until these separate
   checks execute. Its `liveSchemaVerified:false` is not a platform-clone claim.

Recovery spans PostgreSQL, Auth and Storage and is **not** one distributed
transaction. A failure before mapped access is activated leaves no usable
recovered membership. Do not claim success from populated tables alone. If an
interrupted Storage or later step leaves a partial target, preserve its logs and
restart from another clean isolated target with a new reviewed digest; this
version does not silently resume, delete or overwrite that target. Server errors
expose only fixed restore-stage names and SQLSTATE, never archive values.

This proves application recovery, not restoration of Supabase-managed settings,
original credentials, original MFA, mail configuration or production cutover.
