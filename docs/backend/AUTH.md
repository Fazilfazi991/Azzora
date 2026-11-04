# Individual authentication foundation — local Gate 1 preparation

4 November 2026. This is a tested server boundary and provider-verification adapter, **not a deployed individual-login system**. Existing Manager and Accountant demos, entry points and credentials remain unchanged. No approved AZZORA Supabase project exists in the connected inventory; no account, provider, secret, data or cloud configuration was created or modified.

## Implemented contracts

`src/backend/auth.ts` exchanges a provider-verified access token for a random 256-bit opaque AZZORA session. Only its SHA-256 hash and the independent CSRF hash are persisted. The provider access token is not stored. Cookies use `__Host-`, Secure, HttpOnly, SameSite=Strict and Path=/; financial responses must use the exported private/no-store headers. HTTPS, an explicit host allowlist, exact same-origin writes and per-session CSRF checks are mandatory. Duplicate/malformed cookies, idle/absolute/provider expiry, revoked sessions and atomic-touch revocation races deny access.

The identity provider, durable session store, access directory and mandatory security audit are injected. Audit failure during session creation revokes the new session before any cookie is returned. Logout revokes locally before contacting the provider so a provider outage cannot preserve that application session. Initial proposed defaults are 15-minute inactivity and 8-hour absolute expiry, additionally bounded by provider-token expiry; these are owner-review defaults, not approved production policy. There is no refresh-token persistence or renewal implementation yet: expiry requires sign-in again.

`auth-supabase.ts` verifies the exact token online with Supabase `/auth/v1/user` before inspecting its claims. It then checks the approved issuer, authenticated audience and role, user/subject match, non-anonymous identity, valid session UUID, issue/expiry and assurance fields. It uses only a publishable key; no service credential or user-editable metadata grants access. Network/429/5xx errors fail closed. This adapter was tested using controlled HTTP responses, not a real provisioned Supabase identity.

Every request rechecks provider-session validity and **current** company membership. The trusted directory adapter must confirm current session existence/revocation and current assurance/factors; stale signed JWT `aal2` is not sufficient after factor removal. It must fail closed if this cannot be proven. The actual database adapter, invite/recovery/MFA enrollment/challenge flow and revocation administration are still integration work after Gate 1.

## Roles and resource permissions

`permissions.ts` defines owner/admin, Project Manager, Accountant and Site Staff; SQL `owner_admin` maps to the appropriate owner/admin server grant. Neither Manager workspace access nor ownership silently grants Accountant workspace access. Current grants contain explicit workspace entitlement, assigned project IDs and action capabilities. No frontend-selected role or Supabase `user_metadata` is used.

- Privileged owner/admin/accountant access requires MFA `aal2`.
- Finance read/post requires explicit Accountant entitlement, an allowed role and the corresponding capability.
- Project reads/writes and project expenses require explicit project assignment, including owners; no global implicit bypass.
- Site Staff cannot write project administration or approve expenses solely through a capability flag.
- Expense approval requires a known different submitter and an allowed approver role.
- Posting capability is not inferred from `finance_access`. Owner-approved accounting policy must explicitly grant it.
- The command layer must recheck access **inside the same database transaction** as financial mutations; a preflight HTTP check alone does not eliminate revocation races.

SQL schema alignment: `azzora.memberships(company_id,user_id,role,active,finance_access)`, `project_assignments`, `sessions(token_hash,user_id,provider_session_id,company_id,csrf_hash,created_at,last_seen_at,expires_at,revoked_at,assurance)`. The directory must derive explicit capabilities from approved policy, never default all authenticated users to posting. Production tables remain private and RLS-protected; no generic browser/service-role database mutation route is implemented here.

## Verification and remaining acceptance

40 controlled unit tests cover origin/transport rejection, cookie hashing/duplication, membership/workspace/provider revocation, MFA enforcement, CSRF, expiry, atomic-touch rejection, audit failure and logout provider-outage behavior, company/project scope, self-approval, posting capability and online-token claim rejection. These are not live Supabase, RLS, penetration, MFA-device, recovery-mail or hosted browser evidence.

Before Gate 2: approve target organization/project/region and role policy; implement durable adapters and identity enrollment/recovery/MFA; enforce login throttling at the trusted ingress; add successful/denied command/access auditing; provision synthetic staging; run real user/role/revocation/CSRF/recovery/concurrency tests. Production must remain disabled until these checks and later migration/cutover gates pass. No claim of completed production authentication is made.

## Documentation reviewed

- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [JWT claims and validation](https://supabase.com/docs/guides/auth/jwt-fields)
- [Server-side authentication](https://supabase.com/docs/guides/auth/server-side)
- [Sessions and revocation](https://supabase.com/docs/guides/auth/sessions)
- [Changelog](https://supabase.com/changelog): reviewed 4 November 2026; upcoming 10 November legacy TLS cipher removal and server-framework adapter deprecation are noted. This implementation uses modern Node HTTPS and no deprecated framework adapter.
