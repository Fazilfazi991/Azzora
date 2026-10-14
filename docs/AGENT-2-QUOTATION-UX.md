# Agent 2 quotation UX frame handoff

QUOT-UX-02. Worktree `C:/Users/USER/Desktop/Projects/Azzora/azzora-quotation-ux`, branch `codex/azzora-quotation-ux`, starting `698d375` (documentation above the verified `f72e6c1` application). No git add or commit by Agent 2.

## Frame available for composition

`src/quotation/QuotationGuide.tsx` exports `QuotationGuide({step:number,onStepChange:(step:number)=>void,children:ReactNode})` and readonly `stepLabels` in the agreed 0..4 order. It imports `quotation-ux.css` itself. The parent owns active step content, lifecycle and validation.

The frame provides five native keyboard-reachable step buttons, exact full accessible names, `aria-current="step"`, current heading/help and a `.quotation-step-panel` region. Focus moves to the heading when the controlled step changes, without stealing focus on initial mount. At 900px and below the compact labels are **Customer / Scope / Pricing / Payments / Preview**, while the accessible names keep the exact agreed full labels. All five targets remain visible and keyboard reachable.

## CSS contract for workflow owner

- `quotation-context-help`: short help/examples placed next to their relevant field.
- `quotation-category-grid` + `quotation-work-category`: simple work-category choices; use native buttons with `aria-pressed` if selectable, or existing labelled controls.
- `quotation-advanced` + `quotation-advanced__body`: native details/summary disclosure. Leave closed unless explicitly opened by the user. Keep nesting/numbering/source overrides here, not in the main novice path.
- `quotation-editable-grid`: editable fields, visually distinct from derived amounts.
- `quotation-calculated-grid` + `quotation-calculated-value`: read-only pricing outputs; use output or `.quotation-calculated-value__amount` for values, span/small for labels. Add `quotation-calculated-value--total` only to the grand total.
- `quotation-summary-line`: label/value rows inside a summary.
- `quotation-step-actions`: current step Back/Continue/primary action group.
- `quotation-form-section`: optional additional panel without relying on global styles.
- `quotation-guide-help`: existing composition help paragraphs/panels; shorter, readable help styling with a wrapping example-action row.
- `quotation-advanced-toggle`: a full-height labelled toggle for advanced scope controls.
- `quotation-category-summary` / `quotation-item-summary`: native disclosure summaries with separate name and quantity/amount hierarchy.
- `quotation-calculated`: a calculated line output, visually separate from the nearby quantity/rate inputs.

Only current-step content should be passed as children. The frame does not hide existing actions, modify data or infer completion. CSS is scoped to the guide/new quotation classes; existing BOQ selectors are nested under `.quotation-module .quotation-step-panel`. There is no new motion, dependency or PDF styling.

## Baseline actually inspected

Read-only disposable Chromium contexts inspected the existing port 5210 editor at 1440 and 390px before frame authoring. The reference quotation exposes 642 BOQ buttons and four work areas in one continuous editor. There was no document overflow, but customer fields and revision metadata compete before the scope; advanced BOQ controls recur beside ordinary row entry.

The working design keeps AZZORA rust/cream/bronze and Space Grotesk/Inter. The focal task becomes the current quotation step. Advanced controls belong in explicit disclosures; calculations should read as outputs rather than editable form fields.

## Executed bounded verification

Frame and CSS are complete and composed with the workflow owner's source. The initial four-width composed development pass used port 5222 in this new worktree, disposable Chromium contexts and the actual reference quotation; no model/storage fixtures or data changes were required. The later requested review of Agent 1's completed checkpoint at port 5216 is recorded separately below.

| Check                                         | Result                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| TypeScript `tsc --noEmit`                     | Passed                                                                                                  |
| ESLint for `src/quotation/QuotationGuide.tsx` | Passed                                                                                                  |
| Five steps at 1440/1024/768/390               | 20 step/viewport states passed                                                                          |
| Native keyboard navigation                    | All five buttons reachable by Tab; Enter/Space changes step; exact accessible names/current step passed |
| Focus after step changes                      | Heading receives focus; initial mount does not move focus                                               |
| Continue from bottom of content               | 4 passed; heading remains below the sticky app bar                                                      |
| Navigation targets                            | At least 64px on the smaller layouts, 72px on desktop; all widths/heights exceed 44px                   |
| Document overflow                             | None in all 20 states                                                                                   |
| Browser page/console errors                   | 0                                                                                                       |
| Saved data                                    | Exact localStorage value unchanged throughout navigation                                                |
| Workflow source stability during final pass   | SHA-256 before/after matched: `da9e304aa8a0a57689f3367442b720b131aa12fff9fe941ba7c0ab3fea85c921`        |

