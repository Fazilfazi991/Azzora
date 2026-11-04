# Final shared staging integration — coordinator handoff

Date: 4 November 2026. **Local/provider-backed staging integration: verified. Protected hosted publication: awaiting Owner approval. Production: NO-GO.**

## Source and isolation

- Branch: `codex/azzora-final-shared-staging`.
- Worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-final-shared-staging`.
- Final tested application/test/config/migration SHA: **`a6a4ccf9c7cc109d5f1687ce37390a7e0f8698c2`**.
- Source checkpoints: previous accepted application `6c838f9dcbcef8ac55c68bbdab18e5a575877d40`; base/report `3426d409b513a2ffdc5334b35c8223a3e53d8d30`; integrated workflows/recovery/security `88306ee0c84d337a1d8fe3a316ecdd424b3ae4af`; final history-export/status/accessibility correction `a6a4ccf9c7cc109d5f1687ce37390a7e0f8698c2`.
- Subsequent handoff commit contains documentation/evidence only. No push, main merge, Vercel deployment, alias reassignment, real import, invitation or paid AI call occurred.
- Only authorized Supabase project `hkhomrrvxtcxnxvdlkoh`, fictional company `11111111-1111-4111-8111-111111111111`, was used. Real financial posting and real document processing remain disabled; no `finance.post` grant or financial-policy approval was introduced.

Read-only final verification confirms unchanged:

| Existing target | Exact retained reference |
| --- | --- |
| Manager `azzora-seven.vercel.app` | `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp` |
| Accounts stable client demo | `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy` |
| GitHub main | `fd7754dfe0022f9b64bf875313bd9679cb0144eb` |

[Isolation receipt](evidence/final-live-isolation.json).

## Completed integration

All existing Manager save/decision routes were audited. Typed commands now cover workforce/assignment status, tasks/progress/evidence, schedule proposals/baselines, site operations, private documents/revisions, QA, handover, project/settings edits, variations, credits, procurement corrections, budgets and commercial closure. Remaining callbacks are explicit local-demo branches or the existing finite quotation compatibility adapter. Staging does not load/replace the browser-local database. Failed/unconfirmed saves retain form values, and quotation drafts have export/recovery controls.

Both portals share canonical documents, settlement records and **one existing journal engine**. Manager-origin invoices preserve source numbering and item values in Accounts. Newly created/draft Accountant-origin invoices retain their individual item descriptions, quantities and rates in Manager; approved historical invoices are not rewritten. Source units/details remain in the original Accounts document. Standalone Accountant bills appear in Manager's existing Supplier Bills area as read-only canonical records and one linked project cost, with no invented purchase-order/delivery history or duplicate journal. Their editing/issuance remains in Accounts; Manager's PO-based corrections do not imply a separate write path for these bills.

Financial corrections append exact reversals and retain original entries, allocations and snapshots. Credits require independent approval and cannot exceed unpaid balance. VAT-bearing issue, refundable credit balances/advances, policy changes and real posting stay explicitly blocked. Document review and Save Draft never post a financial transaction. Paid AI is disabled; local/prepared/manual document suggestions remain truthfully labelled.

No new CRM or accounting module was added. [Full Manager/Accountant coverage matrix](FINAL-FEATURE-COVERAGE.md), [Manager action audit](FINAL-MANAGER-WRITE-AUDIT.md).

## End-to-end and financial evidence

Actual individual logins accessed the application through local HTTPS `https://127.0.0.1:5365`, using the **real fictional Supabase backend**, not a mocked network. This is not a hosted Vercel acceptance claim.

| Boundary | Verified evidence |
| --- | --- |
| Browser→API | Authenticated create/edit/submit/review actions and expected policy/permission denials; forms stay open on failure |
| API→shared data | Current user/company/project checks; atomic expected-version commits and actor-bound action receipts |
| Shared data→response | Same invoice numbers/items, payments/open balances, supplier bills/costs, immutable history and source-linked journals |
| Response→browser | Actual staff/project/document/QA/handover journeys, cross-portal views, four-width screenshots and corrected cancellation/reversal labels |
| Backup→isolated restore | Authorized Owner export, denied PM export, matching business hashes/files and balanced restored statements |

Manager customer/project→accepted quotation→contract→issued invoice→Accountant receipt→shared outstanding/reports passed. Procurement request/RFQ/quote/order/delivery/bill/payment, independent approvals, credit, receipt/payment reversal and cancellation passed. Separate Accountant-origin two-item invoice and standalone bill projections were verified.

