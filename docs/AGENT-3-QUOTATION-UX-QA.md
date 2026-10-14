# QUOT-UX-03 — Independent quotation usability QA preparation

Status: baseline captured; workflow implementation in progress; **no feature certification**. Agent3 works only in C:/Users/USER/Desktop/Projects/Azzora/azzora-quotation-ux, branch codex/azzora-quotation-ux. Coordinator alone stages/commits. No old worktree source/reports changed.

## Actual BEFORE evidence

Pinned app source f72e6c1dd7c5914e97c509a635b64de8c6aa9750; source tree913fb64df6bde41a8c4c1b6d689760aee65099e5; test tree8fcc10d8b13e612c43d3095ca59a27e1ba79deeb. Capture uses immutable cold production5210, not the moving feature tree.32 actual viewport screenshots: blank and reference editors, top/BOQ/pricing/payment views at1440/1024/768/390, each1000px high.14 served files match the local baseline build and every coordinator baseline hash. Build rechecked unchanged after capture; captured console/page errors0. Every scenario uses a fresh browser context; no actual user profile/data/reset.

[Before manifest](integration-evidence/quotation-ux/before/manifest.json) contains SHA256 for every image/build file, served byte proof, capture URL/time/runtime and DOM geometry. Raw images moved into the existing ignored evidence tree without alteration; provenance records the relocation. Capture script is tmp/quotation-ux-qa/capture-before.mjs (uncommitted scratch artifact, not a browser-suite pass).

| Width | Editor | Document height(px) | All main controls* | Controls in top viewport | Page overflow |
|---:|---|---:|---:|---:|---|
| 1440 | blank | 7037 | 141 | 22 | no |
| 1440 | reference | 35427 | 2061 | 22 | no |
| 1024 | blank | 7025 | 141 | 22 | no |
| 1024 | reference | 55589 | 2061 | 22 | no |
| 768 | blank | 7174 | 141 | 18 | no |
| 768 | reference | 56032 | 2061 | 18 | no |
| 390 | blank | 9883 | 141 | 12 | no |
| 390 | reference | 78268 | 2061 | 12 | no |

*DOM controls include closed advanced disclosures; these counts do not claim all controls were visible. They show document complexity, not a design score. The long reference form is a real structured BOQ, not generated mockup content.

Before examples: [blank1440](integration-evidence/quotation-ux/before/blank-top-1440.png), [reference BOQ390](integration-evidence/quotation-ux/before/reference-boq-390.png), [payments390](integration-evidence/quotation-ux/before/blank-payments-390.png). No after screenshot or improvement claim yet.

## Independent test contract

The available frame source exposes five exact accessible step buttons under navigation Quotation steps: Customer & Project;Scope of Work / BOQ;Pricing Summary;Payment Schedule & Terms;Preview & Issue. Current step has aria-current=step, a named region and a focusable heading. Parent owns state/lifecycle. The workflow source is still moving, so exact business actions/labels and persistence behavior must be checked at the completed implementation checkpoint.

New tests/quotation-ux-helpers.mjs uses only this public UI contract for steps, advanced toggle and category/item opening. It imports no app source and never mutates saved data. It asserts unique scoped targets and enabled presentation controls, including issued read-only inspection. No weak .first fallback or removed numeric/history assertion. Syntax check passes; browser execution is pending the completed feature source. No existing harness has been changed yet.

New tests/quotation-ux-browser.mjs will independently cover:

1. All four widths: five-step visible/relevant controls, default empty simple Work category→Priced item path, explicit worked-example viewing without mutation and opt-in append, empty/error states, keyboard step heading focus and native disclosure/modal focus/Escape. No automatic demo seeding.
2. Draft content survives step changes, reload at the URL-selected step and simple/advanced switching. Existing complex scope retains every row, parent relation, override and total; mode selection persistence will be judged against the completed UI contract, not guessed.
3. Advanced headings(no charge), subcategory/item breakdown, FOC/By Client/Excluded, reordering/duplicate/delete, page breaks/overrides and nested relationships remain available. Original financial/structural assertions stay intact.
4. Calculated totals are visibly distinct from editable discount/VAT. Payment explanation states stages divide the grand total; changing percentages/descriptions never increases quotation total. Invalid/imbalanced stages remain validated.
5. Issued quotations retain enabled step/mode/category/item/preview inspection while content inputs and mutation actions are disabled; original issued/accepted snapshots and records remain unchanged. Revision creates an editable new draft through existing commands, preserving original commercial history.
6. Actual exported and native printed PDF pagination/content/nonblank tails, original reference branding and issued snapshot fidelity remain verified, alongside customer/project inline modal flows on Step1.

