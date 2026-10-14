# AZZORA — Agent3 final independent integration QA

**PASS within the tested browser-demo scope.** Frozen tested commit: **f72e6c1dd7c5914e97c509a635b64de8c6aa9750**. All304 ordinary unit tests, TypeScript, ESLint, the cold production build and all20 browser suites on both dev and production pass. No open blocking defect remains from the recorded audit/regressions. No failing attempt, prototype or earlier-SHA result is counted as a pass here.

Date:14 October2026, Asia/Dubai. Workspace:C:/Users/USER/Desktop/Projects/Azzora/azzora-integration. All browser work used fresh isolated headless contexts and fictional UAE fit-out records. Actual user browser profiles and saved records were not accessed. No source/test/config edits, commits, cherry-picks, merge, push, deployment, backend change or worktree reset/delete by Agent3 during this gate.

## Frozen provenance and safe handoff

| Item | Verified value |
|---|---|
| Full tested HEAD |f72e6c1dd7c5914e97c509a635b64de8c6aa9750|
| HEAD:src tree |913fb64df6bde41a8c4c1b6d689760aee65099e5|
| HEAD:tests tree |8fcc10d8b13e612c43d3095ca59a27e1ba79deeb|
| package-lock SHA256 |e70e38bcdc457e57c7f412c5ec0f2fe09147af963174f2a5b922dc325002dcce|
| Runtime |Node v24.19.0; Chrome154.0.8037.98 headless, Windows|
| Dev target |http://127.0.0.1:5195, isolated integration cache/config|
| Cold production target |http://127.0.0.1:5205, verified-free port, strict preview|
| Cold build directory |tmp/final-qa/f72e6c1-build|
| Final guards |No source/test/config dirty paths;0 source hash mismatches;0 build mismatches;lock unchanged|

All three target aliases agree per run. HEAD/source guards ran before/after browser commands. The14 served production files match recorded cold-build SHA256 hashes. Node/browser versions, tracked source/test/config hashes, package and build hashes, fixture provenance, exact commands, timestamps, exit codes and logs/results are retained in [manifest.json](integration-evidence/final/f72e6c1-run1/manifest.json), [served-build proof](integration-evidence/final/f72e6c1-run1/production-server-build-proof.json), [dev manifest](integration-evidence/final/f72e6c1-run1/dev/run-manifest.json) and [production manifest](integration-evidence/final/f72e6c1-run1/production/run-manifest.json).

Both full runners exited0 and completed on the frozen SHA. All supplementary runners completed; production preview5205 is stopped. Coordinator dev5195 remains running. No runner needs cancellation. No new commit was created: the commit SHA above identifies the application/test revision actually tested. This certificate does not automatically certify later source/test changes.

## Independent static and automated results

| Command | Exit | Actual result |
|---|---:|---|
| node node_modules/typescript/bin/tsc --noEmit |0|Pass|
| node node_modules/eslint/bin/eslint.js src |0|Pass|
| Vitest run --maxWorkers=1 |0|**304 ordinary passed;0 failed;0 pending;13 files**|
| Fresh Vite build |0|Pass; main618.46kB minified/172.44kB gzip warning|

All304 cases are indexed in [domain-coverage.json](integration-evidence/final/f72e6c1-run1/domain-coverage.json). No expected-failure masking, filters or --diagnose mode was used. Both20-suite browser runs passed first execution on this SHA; no retry was needed. Counts below are groups/journeys/route checks, not equivalent unit assertions, and are deliberately not summed into one inflated test number.

