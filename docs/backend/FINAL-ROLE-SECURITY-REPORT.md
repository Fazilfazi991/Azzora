# Final shared staging — authentication, recovery and security

4 November 2026. These results concern the owner-approved **fictional** Supabase project `hkhomrrvxtcxnxvdlkoh` and the local HTTPS application at `https://127.0.0.1:5365`. They do not authorize production credentials, real company records, production financial posting or deployment. The existing Manager and Accounts live URLs were not changed by this work.

## Implemented boundary

The four existing individual fictional accounts use genuine Supabase password authentication. Owner and Accountant retain their verified TOTP factors and must reach `aal2`; Manager and Engineer use their scoped operational roles. Separate Manager and Accountant entry points remain intact. Opaque HttpOnly/Secure/SameSite cookies, server-side encrypted provider tokens, CSRF/origin checks, live membership/provider-session/MFA checks, idle/absolute expiry and revocation remain authoritative. Browser role flags and editable provider user metadata do not grant access.

Manual Owner-assisted recovery is deliberately restricted to these four fixtures. The Owner must supply a **new provider-verified TOTP code on each issuance**, in addition to an active privileged session and `access.manage` capability. The backend generates an official Supabase recovery token without invoking a recovery-email or invitation API, encrypts it and returns only a random one-time handoff code. Codes expire in ten minutes; pending recovery sessions expire in five minutes. Issuance is serialized and limited to five per Owner per rolling hour. Global and HMAC-derived TCP-peer quotas protect exchange; the local BFF overwrites the internal peer header rather than trusting the caller.

The target exchanges the handoff through the official provider verification API. Privileged targets must challenge their existing verified factor again; this flow cannot remove or replace lost MFA. Password changes use the official user API, then revoke target application sessions and request provider global sign-out. Both revocation boundaries are attempted even if one fails; partial completion is reported as unconfirmed. Success requires fresh sign-in, including MFA where applicable. Recovery records and audit events are private; no browser role can execute the service-only recovery RPCs.

## Exact verification

| Verification | Result | Evidence scope |
| --- | ---: | --- |
| Existing authentication tests | 11/11 | Controlled HTTP/store fixtures |
| Recovery HTTP/security tests | 12/12 | Controlled provider fixtures, including lost-MFA denial and revocation outage handling |
| Recovery PostgreSQL tests | 7/7 | Actual migration executed in local PostgreSQL/WASM with explicit managed-Auth stand-ins |
| Genuine recovery rehearsal | 12/12 | Actual local HTTPS BFF, actual Supabase Auth and staging RPCs |
| Direct API/role/security checks | 12/12 | Actual BFF, real authenticated provider JWT and Supabase APIs |
| Recovery UI | 4/4 | Both login entry points at 1440px and 390px; keyboard access, masking, return navigation, no overflow or page errors |

The 30 focused automated tests and 28 live/API/UI groups are different measurements; they are not combined into a fabricated assertion count. Four individual sessions were also renewed and verified, with genuine existing-factor MFA for Owner and Accountant. Scoped ESLint passed. Whole-application TypeScript results are coordinator-owned while parallel shared-file work completes.

The real password rehearsal changed **only the fictional Engineer's** password temporarily. It demonstrated: valid existing session; Staff denial of recovery issuance; actual fresh Owner TOTP; manual provider-token generation; wrong-workspace denial; official recovery-token verification; replay denial; password CSRF denial; actual password update/global logout; rejection of the old cookie and old password; successful new-password login. A `finally` restoration changed the fixture back to its original private password and verified a fresh original-password session. The private fixture-session file was updated only for Engineer. Other identities, MFA factors and business records were not changed.

| Boundary | Actual result |
| --- | --- |
| Missing or forged app cookie | HTTP401 |
| Manager cookie requesting Accounts data | HTTP403 |
| Accountant cookie requesting Manager data | HTTP403 |
| Staff requesting an Accounts attachment | HTTP403 before object lookup |
| Logout without CSRF / foreign-origin write | HTTP403; valid session remained usable |
| Real Accountant JWT calling service-only auth/recovery RPCs | HTTP403 |
| Private `azzora` schema through the Data API | HTTP406; schema not exposed |
| Real authenticated browser role listing private Storage objects | HTTP200 with an empty result under Storage authorization |

