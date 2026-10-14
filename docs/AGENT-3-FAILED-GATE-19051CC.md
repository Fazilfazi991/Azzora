# Agent 3 — Final integration QA failure checkpoint

**DO NOT CERTIFY OR INTEGRATE AS PASS.** Tested source SHA: **19051cc1f5f70770142f116ecc4edb239099e708**. Both complete browser runs reproduce three failing suites. Two application defects and two test-selector defects require corrections and a new frozen SHA. This report records completed evidence; it is not an acceptance certificate.

Date: 14 October 2026, Asia/Dubai. Workspace: C:/Users/USER/Desktop/Projects/Azzora/azzora-integration. No app/test edits, commits, merges, deployment, or actual user-browser data changes by Agent 3 during this gate. Every browser uses fresh isolated contexts and fictional UAE fit-out records. Earlier isolated QA changes remain documented in AGENT-3-QA-REPORT.md, AGENT-3-QA-PREP-REPORT.md and AGENT-3-COMPOSE-REPORT.md; their results are not substituted for this run.

## Safe correction checkpoint

Both 17-suite runners finished, including operational fixture → boundary → compose sequencing. Dev runner exit1; production runner exit1. There is no active QA browser runner to wait for or cancel. Agent 3's cold production preview on5203 has been stopped. The coordinator's dev server5195 was left running. Root can now apply scoped corrections and refreeze. Agent 3 has not applied the coordinator's scratch schema patch or changed frozen harness selectors.

## Frozen provenance and execution

- HEAD:19051cc1f5f70770142f116ecc4edb239099e708 at start/end and before/after browser commands.
- HEAD:src tree:56fc4c25772aaf1dc79d141f05a973a7d9d96bfa.
- HEAD:tests tree:c02ce26292d4ee935d59727810b45353e30aa028.
- Package lock SHA256:e70e38bcdc457e57c7f412c5ec0f2fe09147af963174f2a5b922dc325002dcce; unchanged.
- No tracked diff or untracked files under src/tests. Coordinator-owned central docs may be dirty; no source changes are hidden by that allowance.
- Node v24.19.0; Chrome154.0.8037.98 headless, Windows. All three URL aliases agree per run: dev http://127.0.0.1:5195; production http://127.0.0.1:5203.
- Cold build: tmp/final-qa/19051cc-build; verified free production port5203; strict preview. Build files retained and individually SHA256 hashed; zero build hash mismatches at checkpoint.
- Complete tracked src/tests filesystem hashes, build/lock hashes, exact commands/exits/timestamps, script/log/result hashes: [manifest](integration-evidence/final/19051cc-run1/manifest.json). Browser manifests: [dev](integration-evidence/final/19051cc-run1/dev/run-manifest.json), [production](integration-evidence/final/19051cc-run1/production/run-manifest.json). [Machine-readable checkpoint summary](integration-evidence/final/19051cc-run1/checkpoint-summary.json).

## Independent static and unit results

| Command | Exit | Actual outcome |
|---|---:|---|
| node node_modules/typescript/bin/tsc --noEmit |0|Pass|
| node node_modules/eslint/bin/eslint.js src |0|Pass|
| Default parallel Vitest run |1|Incomplete:261 reported cases;256 pass,5 runner STACK_TRACE_ERROR failures;11/13 files present|
| Serial Vitest --maxWorkers=1 |0|303 ordinary assertions pass,0 fail,0 pending,13 files|
| Cold Vite build |0|Pass;617.83kB minified main chunk warning|

The initial unit run remains a failed/incomplete execution attempt. Two files were absent and five errors had runner definition stacks rather than assertion diagnostics. Serial replay on the same frozen source completed all303 in13.36s. This is diagnostic evidence of successful serial execution; the cause of the first runner failure was not conclusively established. Do not erase that attempt or call the default parallel command passing. No expected-failure promotion or skipping was used during this gate. Raw initial and serial JSON/log files are retained in the evidence root.

## Browser results — separate counts, no inflated aggregate

Each row is a separate script invocation on both targets. Counts describe recorded groups/journeys, not equivalent unit assertions.

