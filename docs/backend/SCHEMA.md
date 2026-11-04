# Canonical database foundation — 4 November 2026

Baseline: `02ab580db6acc45ef9aa4e84cef0ab85af8b48aa` on isolated `codex/azzora-production-backend`. This is a local migration candidate, not an applied Supabase schema or an enabled company backend. No cloud schema, identity, storage bucket, financial policy, real company record or live deployment was changed.

## Canonical ownership

Use one PostgreSQL database for both existing applications. Schema `azzora` is private and must not be added to PostgREST exposed schemas. Application code accesses it through a trusted server boundary using a narrowly scoped database identity; never ship a privileged key or connection string to Vite. Existing calculation engines in `src/accounting`, `src/finance`, `src/commercial` and `src/accounts-review/domain.ts` remain authoritative. SQL does not introduce a competing calculation engine.

All company keys are UUIDs; existing business record IDs remain text, preserving legacy values exactly. Composite foreign keys prevent cross-company project, party, department, document and journal references. Monetary journal values are integer fils stored as `numeric` with explicit integer, nonnegative and magnitude checks (fractional values are rejected before any rounding); the API must encode them as decimal strings, preserving the existing contracts without JavaScript floating-point conversion.

| Existing source | Canonical storage |
| --- | --- |
| Customers/suppliers | `parties`, kind customer/supplier/both; complete legacy payload |
| Projects/departments | `projects`, `departments`; explicit customer and tenant relation |
| Employee records | `records`, entity_type employee; independent from login identities |
| Task/phase/milestone/planning/assignment/site updates/snags/handover | `records`, original ID and full typed payload; explicit project relation |
| Quotations/BOQ/contracts/POs | `records`; append-only accepted/issued revisions in `snapshots` |
| Sales invoices, supplier bills, expenses, receipts, payments, transfers | One `records` register, not separate Manager/Accountant copies |
| Accounts and accounting periods | `accounts`, `accounting_periods` |
| Journal and allocations | `journals`, `journal_lines`, `allocations` |
| Documents/approvals | `records`; immutable history plus private `attachments` metadata |
| Membership/project access | `memberships`, `project_assignments` |
| Server sessions | `sessions` with hashed token/CSRF, provider session link, revocation and expiry |
| Audit/idempotency/import evidence | `audit_events`, `command_receipts`, `migration_batches` |

JSON payloads deliberately preserve complete existing BOQ trees, planning proposals, immutable financial snapshots and workflow history during additive migration. They are not an excuse for arbitrary writes: before staging integration, server commands must validate the corresponding existing TypeScript schema, row version, status transition and related IDs. Subsequent normalized indexes/tables can be additive after actual access patterns are measured. No new task copies or historical baselines are created by this migration.

## Authentication and authorization contract

`memberships(company_id,user_id,role,active,finance_access)` uses only server-controlled assignments. Roles are `owner_admin`, `project_manager`, `accountant`, `site_staff`; membership starts inactive and finance access starts false. An owner does not receive finance access implicitly. Individual provider identities map to `auth.users`, not employee role labels or editable user metadata.

`sessions(token_hash,user_id,provider_session_id,company_id,csrf_hash,created_at,last_seen_at,expires_at,revoked_at,assurance)` is private. The server validates the provider identity and current session and establishes `auth.uid()` context plus transaction-local `azzora.session_token_hash` on the same transaction/connection used for each read. Never use a session-global setting on a pooled connection. Session creation, rotation, idle timeout and revocation commands belong to the authentication implementation; this migration does not grant session mutations to the application role.

The private `can_access` helper checks current membership, app expiry/revocation, exact hashed session context and current provider session existence. Owner/Accountant reads require `aal2`; finance additionally requires explicit finance access. PM and site staff must have an active matching project assignment. Accountant can read financial records and project identifiers but cannot read task/execution payloads; PM/site cannot read journal or other finance records. Unscoped party/department queries currently deny PM/site; a scoped identifier query is required before their UI can connect. No authenticated/anonymous browser role receives schema, table or function access. RLS is enabled on all 19 tables; the restricted `azzora_api` role receives scoped reads only. Helper functions use a fixed empty search path and explicit qualified relations, live in the private schema and have public execution revoked.

**Remaining security work:** restricted database login provisioning, trusted actor context, actual Supabase session/MFA integration, invitations/recovery/revocation, per-action approval grants, department/custody restrictions, read/export audit commands and hosted deny tests. Neither RLS preparation nor local stubs establish secure production multi-user access.