## Cross-quotation presentation-state isolation

Required independent case: open the complex reference quotation, enable advanced controls, enter a nonempty scope search and inspect a category/item; return to the quotation list, then create/open a new blank draft. Assert default Simple mode, empty scope search, no inherited category/item selection or modal, and the visible recommended empty Work category → Priced item path. Assert the reference data and new draft data remain separate and unchanged by presentation navigation.

Contrast case on the same quotation: step navigation preserves draft content and presentation state according to the completed implementation contract. Reload content/URL-step restoration is checked separately from cross-quotation reset. Capture both quote IDs and rendered control states; do not infer UI state from localStorage alone.

Status: added to the independent contract; not yet executed. Shared-state leakage is a source-review risk, not a confirmed defect. Await the completed source checkpoint before running the new UI test.

## Canonical fictional client journey and screenshots

Use exact Olive Courtyard Interiors LLC/contactMaya Reed; Marina Courtyard Apartment Refresh, Dubai fictional. Main journey creates customer and project through public UI, then links them to the quotation. Step1 inline Add Customer/Create Project dialogs get separate tests.

Painting40m²×35=1400;Flooring25m²×90=2250;Joinery2Nos×650=1300. Subtotal4950−discount150=net4800;VAT5%=240;grand5040. Milestones50/40/10%=2520/2016/504;sum5040. Finalize/issue using authoritative lifecycle,accept,convert the linked project contract without duplication;full invoice5040;receipt1000;outstanding4040. Assert net contract4800 and cash1000 remain distinct in project financials;statement4040;preserve issued snapshots/revision history.

Capture actual implemented UI stages under integration-evidence/quotation-ux/after and finalSHA-bound folders:customer;project;quote-step1;category;priced-items;pricing;payments-terms;preview-issued;accepted-contract;invoice;receipt;statement;project-financials. All captures correspond to asserted state, not assembled visual mockups. Coordinator owns client-demo prose/payload handoff.

## Existing harness inventory / adaptations

Direct old editor selectors occur in quotation-browser,boq-visual,quotation-print-browser,commercial-browser,commercial-boundaries,dialog-regressions andoperational-browser. rapid-search-browser uses source-bound setup and must be reviewed for any actual editor navigation rather than altered indiscriminately. Delivery and all other20-suite inventory remain part of the final gate even where no adaptation is needed.

Permitted changes are explicit step navigation, opening the intended category/item/disclosure, and genuine labels/readiness. Keep all original totals/counts/relationships/reorder/history/snapshot/storage assertions. Do not replace exact targets with ambiguous .first, use skip/.fails/filters, change engines or hide a failure by asserting source data instead of rendered UI.

## Awaiting completed source checkpoint

Guide contract is available; Agent1 orchestration and Agent2Frame/CSS are in progress. No moving-tree certificate or new21-suite pass claim. At completed checkpoint, validate simple and advanced/issued navigation contracts, mode/reload policy, labels and category selection/read-only controls before running adapted tests. Potential source-reading concerns are not reported as confirmed defects until reproduced on the implemented UI.

After coordinator reviews/consolidates and freezes fullSHA: run new static/type/lint/304+ordinary units/cold build, all previous20 browser scripts plus new UX suite on dev and fresh production, mandatory source/served-build guards, four-width actual visual/PDF/native print and full operational/workforce/financial/migration/quota rollback regression. Old f72 gate is an inventory/baseline only. Final after/client-demo evidence and exact pass/fail/untested limits will replace this preparation state. No commit/staging, backend/auth/deploy/push/main merge or old worktree modification by Agent3.

## Completed source checkpoint — preparatory results (supersedes pending statements above)

Application checkpoint c53f08e62c86f46e64bd4cfce7c7162aab6362a8; source tree8439141b90e0d2e6c8f7dd6dab701073480d6d37. Current owner harness commits are consolidated by the coordinator; Agent3 has made no source edits or commits. The checkpoint is stable enough for preparatory execution, but the coordinator has not frozen the final consolidated source/test SHA.

| Check | Preparatory result | Evidence |
|---|---|---|
| TypeScript | PASS, exit0 | explicit tsc --noEmit invocation |
| ESLint src | PASS, exit0 | explicit eslint src invocation |
| Units | 304 passed,13files | integration-evidence/quotation-ux/units-preparatory.log |
| Dialog regressions | 64 groups passed,4widths,zero console/page errors | dialog-regressions-prep03.log; dialog-preparatory03/browser-results.json |
| Original quotation journey | 4complete width journeys passed | quotation-browser-prep06.log; tmp/quotation-qa/browser-results.json |
| Independent UX suite | 64groups passed,4widths,zero console/page errors | preparatory-attempt06/browser-results.json;quotation-ux-browser-prep06.log |
| Independent draft and accepted PDF | 16PDFs,48pages,all pages nonblank;text totals/native pagination match | preparatory-attempt06/browser-results.json |
| Final consolidated21-suite dev/production gate | NOT RUN | requires coordinator fullSHA freeze |

