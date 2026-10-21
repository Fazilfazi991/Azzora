# Checkpoint 3 — production Accountant and accounting readiness

21 October 2026. This is an architecture proposal and release gate, not an implementation authorization. The hosted Accountant route is an in-memory/browser-local review. Vercel Deployment Protection controls access to the **preview site**; it does not authenticate users inside AZZORA or authorize financial actions.

## Reuse and proposed architecture

Keep the existing Vite application, Vercel project, domain, and pure finance calculation modules. The present `azzora-demo-v1` browser database remains a compatibility source for the demo; it is neither shared storage nor a security boundary. There is no existing AZZORA identity service, production API, or accounting database to reuse. A production candidate is Supabase Auth, Postgres, and private Storage, with narrow Vercel server functions for financial commands. This choice requires owner approval under B11, a data-processing/security review, and a cost estimate for expected users, files, traffic and retention. No service, account, or secret was provisioned in this checkpoint.

```text
Accountant browser → authenticated AZZORA API → role and policy checks
                                        ↓
                              Postgres transaction
                    documents + allocations + journals + audit
                                        ↓
                              private attachment storage
```

Each Accountant receives an individual identity. The API verifies a current session on every request, resolves current server-side membership and role, and checks permission against the requested entity and action. An owner should be able to revoke access and invalidate active sessions; recovery must use the identity provider's verified recovery flow. Session cookies should be Secure, HttpOnly, SameSite, short-lived or rotated, with CSRF protection for cookie-authenticated writes. Production policies must define inactivity timeout, MFA, and privileged-account recovery. The existing `src/accounting/permissions.ts` matrix is a proposal for review, not enforcement.

The browser never receives database service credentials. Every exposed Postgres table must use least-privilege grants and row-level security; role checks in the API remain necessary for workflow decisions. Supabase documents that exposed tables need both grants and RLS policies, and that its service role bypasses RLS, so the service credential belongs only in server-side secrets. Private financial attachments need per-file metadata, size/type validation, malware handling, signed short-lived access after permission checks, and an auditable download trail. This architecture follows [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Financial commands need one transaction per approved business event: validate document version and approver, write the canonical document transition, payment allocation and balanced journal, append actor/time/source audit, then commit or roll back as a unit. Unique posting/idempotency keys, foreign keys, immutable issued-document snapshots, period locks, and reversal entries prevent duplicate posting or silent history edits. Reports read posted journals and permission-filtered document views; P&L and Balance Sheet are unavailable for production claims until opening balances and policy are approved. Review access must never be inferred from a hidden navigation item or the demo label.

## Data cutover and verification

1. Inventory and export each owner's `azzora-demo-v1` data **with explicit consent**. Validate schema, preserve original bytes and a checksum, and identify duplicate parties, document references, allocations and attachments. Do not auto-import browser data on login.
2. Create a versioned staging import and read-only reconciliation report. Map customers, projects, invoices, purchase bills, receipts, expenses and immutable snapshots to canonical IDs. Separate legacy operational records from opening accounting entries.
3. Have owner and accountant approve cutover date, opening balances, outstanding AR/AP, VAT state, and exception list. Keep unmatched items in a review queue; never invent allocation or journal entries.
4. Run trial migrations, restore drills, permission-denial tests, concurrent posting tests, backup checks and statement reconciliation. Preserve an export/rollback path until written acceptance.
5. Cut over only under a separate production authorization. Freeze or explicitly dual-read legacy data during the transition, with one authoritative write path and signed reconciliation totals.

## Decisions blocking live accounting

The finance [decision register](DECISION-REGISTER.md) B01–B12 remains open. In particular, owner approval is needed for who may post/approve/reverse (B01), expense approval and self-approval exclusion (B02), accrual or cash basis and revenue recognition (B04), VAT/TRN and invoice treatment (B05), project cost allocation (B06), cash-holder scope (B07), proforma advances (B08), opening balances and AR/AP cutover (B10), identity/backend/storage (B11), and currency/FX (B12). These decisions must be translated into executable policy tests and accountant sign-off before any live posting, VAT report, P&L, or Balance Sheet.

## Cost and operations

Existing Vercel hosting can be reused; adding functions may introduce usage charges. The [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan) currently states a $20/month platform fee including one deploying seat and a $20 usage credit, with additional paid deploying seats and usage billed separately. [Supabase pricing](https://supabase.com/pricing) lists Pro from $25/month and usage-based/add-on charges; separate production/staging projects, storage, backup retention, compute and authentication volume can raise the total. These are published starting points, not a budget quote for AZZORA. Confirm residency, data-processing terms, backup objectives, expected attachment volume, and current invoices before purchase. Monitor spend, security events, failed postings, reconciliation exceptions and restore tests after launch.

Production stays blocked until the above controls are implemented, independently penetration/security reviewed, tested with multi-user concurrency and denial cases, reconciled to signed opening balances, and approved by the owner and accountant. The Checkpoint 3 preview does not meet these gates.
