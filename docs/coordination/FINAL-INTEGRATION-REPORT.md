# Final integration report

14 October 2026 · Asia/Dubai. **Ready for owner acceptance within the tested browser-local CRM scope.** No open blocking defect remains in the recorded regressions.

Full frozen integration SHA: **`f72e6c1dd7c5914e97c509a635b64de8c6aa9750`**. Branch: `codex/azzora-integration`. Worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-integration`.

Source tree: `913fb64df6bde41a8c4c1b6d689760aee65099e5`. Tests tree: `8fcc10d8b13e612c43d3095ca59a27e1ba79deeb`. The application, tests, configuration and HEAD remained fixed throughout independent QA. The final documentation checkpoint preserves the tested source/test/configuration unchanged.

## Integrated features

| Area                              | Resulting behavior                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer and commercial lifecycle | Customer/project records, quotation BOQ and attachments, accepted quotation snapshots, contracts, full/milestone/manual invoices, receipts/reversals, expenses, customer statements, dashboard, search and reports                                  |
| Variations                        | Independent approvals, immutable signed net/VAT/gross basis, revised contracts, positive variation billing and negative variation credit sources                                                                                                    |
| Procurement and supplier costs    | Suppliers, material requests, RFQs/comparison, authorized purchase orders/PDFs, partial deliveries/reversals, received/unbilled caps, supplier bills/payments, one expense per bill, net costs/commitments/budgets/forecasts                        |
| Financial adjustments             | Credit notes, refunds/reversals, preserved invoice/receipt history, frozen posted allocations, cumulative item/amount credit capacities, VAT/customer-credit/report reconciliation                                                                  |
| Workforce                         | Canonical employees, active project assignments, workload and role/manager guards, inactive-person checks, history-preserving reassignment                                                                                                          |
| Documents and approvals           | Immutable family versions/files, submission metadata, assigned independent reviewers, reject/resubmit, atomic shared approval transitions, explicit supersession and retained decisions                                                             |
| Site, QA and completion           | Validated site reports, supervision return/resubmit, independent QA inspection/reopening, operational handover with configured financial blocking, separate commercial closure and historic evidence                                                |
| Company and output                | Company/VAT/reference settings, historical branding snapshots, quotation/invoice/PO/credit/report PDFs and corrected native quotation printing                                                                                                      |
| Persistence and recovery          | Pre-render saved-shape/relationship checks, additive migration, lossless legacy compatibility, exact-original export/retry/settings and atomic save rollback                                                                                        |
| Interaction                       | Named dialogs, interior draft retention, opener focus/topmost nested Escape, parent/BOQ retention, mobile navigation focus, warning contrast, visible invalid fields, focused financial errors and fresh-query preservation during rapid navigation |

Agent 2 workforce/document commands are authoritative. Legacy employee/document entry points delegate to them; competing write paths were removed. Agent 1 financial, procurement, variation and commercial closure logic remains authoritative. Shared-source reconciliation preserved both owners' required guards, fields and behavior. The six overlapping components/domain files were resolved deliberately by function/type/contract, without replacing necessary contributions wholesale.

## Data and history guarantees

The browser-local key remains **`azzora-demo-v1`**. Required collections, nested records and relationships are validated before rendering. Missing optional namespaces initialize additively; unknown fields and legacy workflow metadata remain. Incompatible or malformed originals are protected without automatic reset, overwrite or save. The reachable named recovery region offers exact-original export, retry and settings.

Mutations clone the database, run the canonical command, save once, then commit visible state. Storage failure discards the clone. Document and shared-approval transitions therefore succeed together or leave records, history, saved bytes and visible state unchanged. Superseded pending decisions and old revisions remain historical records rather than invented approvals/rejections.

Accepted quotations, issued invoices/credits, approved variations/POs, receipts/refunds, employee/document/project IDs and existing history are preserved. Historical financial allocation is reconstructed only when trustworthy and exactly matching; inconsistent postings require explicit review rather than silent rebasing. Tests use disposable fictional browser contexts and do not access owner profiles/data.

## Corrected defects

| IDs                                | Correction                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A3-005; FIX-A1-01/02               | Bounded discounts cannot create negative taxable bases/VAT. The three AED0.01 inclusive rows/AED0.02 discount boundary is an ordinary passing regression. New posted line bases freeze; cumulative item/amount credits consume original remaining net/VAT/gross pools without rounding overruns |
| A3-006; INT-01; FIX-RECOVERY-01/02 | Protected loading/recovery, lossless canonical adapters, source/reviewer/requester checks, atomic approvals and valid customer-only credit/refund reload with wrong-project rejection                                                                                                           |
| A3-001/002/008/009/010; FIX-A2-01  | Named dialogs and site validation retained; interior clicks keep drafts; opener focus returns; Escape closes only the topmost dialog while retaining parent/BOQ content                                                                                                                         |
| A3-007/011/013                     | Closed mobile navigation is inert, focus/trap/Escape works, warning contrast reaches 5.206:1 and sticky headers do not obscure invalid inputs                                                                                                                                                   |
| FINAL-01/02/03/04; FIX-A1-03       | Customer-only approval hydration fixed; ambiguous test selectors scoped to named surfaces with assertions retained; actual financial errors persist visibly/focused inside all three native dialogs without draft/data loss                                                                     |
| FINAL-05; FIX-A1-04                | Queries track their entered location; delayed route callbacks cannot erase fresh input. Same-route/modal selection, ordinary navigation and Back/Forward dismissal remain; 166 focused checks include 144 unwrapped native result selections                                                    |
| FINAL-06; FIX-A2-02                | Scoped block SVG removes the print line-box overflow. Actual native PDFs contain7 reference pages/3 workflow pages at 1440/390, with no blank tail and unchanged accepted data/content/download semantics                                                                                       |

Previous failed gates are preserved: [19051cc](../AGENT-3-FAILED-GATE-19051CC.md) and [db6bb114](../AGENT-3-FAILED-GATE-DB6BB114.md). Their failures were corrected only after stopped-runner safe checkpoints. Passing replays and prototype CSS were not certified as shipped fixes. No expected-failure or skipped test substitutes for a requirement.

## Source commits and controlled checkpoints

The following 31 reviewed source/report inputs are verified ancestors of the frozen SHA. Full provenance is in [source-provenance.json](source-provenance.json); deliberate merge checkpoints and authority decisions are in [INTEGRATION-PLAN.md](INTEGRATION-PLAN.md). Moving branch tips were not silently substituted for pinned deliveries.

| Full commit                                | Reviewed input                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `ada782a21232b3072850889e3796c3bc5c8d5dd4` | docs: record commercial foundation verification and delivery                      |
| `8b7992156a2f97e6f8d9d38b98a4b120ad2793a9` | Document operational delivery and verified demo evidence                          |
| `26eb5002ed826acd5101bf138dacdabf662a6210` | Complete connected operational and financial CRM workflows                        |
| `dd220dfaca1e0f072d84c5895e8a8c0639345297` | docs: record Agent 2 verification and integration handoff                         |
| `06b1ad206c94c7ad154c05ff4e5b079c2e1ada50` | feat: implement workforce and traceable operational approvals                     |
| `11da92566fe5bbb524e36a3128937756ce506204` | docs: deliver independent Agent 3 audit and regression evidence                   |
| `7b9c26d03146a58dd5d602e37c708abf0c148d60` | fix: stabilize attachment uploads and isolate QA regression harnesses             |
| `a4620eb0fae755bd3be0100386345446e6349ce4` | fix: bound invoice discounts and correct shell accessibility                      |
| `647762d99fa0837df1c991d17bcd38459ab960f9` | docs: deliver Agent 1 corrective verification and handoff                         |
| `c95a1cf022c70bdeed4f55fb1099036baa2f42b5` | fix: preserve modal drafts and restore nested keyboard focus                      |
| `94c568b737fc3f58713ef6f9c866729868bb2612` | docs: record modal corrective verification and adapter requirements               |
| `b88191b8dcb4c0bc568b35796dbf46563cb2d9bb` | test: prepare strict independent integration regression gates                     |
| `e48ef9c31d93649f2345e944cc2d610f86376748` | test: compose canonical operational and atomic regression journeys                |
| `857b57cd4e0519606d5be143b6851260b773c0a4` | fix: freeze posted line bases and bound cumulative credit VAT                     |
| `d4d251fe6674f2354a40aaee5a08569f5d0cc9e2` | docs: hand off historical allocation and cumulative credit fixes                  |
| `62c694814ba2a79a20f2b54b2b5ee98815738ffd` | fix: expose financial dialog failures without losing drafts                       |
| `3dba13435f90cbde4a27ff14deab25e814e34ec2` | docs: deliver financial modal feedback verification                               |
| `8d7a277a760206de73cfb94132b582ab0dbbc7f5` | fix: protect saved data and unify document workforce approval writes              |
| `562a819896c4e7093902f6dc043c0586a0fe9d83` | fix: validate approval sources and preserve requester independence                |
| `93926da798d3a98cc1e1cd1cd6d9fed60bddfdac` | fix: reject conflicting workflow and incomplete issued snapshot data              |
| `c6d3e7370fd64b1812fbccf5693611d26000b68b` | fix: reinitialize the recovery boundary after explicit retry                      |
| `cb3f4d9b0c133901607d05351c33543b6a01897d` | fix: reflect configured financial blocking in handover readiness label            |
| `a53fbf69077a753bfa1f70ea1d6b8e6b4c044933` | fix: validate versioned posted allocation metadata before rendering               |
| `3417fe1b52cbc6d374bf78410593009213aeae56` | fix: preserve customer-only credit approvals through reload                       |
| `3fbf085b38d578bc5f3dadc376795747fd3f603c` | test: await rendered operational search destinations and checkpoint final defects |
| `39c1bffebdac0abedf1bbf2c92ecc679e3ee1935` | fix: prevent blank trailing pages in native quotation print                       |
| `d69e69294496ea857a46b06a3d0823db3de73568` | docs: record native print page counts and rendered verification                   |
| `08a2a153062f0be2bc90a77d786deec3f8ba9f17` | fix: preserve fresh search input across delayed hash events                       |
| `e136489c004d8b8366fed61d40073ecc0130fde9` | merge: reconcile workforce guards with financial handover and models              |
| `a539358b64f0b0808bff8b373951cbff20338886` | merge: preserve independent QA fixes and workforce-aware browser journeys         |
| `f6f7e04c4b5b7c04b8d9f1a1ed06400e94cfd9f4` | test: verify original-data export and recovery rollback at four widths            |

Agent 1 committed the final search source/tests before a report-only remote-compaction model-capacity failure. The Coordinator collected actual saved166-browser/192-unit outputs and traces in [COORDINATOR-SEARCH-HANDOFF.md](../COORDINATOR-SEARCH-HANDOFF.md). No agent-authored report commit or successful report-only turn is claimed. This service failure is distinct from application test results; final combined certification belongs to Agent 3.

## Verification on the frozen SHA

Coordinator preflight and Agent 3's fresh independent static run both pass: **304 ordinary unit tests, 0 failed, 0 pending, 13 files**; TypeScript, ESLint and a cold production build. Unit execution uses `vitest run --maxWorkers=1`. Main chunk: **618.46kB / 172.44kB gzip**, with the existing bundle-size warning.

| Browser script                       | Dev                                 | Production                          |
| ------------------------------------ | ----------------------------------- | ----------------------------------- |
| agent-3-critical.mjs                 | 38 pass                             | 38 pass                             |
| rapid-search-browser.mjs             | 166 pass                            | 166 pass                            |
| recovery-browser.mjs                 | 25 pass                             | 25 pass                             |
| dialog-regressions.mjs               | 64 pass                             | 64 pass                             |
| agent-1-corrective-browser.mjs       | 35 pass                             | 35 pass                             |
| financial-followup-browser.mjs       | 14 pass                             | 14 pass                             |
| financial-modal-feedback-browser.mjs | 38 pass                             | 38 pass                             |
| browser.mjs                          | 66 routes + delivery journey pass   | 66 routes + delivery journey pass   |
| commercial-browser.mjs               | 129 pass                            | 129 pass                            |
| commercial-boundaries.mjs            | 6 pass                              | 6 pass                              |
| quotation-browser.mjs                | 4 width journeys pass               | 4 width journeys pass               |
| quotation-print-browser.mjs          | 4 native-print cases pass           | 4 native-print cases pass           |
| boq-visual.mjs                       | 4 widths /8 screenshots pass        | 4 widths /8 screenshots pass        |
| workforce-browser.mjs                | 40 pass                             | 40 pass                             |
| operational-browser.mjs              | 136 pass                            | 136 pass                            |
| operational-boundaries.mjs           | 18 pass                             | 18 pass                             |
| agent-3-compose-browser.mjs          | 9 atomic-save groups pass           | 9 atomic-save groups pass           |
| agent-3-audit.mjs                    | 128 geometry +5 dialog targets pass | 128 geometry +5 dialog targets pass |
| agent-3-interactions.mjs             | 18 pass                             | 18 pass                             |
| agent-3-upload.mjs                   | 2 pass                              | 2 pass                              |

**All 20 dev and 20 fresh production scripts passed on their first executions: 40 successful script invocations.** Per-script checks/groups/journeys are not equivalent to unit assertions and are not summed into an inflated aggregate. The fresh 24-check handover matrix passes across 1440/1024/768/390 with both financial-policy settings: pending supervision blocks completion under either setting; independent approval clears only its operational blocker; policy-on retains financial blocking. Monetary collections remain unchanged.

The completed [independent certificate](../AGENT-3-FINAL-INTEGRATION-QA.md) records132 primary screenshots reviewed across 1440/1024/768/390, plus 132 production captures. **66 fresh PDFs /158 pages parsed;42 rendered pages visually reviewed.** This includes complete seven-page reference and three-page workflow quotations, invoice/PO/credit/report samples, historical branding exports,20 native quotation pages and two native invoices. Another 20 production native quotation pages are pixel-identical to the reviewed dev pages; 29 production PDF counterparts have identical extracted text. All four native-print cases pass on both targets with no blank tails.

Final source/build guards show 0 source mismatches, 0 build mismatches and unchanged lock/configuration. All 14 served production files match the cold build. No retry was needed on this SHA. [Final machine summary](../integration-evidence/final/f72e6c1-run1/final-summary.json), [dev manifest](../integration-evidence/final/f72e6c1-run1/dev/run-manifest.json), [production manifest](../integration-evidence/final/f72e6c1-run1/production/run-manifest.json), [PDF/visual manifest](../integration-evidence/final/f72e6c1-run1/visual-review/manifest.json), [native PDF review](../integration-evidence/final/f72e6c1-run1/native-pdf-review/manifest.json). Earlier failed certificates/evidence remain preserved separately and are not included as current passes.

## Remaining limitations and release boundary

Browser-local demo identity/persistence, shared browser quota and 750KB attachment limit remain. No secure backend/authentication, server concurrency, cloud backup, statutory ledger/retention release, timesheets/inventory/debit-note extension or multi-invoice receipt allocation was added. Existing main-bundle and broad Unicode PDF limitations remain outside this cycle.

The supplied reference quotation intentionally retains historical manual overrides: numeric AED 210,336.79 versus wording ending Seventy Eight Fills, plus source-rounded payment milestones. These are preserved source/data exceptions; new generated words and workflow totals reconcile. No historical override is silently asserted mathematically correct.

Verification uses native Chromium PDF output and responsive emulation, not physical printers/devices, Safari/Firefox, screen-reader speech or production multi-user/security/accounting certification. Owner visual acceptance remains a separate review.

No backend, push, deployment, main merge, automatic browser-data reset or agent-worktree reset/delete occurred. Main remains **`c1914984021a20a9e83f5e60ee4f93ef035659dc`**. The technical gate is complete. The CRM is ready for owner acceptance; a main merge remains subject to explicit owner approval. The tested application SHA above remains the certificate identity even after documentation-only commits. No push or deployment is authorized.

Compact manifests/results,all66finalPDFs and20reviewcontact sheets are retained with this documentation checkpoint. Raw screenshots,traces,fixture exports and complete logs remain locally in the ignored SHA-bound evidence directories;the full evidence-files.json inventories their hashes. Previous failed gate reports and compact manifests remain retained separately. Existing tracked workforce screenshots/results were refreshed by the current gate;their older versions remain in Git history.
