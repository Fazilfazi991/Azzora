# QA-COMPOSE-03 — Canonical workflow test composition

**14 October 2026 · Asia/Dubai · Agent 3**

Test-only composition is ready for coordinator review/refreeze. Application source was not edited. Central coordinator documents and the existing recovery harness were not changed. No merge, push, deployment, backend or actual browser-data reset occurred.

**This is preparatory evidence, not final certification.** Successful stable-preview probes used application commit `c6d3e7370fd64b1812fbccf5693611d26000b68b`, source tree `8930555a84c7b45aa48e9ab3c977cc8811807c2b`, built into `tmp/agent-3-compose/production` and served on strict port 5200. New harness files were uncommitted during these runs; their delivered content hashes are in [summary.json](agent-3-compose-evidence/summary.json). A full final source SHA must be refrozen after this test commit and the pending credit correction.

## Exact files composed

| File | Change |
| --- | --- |
| `tests/operational-browser.mjs` | Preserves the original financial/procurement/report/branding/persistence and responsive assertions. Uses canonical employee fields and explicit actor, deactivation/reason, assignment actor, document submitter/assigned reviewer/revision controls, independent site supervision and handover reviewer/note. Adds workspace-rejection/shared-inbox-approval agreement and unchanged v1 history/ledger assertions. Uses shared URL resolver and configurable evidence directory. |
| `tests/operational-boundaries.mjs` | Retains all 18 boundary assertions. Creates the reassignment material/request and deactivates employees through the public canonical UI instead of Vite `/src` imports or direct status edits. Can now execute against a production preview as well as dev. Requires a current journey-created fixture, source tree, target URL and fixture hash; final mode also binds the full source SHA. |
| `tests/agent-3-compose-browser.mjs` (new) | Nine independent combined financial/workforce/atomic-persistence checks against the UI-created operational fixture. Rejects stale fixture tree/URL/content. Validates financial separation and four quota-failure boundaries; verifies canonical readiness, historical files/ledger, separate commercial blockers and reload. |
| `tests/agent-3-compose.test.ts` (new) | Three ordinary independent regressions: repeated tiny amount credits, mixed item/amount credits and legacy issued item-credit basis/snapshot invariance. No `.fails`, skip or todo. These intentionally expose the pending FIX-A1-02 defects on this source version. |

Documentation added: this report and `docs/agent-3-compose-evidence/{summary,operational-results,boundary-results,atomic-results,dev-5193-failure}.json`. Only these explicit test/report/evidence paths are included in the composition commit. Determine its full SHA with `git log -1 --format=%H -- docs/AGENT-3-COMPOSE-REPORT.md`; the SHA is returned with this handoff.

## Preserved and strengthened operational journey

The old journey's 128 checks remain represented. Eight checks were added, two at each requested width, for canonical document/approval convergence and required site supervision: **136 checks at 1440/1024/768/390**.

- Existing project/accepted-contract, variation approval and invoicing, partial receipt, credit/refund/statement, deliberate supplier selection, PO approval/PDF, 4+6 deliveries, bills, partial/full payments, single actual cost, budgets, reports, historical company snapshots and reload assertions remain.
- Employee creation now fills Role/Department/Email and explicitly selects an active actor. Assignment also selects its actor. Canonical deactivation includes actor/reason; previous task and assignment ownership assertions remain.
- Drawing v1 is submitted with assigned independent reviewer and rejected in the workspace. Revision v2 is created/resubmitted and approved through the shared inbox. Both canonical `status` and compatibility `reviewState` are asserted, plus exact unchanged v1 document and approval JSON. One revision cannot leave a stale current pending approval after approval.
- At least one site record is submitted by person-3 and independently approved by person-0 before handover. Handover still proves operational completion with an unpaid customer milestone and disabled commercial closure, now with explicit reviewer and confirmation note.
- Boundary reassignment setup creates a real material and purchase request through the UI, assigns person-1, deactivates that person with a recorded reason, then reassigns/approves through the inbox. Initial actor deactivation also uses the canonical employee action before testing replacement actor access to Settings. Existing financial reversal/snapshot/numbering/tax/term/policy assertions remain.
- The journey writes `fixture-manifest-<width>.json` alongside each fictional fixture. Boundaries/atomic tests require the same source tree, target URL and content hash; final mode additionally requires the identical full source commit. A fixture from a different server, application tree or run cannot silently satisfy setup.

