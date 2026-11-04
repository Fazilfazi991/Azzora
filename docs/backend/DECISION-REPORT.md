# AZZORA backend decision for owner review

4 November 2026. Gate 1 decision package; no paid provisioning, cloud mutations or real-data access authorized by this report.

## Recommended decision

Keep both accepted Vercel applications and their domain/calculation engines. Add one dedicated AZZORA Supabase PostgreSQL project per environment, Supabase Auth for individual identities and private Storage for originals. Use a same-origin Vercel backend-for-frontend for each application, sharing one canonical command/query implementation and database. Separate Accountant login/navigation remains; neither app maintains a second company ledger.

Local worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-production-backend`, branch `codex/azzora-production-backend`, inherited from `02ab580db6acc45ef9aa4e84cef0ab85af8b48aa` (tested existing application `039869b2fa563fea457a35a775c8f34fdd15b540`). The new backend files are not imported by either application or exposed by any API route. This is a prepared foundation, not a completed shared backend.

## Existing infrastructure verified

Read-only discovery through all three connected Supabase accounts returned the same organization, **Hamdee**, and two active Singapore projects (one personal project and HAMDEE DEMO). No identified AZZORA project was found. Those existing projects were not inspected for company data, linked, repurposed or modified. Owner must identify the intended organization or authorize a dedicated AZZORA project; access to another project's organization is not consent to use its data or resources. Current organization billing plan, spare paid capacity and invoices are unverified.

The current Manager production and Accounts client-review deployments are preserved. No Vercel configuration, domain, environment variable, alias, deployment, GitHub branch or production record was changed during this checkpoint.

**Owner-supplied target:** `https://hkhomrrvxtcxnxvdlkoh.supabase.co`. Read-only `get_project` against all three connected accounts returned permission denied. Its organization, region, plan, existing schema/data and staging-versus-production designation remain unverified. Do not create a replacement merely because connector permissions are missing. Reconnect the integration with project access, inspect metadata/security/schema without reading real business rows, then reconcile the approved environment choice. Signing into the in-app browser alone does not authorize the connector; both browser-control runtimes failed initialization in this session.

A later fresh worker restored a usable Chrome-control path (the existing chat's runtime remains broken). Chrome's signed-in **Book my meals** organization has three non-AZZORA projects; the supplied target explicitly returns **"You do not have access to this project."** Correct project-authorized sign-in/access is still required. No cloud setup, authentication change or data mutation occurred during that diagnosis.

## Residency and operational costs

Owner must choose an exact region after reviewing company/customer contractual requirements. Mumbai and Singapore are published options; neither means UAE data residency. The published region list does not show a UAE option. Region selection establishes primary-data location, not blanket compliance. Review Auth, backups, Storage, Vercel function execution/logs and AI processing together; current Accounts runtime evidence reports `iad1` and must not be represented as wholly regional processing. Align approved staging/function configuration only after the owner selects the residency boundary. [Supabase regions](https://supabase.com/docs/guides/platform/regions).

Published starting points checked 4 November 2026:

| Item | Budget basis, not an invoice/guaranteed total |
| --- | --- |
| Supabase Pro with one Micro project | From USD25/month, including USD10 compute credits |
| Additional Micro staging project in the same paid organization | From USD10/month additional compute; actual organization configuration matters |
| Vercel Pro | USD20/month platform fee including one deploying seat; existing paid hosting may already cover this |
| Illustrative new combined base | USD45/month for one Supabase project + Vercel Pro, or USD55/month including an additional Micro staging project |
| Variable/additional | Email delivery, object backup, storage/egress, extra seats, PITR, monitoring and AI usage require explicit budgets |

These estimates assume listed starting tiers, no additional usage/add-ons and one paid organization; they do not price a separate second Pro organization. Do not purchase or change a subscription from this report. Free projects pause after inactivity and have project limits; two projects already appear in the connected organization, whose plan is unknown. A free slot cannot be assumed. [Supabase pricing](https://supabase.com/pricing), [Vercel Pro pricing](https://vercel.com/docs/plans/pro-plan).

Supabase database backups do not include Storage object bodies. Approve separate encrypted object backup/retention and demonstrate a database-plus-files restoration. Proposed starting objectives for owner discussion: daily backup, 24-hour maximum data loss, restore within one business day; these are NOT implemented guarantees. More demanding objectives may require paid recovery options. [Backup scope](https://supabase.com/docs/guides/platform/backups).

## Security and implementation boundary

Individual provider identities, server-held opaque sessions, explicit current company/workspace grants, project assignments and privileged MFA replace demo identities. A browser role flag, user-editable metadata or hidden navigation grants no permission. Private SQL schema, least-privilege role, RLS and per-command checks form separate defenses. No privileged backend credential belongs in a Vite bundle. Details and missing durable adapters are in [AUTH.md](AUTH.md) and [SCHEMA.md](SCHEMA.md).

The migration prepares 19 private RLS-enabled tables. Financial writes remain ungranted; accounts default inactive/nonpostable, periods default locked and no policy approvals/opening balances are seeded. Existing `postJournal` remains the calculation authority; a shared transaction contract requires documents, journal, audit and idempotency receipt to commit together. Actual PostgreSQL transaction and application adapters are not implemented. Both current apps must continue their existing modes until these pass isolated staging tests.

Modern TLS clients are required. The current Supabase changelog announces removal of obsolete CBC TLS ciphers starting no earlier than 10 November 2026; modern Node/browser clients should be exercised on staging. This is a compatibility check, not a reason to weaken TLS. [Official notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).

## Migration and policy decisions

The offline rehearsal archives exact browser export bytes/checksum, collection counts, stable IDs, unknown additive histories and source financial controls; it detects conflicts without reading browser storage, importing or posting. Canonical mapping/import, attachment restoration and reconciliation of signed opening balances remain subsequent work. Preserve the original `azzora-demo-v1` key and all issued snapshots. No automatic upload/import on login. See [MIGRATION.md](MIGRATION.md).

Before live posting owner/accountant must close B01/B02/B04/B05/B06/B07/B08/B10/B12: posting and expense approval authority/no self-approval, accounting basis and revenue recognition, VAT/TRN/legal invoice treatment, project/overhead attribution, custody permissions, proforma advances, cutover/opening balances and supported currencies. B09 historical-PDF behavior and B03 broader extraction scope also need explicit decisions where used. Fictional demonstration rules are not approval evidence. The current document-specific DeepSeek consent remains limited to that document and review drafts; no new paid calls were made.

## Gate 1 approval requested after review

Approve the architecture and identify: (1) AZZORA organization/account owner, (2) exact data region and cross-border processing position, (3) dedicated synthetic-only staging project and maximum monthly budget, (4) named role/access administrators, session/MFA/recovery policy, (5) accounting-policy decision owner and signed decisions, and (6) backup/retention objectives. No credentials should be pasted into chat.

Approval to prepare local code does not authorize paid project provisioning, real-data migration, main merge or production cutover. Gate 2 verifies actual staging identity and shared records; Gate 3 verifies migration/security/concurrency/restore; Gate 4 is owner/accountant staging acceptance; Gate 5 separately authorizes production cutover.
