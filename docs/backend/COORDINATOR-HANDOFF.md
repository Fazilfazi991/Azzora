# Production backend preparation — coordinator handoff

4 November 2026. **Production NO-GO. Gate 1 decision package ready; Gates 2–5 not passed.**

## Source and preservation

- Integration worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-production-backend`.
- Branch: `codex/azzora-production-backend`.
- Inherited baseline: `02ab580db6acc45ef9aa4e84cef0ab85af8b48aa`, containing tested Accounts application `039869b2fa563fea457a35a775c8f34fdd15b540`.
- Frozen local source/test revision: **`5481ac0dddc595a5492c444af1b6db21fcafc649`**. This report/decision documentation follows without changing implementation.
- Reviewed contributions: `c12e6a7` offline migration/map; `520ae80` auth/security; `84071e2` separate draft permission; `c81bb0b` independent QA; `6985491` dependency findings plus schema foundation; `ccd4b3f` shared transaction contracts/SQL harness; `5481ac0` positive exactly-once posting test.

Parallel ownership covered database architecture, authentication/security, Manager/Accountant mapping, migration and independent QA. One shared integration worktree used disjoint files. One QA commit included the database agent's already-staged migration files; both agents reviewed/confirmed the complete content, and nothing was overwritten or cherry-picked twice. Subsequent commits were serialized.

No existing Manager/Accounts UI, business engine, demo API, dependency manifest/lockfile or Vercel configuration was changed. No push, main merge, cloud schema mutation, project creation, alias reassignment, deployment, real-record import or paid AI call occurred. The existing accepted applications and document histories are preserved. New backend source is not imported or exposed by a route.

## Architecture and infrastructure

Recommendation: existing Vercel frontends + one canonical PostgreSQL business database per environment, Supabase Auth and private Storage, per-application same-origin server boundaries sharing command/query contracts. Keep separate Accountant login/navigation and one authoritative financial posting engine. See [DECISION-REPORT.md](DECISION-REPORT.md) for region, costs, trust boundaries and the precise approvals required.

Read-only Supabase discovery found the same Hamdee organization through all connected accounts, with two unrelated Singapore projects; no identified AZZORA staging project. No unrelated project was reused. The owner subsequently signed into the in-app Supabase dashboard. Both browser-control runtimes failed initialization (`failed to write kernel assets`); the visible organization could not be independently read. The signed-in browser may be a different account. Organization identification remains pending; this is not proof the owner lacks a project.

The owner then identified `https://hkhomrrvxtcxnxvdlkoh.supabase.co` as the intended project. All three connected Supabase accounts returned **permission denied** for read-only project lookup. The target exists as an owner-supplied identifier, but its organization/region/billing/schema/data and environment purpose are not verified. Reconnect the Supabase integration using an account authorized for that project; no credentials should be pasted into chat. Do not provision a duplicate project or write migrations into the supplied target before inspection and Gate 1 approval.

## Progress by module

| Area | Local implementation completed | Still required before shared staging acceptance |
| --- | --- | --- |
| Canonical schema | CLI-generated additive migration; 19 private RLS tables; tenant foreign keys; existing text IDs and full payload retention | Apply only to dedicated approved staging, actual Supabase advisors, access/query mappings |
| Identity | Server token-verification adapter, opaque hashed sessions, CSRF/origin/expiry guards, current-grant/provider-session contracts | Real identity provider/session/directory adapters, invites, MFA enrollment/challenge/recovery, refresh, rate limiting and production login wiring |
| Permissions | Company/workspace/project checks, privileged MFA, explicit draft/post grants, no self-approval | Approved role/capability mapping, action limits, custody/department rules, actual backend denial and revocation-race tests |
| Shared command boundary | Transaction/idempotency/version/audit contract; existing `postJournal` reused; policy gate closed | Real PostgreSQL transaction adapter; typed existing-workflow adapters; atomic source/allocation/snapshot/journal writes |
| Customers/projects/departments | Canonical parties/projects/department tables and mapping | Manager asynchronous query/command integration, identifiers and directory scopes |
| Quotations/BOQ/contracts | Lossless payload/history storage contract, immutable snapshot table | Canonical lifecycle adapters and snapshot byte/hash verification; preserve approved histories |
| Sales/receipts | Single register + unique posting/source keys + allocation schema | Manager issue -> Accountant query -> receipt -> outstanding -> same journal/report demonstrated on staging |
| Procurement/purchases/payments | Canonical record types and finance scopes | PO/bill adapters, party/outstanding allocation checks and transactional supplier settlement |
| Workforce/documents/approvals | Operational record scopes, assignments and private attachment metadata | Existing workflow adapters, private object policies/upload/download/scan/retention and approval transactions |
| Gantt/QA/handover | Existing implementations untouched, planning/history retained by archive | Server validation/locking and live query integration; no duplicate tasks/baselines |
| Accounting/reports | Existing engine retained, SQL integer/balance/open-period/postable-account/history constraints | Signed accounting policies/opening balances, canonical reporting selectors, full reconciliation and load tests |
| Migration | Offline exact-original archive, checksum, counts, conflicts, source controls, rollback manifest | Canonical importer, attachment inventory/restore, trial cutover/reconciliation and separately authorized real migration |
| DeepSeek | Existing approved-document/review-only policy and current demo preserved | Approved production privacy/retention/exposure/accuracy controls and private canonical draft integration; no arbitrary-document activation |

