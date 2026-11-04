# Browser-record migration rehearsal

4 November 2026. Local foundation only. No cloud import, browser read, real financial posting or reset is implemented by this module.

`src/backend/migration.ts` is server/offline code. Call `prepareMigrationRehearsal(exactExportText, { sourceId, companyId })` only with an owner-exported file or synthetic fixture. Never invoke it automatically on login. Keep returned archives private: the preserved original can include names, bank details, attachment bodies and immutable quotations. Do not log or commit real archives.

The archive retains exact original UTF-8 text, SHA256, byte length and original `azzora-demo-v1` key. Malformed exports still produce a backup manifest and blocking issue; they never trigger seed fallback. Every array, including unknown future extension arrays, is inventoried. Every ID-bearing record has a content hash and a namespaced source/company/collection identity. Duplicate IDs, conflicting register numbers, broken existing-schema/relationship/snapshot validation and synthetic finance markers block readiness for canonical mapping. Nested BOQ display numbers are deliberately not treated as unique business references.

Source control totals cover issued invoice gross, active customer receipts, issued supplier bill gross and active supplier payments in integer fils. Source snapshots already store integer fils; decimal AED payments use the existing strict `parseFils` adapter, with no rounding. These independent source totals are **not** an opening journal, cutover reconciliation, AR/AP outstanding calculation or tax-policy approval. Existing credits/refunds, cancelled and reversed history remain archived; accountant reconciliation must additionally apply their approved cutover treatment before balances can be accepted.

`verifyMigrationArchive` regenerates the manifest and checks preserved bytes, hashes, counts, issues and control totals. `findMigrationConflicts` detects repeated source exports and conflicting/repeated same-ID records from different browser sources without silently merging them. Nested array paths include positional indexes: canonical mapping must resolve these using parent stable IDs; the archive does not pretend positional paths are final database keys. Same-party records with different IDs need a separately reviewed matching report; display names must never silently merge customers/suppliers.

## Required cutover sequence

1. Obtain consent and export exact data from every active browser profile. Preserve originals outside Git with access controls, checksum and retention.
2. Run offline rehearsal and collect blocking issues; do not change original files. Resolve ID/number collisions through an explicit mapping decision preserving both histories.
3. Stage a batch with stable source-to-canonical IDs, references and snapshots; record entity counts, hashes and controls before/after import. This canonical importer is pending.
4. Separately inventory attachment object bodies, MIME/size/hash and access ownership. A JSON/database backup alone does not prove every file exists.
5. Accountant signs opening balances, invoice/bill outstanding, allocations, credits/refunds, cash/bank balances, accounting policy, cutover date and exception queue. Quarantine synthetic fixture journals instead of importing their balances.
6. Restore staging database and private attachment backup, then independently compare counts, historical hashes and financial reconciliation. Test concurrent commands and deny cases.
7. Only after owner cutover approval, freeze legacy writes, import one batch transactionally, reconcile and enable one authoritative backend command path. Keep browser originals; never auto-clear localStorage.

Rollback before cutover: discard the isolated staging batch and retain the original export/checksum. After live writes start, use a reviewed restore/corrective-event procedure; deleting production rows or reverting to a stale browser copy is not a safe rollback.

## Verification

Ten ordinary unit tests exercise malformed-byte preservation, additive history inventory, duplicate IDs/references, tamper detection, cross-browser conflicts, synthetic-journal quarantine, null rejection, broken relationships, money-unit reconciliation and fractional-fils rejection. No cloud SQL, production import, real browser-data migration or full cutover rehearsal is claimed.