## Preparatory results

| Verification | Result | Interpretation |
| --- | --- | --- |
| Adapted operational journey | **136 passed; zero console/page errors** | Four requested widths; public UI, PDF/CSV downloads and persistence |
| Adapted operational boundaries | **18 passed; zero console/page errors** | Retains all original boundary assertions; now public UI setup |
| Independent combined atomic browser checks | **9 passed; zero console/page errors** | Detailed boundaries below |
| Full Vitest run | **267 passed, 3 failed, 270 total, 12 files, zero pending** | All pre-existing tests pass; the three new credit requirements fail ordinarily |
| Targeted independent credit run | **0 passed, 3 failed** | Same known pending credit defects; not hidden expected failures |
| Production build for preparatory preview | Passed | Main chunk 613.73 kB minified / 170.86 kB gzip; non-blocking >500 kB warning retained |
| JavaScript syntax and test diff whitespace | Passed | Three browser files checked; `git diff --check -- tests` clean |
| Application source boundary | No `src` diff | No app fixes or assertion weakening performed |

[Operational results](agent-3-compose-evidence/operational-results.json), [boundary results](agent-3-compose-evidence/boundary-results.json), [atomic results](agent-3-compose-evidence/atomic-results.json), [counts and test-content hashes](agent-3-compose-evidence/summary.json).

Full artifacts remain locally under `tmp/agent-3-compose/`: current unit JSON, four-width operational captures and fixture manifests, CSVs, PO/credit PDF downloads, atomic screenshot and isolated preview build. This cycle generated downloads but **did not independently render/review all PDF pages**; that remains part of the requested frozen final gate.

## Nine independent atomic/cross-domain checks

1. Assert fixture contract net AED 200,320.75, approved addition AED 100 net, actual supplier-linked net cost AED 100, customer receipts AED 80, supplier payments AED 105, issued credit AED 50 and refund AED 25. Customer cash, supplier cash and incurred cost remain distinct.
2. Fail a workspace approval with an injected storage quota error. Raw saved data remains byte-identical; canonical document and approval ledger stay pending, with the visible approval control retained.
3. Restore storage and approve: document and ledger both become Approved in one saved state; every monetary collection stays byte-identical.
4. Fail revision creation: no orphan revision, supersession or history fragment is saved.
5. Fail the compound draft-save-and-submit operation: the previously stored draft remains unchanged and no new pending approval row is committed.
6. Restore and submit: exactly one pending approval is created and derived document readiness becomes unchecked.
7. Fail shared-inbox approval: document and ledger both remain pending, with the visible decision control retained and raw data unchanged.
8. Restore and approve through the inbox: canonical document, approval ledger and derived handover readiness converge; approved v1 file/document/history and its approval JSON remain unchanged; commercial closure is still blocked by its separate financial obligations.
9. Reload and require byte-identical stored workflows and monetary state, with no browser errors.

These probes use disposable contexts and restore injected Storage methods. They do not alter actual user storage or assume that a caught exception proves rollback; raw records, visible controls and both related entities are checked.

## Real financial defects reproduced — owner Agent 1, FIX-A1-02

### Repeated tiny credits — amount-only and mixed sequences

**Exact reproduction:** Issue an Exclusive invoice for AED 1.00 net, AED 0.05 VAT, AED 1.05 gross. Approve and issue six credits of AED 0.11 each. The second test alternates item and amount credits against the same single invoice item.

