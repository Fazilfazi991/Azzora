# Shared Manager and Accounts staging — 4 November 2026

Individual identity and the core shared sales, purchasing, expense and accounting
journeys are implemented and verified against the approved fictional Supabase
project. **This is staging integration, not production accounting acceptance.**
Both existing live deployments and GitHub main remain unchanged.

## Source and environment

- Branch: `codex/azzora-shared-staging`.
- Tested application SHA: `6c838f9dcbcef8ac55c68bbdab18e5a575877d40`.
- Foundation/report base: `61a8a52e3712d3ee72b93d3163c8278346699ba5`.
- Domain/auth/UI checkpoint: `382c48b8e1d2a36c7c7c9193b28c908090be5254`.
- BFF/private-originals integration: `2ec4bc761a454e817dbded761827ffab688c622f`.
- Retry-stable creation IDs: `9cdcc4072666dcd2680879c2a5355ccd2700458b`.
- Local review prefix correction: `911f0df50e01a19da4fec7a71b2f05e48b377749`.
- Final responsive strip alignment (CSS only): `6c838f9dcbcef8ac55c68bbdab18e5a575877d40`.
- Supabase: `hkhomrrvxtcxnxvdlkoh`, Azzora Free, Singapore.
- Actual integration tests use genuine Supabase Auth, PostgreSQL and private
  Storage through the loopback HTTPS BFF, not a mocked cloud database.
- No new Vercel deployment or public staging client URL was created. The local
  harness uses a private test certificate. Hosted runtime acceptance remains a
  separate gate; the prepared `vercel.staging.json` was not applied anywhere.

## Implemented boundaries

Four distinct fictional identities represent Owner, Project Manager, Accountant
and Engineer. Owner and Accountant complete actual Supabase TOTP MFA. Sessions
are opaque Secure/HttpOnly/SameSite cookies; encrypted provider tokens and current
membership/workspace/project grants are checked server-side. No browser role
selector is trusted. Accountant retains its separate login and navigation.

Manager and Accounts materialize compatible views from one canonical company.
Typed commands reuse the existing quotation, commercial, procurement, financial
and approval validators. PostgreSQL atomically checks the company revision and
writes canonical records, immutable journals/snapshots, audit and an actor-bound
idempotency receipt. There is no arbitrary browser snapshot-save endpoint.
Conflicts preserve unconfirmed form content instead of silently overwriting it.

Private originals are company-scoped content-hash objects, with validated size,
MIME and signatures. Canonical document rows retain metadata, corrections,
supplier defaults and private pointers, not duplicated inline file bytes. Download
requires a current Accountant session. Saving a reviewed draft does not create a
journal. Paid AI is disabled; manual review, local PDF text and labelled prepared
synthetic suggestions remain distinguishable.

## Actual connected workflow results

| Journey | Verified outcome |
| --- | --- |
| Sales | PM customer/project → quotation → accepted snapshot/contract → issued invoice → Accountant receipt → shared Manager payment and reduced outstanding |
| Procurement | Supplier/request/RFQ/quote → three independent approvals → PO/delivery/bill → Accountant supplier payment → one linked Manager cost |
| Staff expense | Assigned Engineer submits; a different PM approves; neither action journals; Accountant explicitly records the trusted approved amount |
| Accountant | Separate genuine login/MFA, correct workspace, current sessions, restart persistence, actual provider refresh and logout rejection |
| Documents | New fictional image → private upload → editable review/default correction → draft; identical original hash on download; no draft journal |
| Actual Accounts forms | Custom ledger classification/create/reuse after refresh; Tax/Normal/Proforma itemized invoice drafts at AED 100 each; itemized purchase-bill draft at AED 75; journal and trial unchanged |
| Actual Manager forms | Customer modal saves before closing; permitted-project quotation creation; autosave survives reload; deliberate stale revision preserves unsaved content until explicit reload |
| Concurrency | Different simultaneous commands at one version return 200/409; identical simultaneous no-ID form requests return 200/200 with one generated record and one revision increment |
| Immutable history | Accepted quotation and issued-source snapshots retained; exactly one canonical record and journal for each invoice, receipt, bill, payment and approved expense source |

The initial accepted transaction fixture reached company version 32. Later UI
drafts and nonfinancial concurrency fixtures increment versions without changing
the reconciled transaction amounts. Recorded source evidence explicitly states
that original A/B per-command HTTP rows were overwritten during the resumed QA
run; it uses verified canonical current-state proof and does not invent a count.

For **1 January–4 November 2026**: revenue AED 1,000; cost of sales AED 175;
operating expenses AED 0; gross profit AED 825; net profit AED 825. As of
**4 November 2026**: receivables AED 750, payables AED 60, bank AED 100,135,
cash AED 0. Assets AED 100,885 equal liabilities AED 60 plus fictional opening
capital AED 100,000 plus current earnings AED 825. Trial Balance balances.
The opening capital is a labelled test fixture, not an approved business balance.

Invoice, P&L and Balance Sheet PDFs were downloaded from the actual BFF, rendered
with Poppler and visually inspected. A4 content, financial figures and explicit
fictional/non-tax warnings are readable without overlap.

## Regression evidence