The64UX groups include SPA crossquote state reset, Step1 inline dialogs, all5keyboard step activations with heading focus, explicit example append, no-price heading, FOC breakdown and subcategory parent assertions, Simple/Advanced content preservation, canonical Olive commercial journey, invalid milestone percentages, read-only per-category pricing reviews, issued content locking with enabled presentation inspection, accepted conversion without duplicate project, exact invoice tax snapshot,1000receipt/4040statement/outstanding, reload hydration and editable revision with original accepted record/contract/invoice snapshot equality.

Original quotation regression retains all numeric, row/category count, reorder/duplicate/delete, VAT, milestone/term, reload, PDF/print, lifecycle lock, revision/duplicate/return-to-draft and project-history assertions. Dialog regression retains all64original groups; pricing navigation occurs only after opener-focus assertions. Adaptations use actual step selection and intended disclosure opening, with real label changes(Add Work Category/Add Priced Item/Add Heading/Add Item Breakdown/Add Subcategory/Add payment milestone). No skip,expected-failure,subset or weakened .first fallback was added. No changes were made to the other owners' five harness files.

Preparatory attempts are retained individually. Attempt01 failed on a test fixture assumption: fresh seeded application data is not written to localStorage until a public save. Setup now clicks Save Draft before comparing the reference. Attempt02 reached the correct4040.00statement but expected comma formatting; corrected only the rendered string assertion. During legacy adaptations, closed duplicated category/actions and old Add payment term/Preview selectors stopped harnesses; explicit navigation/disclosure and new labels corrected these. These are harness mismatches, not established application defects. Do not interpret earlier incomplete attempts as application passes.

An initial dialog run used its pre-existing evidence default and rewrote8tracked artifacts. Those new outputs were copied into ignored integration-evidence/quotation-ux/dialog-preparatory03, then the exact HEAD bytes of the8existing artifacts were restored. No substantive old report/evidence diff remains. Final runner must set AZZORA_DIALOG_EVIDENCE to its final isolated folder explicitly.

Visual inspection to date: actual1440Scope and390Pricing PNGs show readable category/item grouping, aligned inputs and stacked pricing reviews without horizontal page overflow. This is preparatory and not a complete final visual certificate. A last preparatory run adds full-page stage captures plus matched reference Scope(one category/item expanded) and blank Simple Scope at all4widths. Screenshot manifest records SHA256,URL,document height and overflow; final rerun must bind these to the frozen fullSHA. Final native PDF renders and all-width image inspection remain required.

Final Vitest and any Agent3-owned dev server must use tests/agent-3-vite.config.mjs to keep cache writes inside this worktree. Dependencies are a junction; the preparatory ordinary Vitest304pass is not a substitute for that isolated final invocation.

Final preparatory attempt07 also passed all64groups with zero browser errors:60actual full-page PNGs,16PDFs/48pages. Manifest:integration-evidence/quotation-ux/preparatory-attempt07/browser-results.json. Application source remained unchanged through the suite. Matched reference Scope heights1440/1024/768/390:4494/4723/4915/5511px;blank Simple Scope1603/1619/1641/1817px. No horizontal page overflow in any matched capture. These are separate step documents, whereas the old before heights measured the entire single-page editor; the comparison documents scope reduction but does not claim equal visible content or DOM-control counts. FullSHA final evidence is still pending.

Coordinator demo refinement: the Olive fixture explicitly edits all3Payment descriptions and Due condition / Notes through public fields, replacing any default template wording.50%:Advance on acceptance / Due on acceptance;40%:Progress stage / Due at agreed progress inspection;10%:Handover / Due at agreed handover. The test asserts exact saved description/note arrays both before and after the invalid-percentage/recovery case, alongside the unchanged5040grand total. No application source or actual browser profile is changed. Attempt08 PASS:all64groups,zero browser errors,60screenshots and16PDFs/48pages. Refreshed evidence:integration-evidence/quotation-ux/preparatory-attempt08/browser-results.json;log:quotation-ux-browser-prep08.log. Independent pypdf text extraction of1440draft export confirms all3milestone descriptions and5,040.00. This is the latest preparatory fixture/evidence; final frozen-SHA dev/production gate remains pending.
