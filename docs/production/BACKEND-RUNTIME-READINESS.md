# Production runtime/Auth wiring — backend agent

## Journal projection performance preparation

The reviewed seedless production migration now caches the existing canonical journal projection within the same company-row-locked transaction, invalidating the cache after a journal insertion. Authorization, immutability, idempotency and the hard disabled financial-posting gate are unchanged. An isolated synthetic SQL-contract benchmark of 898 records and 72 existing journals reduced projection calls from 72 to one and measured 1,977 ms versus 249 ms in one local run; hosted performance is not established by this measurement. No production migration or write was performed. New journal insertion remains blocked by the existing production policy gate, so future changes to activate posting require renewed duplicate/new-journal, concurrency and authorization acceptance before release.

Date:11 November2026. Status: source implemented and isolated tests pass; real-company activation remains disabled. No live deployment, cloud migration, production connection, real invitation or paid call was performed.

## Implemented

- `productionRuntime` pins the owner-created free Singapore database `zwjiztnsxenluqybxhhz`/`ap-southeast-1`; requires explicit company identity, infrastructure approval reference, a separate candidate Vercel project, exact candidate HTTPS origins and distinct production credentials/session encryption. Copied staging configuration, the fictional company, existing live project/hosts, paid AI and posting flags are rejected.
- Every candidate request checks the service-only database `azzora_runtime_identity` contract against project/company/region/project-ID/approval/origins, private bucket, installed backend contract and disabled flags. Missing/mismatched proof fails before authentication or writes. The transport maps compatibility command names only to the finite `azzora_production_*` RPC namespace; no stage database/function fallback.
- The existing Auth/BFF is reused. Production uses its own host-only Secure/HttpOnly/SameSite cookie, exact company and workspace checks, live Supabase token verification, current server-resolved membership, privileged MFA, refresh, CSRF, revocation and logout. Staging emails, the exact former review user and client-review authentication policies cannot obtain a production session. Staging assisted recovery is disabled in production rather than presented as verified email recovery.
- Canonical hydration now preserves the explicit environment and constructs no temporary seed state. Production metadata uses `__production_metadata`; mixed/wrong metadata is rejected. Empty company first access returns409, with no fixtures, balances or first-login bootstrap.
- Manager and Accounts private file adapters are explicitly injected from the candidate project; the same validators/private bucket are reused. No default staging storage can be selected when constructing a production handler.
- An empty, correctly configured production-mode company can be read; an authorized incomplete manual document review can be saved through the real command boundary with zero journals. Financial commands remain423; automatic external document processing remains423; production legal PDFs and production business-backup adapter remain explicit blocked gates.
- `api/production.ts`, candidate-only Vercel config (Singapore), and build preflight prepare reviewable publication without promoting production or changing live aliases. Internal generated IDs in production omit the legacy STG marker. No second journal engine was created.

## Verification

-318/318 tests,29files: `vitest run src/staging src/backend --maxWorkers=2`.
-Latest identity/error-map delta:20/20 tests in runtime/server files passed afterward.
-Production Auth tests cover individual MFA challenge/verification, separate cookie, session/logout/revocation, foreign company/review-ID rejection and disabled staging recovery.
-Production handler tests cover no fixture bootstrap, wrong metadata503, zero-balance snapshot/manual draft/no posting, and blocked finance/AI/PDF writes. Transport/identity/config tests cover exact project, region, service namespace, credentials, origins, schema and disabled activation.
-TypeScript passed. Scoped ESLint passed after unused fixture arguments were corrected. The coordinator must rerun combined tests after integration.

Dependency: finance commit `0b9ec82eb4b72bbabc4fa7831fb8009751f47cb8` (copied locally as66b21d9) supplies production-mode domain/policy/empty-state types. The separate production SQL migration from migration agent supplies the actual mapped RPCs; this runtime does not invent their readiness.

## Still blocked / truthful handoff

-Owner deferred business details, so there are no approved real posting rules, legal invoice/VAT policy, opening balances or cutover receipt. No real finance activation is implemented by an environment switch; activating it requires a reviewed SQL/policy/context release and separate owner/accountant acceptance.
-Company onboarding/role/invitation list, verified SMTP/password-recovery and mailbox delivery require actual approval and hosted acceptance. The candidate blocks the old staging recovery flow.
-Production legal PDF presentation and production UI copy must be reviewed against approved policy; the current compatible frontend contains fictional/staging labels. Do not describe it as a released real-accounting workspace.
-Production business-backup streaming adapter, infrastructure/Auth/Storage recovery and agreed retention objectives need their own verified integration. The existing fictional export is deliberately not mislabeled as production backup.
-Cloud contract migration, private bucket setup, secure candidate secrets and real hosted tests have not been run by this agent. Free-tier provisioning does not itself prove backup, permanence, retention or availability requirements.

All independently executable changes use existing architecture and preserve staging behavior. Existing Manager/Accounts live aliases and GitHub main are untouched.

## Encrypted capture and import-review adapter follow-up

The production business-backup HTTP adapter is now wired to the separately tested explicit production archive and AES-256-GCM encryption module. It requires current Owner MFA/access.manage and a distinct server-only 32-byte base64url `AZZORA_PRODUCTION_BACKUP_KEY` plus `AZZORA_PRODUCTION_BACKUP_KEY_ID`. Missing keys fail closed; there is no plaintext production response or staging/session-key fallback. This resolves the business-backup adapter source gap above, not the still-pending infrastructure/Auth recovery and hosted rehearsal gates.

`POST /manager/import/preview` accepts an authorized Owner's bounded synthetic rehearsal package and returns only hashes, controls, counts and issues. It persists nothing, does not echo source rows or original content, and cannot initialize a company, import records or post finances. Real-company packages remain423 pending migration approval and verified backup; durable approved import/cutover is not claimed by this endpoint.

Follow-up verification:24/24 tests across runtime-production, production encrypted capture/isolated restore and existing staging backup passed. TypeScript and scoped ESLint passed. Tests cover encrypted export/decryption/production-format validation, non-owner denial, missing adapter, version-zero preview, no source echo, foreign-company/real-import rejection and no canonical commits. Requires migration commits2c66b01790f6163f7068e28aea57d911cc34e1a1 and3e11c22eed39182bdf253c99094a9149f279408a; the latter makes reviewed SQL source checksums portable across CRLF/LF checkouts without changing business-archive hashes.
