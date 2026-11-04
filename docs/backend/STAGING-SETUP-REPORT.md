# AZZORA fictional Supabase staging setup

4 November 2026. Owner explicitly approved using the existing project for **fictional-data staging**, with real financial posting disabled and no changes to the live Manager or Accounts deployments.

**Infrastructure established; production NO-GO.** Individual login, shared application records and end-to-end staging journeys remain integration work. This report is not a certificate of production accounting readiness.

## Target and source

| Boundary | Verified value |
| --- | --- |
| Supabase organization | Azzora, `kyhishmkityakkdcyhzk`, Free |
| Project | Azzora, `hkhomrrvxtcxnxvdlkoh` |
| Region/compute | Singapore `ap-southeast-1`, Nano |
| Project URL | https://supabase.com/dashboard/project/hkhomrrvxtcxnxvdlkoh |
| Runtime scope | Immutable database marker `synthetic-staging` |
| Branch/worktree | `codex/azzora-production-backend`, `C:/Users/USER/Desktop/Projects/Azzora/azzora-production-backend` |
| Tested local source/test SHA | `75f4b9db829b2ef546c83945fc1cea6f5c98b37a` |
| Applied migration source checkpoint | `f32ed90524ad46f5e0a8604528beff5e5e10068c` |

The dashboard default branch label remains main/PRODUCTION; owner authorization and the explicit immutable staging marker establish the intended fictional-only use. No provider project rename, paid upgrade or real-data migration was performed.

## Applied setup

1. `20261104081228_canonical_backend_foundation.sql`, SHA256 `c83dd4bdf6e5159af1a49757e85e29199021ecdb6e2e5e3a717e6b28ad607770`. Exact reviewed content was applied through the signed-in dashboard SQL Editor. Success observed **11:35:43 UTC**. It created 19 private RLS-enabled canonical tables, 37 foreign keys, immutable-history guards, journal-balance/period/account/integer-fils constraints and scoped read policies. Public/anonymous/authenticated roles receive no schema/table/function access; the no-login application role has no direct writes.
2. `20261104113610_synthetic_staging_boundary.sql`, SHA256 `d03adb84322210dbe38edb2bd2b55c00b78c57a2f151305664a15dfb285de104`. Success observed **11:41:15 UTC**. It adds two private RLS-enabled metadata tables, immutable scope/evidence guards and the private originals bucket.

Final application schema: **21 tables, all 21 RLS-enabled**. The environment marker sets `real_financial_posting_enabled=false` and `real_document_processing_enabled=false`; constraints and immutable guards prevent toggling that marker through ordinary edits. No posting-policy approvals, open accounting periods, active financial accounts or financial write RPCs were seeded. Admin access is not a substitute for an approved application write path.

Bucket `azzora-private` is **private**, limited to **2 MiB**, and permits only PDF/PNG/JPEG. Storage objects retain RLS with no permissive browser-applicable object policies. No files were uploaded. Private bucket configuration is infrastructure evidence; authenticated upload/download, quarantine scanning and expiry/revocation still need application integration and real roundtrip tests.

The SQL Editor was used because the existing connector accounts lack this project's permissions and the original chat's browser runtime fails initialization. A fresh browser worker accessed the owner-corrected Chrome session. Every target URL and exact editor source was verified before execution. The editor's static RLS scanner did not recognize the migration's dynamic RLS loop; the reviewed file was preserved and actual catalog RLS verified immediately afterward. No browser HTTPS/security barrier, identity check or application policy was bypassed.

## Verification results

| Check | Result |
| --- | --- |
| Full regression on frozen `75f4b9d` | **823/823 ordinary tests, 54 files, passed** |
| Backend unit suites within total | **65/65 passed**, auth/security41, command14, offline migration10 |
| TypeScript / full source ESLint | Passed, exit0 |
| Combined Manager + Accountant build | Passed, exit0; existing annotation warnings retained |
| Local PostgreSQL/WASM schema/integrity checks | **28/28 passed**, including source attestation idempotency/immutability |
| Local revised SQL-admin simulation | All 15 proof groups passed under a non-superuser CREATEROLE admin with the same initial role options as hosted Supabase; exact membership snapshot restored |
| Actual hosted guarded proof | Revised exact 15-assertion script completed without SQL errors and reached the post-ROLLBACK membership receipt |
| Hosted rollback membership receipt | 1 existing grant, 1 original admin-only grant, **0 persisted SET/INHERIT grants** |
| Independent hosted post-rollback state | 21/21 RLS, company/document/journal/policy/file counts0, both real-processing flagsfalse |
| Security Advisor | **0 errors, 0 warnings, 10 informational RLS-without-policy notices** for intentionally inaccessible internal tables |