| tests/ script | Dev coverage | Exit | Production coverage | Exit |
|---|---|---:|---|---:|
| agent-3-critical.mjs | 38 | 0 | 38 | 0 |
| rapid-search-browser.mjs | 166 | 0 | 166 | 0 |
| recovery-browser.mjs | 25 | 0 | 25 | 0 |
| dialog-regressions.mjs | 64 | 0 | 64 | 0 |
| agent-1-corrective-browser.mjs | 35 | 0 | 35 | 0 |
| financial-followup-browser.mjs | 14 | 0 | 14 | 0 |
| financial-modal-feedback-browser.mjs | 38 | 0 | 38 | 0 |
| browser.mjs | 66 routes + journey | 0 | 66 routes + journey | 0 |
| commercial-browser.mjs | 129 | 0 | 129 | 0 |
| commercial-boundaries.mjs | 6 | 0 | 6 | 0 |
| quotation-browser.mjs | 4 width journeys | 0 | 4 width journeys | 0 |
| quotation-print-browser.mjs | 4 native/download cases | 0 | 4 native/download cases | 0 |
| boq-visual.mjs | 4 widths / 8 screenshots | 0 | 4 widths / 8 screenshots | 0 |
| workforce-browser.mjs | 40 | 0 | 40 | 0 |
| operational-browser.mjs | 136 | 0 | 136 | 0 |
| operational-boundaries.mjs | 18 | 0 | 18 | 0 |
| agent-3-compose-browser.mjs | 9 | 0 | 9 | 0 |
| agent-3-audit.mjs | 128 geometry + 5 dialog targets | 0 | 128 geometry + 5 dialog targets | 0 |
| agent-3-interactions.mjs | 18 | 0 | 18 | 0 |
| agent-3-upload.mjs | 2 | 0 | 2 | 0 |

**20/20 suites per target,40 successful script invocations.** Critical38/38; rapid166/166; financial-followup14/14; financial-modal38/38; commercial129/129; operational136/136; boundaries18/18; compose9/9 on each target. Interactions reports knownDefects=[] on both. Audit128 geometry and5 dialog targets pass on each. Operational boundary/composed fixtures are generated through the same target's public UI, then checked against full SHA, source tree, URL and raw fixture SHA256 before reuse.

The rapid-search and financial-modal suites build their setup fixtures from this frozen source via Node/esbuild; their browser actions and assertions use the actual UI. Other customer/commercial/delivery/operational journeys create records through public forms. Production never depends on browser imports from Vite /src modules.

All recorded pageerror/console-error arrays are empty in instrumented results, including each critical group. Intentional quota/read failures, malformed saved data, invalid financial inputs and workflow rejection alerts are negative test probes, separated from unexpected runtime errors. BOQ/interactions/upload do not independently capture every console/page error, so no universal zero-console claim is made for those scripts. Dialog tests also monitor failed HTTP responses.

## Bugs identified, corrected and reverified

The baseline13 issue IDs and6 integration-gate issue IDs include both application and test-infrastructure defects. Their original reproductions/expected-versus-actual behavior remain in [AGENT-3-ISSUES.md](AGENT-3-ISSUES.md). Current verification below supersedes historical open statuses; no unfinished owner branch or unapplied prototype is treated as shipped.

| Issue | Defect | Correction owner | Current verification |
|---|---|---|---|
| A3-001 | Named dialogs/drawers | Agent2 | Fixed / verified: Critical38, dialog64, audit5 targets |
| A3-002 | Interior dialog padding discarded draft | Agent2 | Fixed / verified: Critical/dialog padding and real-backdrop checks at4 widths |
| A3-003 | Harness targeted another server | Agent3 | Fixed / verified: URL resolver9 unit cases; aliases consistent in all40 invocations |
| A3-004 | Boundary output directory absent | Agent3 | Fixed / verified: mkdir source fix retained;6 boundary checks each target; original fresh-folder failure not re-induced |
| A3-005 | Discount could create negative VAT | Agent1 | Fixed / verified: Ordinary financial/discount cases and corrective35 each target |
| A3-006 | Invalid storage could blank the workspace | Agent2/coordinator | Fixed / verified: Storage/recovery units, recovery25 and critical malformed fixtures |
| A3-007 | Off-screen mobile sidebar remained focusable | Agent1 | Fixed / verified: Critical mobile keyboard and corrective navigation checks |
| A3-008 | Whitespace-only site update saved | Agent2 | Fixed / verified: Four-width strict site-validation/interaction checks |
| A3-009 | Drawer opener focus not restored | Agent2 | Fixed / verified: Four-width critical/dialog focus assertions |
| A3-010 | Nested Escape discarded parent draft | Agent2 | Fixed / verified: Four-width child-only close, retained parent data and focus |
| A3-011 | Warning badge contrast below4.5 | Agent1 | Fixed / verified: Four-width targeted computed contrast assertions |
| A3-012 | Attachment removal/upload race resurrected file | Agent3 | Fixed / verified: Upload2 each target; oversize rejection/save/reload checks |
| A3-013 | Invalid field hidden by sticky drawer heading | Agents1/2 | Fixed / verified: Four-width critical/interactions/corrective geometry checks |
| FINAL-01 | Customer-only credit approval failed hydration | Coordinator/Agent1 | Fixed / verified: 304 units include lossless valid roundtrip and wrong-project rejection; financial14 each target |
| FINAL-02 | Critical Quick Add selector ambiguous | Coordinator | Fixed / verified: Critical38 each target, nesting reached normally |
| FINAL-03 | Recovery banner selector ambiguous | Coordinator | Fixed / verified: Commercial129 each target; protected raw-byte guard reached |
| FINAL-04 | Financial rejection feedback outside modal | Agent1 | Fixed / verified: Financial-modal38 each target: visible/focused nonignored AX alert and retained bytes/values |
| FINAL-05 | Late route event erased fresh search query | Agent1/coordinator | Fixed / verified: Rapid166 each target, including144 unwrapped selections; settled-destination boundary18 |
| FINAL-06 | Quotation native print added blank page | Agent2 | Fixed / verified: Native print4 each target: actual7/3 pages, no blank tail, A4/page text/totals and raw invariance |