Desktop, tablet and mobile screenshots were visually inspected, including the scope category/item details and pricing outputs. At 768px the initial full-label layout broke long words into narrow columns; this was corrected within the owned CSS by using compact labels through 900px. The 390px nav fits five approximately 65px-wide buttons. The actual reference scope now exposes 11 visible BOQ action buttons for its selected category, while retaining all 13 categories. The baseline count of 642 referred to BOQ DOM buttons across the original continuous editor, so these are distinct measures rather than an equivalent count comparison.

Local temporary screenshots are under `tmp/quotation-ux-review/` (baseline, preliminary and final captures). They are ignored QA files rather than new deliverable/source ownership. No test files, dependencies, motion, PDF styling, global styles or domain code were introduced. Agent 2 did not stage or commit anything.

The 304-unit/20-suite verified baseline was not rerun or certified by this bounded UI pass. Production build, full journeys, screen-reader/physical-device behavior and independent combined QA remain with the coordinator/Agent 3 after freeze.

## Completed Agent 1 checkpoint review at port 5216

After Agent 1 explicitly handed off its completed source, a new bounded disposable-browser pass inspected the actual `http://127.0.0.1:5216` composition at **1440 and 390px**. Source SHA-256 was stable before/after the pass: `73a4fc7ae3086de82a78cec4f07df8c64c74f4d7b6b4f12dcbbfc56522496d7e`.

- All five steps at both widths passed: **10 step/viewport states**, plus **2 Continue-from-bottom focus checks**.
- Exact full accessible labels, one current step, sequential native Tab access and Enter/Space activation passed. Mobile visible labels are Customer / Scope / Pricing / Payments / Preview.
- Step targets measure at least 72px on desktop and 64px on mobile. Category summary targets also exceed 44px.
- Initial mount does not move focus. After step changes and Continue, the heading is focused and remains below the sticky app bar. At 390px the heading top was approximately 515px while the bar bottom was 64px (preview heading approximately 609px).
- All ten states had zero document overflow; zero browser page/console errors occurred.
- The calculated pricing grid contains no editable input, textarea or contenteditable element. Discount and VAT percentage remain editable in the draft. Calculated cards read AED 200,320.75 subtotal, AED 0.00 discount, AED 10,016.04 VAT and AED 210,336.79 grand total.
- Exact saved localStorage content remained unchanged while navigating and inspecting the reference quotation.
- Actual desktop scope/category details, mobile step navigation and mobile pricing were visually inspected. Current screenshots use the `checkpoint5216-*` prefix in the same ignored temporary QA folder.

No frame/CSS defect required a source change after this requested checkpoint review. The two workflow-content observations below were reconfirmed and remain suggestions for Agent 1/coordinator. This review does not certify future edits or replace independent frozen-source QA.

## Consolidated content observations for workflow owner

These are content-level usability follow-ups in `Quotations.tsx`, not frame defects, and were not edited by Agent 2:

1. **Shorten the Scope introduction on the reference quotation.** Selector: `.quotation-step-panel section.quotation-guide-help`. Its text is 569 characters; the panel measured about 422px high at 1440 and 558px at 390. The actual `.boq-builder` begins at y=991px / y=1175px respectively, so a mobile user must scroll through repeated guidance before reaching work categories. The frame already explains the step in one sentence. Keep a short example/action and put the longer advanced-mode explanation in a native disclosure. Preserve the existing advanced-data notice when relevant.
2. **Treat amount-in-words editing as an advanced override.** Step Pricing Summary; selector `getByLabel("Amount in Words — manual override", { exact: true })`. It is visible and outside any details disclosure at both inspected desktop/mobile widths. A new user may read it as required input even though words are calculated automatically below. Place the override inside a closed `.quotation-advanced` disclosure while keeping the calculated words and editable discount/VAT clear. Do not change calculation semantics.

The latest workflow composition already reduces top-level competition by keeping only Quotation list in the page-header actions and placing duplicate/revision controls in Version actions. No further frame/CSS blocker was observed in the bounded pass.