| Suite (tests/) | Dev | Production | Exit dev/prod |
|---|---|---|---:|
| agent-3-critical.mjs |34 pass/4 fail of38|34 pass/4 fail of38|1/1|
| recovery-browser.mjs |25 pass|25 pass|0/0|
| dialog-regressions.mjs |64 pass|64 pass|0/0|
| agent-1-corrective-browser.mjs |35 pass|35 pass|0/0|
| financial-followup-browser.mjs |4 recorded pass;then abort|4 recorded pass;then abort|1/1|
| browser.mjs |66 route checks+delivery journey|same|0/0|
| commercial-browser.mjs |128 recorded pass;last guard blocked|same|1/1|
| commercial-boundaries.mjs |6 pass|6 pass|0/0|
| quotation-browser.mjs |4 width journeys pass|same|0/0|
| boq-visual.mjs |4 widths,8 screenshots pass|same|0/0|
| workforce-browser.mjs |40 pass|40 pass|0/0|
| operational-browser.mjs |136 pass|136 pass|0/0|
| operational-boundaries.mjs |18 pass|18 pass|0/0|
| agent-3-compose-browser.mjs |9 pass|9 pass|0/0|
| agent-3-audit.mjs |128 geometry+5 strict dialog targets pass|same|0/0|
| agent-3-interactions.mjs |18 positive checks;knownDefects=[]|same|0/0|
| agent-3-upload.mjs |2 pass|2 pass|0/0|

14/17 suites pass on each target. Financial follow-up intended14 checks: only four1440px checks reached; the final three desktop checks and all seven390px checks were not reached. Commercial intended129:128 reached; final guard not completed. Four critical nested-Escape groups fail before exercising nesting. Passing dialog-regressions provides separate nested-dialog evidence, but does not turn the critical suite green.

Recorded page/console errors are empty in every instrumented result, including all critical cases. Storage quota/read failures, invalid recovery data, over-credit/refund and rejected saves are deliberate negative probes, separately recorded as application alerts; they are not unexpected runtime errors. BOQ, interactions and upload scripts do not independently collect all page/console errors, so zero global console errors is not claimed for those scripts.

## Blocking defects and responsible owners

### FINAL-01 — valid customer-only credit approvals fail hydration (P0, Agent1/coordinator schema)

Fresh context → Quick Add invoice for client-0 without project → AED1 net/5% VAT → issue AED1.05 → receive AED1.05 → create/submit/independently approve/issue six AED0.11 amount credits → refund AED0.66 → reload → attempt final AED0.39 credit.

Expected: load valid saved workspace; continue remaining credit/refund; customer statement closes at zero. Actual: read-only recovery reports incompatible **operations.approvals.0.projectId**. All six valid Credit Note approvals contain projectId=''; the approval structural schema requires nonempty id. Preserved raw data still contains the invoice, but the hydrated fallback has no eligible Credit invoice option. Dev reproduced twice; production full suite has the same selection timeout after reload. Root independently confirmed the saved-data cause and scratch correction.

Correction: permit optional project text for polymorphic approval source, retaining missing-source/same-project and required-project validation for other source domains. Add ordinary repository→decode/migration round-trip coverage for this actual customer-only path and UI absence-of-recovery assertions. Do not weaken orphan checks. The existing browser assertion compares raw localStorage after reload, so it can pass while the UI has fallen back; those four recorded passes do not prove hydration.

Evidence: [captured actual fixture and recovery](integration-evidence/final/19051cc-run1/financial-diagnostic/after-reload.json), [selector options](integration-evidence/final/19051cc-run1/financial-diagnostic/options.json), screenshot in that directory, financial-followup results/logs in both run folders. No domain fix applied by Agent3.

### FINAL-02 — ambiguous critical selector (QA harness, coordinator correction/refreeze)

Open Quick Add on dashboard, then unscoped + New Project button. Both main and dialog match. At all four widths strict mode fails before Project→Customer nesting. Scope to named Quick Add dialog; retain every child Escape, parent draft and restored-focus assertion. Verification pending new SHA; no app failure established by this locator error.

### FINAL-03 — ambiguous commercial recovery selector (QA harness, coordinator correction/refreeze)

Final invalid-data save probe uses unscoped role=alert. Persistent Saved data recovery banner and error toast both match. Scope banner to the named recovery region, retaining Writes are disabled and exact-original-byte assertions. Verification pending new SHA; no app failure established by this locator error.

### FINAL-04 — rejected financial save has inaccessible external feedback (P1, Agent1 financial UI)

