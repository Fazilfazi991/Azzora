# Final hosted download → isolated application recovery

Tested source `b778dd75dc34f4b2101f38a66560b55efcafb60f`, protected Preview
`https://azzora-shared-staging-qbw0udtk4-faziils-projects.vercel.app`, deployment
`dpl_2p7wUjkt9fzufXJHydp9emJ1BzYs`. No production alias or real record changed.

Chrome signed the existing fictional Company B Owner into this exact hostname,
verified MFA, opened Settings and clicked the actual **Download Backup** button.
An encrypted AES-256-GCM archive downloaded, its success notice appeared, and the
Owner logged out. The actual rendered success screenshot was visually inspected.
This was not a direct-API substitute for the Owner button.

Downloaded archive SHA256:
`07845b939267c679fa81acba0b895e59ab623830f96edd9c28ad113ced7fe7a9`.
Matching recovery-package SHA256:
`22ab79092c864272efc6a3ebcc3a7ed2c0492b4e56f4a87d950f391cb0bb4cac`.
`final-recovery-provenance-2026-11-12.json` records this external binding. The
application SHA is externally recorded, **not embedded** in the v3 archive.

Restored that exact unchanged file using the frozen release's existing
`recover-local-application` CLI, its reviewed 12 application migrations and
isolated recovery controls. Target `azzora_recovery_release_8bec` began with
zero business records and zero Auth users. The target used real local Supabase
PostgreSQL, GoTrue and private Storage services on loopback; no cloud restore or
complete Supabase platform clone is claimed. The standard `extensions.pgcrypto`
prerequisite was missing on the newly created database; the first attempt safely
rolled back with zero business rows, it was provisioned, and the workflow passed.

The operator and approved replacement users were recreated through supported
Auth administration with fresh credentials/MFA. Recovery activated only the
Owner-approved Owner/Accountant UUID mappings. Four original memberships remain
inactive, three original project assignments retain their historical identities,
and historical Auth identities are disabled. No missing recovered membership was
manually seeded outside the recovery procedure. No passwords or MFA secrets were
restored from the archive.

| Executed check | Result |
| --- | --- |
| Connected CLI restores actual new archive and original | PASS: 17 records, 6 journals, 1 private original, 2 mapped users |
| Actual BFF recovered Owner/Accountant login + fresh MFA enrollment | 2/2 PASS |
| Pending MFA session/snapshot/file/command access denied | 8/8 PASS |
| Real AAL1 provider session falsely presented as AAL2 denied | 2/2 PASS |
| Correct restored company snapshot contains archived invoice | 2/2 PASS |
| Actual authenticated private original download matches archived SHA | 2/2 PASS |
| Existing other-company original denied to recovered users | 2/2 PASS |
| Foreign-company session, altered mapped permissions, revoked authority | 6/6 PASS |
| Other-company user login/MFA, own snapshot and own original | PASS |
| Recovered invoice absent from other-company snapshot | PASS |
| Recovered original denied to other-company user | PASS: HTTP404 |
| Source/restored canonical business data | Identical |
| Trial Balance and Balance Sheet | Balanced; source values match |
| Profit & Loss and financial report values | Source values match |
| Immutable original audit identity references | 117/117 unchanged |

The separate other-company fixture was initialized through the application's
existing fictional Owner workflow and supported fixture-membership procedure.
Its initialization did not change the restored company's canonical data or
journals. All financial testing remained fictional. Recovery has no single
distributed transaction across Auth, database and Storage: an interrupted partial
target requires a clean-target retry as documented, not silent overwrite.

Result: **APPLICATION RECOVERY PASS** for this actual downloaded archive and
matching release package. No failing recovery assertion remains. This is not
accountant approval, production cutover, restoration of old credentials/MFA,
activation of replacement Manager/Staff users, or proof of every Supabase-managed
configuration setting.