## Handoff boundary

The initial presentation delivery contains `src/quotation/QuotationGuide.tsx`, `src/quotation/quotation-ux.css`, and this report. The later explicitly authorized harness adaptation adds the two test files described below. Root alone reviews/stages/commits them. The shared worktree also contains the workflow owner's separate edits; Agent 2 has neither changed nor staged those. No merge, deployment or old-worktree modification occurred. Agent 3 owns independent QA after freeze.

## Authorized existing-harness adaptation

The coordinator subsequently assigned only `tests/boq-visual.mjs` and `tests/quotation-print-browser.mjs` to Agent 2. Both now use Agent 3's public `quotation-ux-helpers.mjs` contract to navigate the five steps and open native category/item disclosures. Labels follow the current Work Category / Subcategory / Heading / Priced Item UI. The print script uses `auditUrl` so all URL aliases must agree. No application, CSS, helper, fixture, calculation or PDF-generation code was changed for this assignment.

Every original geometry, nesting, total, keyboard, sheet-count, PDF-content, A4-size and saved-data assertion is retained. BOQ additionally asserts the exact two-row/two-category fixture counts and the restored subsection class. No skip, expected failure or assertion weakening was introduced.

### Preparatory executed results, 14 October 2026

Both scripts used `AZZORA_URL`, `AZZORA_TEST_URL` and `QUOTATION_URL` set to `http://127.0.0.1:5216`, with bundled Node at `C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

| Executed script | Evidence settings | Result |
| --- | --- | --- |
| `node tests/boq-visual.mjs` | `BOQ_PHASE=ux-agent2-preparatory` | Exit 0. All 1440/1024/768/390px cases passed: heading plus priced item, parent assignment, detach/reattach, AED 236.25, keyboard menu Escape/focus return and exact document width. Repeated once to confirm the complete console result; both runs produced all eight screenshots. |
| `node tests/quotation-print-browser.mjs` | `AZZORA_PRINT_EVIDENCE=tmp/quotation-ux-review/harness-print` | Completed, zero errors/failures; all four records passed. Report timestamp `2026-10-14T10:17:29.728Z`. |

| Quotation / width | Preview sheets | Actual print-popup sheets | Chromium native PDF pages | Downloaded PDF pages | Saved data unchanged |
| --- | ---: | ---: | ---: | ---: | --- |
| Reference / 1440 | 7 | 7 | 7 | 7 | Yes |
| Accepted workflow / 1440 | 3 | 3 | 3 | 3 | Yes |
| Reference / 390 | 7 | 7 | 7 | 7 | Yes |
| Accepted workflow / 390 | 3 | 3 | 3 | 3 | Yes |

The workflow fixture still creates a project-linked quote, quantity 2.5 at rate 90, finalizes and accepts it, and asserts the issued status is locked. Independent Python/pypdf checks retained all page-text/footer/A4 and exact reference/workflow amount checks on both actual native-print PDFs and downloads. The application Print action opens its real popup; no print stub or prototype CSS is used. Detailed PDF extraction, hashes and results are in `tmp/quotation-ux-review/harness-print/pdf-results.json` with eight PDF artifacts alongside it. These and the screenshots are ignored local evidence, not newly committed artifacts.

BOQ evidence: `docs/boq/ux-agent2-preparatory-{1440,1024,768,390}.png` and `docs/boq/ux-agent2-preparatory-boq-{1440,1024,768,390}.png`.

The workflow owner has now addressed both earlier content suggestions: source contains the closed Advanced scope explained disclosure and the amount-in-words advanced disclosure. This is a source-confirmed resolution; the earlier measurements remain a historical record of the reviewed checkpoint.

### Integration boundary for this follow-up

Root must include Agent 3's helper before running the adapted scripts and keep all URL aliases identical. No staging or commits by Agent 2. HEAD observed after these preparatory runs: `c53f08e62c86f46e64bd4cfce7c7162aab6362a8`; application source SHA-256 at handoff inspection: `04d73493cd6b8f3f06fa579d19c1056384f9a72178ea96523a7c7991cc184a46`. This shared development server was not a frozen final release, so these runs are preparatory evidence only. Full TypeScript, ESLint, unit, production-build and independent frozen-source certification remain with the coordinator/Agent 3; Agent 2 did not rerun or claim them in this harness-only follow-up.
