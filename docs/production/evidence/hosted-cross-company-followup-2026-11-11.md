# Hosted fictional cross-company follow-up — 11 November 2026

Scope: protected Preview application `93ab132b7d6d3a6e13773b71a6c276a7daa6f585`, fictional staging project `hkhomrrvxtcxnxvdlkoh`, not production. Test credentials, session cookies and identity secrets were excluded from this record. The temporary Company B grant expires 12 November 2026 at 07:43:38 UTC. Company A and B are fictional fixtures.

## Reverse-direction financial visibility and reconciliation

The Company B Manager issued a zero-VAT fictional AED 100 invoice; its Accountant recorded one AED 25 fictional receipt. Authenticated B snapshot showed that invoice and receipt, with AED 75 outstanding. Compared with B's preceding snapshot, receivables increased AED 75 and bank increased AED 25; B Trial Balance and Balance Sheet were balanced.

The authenticated Company A Accountant snapshot contained neither Company B invoice nor receipt. Company A financial metrics were unchanged. Earlier testing had shown Company B could not see Company A invoices and receipts. These checks cover BFF snapshots; they do not by themselves prove every report field or every table is tenant-safe.

## Foreign invoice mutation denial

Each Accountant submitted a uniquely keyed fictional receipt against the other company's known invoice. Both operations returned HTTP 400. Subsequent snapshots showed both company versions, all exposed financial metrics, and receipt counts unchanged. Neither request created a receipt. These are BFF checks using the Accountant role; they do not establish every possible operation or role.

## Direct provider exposure checks

Using the Supabase publishable key and a Company B Manager provider access token, unauthenticated `staging_auth_grant` returned 401, authenticated `staging_auth_grant` returned 403, authenticated `staging_company_read` returned 403, and a direct `azzora` schema REST request returned 406. The authenticated Storage bucket-list endpoint returned 200 with an empty list; it is accurately recorded as an empty result, not a denied request. This confirms these specific exposed endpoints do not yield the targeted data for the tested identities. It is not a full RLS audit, a privileged-role test, nor a direct test of every Storage policy.

A follow-up provider matrix passed for all eight authenticated A/B Owner, Manager, Accountant and Engineer identities. Owner and Accountant access tokens were verified at AAL2 after TOTP; Manager and Engineer tokens were AAL1. Each token received HTTP 403 from both tested privileged RPCs and HTTP 406 when requesting the private `azzora` schema. Each bucket-list request returned HTTP 200 with zero visible buckets. This expands endpoint exposure coverage to privileged roles but does not test every underlying row-level policy, direct object path or SQL role.

## Mobile browser and local policy follow-up

Direct protected-preview Chrome at 390 px passed Manager and Accountant login, Accountant TOTP, refresh, and ten routes: Manager dashboard, customers, projects, quotations and accounts; Accountant dashboard, invoices, bills, receipts and P&L. No page exceptions were observed. This pass did not test logout. Full-page screenshot inspection showed Accountant P&L readable; Manager Accounts recent-invoices columns are narrow on mobile, long fictional references wrap heavily, and right-side columns lie beyond the initial viewport. Screenshots are retained in ignored `tmp/launch-independent-qa/direct-mobile-followup/`.

An independent local test invocation covering candidate production runtime, authentication and financial policy completed 32 test files and 568 tests successfully. These are local isolated tests, not evidence that live production database permissions were applied or verified.

## Hosted role and session matrix

All eight fictional Company A and B Owner, Manager, Accountant and Site Engineer identities passed direct protected-preview BFF checks. Owner and Accountant sessions remained unauthenticated until their TOTP challenges completed. For each identity, the selected authorized workspace returned 200, the other workspace returned 403, logout returned 200, and replay of that same revoked session returned 401. Anonymous session lookup returned 401. This matrix tests immediate revocation, not time-based expiry. The hosted clock and session expiration settings were not altered; absolute/provider expiry has isolated unit coverage only.

