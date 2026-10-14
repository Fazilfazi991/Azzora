# QA-PREP-02 — Strict independent regression preparation

**14 October 2026 · Asia/Dubai · Agent 3**

Prepared on `codex/azzora-qa-stabilization`, based on `11da92566fe5bbb524e36a3128937756ce506204`. This delivery changes **tests and QA documentation/evidence only**. Application source is unchanged from that baseline, including the previously committed attachment fix. No central coordination documents, feature implementation, merge, push, deployment, backend, actual browser data, reset or deletion was performed.

**This is a failing preparation run on the old QA application, not final certification of the combined CRM.** The coordinator's in-progress integration tree was inspected only for the recovery interface contract. Its fixes were not imported or executed here.

## Results

| Check | Result | Exit / scope |
| --- | --- | --- |
| Full Vitest inventory | **114 passed, 26 failed, 140 total, seven files** | Exit 1; all failures are ordinary assertions; zero `.fails`/expected-failure cases in the prepared QA suite |
| Existing four baseline unit files | **90 passed, zero failed** | Counts remain domain 13, quotation 23, commercial 51, PDF 3 |
| Independent financial file | **10 passed, 5 failed, 15 total** | Four invoice discount boundary failures plus original missing-people rejection failure |
| New storage/schema file | **5 passed, 21 failed, 26 total** | Four existing financial wrong-shape checks and valid idempotent load pass; missing/wrong-type operational collections and three relationship/ID checks fail |
| New URL-selection file | **9 passed, zero failed** | Each alias, consistent aliases, contradictions, invalid base URLs and fallback |
| Full independent critical browser sweep | **1 passed, 37 failed, 38 groups** | Exit 1; all four widths; isolated context per group; only malformed-JSON protected fallback/raw export passes on this old app |
| Recovery selector follow-up | **1 passed, 3 failed, 4 groups** | Exit 1; rerun after recovery-region export scoping; explicit prep-only subset, not added to full-sweep totals |
| Attachment race/validation/persistence | **2/2 viewport scenarios pass** | Exit 0 at 1440/390; invoked using `AZZORA_TEST_URL` alone |
| Final-run guard checks | **4/4 pass** | Missing SHA, wrong SHA, dirty harness and partial final selection are rejected before browser launch |
| Changed JavaScript syntax | **9 `.mjs` files pass `node --check`** | Exit 0 |
| Whitespace/application-source boundary | `git diff --check` passes; `git diff HEAD -- src` empty | No application-source changes |

The negative counts are expected outcomes of preparing strict requirements before their owners' fixes reach this branch. They are **failures**, not expected-failure test passes. No failed test was weakened, skipped or marked `.fails` to make this preparation branch green.

The original full browser preparation was refined after its first run: submitting a blank task immediately after opening did not reproduce A3-013. Including the original 24-Tab navigation before Save exposed the sticky-field failure at all four widths. The latest full sweep therefore reports 1/37, replacing the earlier incomplete 5/33 result. The subsequent recovery-selector/filter/manifest guard refinements were checked with the four-case recovery subset and four guard tests. The committed full-run JSON retains its **actual tested harness hashes**; the summary separately records hashes of the final prepared files. These are distinct evidence stages, not a claim that the latest file hash was used in the earlier full sweep.

Evidence: [summary and final prepared file hashes](agent-3-prep-evidence/summary.json), [full 38-group browser results](agent-3-prep-evidence/critical-full.json), [recovery follow-up](agent-3-prep-evidence/recovery-followup.json). Full raw Vitest output, 38 browser screenshots, earlier diagnostic run and attachment evidence remain locally under `tmp/agent-3-prep/`; follow-up captures are under `tmp/agent-3-prep-recovery/`. Historical QA evidence was not overwritten.

## Exact test files changed