The last two checks prove closed API exposure and filtered listing. They are not a claim that this report tested every object upload/download or two-company row-isolation scenario. Coordinator-owned attachment/workflow evidence remains separate.

## Hosted schema receipt

Migration `20261104132914_staging_manual_recovery.sql` was generated by the Supabase CLI, rehearsed locally and applied once through the verified AZZORA SQL Editor. Reviewed source SHA256: `96a337dc0243ef8104ce7d3e159098423b1e87af3f0544f86c7a36f06212fe70`. The editor's complete contents were compared against the reviewed source, allowing only LF/CRLF differences, before Run. No provider settings, SMTP, redirects, billing, keys or managed Auth rows were edited through SQL.

Post-application catalog verification: **24 application tables / 24 with RLS**, eight recovery RPCs executable by the service role, zero executable by anonymous/authenticated browser roles, zero recovery rows before the rehearsal, and real financial posting/document processing flags both false. Later coordinator migrations may add tables/functions; this receipt describes the exact recovery-application checkpoint.

Safe evidence:

- [Migration receipt](evidence/recovery-migration-receipt.json) and [catalog screenshot](evidence/recovery-catalog-verified.png).
- [Actual recovery results](evidence/final-auth/recovery-live-results.json).
- [Direct security results](evidence/final-auth/security-denials-results.json).
- [Recovery UI results](evidence/recovery-ui/results.json), [desktop](evidence/recovery-ui/accountant-1440.png) and [mobile](evidence/recovery-ui/accountant-390.png).

No password, cookie, TOTP seed, provisioning QR, provider token or service credential is included. Raw fixture credentials remain in ignored local files. One supplemental lost-factor test initially matched the generic recovery `/verify` route to its factor-verification mock; the fixture was corrected to distinguish the official endpoints. No application security condition was relaxed.

## Dependency security snapshot

The read-only [registry audit](../security/DEPENDENCY-AUDIT-2026-11-04.json) submitted 308 public package names from the lockfile to npm's documented Bulk Advisory endpoint. At that snapshot it returned four distinct moderate advisories, all development-only, and zero production dependency advisory matches. This is advisory matching, not a complete exploitability/supply-chain certification or npm's transitive meta-vulnerability count.

- Vite 6.4.4: minimum nonaffected same-major version reported by the registry is 6.4.5.
- `@vitest/mocker` 4.1.11: both returned advisories are fixed at 4.1.12; update the compatible Vitest toolchain together.
- minimatch 3.1.5 and 10.2.6: the returned range has no nonaffected same-major version; minimum available is 11.0.1. Do not force a major-version override into old lint dependencies without compatibility tests. Prefer an upstream dependency update or explicitly tracked development-only risk.

This agent installed no packages and did not mutate the shared dependency junction or package files. Coordinator-owned remediation and a fresh post-change audit must be reported separately; the snapshot is retained as historical evidence.

## Remaining limits and production gate

Email recovery delivery, invitations, SMTP, recovery-mail templates, real-user identity proof and lost-MFA administration are **not verified or enabled**. Manual Owner handoff is a staging demonstration, not evidence of mailbox delivery. No delivery claims follow from a generated provider recovery token. The real password-change rehearsal covered Engineer; privileged recovery's repeated-factor requirement was exercised in controlled HTTP/PostgreSQL tests, while genuine privileged sign-in MFA was verified separately. This cycle did not change an Accountant/Owner password or remove a factor.

Production still needs approved recovery/identity policies, invitation and recovery-mail verification, privileged recovery acceptance, comprehensive independent security review and remaining business/migration/release gates. No production-readiness claim is made from these staging results.