On valid operational fixture (invoice105, receipt80, credit50), Credit Note Draft → gross999 + reason → save. Separately, same fictional fixture without its refund leaves25 customer credit → Customer Refund25.01 + required reason/reference → post. Repeat at1440/390.

Expected: retained form displays accessible persistent rejection inside native dialog. Actual in four contexts: no inside-dialog alert; Store toast outside dialog says Credit exceeds eligible billed value / Refund exceeds eligible customer credit balance. Stored bytes unchanged; dialogs/values retained. Chrome CDP AX reports toast **ignored=true, reason=activeModalDialog**; toast dismiss focus fails and stays on modal submit. DOM inert=false and Playwright getByRole(alert) finding one node do not prove assistive-technology access.

Render Store/WorkflowError inside Credit/Refund forms; cover reversal/legacy-review rejection as appropriate. Agent1 assigned correction; no source fix by Agent3. [AX/focus evidence and snapshots](integration-evidence/final/19051cc-run1/modal-diagnostic/results.json); credit/refund screenshots1440/390 in same directory. No actual screen reader was exercised. Legacy-review feedback specifically was not separately probed here.

Full issue ownership/reproduction is also appended to [AGENT-3-ISSUES.md](AGENT-3-ISSUES.md).

## Complete module audit and financial scope

Visual baseline route/geometry review includes1440,1024,768,390px. Functional journeys use the widths documented by their scripts; not every possible field permutation was exercised.

| Module | Executed evidence and practical result |
|---|---|
| Dashboard | Responsive cards, commercial/operational totals via shared fixture/journeys; no extra layout defect found|
| Customers | Create/edit, normalized duplicate warnings, relationships, archive/restore, statements; customer-only credit reload fails FINAL-01|
| Projects | Create/edit, inline customer, long-name wrapping, project relationships and scoped modules; critical locator prevents its own nested-dialog proof|
| Planning/timelines | Date/progress/dependency workflows and responsive timeline containment; broad route/delivery coverage passes|
| Quotations/BOQ | Decimal totals, VAT, milestone rounding, hierarchical edits/reorder/duplicate/delete, autosave/reload, locking/revision, preview/download/print; four width journeys pass|
| Accounts | Overview, filters, receivable/collection totals and contract distinction pass covered journeys|
| Invoices | Exclusive/inclusive/exempt and discount bases, issued immutable allocation/billing snapshots, milestone/double-billing guards pass covered tests|
| Payments | Partial/full receipt, cancellation/reversal, outstanding reconciliation and statement coverage pass; final customer-only credit/refund path incomplete|
| Expenses | Actual cost vs paid cash distinction, receipt linkage, supplier cash separation and reversals pass|
| Project financials | Contract/variation, billed/collected/cost/margin and forecast data covered by unit/commercial/operational fixtures|
| Tasks/team | Workforce40, employee history, assignments, workflow validation and keyboard drawer checks pass|
| Documents | Revision snapshots, canonical approval ledger, stale decisions, quota rollback/save-and-submit atomicity pass composed9|
| Site updates | Author/supervision/correction history, whitespace rejection and attachment read/removal regression pass|
| QA/snags | Assigned inspector and transitions, reopening, notes, independent approval and handover blockers pass|
| Handover | Operational supervision/document/QA gates remain mandatory; financial policy boundary and separate commercial blockers covered|
| Reports | Live CSV exports, customer/supplier statements, cash/margin/forecast and PDF samples pass covered assertions; not arbitrary dataset accounting certification|
| Settings | Company/tax/numbering, active actor, uploaded logo persistence, historical snapshots, protected storage/export coverage passes; FINAL-01 valid-data hydration exception|
| Global Search/Quick Add | Commercial/workforce/operational destinations and real forms pass boundaries; ambiguous harness trigger separately recorded|

303 serial unit assertions include proportional mixed-tax discount capacities, one-fils invoice/credit, cumulative six tiny amount and mixed item/amount credits, final remainder, immutable posted allocations despite live invoice-line edits, trustworthy legacy reconstruction versus explicit review, receipts/refunds invariant history, supplier payments excluded from customer collections, VAT/net/gross bounds, statements and report totals. These domain passes do not override the customer-only browser hydration defect.