The dashboard displays only the final statement result: **individual 15-check rows and their intermediate count were not captured**. The evidence is exact source verification, error-free completion of every fail-on-error guard, the final rollback receipt and independent subsequent database checks. Do not present this as a screenshot showing 15 individual result rows. No guard was skipped or assertion weakened.

The first hosted proof failed honestly with SQLSTATE42501: the managed SQL Editor administrator had ADMIN OPTION for `azzora_api` but SET=false. It was explicitly rolled back; independent checks showed no remaining fixtures. The revised proof temporarily enables role switching **to the SQL test administrator inside BEGIN/ROLLBACK**, after confirming existing ADMIN-only membership. The restricted API role receives no added privileges. After all checks the complete transaction rolls back; the original Supabase-admin grant and options are independently confirmed unchanged. Initial failure evidence is preserved and is not counted as a pass. Revised script SHA256: `0cbf5a0cfd50ddefc24e3227308abcaa075620a7491187c26520711e23aaac48`.

The proof checks actual browser-role SELECT/INSERT denials, application-role zero visibility without identity, readonly grants, history-trigger behavior using a temporary probe, journal guard metadata, closed policy gates, exact staging scope and private bucket/Storage-policy metadata. It does not create managed Auth users/sessions or claim genuine login/MFA, cross-user sharing, attachment roundtrips, provider revocation or cloud multi-connection posting concurrency.

## Provenance and migration history

Both applied files are versioned locally. The separate reviewed `supabase/attestations/20261104_staging_applied_files.sql` records exact file hashes, source Git SHA, project and SQL Editor execution method in a private append-only registry. Its own SHA256 is `c28d4412eeb0ab3182b79dbc92b4f2eaab0f24cd9bcf549ddaa3505a9b4b1159`. Cloud registration results are recorded in the final machine evidence after verification.

Registration succeeded: **two exact source attestations**, recorded at **11:50:08.636221 UTC**. Independent final state at **11:50:33.072967 UTC** confirms 21/21 RLS, both real flagsfalse, companies/records/journals/policy approvals/bucket objects0, original admin-only role grant unchanged and two matching provenance rows. [Committed machine receipt](evidence/staging-setup-2026-11-04.json) distinguishes the completed guarded script from uncaptured individual result rows.

**SQL Editor does not populate Supabase CLI migration history.** `supabase_migrations` was not manually modified. The private evidence registry is provenance, not a replacement migration engine. Before the first future CLI push, reconcile exact remote schema/policies/grants/triggers and source hashes, perform reviewed migration-history repair only for already-proven versions, then run list and dry-run. Never replay CREATE SCHEMA blindly or reset this project. See [STAGING-RUNBOOK.md](STAGING-RUNBOOK.md).

## Preserved applications and costs

- Manager `azzora-seven.vercel.app` remains READY on `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`, source `fd7754dfe0022f9b64bf875313bd9679cb0144eb`.
- Accounts stable alias remains READY on `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy` (existing latest review Preview).
- GitHub main remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`. No push, merge, rebuild/deploy, Vercel environment/configuration or alias change occurred.
- Existing Manager/Accounts application/domain/API/package/hosting source has no diff from the tested application baseline. Browser records and immutable quotation/invoice histories were not read or imported.
- Existing Supabase Free project reused; no paid project, subscription upgrade, AI request, real financial posting or real document processing was enabled. Future production pricing remains a separate budget decision; the Free tier is not a backup or uptime guarantee.

## What remains before Gate 2 and production

The existing applications are **not connected to this staging database yet**. Next work is durable identity/session/directory adapters, individual invited users and genuine MFA/recovery, least-privilege server connection setup, one transactional canonical command implementation, typed existing-workflow adapters, scoped shared queries, private file handlers and an isolated application Preview. No privileged key belongs in browser code.

Then run real staged workflows A–E, multi-user permission/revocation/concurrency tests, document/PDF/mobile tests, shared-record reconciliation and migration/restore rehearsals. The earlier demo Blob HTTP503 cause remains unexplained; this new database foundation does not retroactively fix or explain it. Four moderate development dependency advisories remain tracked in [QA.md](QA.md); no unrelated dependency mutation was introduced.

VAT/TRN, recognition, opening balances, approval authority, custody, overhead allocation, proforma advances, currency and historical cutover decisions remain pending owner/accountant approval. Fictional-staging authorization does not approve real posting, real migration or production cutover. Backup and object restoration have not been demonstrated on this Free project. Gates 2–5 are incomplete; **production remains NO-GO**.

Evidence is recorded outside source/private data: dashboard SQL application records and screenshots under `C:/Users/USER/Desktop/Projects/Azzora/supabase-*`; local test logs under ignored `tmp/staging-*`. The final machine evidence includes exact timestamps/hashes, receipt limitations and preserved deployment IDs. No password, API key, authentication cookie, original financial document or real customer row is included.
