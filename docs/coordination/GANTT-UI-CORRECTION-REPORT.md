# AZZORA Gantt UI correction — coordinator report

## Scope and frozen revision

This local correction follows the verified timeline delivery at application/test SHA `b0858807194e13b3fb397fbdd2a50283e0649a3e` and its documentation commit `53440e55a1557a03f8d46b19770a27251ff35ce5`. The corrected application and regression tests are frozen at `5053b9be2c0e20070225a1805e903670270a335a` on `codex/azzora-timeline-integration`. Its `src` tree is `242eb06e9c56c318ac431074b5b5dbb1d3c27520`; its `tests` tree is `49f10c95f5952aaa38b9449106eaad0ecc9a4fc2`.

Agent 2 changed only `src/components/Planning.tsx` and Gantt rules in `src/styles.css`. The planning engine, browser-local storage model/key, approved task dates, proposal/approval commands, and all commercial and quotation source remain unchanged. No backend, push, deployment, or merge into `main` was performed.

## Root causes and corrections

| Finding | Cause | Correction |
| --- | --- | --- |
| Dependency lines crossed short labels and attached to wrong sides for SS/FF/SF | The previous SVG builder always joined predecessor right edge to successor left edge and used one fixed elbow | Connectors now use each link's FS/SS/FF/SF start/finish sides, route through row-edge lanes around intervening bars, retain arrowheads, and fade unrelated links when a task is selected. Scheduler relationship calculations did not change. |
| Short bars hid names; long names ended in ambiguous ellipses | Names were suppressed below 70 px and longer labels were clipped to the bar width | Bars keep their progress fills and expose complete names on hover/focus and in accessible labels/titles. The task row and selected-task summary provide additional detail; one click opens TaskDrawer. |
| Task table and timeline had a second vertical scroll, and the date heading could drift under fixed controls | The Gantt container had its own max-height and `overflow:auto`; the heading lived inside that scrollport | The document owns vertical scrolling. The date grid alone scrolls horizontally, with a separate sticky heading synchronized to its scroll position. Mobile heading and focus offsets clear the fixed controls. |
| Narrow Month-scale milestone was offset inside its date cell | A minimum-width diamond used the date cell's left edge as its left edge | The milestone diamond is centered on the approved date cell at every scale. Approved dates and duration calculations are unchanged. |
| First pointer activation after baseline capture sometimes selected a bar without opening details | Focus selection rerendered the bar between pointer-down and click | Pointer activation now opens TaskDrawer on its first click; keyboard-visible focus still selects and highlights connected links. |

Connector attachment follows the existing link type: FS joins finish→start, SS start→start, FF finish→finish, and SF start→finish. The corrected route changes only SVG presentation; it does not calculate or persist suggested dates. The selected-task capture shows only that task's incident links emphasized while the other links recede.

## Visual evidence

These screenshots use the same disposable browser fixture. The coordinator inspected the actual rendered chart crops at all four widths, the mobile scrolled heading, full-name tooltip, selected dependencies, collapsed phase, milestone, and proposed overlays.

| Width | Before | After | Chart detail |
| --- | --- | --- | --- |
| 1440 px | [Before](../planning/evidence/gantt-before-1440.png) | [After](../planning/evidence/gantt-after-1440.png) | [Before chart](../planning/evidence/gantt-before-chart-1440.png) · [After chart](../planning/evidence/gantt-after-chart-1440.png) |
| 1024 px | [Before](../planning/evidence/gantt-before-1024.png) | [After](../planning/evidence/gantt-after-1024.png) | [Before chart](../planning/evidence/gantt-before-chart-1024.png) · [After chart](../planning/evidence/gantt-after-chart-1024.png) |
| 768 px | [Before](../planning/evidence/gantt-before-768.png) | [After](../planning/evidence/gantt-after-768.png) | [Before chart](../planning/evidence/gantt-before-chart-768.png) · [After chart](../planning/evidence/gantt-after-chart-768.png) |
| 390 px | [Before](../planning/evidence/gantt-before-390.png) | [After](../planning/evidence/gantt-after-390.png) | [Before chart](../planning/evidence/gantt-before-chart-390.png) · [After chart](../planning/evidence/gantt-after-chart-390.png) |

