# Fictional staging security proof

The owner has approved project `hkhomrrvxtcxnxvdlkoh` in Singapore for fictional staging. This does not authorize real financial posting, arbitrary real-document processing or changes to the live Vercel applications.

`tests/backend-staging-security.sql` is an executable transaction ending in `ROLLBACK`. It raises an exception on any failed assertion and outputs only named boolean checks and an aggregate count. It never inserts, updates or deletes managed `auth.users` or `auth.sessions`, calls an identity provider, obtains credentials or uploads a file. It creates a randomly identified fictional company/party/project/invoice draft and a temporary immutable-trigger probe, then discards them all. Run the entire file after both reviewed migrations; do not execute selections that omit the final rollback. If an error aborts execution, explicitly roll back that connection before continuing.

## What the proof establishes

Fifteen named checks cover:

- Required nineteen foundation tables exist with RLS; every additional AZZORA application table also has RLS.
- The restricted API role has no login, RLS bypass, superuser status or inherited role memberships.
- `anon` and `authenticated` have no private schema/table/function privileges, and actual SELECT/INSERT attempts fail under each role.
- The API role retains expected scoped read grants, has no direct table mutations/control-table reads and sees zero project/document/journal rows without identity/session context.
- All six history tables retain enabled immutable triggers, and deferred journal-balance plus period/line-admission triggers exist.
- The exact immutable-history function rejects UPDATE and DELETE against a temporary fictional row.
- Financial policy approvals and posted journals remain absent.
- No AZZORA bucket is public; the originals bucket is private, limited to 2 MiB and PDF/PNG/JPEG. Storage objects have RLS and no permissive policy applicable to PUBLIC, anonymous or authenticated browser roles. This is metadata evidence, not an authenticated object upload/download test.
- The exact approved project has a synthetic-staging guard with real posting and real-document processing disabled.

## Results and limits

Local PostgreSQL/WASM rehearsal using the reviewed migration files: **15/15 checks passed**, and post-rollback company count remained **zero**. The harness uses explicit local stand-ins for Supabase's managed auth/storage relations. It does not prove hosted Supabase identity, JWT validation, actual provider-session revocation, MFA enrollment/challenges, invitations, recovery emails, actual file object authorization, successful cross-user sharing, live financial posting or concurrent cloud behavior.

Hosted execution status is coordinator-owned and must be recorded separately using actual SQL Editor results. This document does not claim the hosted checks passed. Live per-user role/tenant/project tests require separately provisioned fictional accounts and genuine authentication adapters; they are still Gate 2 work. No application route should be enabled merely because these database denials pass.