Agent3's original safe isolated upload and harness fixes were committed in codex/azzora-qa-stabilization before integration (including QA preparation commit b88191b8dcb4c0bc568b35796dbf46563cb2d9bb and composed regression commit e48ef9c31d93649f2345e944cc2d610f86376748). Financial/workforce/shell corrections stayed with their owners and coordinator. Latest search source correction08a2a153062f0be2bc90a77d786deec3f8ba9f17 and scoped native-print correction39c1bffebdac0abedf1bbf2c92ecc679e3ee1935 are integrated in the frozen revision. No concurrent feature file was edited by Agent3.

The earlier19051cc and db6bb114 gates remain **failed** in AGENT-3-FAILED-GATE-19051CC.md and AGENT-3-FAILED-GATE-DB6BB114.md, with original failed results and prototypes preserved. Their passing subsets and successful replays are not acceptance evidence for this final SHA.

## Complete module audit

All baseline screens were reviewed at1440,1024,768 and390px; specialized dialog/mobile tests also use their scripted900/844px heights. Functional permutations are the explicit journeys and ordinary tests, not every theoretically possible input.

| Module | Fresh executed coverage and result |
|---|---|
| Dashboard |Responsive summary cards/links; shared commercial and operational totals checked against fictional fixtures;pass|
| Customers |Create/edit, normalized duplicate warnings, stable relationships, archive/restore and statements;customer-only financial reload now passes|
| Projects |Create/edit/inline customer, scoped relationships and modules, long names, nested-dialog retention;pass|
| Planning/timelines |Dates/progress/dependencies, global/project views and contained horizontal timeline;delivery and route checks pass|
| Quotations/BOQ |Nested sections/main lines/subsections, reorder/duplicate/delete, decimal/VAT/milestones, autosave/reload, finalize/sent/revision, preview/download/native print;pass|
| Accounts |Contract/receivable/collection separation, overview/filters/registers and linked records;pass covered journeys|
| Invoices |Exclusive/inclusive/exempt net/VAT/gross, discounts, one-fils cases, immutable issued identity/line allocations, milestone/double-billing guards;pass|
| Payments |Partial/full allocation, correction/reversal, outstanding/customer-credit/refund reconciliation, zero statements;pass|
| Expenses |Incurred cost versus paid cash, supplier bill linkage and reversals, customer-receipt independence;pass|
| Project Financials |Contract/variation, billed/collected/committed/incurred/paid costs, gross and forecast margin, budget/dashboard/report consistency;pass covered fixtures|
| Tasks and Team |Employee history, assignments/task transitions and validation, workforce40 and keyboard drawer checks;pass|
| Documents |Canonical approval ledger, immutable prior revisions/files/history, shared inbox and stale-decision protection;composed atomic workflows pass|
| Site Updates |Active author, independent supervision/corrections, whitespace rejection, pending readiness, attachment upload/removal regression;pass|
| QA/Snags |Assignment/inspection/reopening and notes, independent decisions, readiness blockers;pass|
| Handover |Operational/commercial separation; supervised-site, document and QA gates, explicit financial-policy matrix;pass|
| Reports |Live commercial/operational CSVs, customer/supplier statements and cost/margin data, representative PDF output;pass|
| Settings |Company/logo/tax/numbering/payment defaults, actor changes, original-data protection and historical snapshot persistence;pass|
| Global Search / Quick Add |Real supplier/variation/request/order/credit and customer/project/task forms;exact domains/destinations, delayed/rapid navigation, same-route/modal/keyboard dismissal;pass|