The schema's JSON payload preservation is not a generic permission to accept arbitrary JSON writes. Command adapters must use existing typed validation, immutable transitions and approved source events. No registered production adapters, write RPC or public endpoint was enabled. SQL and TS permission models require an explicit tested directory mapping; missing mappings must deny.

## Exact executed verification

| Check | Actual outcome and limits |
| --- | --- |
| Frozen regression at `5481ac0` | **823/823 ordinary unit tests passed, 54 files**; inherited CRM/quotation/planning/finance tests included |
| New backend tests within total | **65/65**: authentication/security41, command-boundary14, offline migration10 |
| Local PostgreSQL schema | **23/23 checks passed** using isolated PGlite0.5.15 and synthetic auth stand-ins; not live Supabase Auth/Storage/concurrency proof |
| TypeScript | Passed |
| Full source ESLint | Passed |
| Combined Manager + Accountant production build | Passed; existing Zod PURE annotation warnings retained; no performance certification claimed |
| Production lockfile advisory lookup | 71 non-development packages queried against npm registry bulk endpoint; no advisories returned; not a full npm audit |
| Development advisory lookup | Four moderate advisories across minimatch, @vitest/mocker and Vite; exact advisory links in [QA.md](QA.md); no uncontrolled dependency upgrades |
| Existing application preservation | Existing Manager/Accounts/domain/API/package/hosting files have no diff from inherited baseline |

Local PostgreSQL checks exercise: private-schema denial, RLS on all tables, no direct application writes, company isolation, Manager/finance and assigned-project separation, wrong/revoked sessions/membership, stored MFA downgrade, immutable snapshots, idempotency uniqueness, positive balanced commit, empty/unbalanced rollback, fractional-fils rejection, locked/out-of-period rejection, inactive accounts, prohibition on later balanced line additions, immutable journals, cross-tenant foreign keys and quarantined attachment denial.

The first expanded SQL harness stopped because its rejection-message assertion expected `transaction|immutable` while SQL correctly returned `Cannot append lines to an already committed journal`. The assertion was corrected to that exact guard; no SQL weakening or expected-failure marker was introduced. TypeScript caught an in-progress coordinator integration using the `postJournal` result wrapper instead of its `.state`; this was fixed before the frozen regression. Independent review additionally corrected read-capability authorization of writes and mutable payload divergence before awaits, each with passing regressions.

The command concurrency/rollback tests use a serialized in-memory adapter. They verify the contract but do not establish real PostgreSQL multi-connection behavior. PGlite runs actual SQL with synthetic provider/session tables; it does not establish hosted token verification, current provider MFA or network behavior. New backend UI is not wired, so no staging screenshots/browser acceptance is claimed. Existing demo screenshots remain historical demo evidence.

## Workflow gates and unresolved risks

All requested new shared staging journeys A–E remain **not executed / blocked by unapproved, unprovisioned dedicated staging and missing durable application adapters**, not passed:

1. Sales: customer/project/quotation/invoice/receipt/ledger/reports.
2. Purchases: supplier/PO/bill/payment/payables/reports.
3. Project expense: staff custody/submission/separate approval/ledger/profitability.
4. Individual Accountant login/reconciliation/P&L/Balance Sheet.
5. Private upload/approved extraction/review/draft/explicit approved transaction.

Earlier intermittent Blob HTTP503 financial-write failures remain unexplained. Successful reruns and new transaction contracts are not a fix certificate. PostgreSQL can remove whole-session Blob from the eventual financial source of truth, but the replacement must pass contention/failure injection and must not be claimed to explain the old incident. No real DB/attachment backup restoration, security penetration test, hosted load measurement, immediate revocation race test or production reconciliation has passed in this checkpoint.

The new SQL read helper checks stored app assurance/provider-session existence, while the future server adapter must also prove current MFA/factors, idle policy and current capabilities on the same trusted transaction. Broadening mutation grants before that adapter exists is prohibited. Keep moderate development advisories as tracked work, with dev services loopback-only until patched and verified.

## Costs, approvals and next release gate

Published illustrative starting budget: Supabase Pro25USD/month + Vercel Pro20USD/month =45USD/month; a second Micro staging project in the same paid Supabase organization adds from10USD/month, giving55USD/month before usage/other services. Existing Vercel subscriptions may already cover hosting. Current organization invoices/plan and additional email/backup/PITR/AI costs are unverified; see cited sources and assumptions in the decision report. No purchase was made.

Gate 1 requires owner review of dedicated project/organization, region and cross-border processing, monthly budget, membership/role/MFA/recovery administrators, backup/retention targets and accounting-policy ownership/decisions. VAT/TRN, recognition, opening balances, approvals, project overheads, proforma advances and historical cutover remain business gates; demonstration fixtures are not approval evidence.

After Gate 1: provision only the authorized synthetic staging boundary, implement real adapters/private Storage/auth flows, integrate both existing apps, then execute A–E plus desktop/mobile/PDF/concurrent/security/restore checks and reconcile with accountant. Gate 4 requires owner/accountant staging acceptance. Gate 5 separately authorizes production cutover. **Do not promote, import real records or merge main from this checkpoint.**

Evidence: local ignored `tmp/frozen-unit.txt`, `tmp/schema-tests-final.txt`, `tmp/typecheck-final.txt`, `tmp/lint-final.txt`, `tmp/build-final.txt`; committed executable tests and [independent QA](QA.md), [schema](SCHEMA.md), [auth](AUTH.md), [migration](MIGRATION.md), [integration map](INTEGRATION-MAP.md). No uploaded actual supplier document, browser database, credential or paid AI result was copied into this branch's reports or tests.
