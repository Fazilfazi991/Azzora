# Final source-identified hosted backup and application recovery

**PASS**, source `720240abd8c5adbb66d32357cb1d779cada1fb06`, Preview
`https://azzora-shared-staging-9d1iido4y-faziils-projects.vercel.app`, deployment
`dpl_2Tf7fBxtVai2X6Wtb9eF3TadS9Qf`.

Actual Chrome Owner sign-in/MFA → Settings → **Download Backup** → encrypted
download/success notice → logout passed. The actual success screenshot was
visually inspected. The newly downloaded archive was decrypted with the existing
separately held key and the trusted release verifier: its authenticated content
embeds the exact source SHA above and the reviewed twelve-migration bundle.

Archive SHA256: `b037a7ce750804ab56051674b5ff8e77f84693dcdd4fed2e51c533ecfbc39fec`.
Matching release-package SHA256:
`7e63514b7e855ef9814764e721c46d35457c6d7def4a4bd0be97ce0d46e0dca1`.
Both file hashes were independently calculated again after testing. The new
`final-recovery-provenance-720240a-2026-11-12.json` records these bindings; earlier
checkpoint archives and evidence remain unchanged.

This exact file—not an alternate fixture—was restored using this exact release's
existing CLI and matching migrations into clean isolated target
`azzora_recovery_release_720240a`: zero initial business records/Auth users,
standard pgcrypto prerequisite, real local PostgreSQL, GoTrue and private Storage
services. Supported Auth administration recreated identities; the MFA-verified
operator applied only the approved Owner/Accountant UUID mappings. Passwords,
sessions and MFA secrets were not recovered from the archive.

| Executed acceptance | Result |
| --- | --- |
| Connected CLI restores business/history/private original | PASS: 24 records, 12 journals, 1 original |
| Recovered Owner and Accountant actual BFF login + fresh MFA enrollment | 2/2 PASS |
| Pre-MFA session/snapshot/file/command denied | 8/8 PASS |
| Actual AAL1 provider session falsely presented as AAL2 denied | 2/2 PASS |
| Correct company snapshots include the archived invoice | 2/2 PASS |
| Authenticated original downloads match archived SHA | 2/2 PASS |
| Existing other-company private original denied | 2/2 PASS |
| Foreign company/session, changed mapped permissions, revoked authority | 6/6 PASS |
| Separate other-company user supported login/MFA and own snapshot/file | PASS |
| Restored invoice absent from other-company snapshot | PASS |
| Restored private original denied to other-company user | PASS: HTTP404 |
| Canonical business data | Identical to downloaded archive |
| Trial Balance/Balance Sheet and P&L | Balanced/reconciled and source values match |
| Original journal actor references | 12/12 unchanged |
| Original snapshot capture attribution | 1/1 unchanged |
| Original audit-event actor references | 140/140 unchanged, representing 4 distinct actors |

Four historical memberships remain inactive and three original project
assignments retain original identity references. Only the two explicitly mapped
roles were activated. Other-company test setup used the existing fictional Owner
initialization workflow and supported fixture-membership procedure; it did not
seed missing recovered memberships or change recovered canonical data.

No recovery assertion remains failing. This verifies hosted capture → isolated
**application recovery**, not a cloud-hosted restore or complete Supabase platform
clone. Cross-service restore is not a distributed transaction; partial-target
failure requires a new clean target as documented. No real financial posting,
paid AI, production alias or live database was enabled or changed.