**Actual:** Both sequences cumulatively record **AED 0.06 VAT against AED 0.05 originally issued**; the invariant fails at the sixth credit. Source before the assigned correction would then be unable to reconcile the final AED 0.39 credit safely.

**Required:** Non-negative credit bases/taxes, VAT never above issued capacity, cumulative proportional VAT AED 0.03 after AED 0.66 gross adjustment, final AED 0.39 remainder reconciling to original AED 1.00 net/AED 0.05 VAT/AED 1.05 gross, zero invoice position and byte-identical original issued invoice. This is an ordinary failing requirement, not an expected-failure pass. Mixed item/amount sequences must share the same issued capacity.

### Legacy issued item basis

**Exact reproduction:** Model an existing issued snapshot with three one-fils Exclusive lines, two-fils discount and original aggregate net/gross one fils, VAT zero, under the old final-row allocation. Its second line originally retained one fils. Attempt a one-fils item credit against that historical line.

**Actual:** Current bounded redistribution recalculates that line as zero and returns the generic selected-item billed-value rejection. The original invoice JSON remains unchanged; the defect concerns **eligibility/basis recomputation**, not demonstrated mutation of stored snapshot bytes.

**Required:** Use a defensible historical issued basis, or reject explicitly because the legacy historical basis cannot be safely established. The independent test permits either correct historical credit issuance or a clear historical/snapshot/basis error, while requiring the complete original invoice to remain unchanged. It does not accept silent reuse of the new draft allocator as the original billed item basis.

Both findings were already assigned by the coordinator to Agent 1. No concurrent financial code edit was made. These three tests must be rerun against the pinned correction before a final passing certificate can be issued.

## Environmental failures retained separately

The initial port-5193 dev probe failed before quotation setup: `504 Outdated Optimize Dep` and failure to dynamically import the quotation module. [Retained failure JSON](agent-3-compose-evidence/dev-5193-failure.json). A subsequent isolated-cache dev probe encountered `Store unavailable` during ongoing module/source replacement; neither run is used as passing business verification. A harness metadata initialization error in the earliest attempt was corrected before the recorded successful runs.

Coordinator confirmed shared dependency-cache contention and provided **5195** with the integration-local optimizer cache. Subsequent development verification will set all three aliases to 5195. To finish this preparatory composition without certifying a changing hot module graph, the stable application build above was served separately on strict port **5200**. It completed the 136/18/9 groups with no browser errors. No application source was changed to conceal either environmental failure.

## Reproduction and final refreeze dependency

On the final combined checkout, set all URL aliases to the same actual target:

```powershell
$env:AZZORA_URL='http://127.0.0.1:5195'
$env:AZZORA_TEST_URL=$env:AZZORA_URL
$env:QUOTATION_URL=$env:AZZORA_URL
$env:QA_OPERATIONAL_EVIDENCE_DIR='tmp/final-qa/operational'
$env:QA_EVIDENCE_DIR='tmp/final-qa/agent-3'
$env:QA_RUN_KIND='final'
$env:QA_SOURCE_SHA='<coordinator supplied full frozen SHA>'
node tests/operational-browser.mjs
node tests/operational-boundaries.mjs
node tests/agent-3-compose-browser.mjs
node node_modules/vitest/vitest.mjs run
```

Run the journey first; it creates the current fixture and provenance manifests. Public-UI boundary setup now also supports the final production preview; use a separate evidence directory and matching aliases when switching targets. Preserve and rerun `tests/recovery-browser.mjs` plus every previously specified critical/customer/commercial/quotation/BOQ/delivery/workforce suite, migration/financial/handover matrix, four-width visual audit and rendered quotation/invoice/PO/credit/report PDFs.

**Awaiting coordinator review and the full refrozen integration SHA.** The final gate must include this test composition and Agent 1's pending credit correction. Any further harness-source change must be committed/reported and refrozen before certification. This report does not claim final integration acceptance.
