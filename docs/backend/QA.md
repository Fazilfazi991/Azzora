# Independent backend foundation QA — 4 November 2026

Scope: isolated `codex/azzora-production-backend`, inherited baseline `02ab580db6acc45ef9aa4e84cef0ab85af8b48aa`. This is Gate 1 local preparation. It is not a completed production backend, hosted staging approval or live migration certificate.

## Executed checks

| Check | Actual result |
| --- | --- |
| New backend unit suites | **61/61 passed**, 3 files: auth/security40, command contracts11, migration10 |
| Full application TypeScript | Passed after coordinator corrected the in-progress `postJournal` result wrapper to `.state` in command reduction |
| Full `src` ESLint | Passed |
| Production dependency advisory check | npm registry bulk advisory endpoint checked **71 non-development lockfile packages**, returned `{}` advisories |
| All dependency advisory check | **307 package names** checked; **four moderate advisories across three development packages** (`minimatch`, `@vitest/mocker`, `vite`) returned |
| Existing application isolation | No diff from baseline in existing `src/accounts-review`, `src/domain`, `src/App.tsx`, `src/store.tsx`, `api`, `package.json`, `package-lock.json` or `vercel.json` |

The ordinary `npm audit` command was unavailable because npm is not on this environment's PATH. The successful registry bulk query is explicitly a production-lockfile advisory lookup, not a full npm audit, penetration test, supply-chain attestation or development-dependency clean bill. No packages were upgraded during this independent audit. Coordinator's full regression/build and local PostgreSQL-compatible harness results are separately recorded in the consolidated handoff.

Development advisory details: [minimatch glob amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249), [Vitest mock registration](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), [Vitest Windows redirect traversal](https://github.com/advisories/GHSA-xp26-3454-mjgp), [Vite fs.deny query bypass](https://github.com/advisories/GHSA-8g5g-mxqh-grgj). These are advisory counts, not npm's dependency-expanded vulnerability counts. Local dev servers must remain loopback-only; patch and rerun the applicable regression before staging development services are exposed. Package upgrades were left to the coordinator's controlled dependency task to avoid changing shared dependency installs concurrently.

## Findings and corrections

1. Source examination confirms Manager `Database` still writes browser localStorage and hosted Accounts still initializes per-session fictional finance. Neither application is connected to the new production interfaces. Do not claim shared production records from interface tests.
2. Command tests exercise a serialized **in-memory transaction test adapter**, not PostgreSQL network/concurrency semantics. They verify stale-version conflicts, exact actor-bound idempotent replay, revoked-membership rejection, audit rollback, policy gates and reuse of existing `postJournal`. A real durable transaction adapter and registered existing-workflow adapters are still missing.
3. SQL `owner_admin` maps to TS owner/admin grants. The mapping, explicit workspaces, capabilities and multi-role behavior require a reviewed server directory adapter. No default `finance_access -> finance.post` inference is permitted.
4. SQL RLS helper checks stored app-session assurance and provider-session presence. This does not by itself prove current MFA-factor assurance, inactivity policy or revocation race safety. `AccessDirectory` and same-transaction production adapter must supply current checks before routes are enabled. Present lack of client/write grants avoids presenting this incomplete adapter as an active security boundary.
5. Schema reviewer added missing operational entity types and finance scoping for credits/refunds, replaced fixed-scale `numeric` casts with integer checks to reject fractional fils, and added creating-transaction guards to prevent later inserts into committed journal history. Actual runtime SQL results belong to the coordinator's harness report; this independent review does not invent them.
6. Earlier Blob financial-write HTTP503 errors remain an **unidentified availability risk**. Current unchanged demo still uses whole-session ETag/CAS writes. New PostgreSQL contracts are not evidence those observed failures were diagnosed or repaired.
7. Migration test preparation initially treated repeated nested BOQ display numbers as document-reference collisions. The implementation now checks business-reference uniqueness only in canonical top-level document registers. All ten ordinary regression tests pass; no expected-failure markers were added.

## Workflow acceptance status

| Required staging journey | Status |
| --- | --- |
| A: Customer/project/quotation/invoice/receipt/ledger/reports | **Blocked** pending provisioned approved staging and shared persistence adapters |
| B: Supplier/PO/bill/payment/payables/reports | **Blocked** for same reason and posting-policy gates |
| C: Staff cash/expense/approval/ledger/project profitability | **Blocked** pending trusted assignments, segregation and transaction adapter |
| D: Individual Accountant login/reconciliation/statements | **Blocked** pending real identity/session/directory, MFA/recovery and durable company data |
| E: Upload/approved extraction/review/draft/explicit transaction | Existing demo preserved; **production journey blocked** pending private storage and canonical command integration |

No desktop/mobile browser acceptance was fabricated for these unconnected production interfaces. Existing UI was deliberately unchanged; prior demo screenshots/tests remain their historical evidence. Live provider identity, real RLS/Storage advisories, attachment authorization, backup/object restore, multi-user load and migration cutover all require subsequent isolated staging verification.

**Recommendation: NO-GO for production cutover.** The foundation is reviewable locally; provision only after architecture/region/account and applicable policy approvals. No cloud write, real-data import, paid AI request, push, deployment, alias change or production promotion was performed by this QA work.
