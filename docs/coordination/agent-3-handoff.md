# COORD-A3-01 — Independent review and combined regression gate

**Acknowledged: 14 October 2026, Asia/Dubai. Agent 3.**

QA delivery acknowledged at `11da92566fe5bbb524e36a3128937756ce506204`, whose implementation parent is `7b9c26d03146a58dd5d602e37c708abf0c148d60`. I accept the read-only application-code review assignment and exclusive ownership of this handoff file. Only this file was created for this assignment. No feature source, other coordination file, branch integration, push, deployment or backend work was performed.

**Final combined regression has not run.** At inspection, `codex/azzora-integration` remained at `ada782a21232b3072850889e3796c3bc5c8d5dd4`; neither completed feature implementation was present there. Evidence review and source inspection below must not be interpreted as a passing integrated build or a verified defect fix.

## 1. Inspected provenance

| Delivery | Exact commit | Implementation parent | Common foundation |
| --- | --- | --- | --- |
| Agent 1 operational | `8b7992156a2f97e6f8d9d38b98a4b120ad2793a9` | `26eb5002ed826acd5101bf138dacdabf662a6210` | `ada782a21232b3072850889e3796c3bc5c8d5dd4` |
| Agent 2 workforce | `dd220dfaca1e0f072d84c5895e8a8c0639345297` | `06b1ad206c94c7ad154c05ff4e5b079c2e1ada50` | Same |
| Agent 3 QA | `11da92566fe5bbb524e36a3128937756ce506204` | `7b9c26d03146a58dd5d602e37c708abf0c148d60` | Same |

Commit identities, ancestry, tracked paths and source were read with Git, rather than inferred from filenames or chat statements. Each delivery commit records documentation/evidence after its implementation parent. This review does not replay those implementations.

### Agent 1 evidence

- Tracked `docs/operational-validation.json` agrees with `docs/OPERATIONAL-COMPLETION-REPORT.md`: **141 passing unit tests**, zero failed/skipped, across five files: domain 13, quotation 23, commercial 51, commercial PDF 4, operations 50. That is the original 90 plus 50 operations tests plus one PDF regression.
- Independently parsed the currently available local raw `docs/operational-evidence/unit-results.json`: 141 passed, zero failed/pending, five `testResults` files with those same counts. Its `numTotalTestSuites=16` is the runner's suite grouping, not 16 source files.
- Local raw operational browser results contain **128/128 passed checks**, four requested widths and empty errors; boundary results contain **18/18 passed checks** and empty errors. Local commercial results contain **129 checks**, commercial boundaries 6, and quotation results four width journeys with no failures. These agree with the tracked summary. The 66 legacy route checks and four BOQ widths are also reported; they are not separate independent confirmation of the same functionality.
- Tracked sample evidence is **16 PNG screenshots and 2 PDFs**, not all raw captures. The full raw operational JSON/fixtures are Git-ignored and presently available in Agent 1's worktree. They will not appear in a fresh clone of the delivery commit.
- Source shows operational boundary tests read `docs/operational-evidence/qa-data-1440.json` produced by the operational journey and import application modules through Vite. They must follow the journey and run on a development server, not a static production preview.
- Recorded build warning: main chunk 585.22 kB minified / 162.63 kB gzip. Treat as the author's recorded build outcome, not an independent build measurement from this review.

### Agent 2 evidence

- Tracked automated summary reports **118 passed / zero failed**, five files, including **28 workforce cases** plus the shared 90. The report agrees; no detailed raw Vitest per-case JSON is committed with this summary, so the 118 is a recorded aggregate, not a newly executed count.
- Independently parsed tracked `docs/workforce-evidence/browser-results.json`: **40/40 `passed:true` checks**, empty errors, recorded target `http://127.0.0.1:5177`, timestamp `2026-10-14T03:40:16.494Z` (07:40:16 Dubai). Breakdown: 12 initial workflow checks, 20 screen/viewport checks, four revision-drawer viewport checks and four final keyboard/completion/validation/storage checks. **The full workflow is not repeated four times**; the four-width component is the responsive portion.
- Tracked delivery JSON has **66 route/viewport observations**, all `overflow:false`, empty errors, plus a recorded complete delivery journey. The legacy sweep uses six sizes including 1280 and 430, while the workforce-specific sweep uses the four requested sizes.
- Exactly **24 PNGs** are committed: five screens plus revision drawer at four widths. No workforce PDF samples are committed.
- The report's final browser target is a production preview on 5177. Source confirms `AZZORA_TEST_URL` selects the workforce browser target and its updated delivery script. Source/report agree that commercial, quotation, App, dashboard, workspace and global styles are unchanged by Agent 2.