Combined boundary/composed tests demonstrate financial policy surfaced in handover, mandatory supervision under either financial-policy state (ordinary unit), pending canonical document approval blocking readiness, monetary collections unchanged by workforce/document actions, and all-or-nothing review/revision/compound save/inbox decisions under injected quota failure. Recovery tests cover malformed/missing structural collections/orphans, unknown workflow states, backup/unavailable-storage and migration rejection with original bytes protected. This is enumerated automated coverage, not an assertion of all possible legacy inputs.

## UI screenshots and PDF review

[Visual manifest](integration-evidence/final/19051cc-run1/visual-review/manifest.json) maps132 baseline screenshots into12 inspected contact sheets (33 captures per width, including long names and Quick Add). 128 geometry groups exclude supplemental modal shots. All12 sheets were visually inspected. No additional layout defect apparent beyond known blockers. Desktop/tablet dense tables and timelines use contained scrolling; mobile actions wrap, cards stack, menu replaces sidebar, long names remain within page. This is screenshot/geometry and keyboard evidence, not owner design approval or complete WCAG certification.

Representative sheets: [1440](integration-evidence/final/19051cc-run1/visual-review/ui-1440-1.jpg), [1024](integration-evidence/final/19051cc-run1/visual-review/ui-1024-1.jpg), [768](integration-evidence/final/19051cc-run1/visual-review/ui-768-1.jpg), [390](integration-evidence/final/19051cc-run1/visual-review/ui-390-1.jpg). Native task validation, mobile navigation/focus and financial rejection screenshots are retained in corrective/dialog/critical/modal directories. Full-page BOQ screenshots cover nested sections; no arbitrary thousands-of-lines load benchmark performed.

48 downloaded PDFs parsed successfully,76 pages total;21 production PDFs have identical extracted text to their corresponding dev downloads. 20 representative pages rendered with Poppler and visually inspected: all seven reference-quotation pages; all three workflow-quotation pages; invoice, credit, PO and report samples; plus six production historical/commercial/operational exports. Reviewed pages show no clipping/overlap or blank accidental pages. Dense budget-report headers wrap within columns; actual printed-paper/device verification not performed.

19 extra text checks pass: eight invoice exports net500/VAT25/gross525; eight workflow quotation exports subtotal225/VAT11.25/gross236.25; three regenerated historical invoice/PO/credit exports retain AZZORA DESIGN TECHNICAL SERVICES LLC after live company changed to AZZORA QA Company1440. Historical invoice105 less credits50 less receipt80 plus refund25 reconciles zero; PO100+VAT5=105; credit47.62+2.38=50. Sample operational budget/PO reports exported after company change via public UI. [Additional-download provenance](integration-evidence/final/19051cc-run1/pdf-extra/manifest.json).

Reference quotation retains an explicit supplied historical override: numeric210,336.79 but words Seventy Eight Fills, plus its historical manually rounded milestone schedule. Unit coverage explicitly preserves that source exception while new generated words use Seventy Nine Fils. Treat that reference content as a documented source/data exception, not proof that arbitrary manual overrides reconcile. New workflow documents reconcile in this run.

Rendered sheets: [PDF1](integration-evidence/final/19051cc-run1/visual-review/pdf-sheet-1.jpg), [PDF2](integration-evidence/final/19051cc-run1/visual-review/pdf-sheet-2.jpg), [PDF3](integration-evidence/final/19051cc-run1/visual-review/pdf-sheet-3.jpg), [PDF4](integration-evidence/final/19051cc-run1/visual-review/pdf-sheet-4.jpg). Individual PNGs and extracted text remain available for detailed inspection.

## Integration risks and required next gate

Coordinator should correct FINAL-01 with ordinary customer-only hydration regression, narrowly scope FINAL-02/03 harness locators, and integrate Agent1's FINAL-04 modal feedback correction before freezing once. Then repeat the full required gate, including fresh cold build/preview and regenerated same-SHA operational fixtures. No results from19051cc certify a later commit. No cherry-pick of unfinished feature work is recommended.

Not tested: real user browser profiles/data, physical tablet/mobile hardware, Safari/Firefox, actual screen-reader speech output, physical printing, multi-user/concurrent backend/auth/security, external delivery/payment integrations, unbounded BOQ performance, or statutory invoice compliance. Production performance warning remains; no unrelated redesign or speculative fixes were made.

No new commit SHA for this checkpoint: **no commit was created**. Frozen tested commit is19051cc1f5f70770142f116ecc4edb239099e708. Final outcome: **FAILED / correction and refreeze required**.