| Check | Exact result |
| --- | --- |
| Full unit suite on tested SHA | 887/887, 62 files |
| Separate financial design fixture tests | 2/2 |
| Actual provider auth | 14/14 workflow groups, plus one actual token refresh |
| Provider account restriction | 3/3 reversible Engineer checks: valid session 200, provider ban rejects the same cookie 403, ban removed and independently verified |
| Existing core CRM browser | 66 recorded checks |
| Existing commercial browser | 129 |
| Existing operational browser | 136 |
| Existing workforce browser | 40 |
| Existing recovery browser | 25 |
| Existing quotation browser | 4 full desktop/mobile lifecycle journeys |
| Existing Accounts browser | 14 groups |
| Existing browser total | 414 recorded checks/groups, zero browser errors |
| Staging route browser coverage | 70 route/width checks: 20 Manager and 15 Accountant routes at desktop/mobile; no page overflow, missing form labels or access to the existing browser database key |
| Staging responsive coverage | 8/8 Manager/Accountant dashboard checks at 1440, 1024, 768 and 390px; 2/2 mobile navigation checks, visually reviewed |
| Staging UI workflows | 19 actual browser assertions; quotation save/autosave/conflict recovery, ledger creation/reuse, three invoice types, purchase draft, private original and reviewed draft |
| TypeScript / full source ESLint | Pass |
| Default build / staging-flag build | Both pass; upstream Zod comment-annotation warnings only |
| Cloud schema | 23/23 private tables have RLS; 15 public staging RPCs service-only |

The 414 browser checks mix individual checks and grouped journeys; they are not
presented as 414 individual assertions. Most legacy browser suites ran against
the working tree before the final freeze; the only subsequent source correction
there was the local review invoice-prefix fix, after which the unchanged affected
Accounts suite passed. Final units, typing, lint and builds were checked after
the CSS correction. Actual simultaneous shared writes were checked on clean
`911f0df50e01a19da4fec7a71b2f05e48b377749`; the sole subsequent application
change is the six-line responsive CSS rule. No blanket claim is made that
every prior browser suite was rerun after every documentation commit.

Safe detailed evidence is under `docs/integration-evidence/`: auth verification,
cloud migration receipts, default regression verification and the staging folder
with workflow/concurrency results, screenshots and rendered PDFs. Private
passwords, cookies, TOTP seeds and server keys remain ignored and uncommitted.
The final 70-route read-only sweep was rerun on clean `6c838f9`; its report
excludes the known local Vite WebSocket handshake from application error counts.
Source scans and both default/staging browser-bundle scans found no configured
server service key or session-encryption key in publishable files.

## Failures found and corrected

1. Successful void RPCs returned 204/empty bodies, causing a JSON parse 503 after
   valid authentication writes. The server client now handles empty success and
   has regressions for 204, empty 200 and invalid JSON.
2. Fixture initialization failed 42501 at the deferred journal balance check.
   Its invoker context ran after the command's definer context ended. Only this
   fully qualified, read-only trigger guard now runs as its owner with an empty
   search path and closed direct EXECUTE grants. Private schema access was not
   broadly granted; the real fixture transaction then succeeded.
3. Permission denials initially appeared as generic 400 validation errors. Typed
   permission errors now return 403; invalid amounts remain 400.
4. Actual existing Accounts forms omit creation IDs. The BFF now derives stable
   server IDs from company, actor and action key; identical parallel no-ID
   requests were verified to create one record. Existing-resource IDs are never
   invented. Initial failed UI evidence is retained.
5. The default local review adapter used DEMO IDs for all new invoices while the
   existing hosted contract and unchanged browser suite expected NOR/PRO/INV.
   The narrow local prefix correction passed the affected 14-group suite.
6. Global quotation creation needed explicit permitted-project selection, the
   legacy Manager Accountant Preview needed a staging guard, and individual
   email labels needed footer wrapping. These are staging-only refinements.

## Remaining gates and limitations

- Shared staging is not a full replacement for every legacy Manager editing
  route. Typed connected commands cover the tested customer/project/quotation,
  contract/invoice/payment, procurement, assignment and expense-approval flows.
  Other direct-mutation routes, including task/planning, roster administration,
  Manager document workflows and QA/handover edits, remain closed in staging
  until their explicit commands are integrated. Their default browser-local
  implementations remain intact and pass the existing regressions. A rendered
  navigation route is not evidence that all its staging edits are connected.
- Production user onboarding, verified business email/recovery, MFA recovery,
  account lifecycle administration and further revocation/tenant attack testing
  are still required. Current allowlisted identities are `.test` QA users.
  The reversible provider-ban test proves immediate rejection during the ban;
  it does not claim permanent JWT invalidation after the account is unbanned.
- Security Advisor reports leaked-password protection disabled (one warning,
  zero errors). No paid plan or auth setting was changed to conceal this.
- Shared staging uploads have no malware scanner or approved retention policy.
  Storage and PostgreSQL cannot commit atomically; failed/uncertain database
  commits can leave private orphan objects for controlled cleanup.
- Real data migration, deduplication/opening-balance reconciliation, backup and
  restore drills, recovery objectives and a production cutover/rollback rehearsal
  remain gates. Existing browser records were neither imported nor reset.
- VAT/TRN, revenue recognition, approval authority, real opening balances and
  historical cutover require owner-approved financial policy. Demo tax documents
  are not compliant legal invoices. Real posting remains disabled.
- The earlier live Blob-store 503 incident is not declared resolved by this new
  staging path. Production dependency/security and performance gates remain.
- SQL Editor application does not register CLI migration history. Reconcile that
  registry before future CLI migration pushes; never reset/replay blindly.

## Live boundary and rollback

Read-only Vercel alias checks and `git ls-remote` confirm:

| Existing target | Unchanged value |
| --- | --- |
| `azzora-seven.vercel.app` | `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp` |
| Accounts stable client-review alias | `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy` |
| GitHub main | `fd7754dfe0022f9b64bf875313bd9679cb0144eb` |

No push, merge, alias change, deployment, real financial record or paid AI call
was made. Rollback is to stop the isolated staging BFF and revoke staging access
if necessary, preserving all records/evidence. Revert application changes only
on the feature branch after review; do not delete schemas, reset worktrees or
remove immutable financial history. Existing deployments need no rollback.