### Evidence limits and counts

The recorded counts are internally consistent. Operational raw artifacts and workforce tracked JSON do **not** contain a full tested source SHA or build-asset hash manifest. Timestamps, worktree paths, report ancestry and matching source provide useful provenance, but do not prove that every run used byte-identical contents of the final commit. This is an evidence-binding gap, not evidence of falsification. Existing screenshots/PDF-review claims remain the authors' verification; this assignment did not independently re-render their PDFs or visually certify every feature screen.

Do not add 141 + 118 + 102. They share the original 90 tests. Before new combined tests or intentional inventory changes, retaining both feature additions and the QA additions suggests **181 cases in seven files: 179 ordinary cases and two current `it.fails` cases**. This is a reconciliation expectation, not a measured integrated count or a quota. Once A3-005/A3-006 are repaired and promoted, the same inventory would be 181 ordinary cases. Report actual discovered cases, documented edits and expected failures separately.

Agent 3's own delivery remains **100 ordinary passes + two expected failures**, rather than 102 successful feature tests. Its independent browser diagnostic observations are not release assertions yet.

## 2. Applicability of the ten open baseline defects

Statuses in this section are **source assessment / recorded evidence**, not newly verified runtime outcomes. None is closed by this handoff.

| ID | Agent 1 operational source | Agent 2 workforce source | Required combined verdict |
| --- | --- | --- | --- |
| A3-001 dialog accessible names | Shared Modal unchanged from baseline | Adds `useId`, `aria-labelledby` and matching heading ID; recorded workforce browser test explicitly checks Add Employee's accessible name | Candidate addressed, with narrow recorded evidence. Rerun Quick Add, customer/project nesting and every new modal/drawer at four widths before closing globally. |
| A3-002 interior padding discards draft | Baseline click-target handler retained | Same `target === currentTarget` dismissal remains | Still applicable by source; test interior padding and real backdrop separately. |
| A3-005 negative VAT discount allocation | `invoiceTotals` retains the unsafe “last row absorbs remainder” algorithm. Operations `price()` delegates to it; discounted variations also use it | Commercial calculations byte-identical to baseline | Still applicable by source. Test invoices and delegated discounted variation pricing; existing fractional supplier-bill safeguards do not establish an invoice fix. |
| A3-006 incomplete persisted operational shape | Loader's explicit shape checks are unchanged, but `initializeCommercial` now calls `initializeOperations`, whose `db.people.forEach` will throw for missing `people` during loading | Loader still omits `people` checks; commercial migration unchanged | Exact missing-people test may now pass incidentally through an earlier throw on the operations path. Verify protected fallback/no write/raw export in browser. Expand to every required collection and malformed relationships; do not call incidental throwing a complete schema fix. |
| A3-007 hidden mobile sidebar focus | No inert/hidden/focus/Escape guard added in shell; relevant mobile CSS unchanged | App/global styles byte-identical to baseline | Still applicable by source; physical off-screen focus must be rejected by strict keyboard assertions. |
| A3-008 whitespace-only site update | Existing direct site form mutation remains; no equivalent trim guard added | `saveSiteUpdate` rejects `!completed.trim()`; recorded workforce unit test explicitly supplies one space and expects rejection | Candidate addressed in workforce command, with recorded unit evidence. Verify the combined UI calls that command and no alternate quick-add/project path bypasses it. |
| A3-009 opener focus after closing | Baseline effect cleanup retained | Cleanup still only calls `dialog.close()`; no opener capture/restore | Still applicable by source. New Tab containment does not test or repair return focus. |
| A3-010 nested Escape discards parent wizard | Baseline cancel handler retained | Still `onCancel={onClose}` without event isolation | Still applicable by source; explicitly test the nested customer dialog, not only standalone Escape. |
| A3-011 warning contrast | Relevant warning colors unchanged despite other stylesheet edits | Global stylesheet unchanged | Still applicable by source. Recompute actual final foreground/background; retain approved palette while meeting 4.5:1 for small text. |
| A3-013 sticky header obscures invalid task field | Relevant modal/drawer CSS unchanged | Global CSS unchanged; TaskDrawer adds inline error but native required-name validation remains; workforce-scoped CSS has no modal scroll correction | Still applicable by source. Measure focused-invalid-field/header bounds after submitting at all widths. |