Actual concurrent **financial** receipts against a fresh AED100 invoice returned409/200 for competing AED70/AED60 writes. Only AED60 posted. The rejected AED70 retried at the fresh version was denied as an overpayment without any change. A winning-key replay made no second posting. Two simultaneous identical, ID-omitted AED10 receipts returned200/200 with the same generated ID and one receipt/journal/version increment. Both portals then showed AED30 open. Separate ledger races also proved200/409 and200/200 behavior without financial changes.

Final company version 139, P&L period 1 January–4 November 2026; balances as of 4 November 2026:

| Metric | AED |
| --- | ---: |
| Revenue | 2,000.00 |
| Cost of Sales | 205.00 |
| Operating Expenses | 0.00 |
| Gross Profit | 1,795.00 |
| Net Profit | 1,795.00 |
| Receivables | 1,680.00 |
| Payables | 90.00 |
| Bank / cash | 100,205.00 /0.00 |
| Trial Balance / Balance Sheet difference | 0.00 |

Historical as-of checks preserve balances before credits/cancellations. Physical SQL confirms original settlement allocations survive reversal. [Detailed financial evidence](FINAL-FINANCIAL-API-QA.md), [receipt race](../integration-evidence/staging/final-financial-receipt-race-results.json).

## Individual identity and security

| Role | Actual tested behavior |
| --- | --- |
| Owner/Admin | Genuine individual login/MFA2, company-wide own-company project scope, independent approval boundaries, private export and fresh-TOTP recovery issuance |
| Project Manager | Individual login, assigned-project scope, task/schedule/document/site/QA/handover decisions; Owner backup denied403 |
| Accountant | Genuine individual login/MFA2, separate workspace, shared invoices/bills/settlements/reports; Manager API denied403 |
| Site Engineer/Staff | Individual login, own assigned-task progress/private evidence and site/rectification submission; supervisory/financial/workspace restrictions enforced |

Actual security checks: 12 direct API/session/storage denials, 12 provider-backed recovery checks, 6 employee-status/revocation checks, and 4 recovery UI checks passed. Deactivation revoked the Engineer's old cookie; reactivation did not restore it; a fresh individual login succeeded. Temporary password/status changes were restored. Owner/Accountant passwords and MFA factors were not reset in this cycle. Privileged recovery's repeated-factor checks also pass controlled HTTP/PostgreSQL tests.

All 24 application tables retain RLS; 23 staging RPCs are service-only with zero browser execution grants. The private schema is not exposed to the Data API. Missing/forged sessions, cross-workspace requests, cross-origin/CSRF writes and unauthorized private file access were denied. Private downloads recheck current project permissions. Role authority is not derived from job title or editable user metadata. No real invitations/email were sent.

Recovery is explicit Owner-assisted one-time staging handoff; it is **not verified email recovery or lost-MFA administration**. Hosted client-address headers are stripped, and recovery uses a conservative shared limiter until a trusted hosted per-client signal is reviewed. [Role/security report](FINAL-ROLE-SECURITY-REPORT.md).

## Reliability, migration and recovery

Two exact-file, reviewed additive migrations completed the existing fictional staging schema. Before/after receipts preserved business hashes/counts; no cloud reset or production migration occurred. All seven migrations were applied again to an empty isolated PostgreSQL rehearsal. CLI migration-history registry reconciliation remains required before any automated `db push` pipeline; source receipts are not a reason to replay already-applied DDL.

The final Owner backup captured version 139 at15:00:33.371 UTC; PM export returned403. A fresh isolated PGlite restore completed15:00:40.286 UTC with 108 records, 20 journals/40 lines, 9 immutable snapshots, 6 allocations and 3 verified private originals. Source/restored logical business SHA256 matches:

`ae22b77427e9a1b1fe2d37e66756f57724b42ed3e8c27fb697ab366d5fd9b7c8`

Only top-level registry collation order/timestamp presentation is normalized; payload histories, BOQ/item arrays and original raw export hashes are retained. Bad/FK-invalid and duplicate restores roll back/reject. Original browser exports are preserved on malformed/incompatible migration input; no automatic historical baseline is created. [Recovery rehearsal](FINAL-RECOVERY-REHEARSAL.md).

Structured server errors record only request ID, stage, safe code/status and elapsed time. Historical diagnostics were investigated, not hidden:

- PostgreSQL JSONB object-key order invalidated old schedule fingerprints: fixed canonical serialization; old proposals require explicit recalculation, without schedule/history rewrite.
- VAT issue safely rejected with generic400: corrected to explicit423 using the same draft and no posting.
- Staff offered a supervisory QA assignment: API correctly denied403; UI now reserves assignment for PM.
- Final export rejected an inline original inside an immutable history snapshot: narrowly accept it only when ID/MIME/size/SHA match an existing private original; retain exact history bytes and reject tampering/current inline uploads. Final export/restore then passed.
- Cancelled document badges still read Issued, and Owner recovery summary hid behind sidebar: corrected presentation only; exact date/PDF/mobile checks passed.
- Idle15-minute sessions caused expected401s; only the required fictional identity was renewed. No failed write was presented as saved.

