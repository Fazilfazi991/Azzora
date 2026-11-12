# Application security comparison — 12 November 2026

The read-only `application-security-fingerprints.sql` covers application-owned `azzora` relations, columns, constraints, indexes and policies, plus `azzora`/`public.staging_*` function definitions and client-relevant grants (PUBLIC, anon, authenticated, service_role, azzora_api). No business rows or Auth secrets are selected. Supabase-managed internal schemas are excluded. PostgreSQL 18's additional not-null constraint catalog entries (`contype=n`) are excluded for comparison with hosted PostgreSQL 17; column nullability remains included.

The coordinator executed the query through the authorized fictional staging SQL Editor. Isolated comparison used the reviewed 12-migration root/recovery baseline, including `20261111133235_staging_owner_backup_provenance.sql`. The initial comparison used an older 11-migration security worktree; the extra Owner-backup function was traced to this known baseline difference, not an unknown hosted addition.

| Component | Count | Hosted digest | Result |
| --- | ---: | --- | --- |
| columns | 182 | 370e8b59eea9ef5ace3a7672e63acf5e | Exact match |
| constraints, normalized | 131 | b8156ba8fd7ce9d025a85e31cd633900 | Exact match |
| function grants | 26 | 2a76b5e2eae84f161cb38fa6070b702c | Exact match |
| indexes | 35 | a3b072fc4482f6b113513de42650da50 | Exact match |
| policies | 11 | 3144409777d95cab7b1ed9792008b38e | Exact match |
| relations and RLS flags | 24 | 59ab66aa61073aa1e44714a5c54126df | Exact match |
| schema grants | 1 | 13a280312f97b147689041caad6a4511 | Exact match |
| table grants | 11 | 8ae6fb490fcedd71a47075a0a4763b86 | Exact match |

All 36 application function definitions were accounted for. Thirty-four matched the initial 11-migration baseline exactly. Hosted `staging_owner_backup(text)` definition MD5 `4b6d4397f4392af2630688f9740c3a85` exactly matched the reviewed twelfth migration. Hosted `staging_auth_grant(uuid)` MD5 `3f53acf856c3037b1d18767c86bece5e` exactly matched the previously captured applied Company B function. Its difference from `tests/fixtures/company-b-allowlist.review.sql` was formatting only: a lexical comparison retaining quoted strings/identifiers and ignoring whitespace/comments produced identical 895-token sequences, SHA-256 `d332247de517c458a59a52b8eb47a7b34f745d9d625f4c1eaa23abb2c588d334`. This branch permits only the four approved fictional identities, exact roles/capabilities and 24-hour window. No grants, role memberships or policies were broadened for this comparison.

These results establish application-owned schema/security metadata correspondence at the inspection checkpoint, not execution of RLS in a browser or verification of every Supabase platform setting. Earlier isolated 160-assertion private-table RLS tests, hosted direct-provider ACL denials and allowed/denied BFF operations remain distinct evidence. Final candidate hosted authorization tests must be recorded against their own exact SHA and URL.

## Independent recovery failure checks

On the isolated loopback PostgreSQL target, three malformed-JSON, invalid-UUID and unknown-authority requests to `004_restore_business.sql` returned generic denials. The synthetic sentinel was absent from driver fields and PostgreSQL logs; business record count and existing monitoring settings were unchanged. This first check used SQL SHA-256 `58c36f17744746b5b3f53a7943559520a6e2b6ff3f5f1bc9d8c506da1796e50b`. Binding-aware operator tests passed 2/2.

A separate late-failure check used recovery source `9c2172b479dce1c4e575254965a1ac3b2b536be9`, SQL SHA-256 `b09e68fa1e02a8084261fb43a37e5774727c380489c9339fcf708440022e03f4`. The actual downloaded encrypted archive was decrypted in memory; only the synthetic command-receipt date was deliberately corrupted in a sealed fault-test context. The function reached `command-receipts` after restoring audits and executing transactional `ALTER SEQUENCE RESTART`, then rejected SQLSTATE 22007. Zero partial business rows remained, and audit sequence `last_value`/`is_called` were unchanged. No sentinel appeared in the driver error or PostgreSQL logs. The test used an outer rollback; the already restored target's complete canonical data and sequence matched their preceding state afterward. An initial test setup encountered an `auth_flows` foreign key; that outer transaction rolled back, the isolated setup accounted for the ephemeral references, and the fault scenario then passed. No Auth users or hosted records changed.

Recovery activation remains after private-original hash verification. Bucket preflight and loopback-only bindings were reviewed. An unexpected upload failure after business commit leaves access unactivated and requires a fresh isolated-target retry; this is not an atomic rollback of PostgreSQL plus Storage. Archived inactive memberships and project assignments are preserved; the tested replacement-access activation is scoped to the approved Owner and Accountant mappings.