| File | Preparation change |
| --- | --- |
| `tests/agent-3-financial.test.ts` | Promotes A3-005/A3-006 from `it.fails` to ordinary assertions. Adds three fixed-discount conservation/non-negative net/VAT cases, covering one-fils, scaled near-full discount and mixed exempt/zero-rated/inclusive rows. Retains ordinary financial/payment/reversal/margin/persistence assertions. |
| `tests/agent-3-storage.test.ts` (new) | 26 ordinary checks: nine required operational collections, absent and wrong-type; four malformed existing financial collections; orphan customer, cross-project task phase, duplicate project IDs; valid idempotent load without writes. Distinguishes required legacy collections from legitimately absent new optional fields. |
| `tests/agent-3-harness.test.ts` (new) | Nine tests for URL aliases, normalization and rejecting contradictory/invalid targets. |
| `tests/agent-3-critical.mjs` (new) | 38 independent groups with per-group context, screenshots, runtime errors, pass/fail and nonzero aggregate failure. Covers names/padding/backdrop, opener focus, nested Escape, invalid-field bounds, forward/back Tab/reduced motion, contrast, whitespace site content, mobile sidebar focus/Escape and protected saved-data recovery/export/no-write behavior. |
| `tests/agent-3-helpers.mjs` (new) | Public-UI demo export fixture, raw export scoped to recovery region when present, explicit workforce site author selection when that control exists, strict whitespace rejection. No `/src` browser imports. |
| `tests/agent-3-audit.mjs` | Names and padding are always strict, with no opt-in final phase. Long-name fixture comes from public export UI instead of Vite module imports, permitting production preview execution. Existing route/overflow and long-name assertions retained. |
| `tests/agent-3-interactions.mjs` | Diagnostic `knownDefects` now causes failure; whitespace rejection uses the validated actor-aware site fixture. Existing positive search/drawer/navigation assertions retained. |
| `tests/agent-3-upload.mjs` | Always runs the final strict behavior, selects workforce site author when present, retains delayed read/removal, oversize file, saved photo identity and reload assertions. No deliberate baseline resurrection mode. |
| `tests/browser-runtime.mjs` | Shared `resolveAuditUrl`: accepts `AZZORA_URL`, `AZZORA_TEST_URL` or `QUOTATION_URL`, normalizes trailing slash, rejects conflicting aliases and invalid base URLs. Keeps 5173 fallback. |
| `tests/commercial-browser.mjs` | Uses shared URL resolver; commercial assertions unchanged. |
| `tests/quotation-browser.mjs` | Uses shared URL resolver; quotation assertions unchanged. |
| `tests/agent-3-vite.config.mjs` (new) | Preparation-only dev config inherits app config and places Vite optimizer cache under `tmp`, avoiding shared dependency-cache writes. |

Documentation files added: this report plus `docs/agent-3-prep-evidence/summary.json`, `critical-full.json` and `recovery-followup.json`. No other report or central coordination file was edited. The delivery commit can be identified with `git log -1 --format=%H -- docs/AGENT-3-QA-PREP-REPORT.md`; its SHA is returned with this handoff.

## Important behavior and evidence boundaries

- Critical groups continue after another group's failure, so the first unnamed dialog cannot prevent contrast/sidebar/recovery checks. Within a failed group, later assertions can remain unexecuted; for example, padding failure blocks that group's subsequent real-backdrop assertion. A passing final group requires its entire sequence to complete.
- `agent-3-audit.mjs` and `agent-3-interactions.mjs` were syntax checked, not rerun in full during prep. Their strict requirements are exercised independently in the new critical sweep. Commercial/quotation scripts only changed URL wiring and were not rerun as full journeys in this cycle.
- The old application's native dialog containment fails the longer forward/back Tab cycle, and its mobile menu does not close via Escape. Those are ordinary preparation failures alongside the recorded baseline issues; Agent 2's prepared Tab trapping and Agent 1's planned shell behavior still require combined runtime verification.
- Workforce compatibility is prepared from the reviewed UI contract: when `Demo site author` exists, QA explicitly selects active `person-3` before saving. That presence branch is not runtime-verified on this old application, which has no such control. Assertions concerning uploaded files, whitespace rejection and persistence remain intact.
- The coordinator reported a region named **Saved data recovery**, with heading **Your saved records are protected**, raw export and Retry saved data. Raw-export selection now prefers that region over Settings so duplicate labels cannot cause ambiguity. This is selector preparation; the in-progress recovery implementation is not certified by this report.
- Browser fixtures are fresh-context fictional exports. No persistent browser profile is launched. All corrupt storage and delayed FileReader injections are confined to disposable test contexts.
- The 38-case sweep records source HEAD, target, browser/Node versions, lock hash, dirty-path inventory, timestamps and actual harness hashes. A final run requires `QA_SOURCE_SHA` to match the full checkout HEAD and no changed/untracked `src` or `tests` files. Final mode also rejects `QA_CASE_FILTER`; filtered preparation runs cannot be presented as final certification.

