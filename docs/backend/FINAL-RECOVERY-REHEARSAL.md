# Fictional staging backup and recovery rehearsal

Status: verified locally against an actual authenticated staging export. This is **not** approval for production accounting, importing real browser records, or restoring an existing cloud database.

## Actual capture and recovery

- Capture: **2026-11-04 14:08:20.606 UTC**, company version **59**.
- Source: existing fictional staging company, through `https://127.0.0.1:5365/api/staging/manager/backup`.
- Current authenticated Owner with MFA: **HTTP 200**. Project Manager: **HTTP 403**.
- Rehearsal finished: **2026-11-04 14:08:23.758 UTC**.
- Target: a newly created, isolated, in-memory PGlite PostgreSQL database. No cloud database was reset, restored, deleted or overwritten.
- All seven migration files present at rehearsal time were applied, including `20261104134923_staging_manager_completion.sql`.

| Business section | Captured/restored |
| --- | ---: |
| Parties | 4 |
| Projects | 2 |
| Departments | 3 |
| Canonical business records | 66 |
| Chart accounts | 13 |
| Accounting periods | 1 |
| Journals | 6 |
| Journal lines | 12 |
| Immutable snapshots | 4 |
| Relational payment allocations | 2 |
| Deduplicated private originals | 2 |

Both original files were recovered into the isolated file map and checked against their SHA-256 content keys. Manager attachment pointers and Accountant attachments are included. Multiple references to identical content share one exported original. No public or signed Storage URL is created.

The restored company version is **59**. Trial Balance and Balance Sheet are balanced as of **2026-11-04**. Immutable snapshot payloads, IDs, domain revision histories and source journal links are retained. Relational allocations are rebuilt using the existing SQL projection from canonical settlement events; this creates no new financial journal.

## Integrity evidence

The raw exported canonical JSON SHA-256 is:

`8ae4d957af3aec9ab4bfd1fcdf2f54c1ee731688f2360ae9a23066d5470cc193`

The normalized canonical business SHA-256, identical before and after recovery, is:

`aaa41639c9af2bfda5a4cd6392cec83ea06d01ed434ebd96025b1f73bae073d3`

Raw registry array ordering differs between the cloud database and local PGlite because their collations order four sales-invoice IDs differently. The comparison therefore sorts only top-level entity registries by stable IDs and normalizes journal UTC timestamps. It does **not** sort or change quotation BOQs, invoice items, payment terms, histories or other arrays inside business payloads. The untouched raw package has its own manifest hash, counts and original-file hashes.

Safe machine-readable evidence is stored in ignored `docs/integration-evidence/staging/final-backup-rehearsal-results.json`. The complete plaintext fictional package is kept only in ignored `tmp/private-fictional-staging-backup.json`; it is not committed.

## Format and access contract

`createStagingBackup({ version, data, companyId }, readOriginal)` exports format `azzora-fictional-staging-business-backup`, schema version 1. It includes canonical business data, capture time, company version, a count/hash manifest and verified private originals. The BFF enforces current Owner identity, `aal2`, and `access.manage` before export. Responses use attachment disposition and `Cache-Control: no-store, private`.

`verifyStagingBackup` rejects unsupported/nonfictional formats, credential/Auth sections, altered manifests, missing/corrupt originals, invalid source snapshots, missing journal sources and unbalanced accounting statements. Unstored inline originals are rejected rather than silently omitted. The reviewed fictional export limit is 64 MiB of original bytes; exceeding it fails without creating a partial package.

There is no application restore endpoint. The restore helper exists in test code only and requires an empty business database. PostgreSQL foreign keys, immutable-history constraints, journal balance checks and reversal constraints remain enabled. A failed FK restore rolls back its transaction and leaves zero partial business records. A second restore into a populated target is rejected.

## Regression results

- Backup/export and isolated PostgreSQL recovery: **5 passed, 0 failed**.
- Additive browser-export migration rehearsal: **3 passed, 0 failed**.
- Actual PostgreSQL JSONB planning-fingerprint regression: **3 passed, 0 failed**.

