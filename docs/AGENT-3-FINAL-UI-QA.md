# Independent QA preparation — final UI, live preview and BOQ hierarchy

Status: **preparation only; no combined-feature certification**. Published starting SHA: `aebd0688853e3fff416939ae8227946d690c211e`. QA native worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-final-ui-qa`, branch `codex/azzora-final-ui-qa`. No application source edits, pushes, deployments or merges. The coordinator integrates reviewed work and provides the exact final freeze SHA before final runs.

## Accepted scope and ownership

The three owner instructions have been read in full: final sidebar/dashboard corrections; real live quotation preview; intuitive BOQ parent/child structure and deterministic numbering. These are one cumulative acceptance cycle. Previous requirements remain active.

- Agent 2 owns sidebar/dashboard, preview surface and hierarchy UI, with sequential shared-editor ownership coordinated by the coordinator.
- Agent 1 owns Accounts verification, preview editor wiring and hierarchy/domain numbering and pricing work.
- Coordinator exclusively owns quotation `document.ts` alignment and integration. Agent 3 will not edit it.
- Agent 3 owns independent QA/test/report work. Reserved test changes: new `final-ui-navigation-browser.mjs`, `quotation-live-preview-browser.mjs`, `quotation-hierarchy-browser.mjs`, and the explicitly requested exact educational-action label update in `quotation-ux-browser.mjs`.

The seven-page reference expectations remain unchanged. Coordinator reports that approved alignment fixes retain exactly seven pages; existing ordinary quotation assertions must not be relaxed. Short custom templates and default-terms workflows retain their actual distinct pagination contracts.

## Immutable published-base evidence

An isolated cold build of the published SHA was served on strict local port 5240. It produced 96 route/width observations: all 19 existing sidebar modules plus the five additional Accounts URLs at 1440, 1024, 768 and 390 pixels. Captured 36 actual PNGs, eight reference quotation PDFs (download/native at four widths), and public fictional seed exports. All 15 served files matched local cold-build SHA256 hashes; captured browser errors: zero. The baseline build passed, with the existing main-chunk size advisory.

Evidence: `docs/integration-evidence/final-ui-qa/before/manifest.json`. Application captures are from the actual immutable baseline, not a mockup or moving feature source. Dashboard full-page shots start at scroll position zero. Accounts direct pages all render the Accounts heading successfully.

The first 390px open-sidebar capture caught its transition partway through. A separate `sidebar-open-stable-390.png` was captured after the drawer reached x=0 (280px wide), and its SHA256 and geometry were added to the manifest. The original file remains as captured; the stable image is the valid visual comparison for the open mobile menu. Baseline image inventory is therefore 36 original PNGs plus this one corrected timing capture.

Observed visibility cause: the published sidebar is a flat 19-entry list under a single Project Execution label. Its navigation scroll area is 859px high but has only 595px of space at 1440×900 and 607px at 1024/768×900. Accounts is low in that list (y≈668/662), while lower modules require scrolling. Mobile correctly hides the closed sidebar. Thus the module is registered and reachable; information grouping and discoverability are the issue. These measurements describe the tested viewport; they do not claim Accounts is outside every viewport or missing.

Additional independent historical fixture: `before/historical-issued-reference.json`, created by Finalize→Confirm through the immutable published app in a new disposable context. The original `quotation-reference` is Finalized, including the repository-generated issued history snapshot and original manual numbering. Its PDF and both file hashes are recorded in the baseline manifest. Baseline PDF count including this extra historical export is nine; the original eight-file capture set remains separately identifiable. No actual browser profile or user records were used.

The exported fixture remains ignored and local. No client-reference copy or browser export is tracked. The committed hierarchy harness can reconstruct a fictional issued record from the app's existing reference seed when the export is unavailable; final certification will set `QA_HISTORICAL_FIXTURE` to this authentic old-UI export so the migration/immutability assertion is independent of the new implementation.

## New harness preparation

| Harness | Prepared contract | Execution status |
|---|---|---|
| final-ui-navigation-browser | Five exact navigation groups, all 19 route links through keyboard, initial Accounts visibility without scrolling, one current link, no nested scroll ancestors, six Accounts URLs plus refresh/Back/Forward, mobile openers/Tab/Escape/focus, raw record invariance, four widths | Syntax/preparation only; owner UI pending |
| quotation-live-preview-browser | Separate fictional View Example, empty/incomplete draft preview, current three-category long BOQ, discount/VAT, milestones/terms, all five steps, real SVG/download/native-print page counts and text, draft/unissued state, exact-step/opener-focus/input preservation and reload, four widths | Syntax/preparation only; actual preview labels/surface contract pending |
| quotation-hierarchy-browser | Category 2, parent 2.1 and children 2.1.1/2/3, second parent 2.2/2.2.1, special pricing, delete/insert/reorder, duplicate/move/delete whole groups, unique IDs/numbers, no double-charge, save/reload, SVG/PDF numbering, independently old-issued immutability, four widths | Syntax/preparation only; actual hierarchy controls pending |
| retained quotation-ux-browser | Exact View worked example→View Example label change required by new owner instruction | All substantive existing assertions retained; no final execution yet |

The new tests intentionally encode requested behavior instead of passing against the old implementation. Their selectors must be checked against the completed owner UI before the consolidated test/source freeze. The navigation contract permits a semantic static heading, native details, or an aria-expanded button because collapsible groups are optional; it does not permit ambiguous route fallbacks.

Preparatory runs against Agent 2's development server passed 113 independent navigation groups, 29 live-preview groups and 28 hierarchy groups across the four widths. The preview run includes recoverable failure messages for an aborted PDF logo asset and a blocked print popup. The authentic ignored old-UI finalized reference survived hierarchy preview, download and reload unchanged. Retained BOQ visual (four widths), quotation workflow, guided quotation UX (64 groups) and rapid search (166 checks) also passed after the exact changed labels, safe parent→child setup and new deletion confirmation were incorporated. These are useful selector/behavior preflights only: the served code was not the completed combined SHA.

Remaining additions before final test handoff: reconcile actual preview accessible name/close action and row/group operation labels; complete preview-generation/download/print failure injection using a supported observable network or browser failure; add parent collapse/expand and long multiline location cases, reference Demolition/Tiling/Gypsum/Plumbing relationship assertions, and native/download geometry checks for the approved alignment changes. None of these pending cases is currently represented as passing.

## Final verification plan

1. Coordinator reviews and consolidates all owner changes and QA tests, then supplies a full frozen SHA. Use an isolated QA checkout of that completed commit; retain published-base captures and old worktrees. No unintegrated branch is a final target.
2. Record exact HEAD, source/test trees, tracked source/test/config/package hashes and clean status. No source/test/config edits during the gate. A genuine application failure stops certification and is reported with reproduction evidence and responsible owner; a reviewed correction requires a new frozen checkpoint. Preserve failed attempts separately; no silent retries.
3. Run TypeScript, ESLint, all ordinary unit/domain tests using the existing isolated-cache Vite/Vitest config, and a fresh cold production build. The published baseline inventory was 304 tests across 13 files; final counts must come from the completed run, including owner-added hierarchy tests.
4. Run every retained 21 browser suite against both dev and a fresh strict-port cold preview, plus the three independent new suites and any separately delivered Agent 1 Accounts check. Final suite count is determined by the frozen inventory, not assumed from the old certificate. Use no filters, skips, expected failures or weakened assertions.
5. Generate same-target, manifest-bound operational/commercial fixtures before their dependent boundary/composition suites. Set every available evidence environment variable explicitly. Route remaining hardcoded generated-artifact paths in an ignored temporary runner, preserving source/test bytes and tracked baseline artifacts; preflight screenshot parent paths and download copy destinations before the gate.
6. Check all requested widths, groups and routes, six Accounts URLs, mobile closed-menu inertness, group keyboard traversal, current states, focus restoration, refresh/Back/Forward, no page overflow, controls/tables/long names, empty/validation states, and reduced motion. Verify navigation and preview do not alter commercial records, linked relationships or domain totals.
7. Verify the exact category→parent→children numbering sequence and the 12 owner hierarchy scenarios. Known independent numbers: painting children 1400+700+875=2975 net; ceiling child 200; combined3175 net,158.75 VAT,3333.75 gross. Parent duplication adds only its2975 descendant subtotal, yielding6150 net/6457.50 gross, and deletion restores the original totals. FOC/By Client/Excluded add no charge. Compare stable IDs separately from visible numbers.
8. Test live preview before issuance from every step, with empty/incomplete/invalid and latest valid draft inputs. Assert real shared-renderer pages, DRAFT / NOT ISSUED label, all relevant BOQ/totals/milestones/terms, scrolling/zoom if provided, close/back/Escape exact-step/focus/input preservation, export/print success and clear failure handling. Preview must not bypass issue validation or rewrite issued snapshots.
9. Verify source QTN-AF-26049 semantics in Demolition, Tiling, Gypsum and Plumbing, alongside multi-page long description/location fixtures. Preserve cover, logo, grey headers, original columns, numbering, Summary of Cost, amounts/words, Payment Schedule, terms and footers. Inspect actual before/after screenshot and PDF-render pairs; alignment may change pixels but not saved content, approved styling or figures. Keep exact seven-page reference assertions.
10. Inspect every generated PDF's text, pages/nonblank tails and page renders; check quotation, invoice, PO, credit and populated report exports plus native print. Repeat the populated Project Financial Summary/Invoice Register and clearly labelled disposable pagination stress validation if the final changed surface warrants it. Record supplemental counts separately from the main browser gate.
11. Close with fresh HEAD/source/test/config/cold-build/served-file guards; record exact suite/check/unit/PDF/page/image counts and manual visual scope. No broad “fully tested” claim for unexecuted features, other browser engines, physical printers, actual backend/auth or owner acceptance.
12. Stop only owned QA runners/previews. Coordinator alone publishes the updated review branch/PR #1 after independent QA; Agent 3 does not push or merge main. Record final tested SHA separately from any later docs-only publication SHA and verify source/test trees match before publication certification.

## Readiness

Baseline evidence and historical issued fixture are prepared. New test scripts and the verification contract are available for coordinator review. Final browser execution is intentionally pending completed owner implementation and an exact combined freeze. No feature pass claim, remote SHA update or PR acceptance claim has been made in this preparation stage.