The SQL helper checks stored app-session assurance and absolute expiry. The trusted auth adapter must additionally revalidate current provider assurance/MFA factors and idle timeout on every request; a cached `aal2` field does not replace those checks. Snapshot SHA256 format is constrained but SQL does not recompute it: the adapter must hash and preserve canonical original bytes.

The SQL `owner_admin` role maps to either approved TS Owner or Admin grants. This single-role storage contract does not implement the TS multi-role/workspace/capability matrix. An explicit adapter with matching tests must reconcile the models before routes are enabled; no permission may be inferred by coercing unrelated role strings.

## Financial write contract and closed policy gate

No financial write RPC or table mutation grant is enabled by this first migration. This is intentional: business policies, real backend command validation and staging transactional acceptance are not approved/completed. `policy_approvals` has no seeded approvals; accounting periods default locked and accounts default inactive/nonpostable.

The eventual authoritative command must lock the affected canonical record(s), recheck live actor/policy/period, verify expected row versions, call the existing finance engine, and atomically persist document transitions + allocations + balanced journal + immutable snapshots + audit + command receipt. A unique `(company_id,idempotency_key)` receipt binds actor and request digest, and posting/source keys are unique. No write may be applied independently by the Manager and Accountant routes. Enabling this transaction is a later migration with executable staging tests, not a claim made by this foundation.

SQL rejects fractional, negative or two-sided journal lines and empty/unbalanced commits using deferred constraints. Journal admission requires an open matching period; line admission requires an active/postable account. An internal transaction ID requires all lines in the journal's creating transaction, preventing later balanced inserts from changing committed history. Journals, lines, allocations, snapshots, audit and command receipts reject update/delete. Reversals and new revisions are the correction route. Allocation amount/party/document-outstanding validation, concurrent locking, policy approval and document+posting atomic RPC remain mandatory before write grants.

## Private attachments

Metadata records a tenant-prefixed opaque key, linked canonical document, SHA256, allowed MIME/size and quarantine status. Only clean attachments with readable parent records are visible through the server role. No actual bucket or Storage policy is provisioned here. Before storage integration, create a private bucket only in approved staging, implement equivalent object policies/current-user checks, quarantine/scan/confirmed MIME, authenticated upload/download and explicit retention. Database backups do not replace object backups. Signed URLs are bearer access until expiry and must not be treated as immediately revocable sessions.

## Migration, verification and rollback

The filename was created using Supabase CLI **3.0.0** `migration new canonical_backend_foundation`, after inspecting CLI help. No CLI login, link, push, reset or cloud database call occurred. This migration is atomic (`BEGIN/COMMIT`) and additive to a new approved AZZORA schema. It must not be applied to the existing unrelated Hamdee projects. Applying twice intentionally fails instead of silently rewriting an incompatible existing schema.

Before application: preserve original browser bytes/checksum offline; rehearse only fictional/anonymized manifests; map IDs without rewriting accepted history; reconcile counts, parties, totals, outstanding balances and duplicate identifiers. Real import requires explicit consent and signed opening balances.

Rollback before cutover: roll back the failed transaction, or abandon an isolated staging database and return the applications to unchanged adapters. After any real cutover, stop writes, export a fresh backup and apply a reviewed forward repair or restore to a separate project with reconciliation; **do not drop the schema or reset browser data**. No destructive down migration is provided.

Local Docker client exists but its Linux daemon is not running; no `psql` server/client was available at initial inspection. PostgreSQL/Supabase runtime and advisor results must therefore be separately recorded by the coordinator's local SQL harness; this document does not claim those checks passed. Before staging release also run actual Supabase advisors, RLS role tests, provider revocation/MFA tests, Storage object tests, concurrent writes and complete workflows A–E. Staging and production remain blocked pending architecture/region/account approval and business policies.

## Documentation checked

- [Supabase changelog](https://supabase.com/changelog): inspected 4 November; November 10 TLS cipher removal requires modern TLS clients, and current PostgreSQL timezone fixes need to be considered when selecting a project version.
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): grants plus row scopes, private security helpers and denied direct writes.
- [Private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): per-request authorization for private files; public buckets bypass retrieval authorization.
- [Backups](https://supabase.com/docs/guides/platform/backups): document a separate object-body backup/restore drill.