The three delivered QA fixes also need preservation: A3-003 configurable browser URLs, A3-004 independent evidence-directory creation and A3-012 attachment removal during reading. Both feature commits still have the old uploads component. `tests/browser.mjs` has a genuine Agent 2/3 integration conflict: retain workforce-aware transitions **and** isolated URL selection. Do not resolve by replacing either complete file.

The held dialog patch is not a safe blind apply over Agent 2's new Modal: it duplicates the already added title ID and may conflict with manual Tab trapping. Integrate only the remaining behavior deliberately, then validate parent/child event handling and focus loops. Preserve the confirmation content-wrapper correction.

## 3. Semantic integration risks to resolve before freezing

1. **Two document write/review APIs:** Agent 1's `DocumentControl` / `saveControlledDocument` / approval inbox uses `reviewState` and central `operations.approvals`; workforce commands use `status` Draft/Pending/Rejected/Approved and history. Decide one authoritative workflow and explicit mapping for legacy/central inbox records. Approving through either UI must update the same latest-family readiness, pending-inbox and commercial-closure results. Never leave two independently mutable states for one decision.
2. **Two employee APIs:** Agent 1's employee form/settings additions and workforce's employee/assignment commands overlap semantically. Keep stable IDs, historical actors, department/code/capacity validation, inactive assignment guards, project manager pointers and approver reassignment. Preserve optional operations demo roles without bypassing workforce validation.
3. **Two handover policies:** Operational `handoverState` excludes manual Commercial items; workforce adds required derived document/site/QA items to its version of the selector. Combine both deliberately. `completeProject` must retain workforce actor/reason validation and Agent 1's optional financial-blocking policy. Commercial closure must remain distinct from operational completion.
4. **Shared models/repository/migrations:** Six feature paths overlap: Handover, Operations, Team, domain logic/model/repository. Reconcile additive optional fields and command signatures; retain validated workforce mutations and all financial relations/snapshots. Derived `operational-*` checklist rows must not be persisted as manual flags.
5. **Approval and document convergence:** Agent 1 commercial closure examines latest documents of all categories and central pending approvals; workforce operational readiness considers a defined category subset plus independently approved site updates. Record that policy explicitly and test excluded categories, obsolete pending reviews, resubmissions and category changes.
6. **Harness contracts:** Operational uses `AZZORA_URL`; workforce uses `AZZORA_TEST_URL`; quotation uses `QUOTATION_URL`; old boundary/BOQ scripts hard-code 5173. Retain QA URL fixes and workforce transition updates; set all three variables to the same server for the final gate. New features also increase route/Quick Add/search coverage beyond the baseline audit's 29 routes.

## 4. Exact consolidated regression gate

### G0 — Composition and evidence binding (Coordinator → Agent 3)

Precondition: Coordinator provides one immutable **combined SHA**, composed from both finished feature implementations and intended QA fixes, with the overlaps above resolved. No QA certificate against a single feature branch. Coordinator owns feature composition; Agent 3 does not merge or copy implementations during this review.

Before each final run, record full SHA, relevant dirty-file diff (or clean-source assertion), dependency lock hash, Node/browser versions, test clock/timezone, commands, exit codes, target URL, start/end times and output hashes. Bind the running dev root to the integration worktree; bind production preview to a build created from that SHA. Use an unused strict port and fresh browser contexts, never a persistent user profile. Fresh evidence folders must prevent stale files from satisfying fixture prerequisites. Keep manifest/run output outside committed application source; attach its hashes to the final QA report. Any subsequent source fix invalidates the affected gate and requires a new frozen SHA.