## Reproduce preparation

Use the QA worktree. The server target below is the isolated preparation port, not the in-progress integration application.

```powershell
# Terminal 1
node node_modules/vite/bin/vite.js --config tests/agent-3-vite.config.mjs --host 127.0.0.1 --port 5198 --strictPort
# Terminal 2
$env:AZZORA_URL='http://127.0.0.1:5198'
$env:AZZORA_TEST_URL=$env:AZZORA_URL
$env:QUOTATION_URL=$env:AZZORA_URL
$env:QA_RUN_KIND='prep'
$env:QA_EVIDENCE_DIR='tmp/agent-3-prep'
node node_modules/vitest/vitest.mjs run
node tests/agent-3-critical.mjs
node tests/agent-3-upload.mjs
```

Unit and critical commands should exit nonzero on this old application. The upload command should pass. Clear contradictory URL aliases by setting all supplied aliases to the same target; no harness may silently select another worktree. QA outputs default to `tmp/agent-3-strict` unless `QA_EVIDENCE_DIR` is supplied.

## Waiting for the frozen combined source

No final gate has started. Coordinator must integrate this preparation commit and the owners' financial/modal/sidebar/contrast/sticky-field changes, recovery validation and canonical workforce/document/atomic approval adapters, then provide a **full frozen combined SHA**.

For that later gate I will:

1. Confirm the checkout and running dev/production build match the frozen SHA; create a run manifest and isolated contexts.
2. Run TypeScript, ESLint, full unit/domain inventory and production build; execute all retained customer/commercial/quotation/BOQ/delivery plus operational/workforce and strict QA scripts. Preserve and rerun the coordinator's `tests/recovery-browser.mjs`; its reported 25-case pre-freeze result is not independently certified here. The union now suggests **219 ordinary unit cases in nine files before coordinator-added tests and intentional inventory edits**; actual counts, not that estimate, govern the report.
3. Adapt old operational browser/boundary fixtures to canonical workforce employee/document/reviewer/revision/site-supervision and handover-actor controls, retaining their domain assertions. Preserve the required journey-before-boundary fixture order. **Any such test-source edit will be reported with its hash and require coordinator refreeze before certification.**
4. Exercise the combined financial/procurement/workforce fixture and handover matrix from COORD-A3-01, including atomic agreement between workspace document decisions, central active approvals and commercial/operational closure. Verify both commands and UI paths; distinguish history from current pending work.
5. Verify legacy/operations/workforce/combined migrations, schema/relationship recovery, raw export, read-only writes, Retry behavior and storage/attachment failures without resetting actual data.
6. Capture desktop/tablet/mobile screens at 1440/1024/768/390, strict modal/sidebar/validation/contrast cases and new feature routes; render and review downloaded quotation, invoice, PO, credit and representative commercial/operational report PDFs against totals and historical snapshots.
7. Deliver the **full tested source SHA**, harness hashes, exact ordinary/failing/skipped counts, failures, screenshots, rendered PDF results, limitations and remaining issues. No passing certificate while critical failures or unverified composition remain.

Ready for coordinator review of this preparation commit and, afterwards, the frozen integration SHA. No feature work or final regression will proceed against an unfrozen feature branch.