The migration rehearsal uses only the repository's bundled demo seed, with explicitly fictional accepted/issued fixtures. It does not read browser `localStorage` or an owner's real export. It verifies existing customer, project, employee, task, document and commercial IDs/counts; task dates; accepted quotation history; and issued invoice snapshots across decoding and canonical backup roundtrip. Existing task dates do not create a historical baseline. Malformed/incompatible source strings are rejected while their original bytes remain unchanged.

The planning regression also verifies that real JSONB key reordering leaves semantic fingerprints unchanged, that new-task proposals can be submitted and approved after database roundtrips, and that old order-dependent fingerprints require explicit recalculation. Existing approved/submitted history is not silently rewritten.

## Limits and production gates

- The package contains fictional business data in plaintext. Production use requires approved encryption, key ownership, offsite retention, access logging, restore authorization and recovery-time/recovery-point procedures.
- Operational employee profiles are business records and are included. Supabase Auth users, passwords, MFA secrets, provider tokens and application sessions are excluded and must be provisioned/recovered separately.
- Canonical domain histories and snapshots are preserved. Infrastructure/security audit tables, command-receipt history and physical row-version counters are outside this business-export format; it is not a full database point-in-time backup.
- Restored files were verified in an isolated memory map. No production Storage bucket recovery was attempted.
- Legacy finance records are preserved without inventing historical posting, opening balances or tax approval. A real import requires explicit reconciliation and identity mapping.
- The capture represents version 59 at its stated time; later client-review edits are not claimed to be included.
- Real financial posting and paid AI remained disabled. Neither live Manager nor live Accounts deployments were changed by this rehearsal.

## Final capture after complete workflow testing

The earlier version59 export and results remain preserved as `private-fictional-staging-backup-checkpoint59.json` and `final-backup-rehearsal-checkpoint59-results.json` in the ignored QA directory. A final capture succeeded against tested source **`a6a4ccf9c7cc109d5f1687ce37390a7e0f8698c2`**:

- Capture **2026-11-04 15:00:33.371 UTC**, company version **139**.
- Owner export **200**, PM denial **403**; isolated restore complete **15:00:40.286 UTC**.
- All seven migrations applied to a fresh in-memory PGlite database; no cloud restore or reset.

| Section | Captured/restored |
| --- | ---: |
| Parties | 6 |
| Projects | 3 |
| Departments | 3 |
| Records | 108 |
| Accounts | 15 |
| Periods | 1 |
| Journals | 20 |
| Journal lines | 40 |
| Immutable snapshots | 9 |
| Private originals | 3 |
| Relational allocations | 6 |

Raw source SHA256: `4cb4289ca2a33ead50d906f97e342f2502326fc57d99effa4fe30bbe1424332d`.

Source and restored logical canonical SHA256: **`ae22b77427e9a1b1fe2d37e66756f57724b42ed3e8c27fb697ab366d5fd9b7c8`**. Raw registry ordering differs due to database collation; canonical entity content, snapshot/history/item ordering and all three original-file hashes match. Restored version is139; all six allocation rows are reconstructed from their original source settlements. Trial balance and Balance Sheet are balanced as of4November2026.

The final accounting metrics match the receipt-race endpoint results: revenue AED2,000, Cost of Sales205, Operating Expenses0, gross/net profit1,795, receivables1,680, payables90, bank100,205 and cash0.

The first final export correctly failed400 because an immutable document-approval JSON snapshot retained its original inline photo. The compatibility fix preserves that exact historical string; it accepts historical inline bytes only when their ID, MIME, size and SHA match an existing private original pointer elsewhere in the canonical data. Current mutable inline uploads remain rejected. A mismatched or tampered historical original is rejected. Focused backup/restore/migration tests now pass **9/9**, including the new compatibility regression. The succeeding final export contains the deduplicated original and retains all approval history. No historical cloud record was rewritten to fix the export.

Final safe evidence: `docs/integration-evidence/staging/final-backup-rehearsal-results.json`. This final capture supersedes the version59 checkpoint for workflow coverage; all production limitations above still apply.