Official references reviewed: [generate recovery links](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verify provider tokens](https://supabase.com/docs/reference/javascript/auth-verifyotp), [provider response transformation](https://github.com/supabase/auth-js/blob/master/src/lib/fetch.ts), [MFA](https://supabase.com/docs/guides/auth/auth-mfa), [npm audit endpoints](https://docs.npmjs.com/cli/v11/commands/npm-audit/).

## Final Manager authorization migration checkpoint

The reviewed `20261104134923_staging_manager_completion.sql` was applied once to the approved fictional staging project after a complete LF/CRLF-normalized editor/source comparison. Source SHA256: `9afd8f7156f20104b500e648380095ea74bca944a2a7730528f51c4c8f713f13`. The superseded draft was not executed.

Before/after verification preserved company version 66, 70 canonical records, six journals, 12 journal lines, four snapshots, two projects and their recorded hashes. Only the expected immutable allocation projection changed from zero to two rows; no new journal was created. All 24 application tables retained RLS, all 23 staging RPCs remained service-only, browser execution grants remained zero, financial policy approvals remained empty, and real financial posting/document processing stayed disabled.

Owner/Admin is explicitly a company administrator: a current genuine MFA2 Owner actor returned both own-company project IDs and zero foreign project IDs. Project Manager and Site Staff retain active assignment scope. Only Owner, Project Manager and Site Staff received the four reviewed operational capabilities; Accountant did not, and no role received `finance.post`. The reversal uniqueness index and deferred constraint trigger are installed; private trigger/projection helpers have no direct API, browser or service-role execution grants. Local coordinator tests cover an unassigned own-company Owner project, the corresponding denied Project Manager action and foreign-company exclusion; the hosted aggregate checks did not create foreign tenant records.

Evidence: [migration receipt](evidence/manager-completion-receipt.json), [post-migration screenshot](evidence/manager-completion-after.png), [role safeguards](evidence/manager-completion-role-security.png), and [current Owner scope](evidence/manager-completion-owner-scope.png).

## Final employee revocation acceptance

After Staff UI completion, an actual Owner `employee.status` command temporarily deactivated only the fictional Engineer. Six checks passed: the initial genuine session was valid, the Owner command succeeded, both the old session and Manager API were denied, the Owner restored Active status in an unconditional cleanup path, and reactivation did not resurrect the revoked session. A fresh individual Engineer login then succeeded. The last read immediately afterward reported company version 123; later independent workflow tests may legitimately increase it. No password, other identity status or MFA factor was changed. [Safe results](evidence/final-auth/employee-status-revocation.json).

## Default-mode compatibility regression after dependency patches

Nine existing browser suites passed against a separately started default-mode server at `http://127.0.0.1:5367`; the owned server was stopped afterward. These tests used fresh isolated browser contexts and an ephemeral generated local review password, paid AI disabled and the staging frontend flag disabled. Existing personal browser profiles and browser-local records were not read or modified.

| Existing suite | Actual result |
| --- | --- |
| Core CRM | 66 route/viewport checks passed |
| Commercial | 129 journey/responsive checks passed |
| Operational | 136 journey/responsive checks passed |
| Workforce | 40 checks passed |
| Recovery | 25 cases passed |
| Quotation | Passed desktop/mobile workflows, PDF downloads, print, lifecycle and persistence; script provides no numeric total |
| Accounts review | 14 grouped checks passed, zero page errors |
| Timeline independent | Passed approval rollback, reload, explicit baseline and incompatible-data export; script provides no numeric total |
| Timeline date positions | Passed approved-date geometry, calendar spans, milestones, typed dependencies and horizontal scrolling at Day/Week/Month; script provides no numeric total |

This is **410 explicitly numbered checks across six suites, plus three passing suites without numeric counts**; it is not an invented aggregate assertion count. All nine exited zero. [Runner results](evidence/final-legacy-browser/results.json) and per-suite logs provide exact output. This verifies local default-mode compatibility, not hosted production acceptance.

The distinct [post-remediation registry audit](../security/DEPENDENCY-AUDIT-POST-REMEDIATION-2026-11-04.json) checked the current lockfile after Vite 6.4.5 and Vitest/@vitest/mocker 4.1.12 updates: one remaining distinct moderate development-only minimatch advisory affecting two installed version entries; zero production advisory matches. The earlier four-advisory snapshot remains historical evidence.