### G1 — Inventory, static checks and builds

1. Reconcile all original 90 tests, Agent 1's 51 additions, Agent 2's 28 additions and QA's 12 cases, including parametric counts. Do not suppress checks or remove workflow assertions to make integration green. Document intentional changes to legacy handover expectations.
2. Run TypeScript, ESLint, full Vitest JSON report and production build. Capture counts per file and ordinary/expected/skipped/todo separately; unexpected failures or skipped required coverage fail the gate.
3. A3-005/A3-006: when a fix is composed, convert `it.fails` to ordinary assertions. If they now unexpectedly pass under `.fails`, promote them and rerun; do not restore bad behavior or delete the tests. If either requirement still fails, retain an explicit open P1 and withhold final passing certification.
4. Compare the integrated bundle to both recorded branch sizes; record actual chunk warnings and document expected on-demand document/PDF loading. Build success alone does not establish acceptable large-data performance.

### G2 — Existing and feature-specific scripts on the combined dev server

Run the following from the integration worktree **after G0**, using the merged harnesses. Port 5193 is an example; choose another unused port if needed. These commands were not executed for COORD-A3-01.

```powershell
# Terminal 1; strictPort failure must not silently select another server.
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5193 --strictPort
# Terminal 2, same frozen source and worktree:
$env:AZZORA_URL='http://127.0.0.1:5193'
$env:AZZORA_TEST_URL=$env:AZZORA_URL
$env:QUOTATION_URL=$env:AZZORA_URL
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src
node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=tmp/integration-qa/unit-results.json
node node_modules/vite/bin/vite.js build
node tests/browser.mjs
node tests/commercial-browser.mjs
node tests/commercial-boundaries.mjs
node tests/quotation-browser.mjs
node tests/boq-visual.mjs
node tests/workforce-browser.mjs
node tests/operational-browser.mjs
# Mandatory order: operational-browser created the current run's fixture.
node tests/operational-boundaries.mjs
$env:QA_PHASE='final'
node tests/agent-3-audit.mjs
node tests/agent-3-interactions.mjs
node tests/agent-3-upload.mjs
```

Create `tmp/integration-qa` before the report command. Assert all required scripts exist on the combined tree first. The QA interaction script currently reports remaining defects diagnostically; **zero exit status is insufficient**. Promote all resolved diagnostic cases into strict assertions, require zero `knownDefects`, and inspect observations/results. The old baseline upload/site script may require explicit active actor selection in the new form: adapt the fixture setup while retaining the busy-state, photo-removal, size-limit and reload assertions.

Add these missing strict checks rather than relying on the old positive-check totals:

- Named Quick Add plus original six and new five action forms; customer/project nested dialogs; operational/workforce review drawers. Interior padding preserves typed drafts, actual backdrop closes, only the top dialog receives Escape, and focus returns to the proper opener. Test forward/back Tab, hidden/disabled controls, consecutive dialogs and reduced motion.
- Closed mobile navigation cannot receive Tab or screen-reader focus. Open navigation supports a visible close action, Escape and focus return; desktop navigation remains reachable.
- Submitting blank required task/customer/employee/document fields leaves the invalid field and message visible, not beneath sticky headers or bottom navigation. Verify keyboard focus bounds, not only screenshot/page width.
- Whitespace site content fails at both UI and command boundaries; every global/project entry point uses the validated command.
- Warning text contrast at least 4.5:1 in actual final styles. Check enabled action visibility and touch spacing at the four widths without introducing a theme redesign.
- No console/page/network errors for normal journeys; intentional failures must be identified and asserted separately.

### G3 — One cross-domain fictional UAE project

Create the fixture through public UI/validated commands in a disposable context. Confirm stored IDs and relationships after each transition and reload. All numbers below are independent oracles; retain integer-fils comparisons and separate net, VAT, gross, cash and contract measures.