## Financial integrity, relationships and persistence

304 ordinary unit cases include capacity-bounded proportional mixed-tax discounts; exact quotation/invoice VAT; partial/full receipts and reversal; stable issued snapshots despite master/live-line changes; one-fils credits; six tiny amount credits and mixed item/amount ordering with a final remainder; trustworthy legacy reconstruction versus explicit-review rejection; customer statements; supplier cash excluded from customer collections; incurred costs, margin and report/dashboard totals.

The financial follow-up journey completes at1440/390 on both targets: customer-only invoice1.00net+0.05VAT=1.05gross;receipt1.05;six0.11 credits;refund0.66;reload;final0.39 credit/refund;statement0.00, unchanged receipt and original invoice allocations. The new ordinary valid-data roundtrip also rejects wrong-project approval relationships, retaining the schema's orphan protection.

Financial-modal38 checks per target exercise actual visible focused nonignored Chrome AX alerts for over-credit, excessive refund, legacy review and reversal rejection; draft/raw-byte retention; quota failure/retry; read-only writes-disabled feedback; clearing stale scoped feedback without clearing global protection. They verify the modal feedback remains after its unrelated toast expires.

Composed9 checks on each target prove all-or-nothing workspace review, revision creation, compound save-and-submit and shared-inbox approval under injected quota failure. Prior versions/attachments/history and monetary collections remain intact. Recovery25 browser cases plus31 domain recovery cases cover additive/idempotent migration, incompatible/missing/orphan/unknown workflow data, unavailable read/backup/quota handling and exact-original-data preservation. Valid-data reload and protected malformed-data fallback are separate assertions.

Additional same-SHA production handover matrix: **24/24 pass**, four widths×policy off/on×three readiness states. Setup explicitly documents a fictional completed-project→Active fixture transform and policy flag. Pending site supervision blocks handover under either policy; independent approval clears only the operational blocker; policy-on still blocks for the unpaid invoice, while policy-off enables operational completion eligibility. Monetary collections remain equivalent. The main operational journey also actually completes handover with an unpaid invoice under policy-off. [Matrix evidence](integration-evidence/final/f72e6c1-run1/policy-supervision/results.json).

Rapid-search166 cases per target include **144 unwrapped native six-domain selections** in fresh ordinary contexts, plus deliberately held callbacks/back-forward/same-route/modal/keyboard cases and raw-data invariance. The next query is entered before destination render to reproduce the old race; it now survives. Operational boundaries separately wait for the destination heading and active procurement tab, retaining all original result-count/destination assertions.

## UI stabilization and screenshots

132 primary baseline screenshots (33 per width) were freshly captured and visually inspected through12 contact sheets; production captures another132 and passes its own128 geometry+5 strict dialog targets. Production financial-error and mobile-navigation screenshots were additionally inspected. No new on-screen layout defect was apparent. Approved AZZORA typography/palette/layout were preserved; no unrelated redesign or added animation.

Navigation collapse, closed-menu focus exclusion, Escape/opener restoration, nested modal draft retention, drawer right-edge positioning, required-field visibility, normal/reduced-motion containment, targeted warning contrast≥4.5, form alignment, contained table/timeline overflow, long customer/project names, nested BOQ and empty/validation states pass their named checks. A separate native ArrowRight/ArrowLeft probe verifies named financial table regions receive keyboard focus and scroll/reset horizontally at390 (with focusability also checked at1440).

Screens:[1440](integration-evidence/final/f72e6c1-run1/visual-review/ui-1440-1.jpg), [1024](integration-evidence/final/f72e6c1-run1/visual-review/ui-1024-1.jpg), [768](integration-evidence/final/f72e6c1-run1/visual-review/ui-768-1.jpg), [390](integration-evidence/final/f72e6c1-run1/visual-review/ui-390-1.jpg). Each width has two full module sheets and a compact Team sheet; original images remain in dev/qa/audit. [Visual manifest](integration-evidence/final/f72e6c1-run1/visual-review/manifest.json). [Production mobile rejection example](integration-evidence/final/f72e6c1-run1/production/financial-modal-feedback-artifacts/over-credit-390.png).