A subsequent hosted idle-expiry check created a fresh fictional Company B Manager session and confirmed HTTP 200. A transaction guarded by exact staging project/environment, company/user and a unique recent-session predicate changed only that session's last-seen timestamp to 16 minutes earlier. The original cookie then returned HTTP 401 against the hosted session endpoint. This exercises the actual 15-minute idle-expiry check using a simulated lapse; it does not prove natural passage, absolute session expiry or provider token expiry. No clock, MFA factor, business data, production setting or other session was changed.

An attempted direct hosted RLS query set a fresh fictional Company B Accountant session context, then attempted `SET LOCAL ROLE azzora_api` before selecting own versus foreign rows. The SQL Editor database role rejected the role switch with SQLSTATE 42501. The transaction therefore produced no RLS row-query result and no direct hosted RLS pass is claimed. No role grants were changed. Earlier direct REST private-schema/RPC denial and application-level cross-company checks remain separate evidence.

Further read-only privilege inspection on hosted PostgreSQL 17 showed RLS enabled on `azzora.records`; `authenticated` has no `USAGE` on schema `azzora`, and neither `authenticated` nor `anon` has `SELECT` on `azzora.records`. The SQL Editor session role is a member of `azzora_api`, but has neither inherited role privileges nor the `SET` option, explaining the role-switch failure. These metadata checks do not execute the underlying RLS predicates.

All eight A/B provider identity tokens subsequently requested the exact Storage object key for the known fictional B original previously retrieved through the authorized BFF. Each direct request returned HTTP 400; the B Accountant response carried structured Storage status 404. No original bytes were returned. This confirms direct-access denial for this tested object and identity set, not all Storage objects or policies.

Each of the same eight role identities also attempted three direct provider mutations: a privileged `staging_company_commit` RPC, a POST to the non-exposed `azzora.records` schema, and upload of a one-pixel fictional PNG to a newly generated unique Storage object path. Owner and Accountant provider tokens were MFA-elevated. Every commit RPC returned 403, every table POST returned 406, and every Storage upload returned 400. No object upload succeeded. These checks cover the tested external entry points; they do not execute private `azzora_api` row predicates.

## Diagnostic logging privacy check

After a separately authorized fictional-only staging performance diagnostic had been removed and its function restored, one actual phase-log event was examined in memory with its Query and raw JSON sections expanded. The event included the SQL statement with parameter placeholders and parameter names. Checks found no 64-hex hash, JWT-shaped string, quoted 64-hex value, credential keys or known fictional fixture text in that event. This is a limited single-event check, not proof that all diagnostic logs or all types of sensitive values were absent. PostgreSQL `log_min_error_statement=ERROR` can include the statement for LOG messages, so this diagnostic must not be used for real data without an independently verified logging/privacy design.

## Isolated private-table RLS test

One integration test passed against an in-memory PGlite database using the actual staging migration policies and the restricted `azzora_api` role. It ran 160 assertions across eight fictional A/B Owner, Manager, Accountant and Site Staff identities. It checked own and foreign invoice, task, expense, receipt, supplier-payment, party, account and balanced-journal visibility; finance access was limited to Owner/Accountant, and Manager/Staff task access required their fixture assignment. INSERT, UPDATE and DELETE attempts were rejected and party counts remained unchanged for all eight identities. TypeScript and scoped ESLint passed. This does not establish hosted private-table RLS or production RLS: it used an isolated local database and fictional users, not live credentials or hosted role grants.

Company B's Manager and Accountant also completed a direct Chrome 390 px login and refresh test (Accountant with TOTP), with five routes per role and no page exceptions. Together with the previous Company A mobile pass, this covers 20 route visits across four mobile role sessions. Screenshot inspection confirms the hosted pre-fix Manager invoice table has narrow columns; the separate local correction was tested but not deployed. Mobile screenshots in the ignored `tmp/launch-independent-qa/company-b-mobile-followup/` contain fictional fixtures and were not committed.

No production records, deployment, real posting settings or live aliases were changed. The staged tests used uniquely keyed fictional records. Combined with previous BFF private-file and project-denial tests, these results extend but do not complete the full security acceptance matrix.