| Stage | Required oracle |
| --- | --- |
| Customer/project/contract | QA DIFC Executive Office; quotation 120 × AED 2,100, AED 12,000 discount: subtotal 252,000; net 240,000; VAT 12,000; gross 252,000. Accept/convert once, retain original snapshot and linked customer/project IDs. |
| Variation | Approve addition net 10,000 / VAT 500 / gross 10,500; revised contract net 250,000. Draft/rejected variants contribute zero. One accepted family/invoice reservation; no quotation snapshot mutation. Test a separate eligible deduction and reject over-deduction/unapproved/duplicate billing. |
| Customer settlement | Original invoice receipts 75,600.25 then 176,399.75: original balance zero. Variation invoice gross 10,500, receipt 8,000, issued credit gross 5,250 (net 5,000/VAT 250): position -2,750; refund 2,750: position zero. Gross invoiced 262,500, actual receipts 260,000, credits 5,250, refunds 2,750; net customer cash 257,250. Credit is a billing adjustment in this fixture, not an implied contract deduction. |
| Reversals/history | Reverse the refund and receipt in valid order, observe corresponding credit/receivable and historical statement events, then reconcile again. Reject duplicate/over/refund-without-credit and preserve immutable issued snapshots. Compare statement/ageing as of dates before/after corrections. |
| Procurement | Two suppliers, explicitly approve the higher quote. Approved PO net 100,000/VAT 5,000/gross 105,000; receive 4/10 then 6/10 quantities; bill net 40,000+60,000, VAT 2,000+3,000. Reject unapproved, undelivered, duplicate and over-billed quantities/references. Test fractional cumulative rounding and the cancel/rebill negative-VAT safeguard. |
| Supplier costs/cash | Each active bill creates exactly one linked expense. Add separate manual net expense 68,000: final actual net cost 168,000. Supplier partial/full payments change supplier outstanding and linked paid expense only; customer receipts remain 260,000. Reverse/cancel eligible unpaid allocations; preserve cost/history and avoid double counts. |
| Forecast | Revised budget 175,000; entered remaining estimate 27,000. At partial billing: actual 108,000, open commitment 60,000, forecast 168,000, profit 82,000, margin 32.8%. After all bills: actual 168,000, open commitment zero, forecast 195,000, profit 55,000, margin 22%. Final actual gross profit = 250,000−168,000 = 82,000 (32.8%); forecast profit remains distinct. |
| Workforce integrity | Add/edit/assign employee with stable ID; create linked tasks, replace manager/staff, retain completed-task and historical assignments. Deactivate approver/employee: prevent new allocations, allow historical records, reassign pending approvals with reason; reactivate same ID. Workforce mutations leave monetary records unchanged except explicitly linked approval status. |
| Documents/site/QA | Reject drawing v1, create/resubmit/approve v2 without overwriting v1/files/actors. Both central inbox and workspace show consistent latest decisions. Return/resubmit site record, independent active supervision; create/assign/rectify/inspect/close/reopen snag with fresh independent inspection. Older pending revisions cannot approve after replacement. |
| Combined handover | Matrix below must pass using the same project. No manual flag may bypass derived document/site/QA or configured financial policy. Reload retains both operational and commercial outcomes. |

Handover matrix: (a) operational pending, finance clear → completion blocked; (b) operational clear, finance outstanding, default finance policy off → operational completion allowed, commercial closure blocked; (c) same financial obligation with policy on → operational completion blocked; (d) clear every pending review, delivery, payable, receivable/customer credit, unbilled milestone/variation, open commitment and configured retention → closure permitted once, actor/note/snapshot immutable. Derived checklist rows cannot be toggled/saved as manual items. Test document-category policy and central approvals explicitly; financial clearing cannot auto-approve a site/document/QA record.

### G4 — Financial boundary promotion

Strictly assert A3-005's three Inclusive one-fils rows / two-fils discount and higher-value near-full-discount cases: non-negative line bases/taxes and conserved totals. Include trailing zero/zero-rated/exempt/mixed lines, reordered rows, six-decimal quantities, exclusive/inclusive extraction and largest input bounds. Apply relevant cases to delegated variation pricing and item credit eligibility; do not change historical issued snapshots while repairing draft arithmetic.