This is visual/geometry/keyboard and Chrome accessibility-tree evidence, not a full WCAG audit, actual screen-reader speech verification or owner design sign-off. Very large BOQ load benchmarks and physical soft-keyboard behavior were not tested.

## PDF generation, native pagination and historical branding

**66 fresh PDFs /158 pages parsed**, partitioned as64 PDFs/156 pages in the main visual/PDF inventory plus2 one-page native invoice captures. Includes ordinary quotation/invoice/credit/PO/commercial/operational report downloads, native quotation regressions and historical re-exports. All29 production counterparts have identical extracted text to their dev counterparts. No earlier gate's document is used.

**42 rendered pages visually reviewed** with Poppler:20 representative downloaded pages (complete7-page reference, complete3-page workflow, invoice/credit/PO/report and6 extra production historical/report documents), plus20 native quotation pages covering both reference/workflow at1440/390 and2 native invoices. Another20 production native quotation pages were rendered and are **pixel-identical** to the reviewed dev pages, not merely assumed equivalent. [Native review manifest](integration-evidence/final/f72e6c1-run1/native-pdf-review/manifest.json), [production pixel proof](integration-evidence/final/f72e6c1-run1/native-pdf-review/production-native-pixels.json).

Native print suite4/4 per target proves actual parsed reference7/workflow3 pages, A4 dimensions, nonblank content and page numbers on every page, expected amounts and exact saved/accepted quotation bytes unchanged. There is no blank eighth page. Native invoices at1440/390 are one page each. The shipped scoped .sheet svg display:block fix is exercised; old popup prototypes are excluded.

19 extra text checks pass:8 invoice exports500net+25VAT=525gross;8 workflow exports225+11.25=236.25;3 regenerated historical invoice/PO/credit exports preserve original legal company after changing live company settings. Additional invoice105−credit50−receipt80+refund25 reconciles0;PO100+5=105;credit47.62+2.38=50. Representative current Invoice Register, Purchase Order Register and Project Budget vs Actual PDFs export through public UI. Text, per-page lengths/counts, document hashes and renders are retained.

No clipping/overlap or accidental blank tail was apparent in reviewed outputs. Dense budget/report headers wrap within columns. Native printed layouts and downloaded layouts are independently inspected; physical paper/printer output remains untested.

Documented historical source exception:reference numeric210,336.79 intentionally retains supplied words Seventy Eight Fills and manually rounded milestone overrides. This preserves supplied historical content; it is not a claim that arbitrary manual overrides reconcile. New generated words/new workflow calculations pass. No historical user/reference data was silently rewritten.

Download render sheets:[1](integration-evidence/final/f72e6c1-run1/visual-review/pdf-sheet-1.jpg), [2](integration-evidence/final/f72e6c1-run1/visual-review/pdf-sheet-2.jpg), [3](integration-evidence/final/f72e6c1-run1/visual-review/pdf-sheet-3.jpg), [4](integration-evidence/final/f72e6c1-run1/visual-review/pdf-sheet-4.jpg). Native sheets:[1](integration-evidence/final/f72e6c1-run1/native-pdf-review/native-sheet-1.jpg), [2](integration-evidence/final/f72e6c1-run1/native-pdf-review/native-sheet-2.jpg), [3](integration-evidence/final/f72e6c1-run1/native-pdf-review/native-sheet-3.jpg), [4](integration-evidence/final/f72e6c1-run1/native-pdf-review/native-sheet-4.jpg).

## Remaining limits and integration risks

No open blocking issue remains within the recorded regressions. Nonblocking observations are the618.46kB main-bundle warning and explicit historical reference override. Performance beyond these responsive interactions was not benchmarked.

Untested:real user profiles/data, physical mobile/tablet hardware and printers, Safari/Firefox, screen-reader speech, arbitrary legacy/import datasets or every form permutation, unbounded BOQ/load/concurrency, real authentication/multi-user backend/security, external payments/delivery integrations and statutory accounting compliance. Demo actor labels are not secure role enforcement. Passing financial/domain tests do not certify regulatory compliance or every possible dataset.

Later source/test/config changes need appropriate fresh verification; exact-SHA and tree/hash provenance above allow the coordinator to distinguish docs-only follow-ups. Preserve previous failed certificates/evidence; do not cherry-pick unfinished branches. This handoff authorizes no deployment or merge. **Final tested commit:f72e6c1dd7c5914e97c509a635b64de8c6aa9750; no new Agent3 gate commit.**
