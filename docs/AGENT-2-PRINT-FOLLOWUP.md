# Agent 2 print follow-up - FIX-A2-02 / FINAL-06

Completed 14 October 2026 (Asia/Dubai). Native Chromium quotation printing now produces the intended page count without a blank trailing page. No integration merge, push, deployment, backend work or unrelated source changes.

## Git delivery and source scope

- Branch: `codex/azzora-workforce-approvals`.
- Worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-workforce-approvals`.
- Starting SHA: `94c568b737fc3f58713ef6f9c866729868bb2612`.
- **Print CSS fix and regression test SHA: `39c1bffebdac0abedf1bbf2c92ecc679e3ee1935`.**
- A following documentation/evidence commit records this report and its exact verification artifacts.
- Only application edit: `src/quotation/document.ts`, inside `printQuotation`'s popup stylesheet: `svg{width:100%;height:100%}` becomes `.sheet svg{display:block;width:100%;height:100%}`.
- New test: `tests/quotation-print-browser.mjs`. No other existing test, source, package, shared modal, workforce, financial calculation, snapshot, loader, App, schema, style or central coordination file changed.

The installed interface-design guidance and AZZORA Architectural Prestige design system were consulted. The PDF skill was used for native output parsing, rendering and visual QA. Existing typography, stationery, dimensions, margins, content and downloaded-PDF generation are preserved. No motion or redesign was added.

## Root cause and correction

A 297 mm sheet contains a full-height SVG. Inline SVG participates in a text line box and adds baseline space below the sheet: the measured sheet height was 1122.515625 px, while scrollHeight was 1127 px. Chromium printed the overflow as an extra blank final A4 page. Making the SVG a block removes that baseline space; scrollHeight becomes 1123 px and native page count matches the actual sheet count.

This is a source correction. The passing tests do not inject prototype CSS, replace window.print, mock Page.pdf or fabricate PDF output. They click the real Print button, use the real print popup and export through Chromium's native Page.pdf with CSS page size and backgrounds. Python pypdf parses the resulting files independently.

## Reproduction and exact results

The new ordinary regression assertions were first run against the unchanged pinned production build on isolated port 5188. All four native-print cases failed as expected, while downloaded page counts remained correct. After the one-line CSS change, the same test ran against the rebuilt production bundle on isolated port 5189 and all four cases passed.

| Quotation / width            | Native before | Native after | Download before / after | Final blank pages |
| ---------------------------- | ------------: | -----------: | ----------------------- | ----------------: |
| Reference / 1440             |             8 |            7 | 7 / 7                   |                 0 |
| Reference / 390              |             8 |            7 | 7 / 7                   |                 0 |
| New accepted workflow / 1440 |             4 |            3 | 3 / 3                   |                 0 |
| New accepted workflow / 390  |             4 |            3 | 3 / 3                   |                 0 |

Each workflow quotation is newly created through the UI, linked to an existing project, given a BOQ line (2.5 x AED 90), finalized and accepted before printing. The test checks AED 225.00 net, AED 11.25 VAT and AED 236.25 gross. Reference net/VAT/gross remain AED 200,320.75 / AED 10,016.04 / AED 210,336.79.

The parser asserts actual page count equals both the rendered sheets and the explicit expected 7/3 pages, every page contains text and its correct page footer, each page is A4, and brand/totals remain. Printing/downloading preserves the complete saved-data byte string, including the accepted quotation and history.

Before/after comparisons additionally confirm identical downloaded PDF extracted text, embedded font names and page boxes, and identical native content text across the intended pages. This is a semantic comparison, not a claim of binary-identical independently generated PDFs with creation metadata.

| Verification                          | Result                                         |
| ------------------------------------- | ---------------------------------------------- |
| TypeScript `tsc --noEmit`             | Passed                                         |
| ESLint `eslint src`                   | Passed                                         |
| Existing quotation unit tests         | 23 passed, 0 failed, 1 file                    |
| Production build                      | Passed, no warnings                            |
| Native print matrix                   | 4 passed, 0 failed; 20 actual native pages     |
| Downloaded PDF matrix                 | 4 passed, 0 failed; 20 actual downloaded pages |
| Browser page/console/network errors   | 0                                              |
| Before/after preservation comparisons | All 4 passed                                   |
| `git diff --check`                    | Passed                                         |

The tests use disposable browser contexts and fictional seed/test records, without the owner's normal browser profile. No broad combined-branch QA gate was claimed or run in this task.

## Evidence and visual verification

- [Automated summary](agent-2-print-evidence/automated-results.json)
- [Original failing ordinary assertions and parsed PDFs](agent-2-print-evidence/baseline/pdf-results.json)
- [Passing production assertions and parsed PDFs](agent-2-print-evidence/verified/pdf-results.json)
- [Before/after content and download comparisons](agent-2-print-evidence/comparison-results.json)
- [All 20 final native pages rendered together](agent-2-print-evidence/rendered/native-pages-contact-sheet.png)

All 20 final native pages were rendered with Poppler, along with all four original blank tails. The contact sheet and representative full-size first/last pages were visually inspected: quotation headers, stationery, content, terms, footer/page numbering and spacing remain intact; the formerly blank final pages are absent.

| Output                 | Native print PDF                                                             | Downloaded PDF                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Reference 1440         | [7 pages](agent-2-print-evidence/verified/reference-native-1440.pdf)         | [7 pages](agent-2-print-evidence/verified/reference-download-1440.pdf)         |
| Reference 390          | [7 pages](agent-2-print-evidence/verified/reference-native-390.pdf)          | [7 pages](agent-2-print-evidence/verified/reference-download-390.pdf)          |
| Accepted workflow 1440 | [3 pages](agent-2-print-evidence/verified/workflow-accepted-native-1440.pdf) | [3 pages](agent-2-print-evidence/verified/workflow-accepted-download-1440.pdf) |
| Accepted workflow 390  | [3 pages](agent-2-print-evidence/verified/workflow-accepted-native-390.pdf)  | [3 pages](agent-2-print-evidence/verified/workflow-accepted-download-390.pdf)  |

Baseline PDFs are deliberately retained under `agent-2-print-evidence/baseline/` as failing evidence, not as fixed-output deliverables. Hashes and full per-page parser results are included in the two pdf-results files.

## Reproduction and integration

```powershell
npm run typecheck
npm run lint
npm exec vitest run src/quotation/quotation.test.ts
npm run build
# Terminal 1
npm exec vite preview -- --host 127.0.0.1 --port 5189 --strictPort
# Terminal 2 (Python with pypdf must be available)
$env:AZZORA_TEST_URL = 'http://127.0.0.1:5189'
node tests/quotation-print-browser.mjs
```

The new test accepts AZZORA_URL or AZZORA_TEST_URL, AZZORA_PRINT_EVIDENCE for output location, and AZZORA_PYTHON for a Python executable. It uses bundled Python when available, otherwise python from PATH. This session used bundled Node/Python, pypdf 6.10.0 and Poppler; no dependency/lockfile change was needed.

The coordinator can review/apply the two-file fix/test commit and the following report/evidence commit onto the integrated branch. Resolve the single print-style change without replacing other Agent 1 quotation/document code. Agent 3 should rerun this native print test against the newly frozen integrated SHA before certification. FINAL-05 search corrections belong to Agent 1 and were not touched here.

Remaining verification limits: physical printers, Safari/Firefox and real devices were not exercised. Native Chromium PDF output is verified; the final combined branch is not certified by this isolated follow-up.