## Exact final verification

| Check | Result |
| --- | --- |
| Full Vitest on final SHA | **962/962**, 75 files, 0 failed |
| Financial fixture tests | **2/2** |
| TypeScript / ESLint | Passed |
| Default and shared-staging production builds | Both passed; existing default bundle-size warning retained |
| Legacy browser compatibility | **9/9 suites**, 410 explicitly numbered checks plus three passing unnumbered suites; final frozen SHA, 0 failures |
| Actual nonfinancial shared workflows | **26 recorded assertions** |
| Authenticated routes | **64** passed on 88306ee checkpoint; final scope changes tested separately |
| Four-width shared layouts | **8 workspace×width checks** at 1440/1024/768/390; 2 mobile navigation checks |
| Final correction/recovery browser/PDF delta | **7/7** on final SHA |
| Actual role/recovery/revocation/UI checks | **12 + 12 + 6 + 4 passed**; do not add these to unit count |
| Actual final export/isolated restore | Passed, version 139 |
| Final source/build credential matching | 68 source files and 58 built files, 0 matches to configured private credentials; no secret/dependency/build folder committed |

The detailed financial report retains 51 initial status/check entries including the resolved diagnostic; these are not falsely counted as independent unit tests. The source audit covers all listed actions, while browser CRUD is representative rather than every possible route/action permutation. [Browser evidence](../integration-evidence/final-shared-staging/final-nonfinancial-browser-verification.json), [legacy evidence](evidence/frozen-a6a4-legacy-browser/results.json).

The coordinator visually inspected actual desktop/mobile planning, documents, handover, recovery, cancellations/reversals and Accounts screenshots, plus rendered invoice, issued credit, P&L and Balance Sheet PDFs. Screenshots and PDFs use fictional records. The initial 64-route/eight-width matrix was at88306ee; the only subsequent UI changes are the seven scoped checks on a6a4ccf9. No application changes follow the final frozen SHA.

Dependency remediation pinned Vite 6.4.5/Vitest 4.1.12 using an independent installation; other worktrees' dependencies were preserved. Registry review finds **zero production advisory matches** and one remaining moderate **development-only minimatch** advisory affecting two version entries. A forced incompatible major override was not applied. This is advisory matching, not a penetration-test certification. [Post-remediation audit](../security/DEPENDENCY-AUDIT-POST-REMEDIATION-2026-11-04.json).

## Hosted readiness and remaining approvals

The concrete [protected deployment proposal](PROTECTED-STAGING-DEPLOYMENT-PLAN.md) specifies a **new dedicated `azzora-shared-staging` project**, Preview only, Node 24/Singapore, separate Preview secrets, new staging encryption key, exact project/origin checks, private storage, Vercel Authentication and Owner-controlled client access. Build preflight rejects wrong database/project, production, missing approval, old shared-login secrets and paid-AI configuration. No deployment ID or new hosted URL exists yet.

**Owner publication approval is required by this assignment before creating/publishing that protected candidate.** After approval, hosted packaging, branch-origin availability, protection/share access, secure sessions, uploads, private files, recovery, PDFs and complete cross-portal workflows must be verified on its exact deployment. No production/stable alias changes are part of that approval.

The [eight-row policy decision sheet](FINAL-BUSINESS-POLICY-DECISIONS.md) requires Owner/Accountant decisions on VAT/TRN, posting authority, expense approvals, opening balances, customer advances, project costs, revenue recognition and migration/cutover. Also required before real use: real-user onboarding/recovery/MFA acceptance, verified mailbox delivery, independent security acceptance, full infrastructure/offsite/PITR backup and recovery objectives, approved source migration/reconciliation, hosted acceptance and explicit production cutover authorization. Business export is plaintext and excludes Auth/security infrastructure; it is not a production backup service.

Known preserved behavior: dashboard phase-weighted progress and duration-weighted planning progress are separate metrics. Sparse fictional projects may show different values; no approved dashboard formula was silently changed. Accountant-origin bills are read-only in Manager and edited in their existing Accounts route. Paid AI and real tax/posting remain blocked.

**Recommendation: GO for Owner approval to publish protected fictional staging and then perform hosted acceptance. NO-GO for real accounting, production cutover, main merge or replacing either existing stable deployment.**