Verify quotation/invoice net/VAT/gross consistency under the documented rounding policy, exact milestone reconciliation, discounts before tax, partial/full payments, credits/refunds/reversals, outstanding/customer credit, customer statements, dashboard/report/project totals and historical as-of balances. Status/date/customer/project filters must use explicit documented semantics; snapshots and corrected reports may not silently disagree.

### G5 — Legacy migrations and storage failures

Use cloned fictional persisted fixtures for: pre-commercial legacy shape; `ada782a` commercial shape; operations-only 8b79921 data; workforce-only dd220df data; combined shape; malformed JSON; missing/wrong-type required collections (people, phases, assignments, handover, updates, documents, snags, activities and financial collections); malformed/unsupported operations namespace; orphan/mismatched IDs and revision families. Do not infer that optional absent new fields mean corrupt legacy data.

Assert additive, idempotent loading; original IDs, monetary strings, snapshots, attachments and history retained byte-for-byte where migration does not intentionally add optional metadata; no new financial seed records; legacy approved documents retain supplied identity, and unreviewed legacy site entries do not become approved automatically. Repeated load/save/reload must not duplicate approvals, revisions, expenses, bills, receipts or assignments. Verify missing-people recovery in a browser, not just an incidental thrown exception.

For unreadable/incompatible data, confirm original raw value is unchanged, protected fallback is usable and read-only, and original export remains reachable when storage can be read. Inject `getItem` failure, mutation `setItem` quota failure and attachment read failure in disposable contexts. Failed employee/document/approval/receipt/bill mutations must commit neither visible nor saved changes and show actionable local errors. Reset must be explicit; never silently replace incompatible user data. Expand A3-006 to a schema/relationship matrix after promoting its original exact case.

### G6 — Production/browser/PDF/visual confirmation

Build the frozen combined SHA, serve a separate strict-port production preview (example 5194), set all three URL variables to it, and rerun delivery, commercial, quotation, BOQ, workforce and the UI-only operational journey where compatible. Do **not** run the Vite-import-dependent operational boundary harness against the static preview; retain its dev-server gate and add equivalent public-UI production checks for its important paths.

Capture and visually inspect all original modules plus variations, suppliers/profile, procurement tabs/comparison/orders/deliveries/bills/payments, credits/refunds, budgets, approvals and company Settings at **1440/1024/768/390**. Include long names, large BOQ/long reports, empty/no-result/filter states, validation/errors, nested dialogs, drawers, sidebar/table overflow and fixed bottom-navigation interaction. Screen-emulation does not establish physical touch or screen-reader certification; report actual engine/device scope.

Download and render quotation, invoice, credit note, PO, statement and representative commercial/operational report PDFs from the combined build. Compare totals to stored snapshots/calculations; review all pages for headers/footers, continuation rows, final markers, wrapped names/descriptions, page breaks, VAT/discount labels and print clipping. Change company/logo/TRN/terms, then prove earlier issued/approved artifacts retain historical branding while new records use new settings. Cover long single cells and large BOQ tables; explicitly report international-script/font coverage. Exercise browser print paths; physical printers remain a separately stated limitation.

### G7 — Acceptance output

Deliver one SHA-bound report with per-command exit codes, actual per-file test counts, zero unresolved required expected failures/diagnostic defects, screenshots at all widths, rendered PDFs, migration/storage evidence and the combined financial/workforce fixture. Classify any remaining issue as reproduced, source-only, recorded branch evidence, untested or verified fixed, with owner/severity. Do not call an intentional test skip, caught console failure, screenshot file's existence, source correction or author aggregate a passing integrated scenario.

## 5. Ready state and dependencies

COORD-A3-01 review/handoff is ready. Dependencies for later execution: Coordinator's combined immutable SHA and reconciled domain contracts; scheduled owners for A3-005/schema validation/shared dialog/sidebar/contrast/sticky-field changes; merged harness URL/actor behavior; explicit decision on document/approval and operational/commercial closure authority. Until those exist, the final combined regression gate is **not executed**, rather than failed or passed. No final regression was run against either feature branch.
