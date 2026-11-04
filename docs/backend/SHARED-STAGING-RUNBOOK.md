# Individual login and shared fictional staging

This worktree is isolated from both existing live deployments. Do not use real
customer, supplier, banking or financial records here. Real financial posting and
real-document processing remain disabled by the immutable database scope marker.

## Local verification

Install the pinned dependencies with `npm ci`. Run `npm test`, `npm run lint`,
`npm run typecheck` and `npm run build`. PostgreSQL tests use the pinned PGlite
dependency, not an external temporary installation.

The ignored `.env.staging.local` contains server-only staging credentials and the
session encryption key. Never prefix these secrets with `VITE_`, commit them,
print them or copy them into a browser. Only the approved project URL is accepted
by the staging server configuration guard.

`node src/staging/dev-server.mjs` starts the loopback-only HTTPS QA harness at
`https://127.0.0.1:5361`. Its private test certificate resides in the existing
ignored local QA directory referenced by that script. The harness is for automated
local verification with a test certificate, not a hosted client link. No Windows
trust-store modification is necessary. Manager entry is `/index.html`; Accountant
entry is `/accountant.html`. `VITE_AZZORA_STAGING=1` selects the staging adapters.

The four fictional users are provisioned explicitly through supported Supabase
Auth Admin APIs. Their individual passwords and test TOTP seeds are in ignored
private QA files. They must not be used as client or production credentials.
Owner and Accountant require genuine TOTP MFA. Memberships, permitted workspaces,
capabilities and project assignments are server-owned and freshly checked.

The Owner initializes the explicitly fictional fixture once. There is no browser
database import, automatic legacy-data reset or automatic historical baseline.
The fixture's bank opening is fictional demonstration capital, not an approved
opening balance for AZZORA. Existing browser-local CRM data is untouched.

## Shared write contract

Manager and Accounts execute finite domain commands through the same staging BFF.
SQL commits the canonical records, immutable snapshots, balanced journals, audit
event and actor-bound idempotency receipt in one compare-and-swap transaction.
A conflicting revision is rejected; financial commands are not blindly retried.
A receipt replays an uncertain response without applying the action twice.

Accounting entries are fictional simulation only. VAT policy remains pending;
tax-bearing documents cannot be represented as legally compliant invoices. Paid
AI is disabled. Local selectable-PDF text, labelled prepared synthetic suggestions
and manual review remain separate statuses. Saving a document review never posts.

Originals use company-scoped content hashes in the private `azzora-private`
bucket. Downloads require a current Accountant session; no public file URLs are
issued. Object Storage and PostgreSQL do not share a transaction: an upload whose
database commit fails may leave a private orphan for later controlled cleanup.
Do not delete objects after an uncertain commit. Malware scanning and a formal
retention/deletion policy remain required before real documents are accepted.

## Separate hosted staging later

`vercel.staging.json` is a prepared configuration for a separate staging project.
It is not applied to the existing Manager or Accounts projects. A hosted staging
release requires a separately linked project, the server-only staging secrets,
`VITE_AZZORA_STAGING=1`, and exact HTTPS origin(s) in
`AZZORA_STAGING_ALLOWED_ORIGINS`. Never infer trusted origins from an incoming Host
header. Run genuine hosted login/MFA/session, uploads and transaction tests before
sharing that URL. Do not reassign either live alias or deploy to `main`.

The SQL Editor applied the reviewed migration files. This does not create CLI
migration-history rows; do not replay those CREATE statements with `db push` or
reset the project. Reconcile the migration registry deliberately before adopting
CLI-driven cloud migrations.