Additional inspected captures: [mobile vertical scroll](../planning/evidence/gantt-after-scrolled-390.png), [full-name tooltip](../planning/evidence/gantt-after-long-name-tooltip-1440.png), [selected links](../planning/evidence/gantt-after-selected-tooltip-1440.png), [mobile milestone](../planning/evidence/gantt-after-milestone-390.png), [collapsed phase](../planning/evidence/gantt-after-collapsed-1440.png), and [proposal overlay](../planning/evidence/gantt-after-proposal-chart-768.png).

## Controlled checkpoints

| Owner | Isolated commits | Replayed integration commits |
| --- | --- | --- |
| Agent 2 — Gantt source/evidence | `10e4a3f`, `c5fc54d`, `123ff15`, `2e6137a` | `0c7abb5`, `6fce04f`, `1ebe965`, `cce694c` |
| Agent 1 — independent date/dependency audit | `e0726b8`, `27b8a60`, `875c99a`, `9bb06cb`, `40c528b` | `55618af`, `928342c`, `8980f91`, `9fd7ca7`, `5053b9b` |
| Agent 3 — independent browser QA | `464dbb6`, `3b4f2a3`, `fe6fd6a` | `47a186e`, `2b58ac8`, `cb9f116` |

Two initial Gantt browser assertions sampled horizontal-scroll geometry before React received the browser scroll event. Their test-only corrections wait with a bound for heading/body scroll positions to converge, then retain the same pixel-alignment assertions. The corrected 31-check independent Gantt journey passed on the unchanged source before the full gate restarted. A separate new date audit initially imported TypeScript source through development-only browser URLs; Agent 1 replaced those imports with an ordinary Settings data export and local Node engine bundle. The amended audit passed in isolated development and fresh production preview without changing source. The first development gate also recorded a harness URL setup interruption. These stopped/failed runs remain separate from final results.

## Independent verification

Agent 3 completed the full gate on exact SHA `5053b9be2c0e20070225a1805e903670270a335a`. The [per-suite independent QA matrix](../planning/evidence/gantt-final-qa-matrix.md) records every development and fresh-production exit code and the excluded stopped attempts.

| Check | Exact result |
| --- | --- |
| Unit tests | **384 passed / 0 failed**, 17 files |
| TypeScript | Passed |
| ESLint | Passed |
| Cold production build | Passed; existing nonblocking bundle-size advisory |
| Development browser gate | **31 suites passed / 0 failed** |
| Fresh-production browser gate | **31 suites passed / 0 failed** |
| Independent Gantt checks | **31/31** in development and **31/31** in production |
| Independent date audit | Day, Week, Month; one/multi-day tasks, weekend/holiday spans, Month milestone center, typed FS/SS/FF/SF endpoints, multiple-predecessor bounds and horizontal scroll passed in both environments |
| Responsive visual review | 1440, 1024, 768, 390 px full charts and 390 px scrolled chart inspected in production; timeline UI suite also covered 390×600 |
| Existing quotation print journey | Seven-page reference and two-page accepted workflow passed native/download checks at 1440/390 px; saved data unchanged |

The independent browser fixture confirmed one document-owned vertical scroll, a horizontally synchronized date header, no page-level horizontal overflow, a first-click TaskDrawer opening after baseline capture, keyboard details, collapsed phases, task progress, selected links, and baseline/proposed overlays without approved-date writes. Agent 1's separate geometry audit found no remaining approved-date positioning or dependency-calculation defect. The coordinator inspected the committed four-width before/after screenshots and the selected/tooltip/proposal captures; Agent 3 separately inspected fresh-production renderings.

This revision is **ready for owner visual acceptance** as a browser-local Gantt/CRM demo. Compact bars and mobile task names still require hover/focus tooltip or opening the task detail to read the complete name. Browser-local storage and demo identity retain the previously documented limitations; this cycle did not add backend authentication, cloud persistence, or live collaboration. Visual checks used Chromium viewport emulation, not physical devices or a screen-reader speech audit. No push, deployment, or merge to `main` occurred.
