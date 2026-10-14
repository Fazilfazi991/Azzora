# Agent 1 — final UI Accounts verification and source handoffs

Agent1 worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-accounts-navigation`; branch `codex/agent-1-accounts-navigation`. It was created natively from published **aebd0688853e3fff416939ae8227946d690c211e**. Old worktrees remain unchanged. No push, main merge, deployment, backend or database changes by Agent1.

## Accounts finding

Accounts is implemented and correctly registered. `#/accounts` renders Overview; invoices, payments, expenses, receivables and project-financials route correctly. The original visibility issue is the flat19-entry sidebar: Accounts is eleventh, after execution modules and the quotation divider. The inner nav has859px of content and a fixed-height sidebar, making Accounts disappear at shorter viewport heights.

| Actual viewport   | Accounts bounds | Inner nav bottom | Visible portion |
| ----------------- | --------------- | ---------------- | --------------- |
| 1440×768          | y668–709.5      | y664             | 0px             |
| 1024×768          | y662–703.5      | y670             | 8px of41.5px    |
| 768×768           | y662–703.5      | y670             | 8px of41.5px    |
| 390×667,menu open | y662–703.5      | y569             | 0px             |

At900px desktop/844px mobile it is visible, explaining why a route check alone misses the client's screenshot problem. No route-wiring patch is needed. Agent2 received these measurements/screenshots and owns the logical grouping/spacing/scroll fix; Agent1 did not edit App/styles/Dashboard/Accounts source.

## Focused regression harness

`tests/agent-1-accounts-navigation.mjs` tests the six exact requested URLs at1440,1024,768,390 widths: direct access, correct active Accounts link and active subtab, refresh, keyboard tab entry, Back/Forward through all six screens, mobile focus containment/Escape/opener restoration, no document horizontal overflow, actual register values and byte-identical saved records after every navigation. It additionally measures/captures Accounts before any scrolling at the four short-height viewports above.

The fixture is generated in-memory from the actual source domain functions, then installed only in disposable browser contexts. It has one accepted contract, one issued invoice, one posted receipt and one expense: contract AED1000; invoice AED1050; collected AED200; outstanding/overdue AED850; incurred cost AED100; paid cost cash AED50; profit AED900; margin90%. The same figures are asserted on the actual Accounts screens, and original saved bytes (including snapshots/history/IDs/amounts) must remain identical. No owner browser profile or live company records are accessed.

Default audit mode records visibility findings without hiding them. `--require-prominent-accounts` makes initial Accounts visibility, including short heights, a hard regression assertion for corrected integration. Output is ignored local evidence controlled by `QA_ACCOUNTS_EVIDENCE_DIR`; defaults to `tmp/agent-1-accounts-navigation`. `QA_ACCOUNTS_SOURCE_SHA` explicitly identifies an independently built server's source revision; absent that override the current HEAD is recorded. `QA_ACCOUNTS_PHASE` labels screenshots. All three URL variables must agree through the existing browser runtime.

The baseline production preview at5222 was built from **aebd0688853e3fff416939ae8227946d690c211e**, source tree **8439141b90e0d2e6c8f7dd6dab701073480d6d37**, before any feature changes. That published baseline passed TypeScript, **304unit tests/13files**, and a fresh Vite production build; existing >500kB advisory remains. The focused Accounts run passed **113navigation/data checks,zero browser errors**, at all four widths. Short-height prominence observations are separately reported as the verified baseline defect, not silently skipped.

Local evidence: `tmp/agent-1-accounts-navigation/browser-results.json`; `baseline-sidebar-dashboard-{width}.png`; `baseline-{overview,invoices,payments,expenses,receivables,project-financials}-{width}.png`; `baseline-short-sidebar-{width}x{height}.png`; initial unit JSON. These are actual browser captures, intentionally excluded from Git publication. Agent3/coordinator own durable final before/after evidence and independent combined certification.

## Live-preview and hierarchy handoff

- **f0b5abec01a86a33168952483d02fe3f1cbebd91**: persistent Preview Quotation, current q passed to conditionally mounted real preview while editor stays mounted, separate View Example action. Exact `Quotations.tsx` ownership was then explicitly relinquished to Agent2; no further Agent1 edits to that file. Agent2 owns preview UI/focus/error/download/print behavior and subsequent hierarchy UI.
- **e79173e7ecdac718482698e7a4572024c8e5458e**: pure hierarchy module,24focused tests and API report. Stable ID subtree commands; Heading parents bill zero; special pricing preserved; historical/reference/revision/issued numbering protected.
- **82fd68f207003986b16277cfca4ef2dd2edfa53b**: nested-category numbering correction plus4focused tests. Shared row/category child slots prevent duplicate generated numbers; category parentId is recursively numbered. API unchanged. Both domain SHAs were sent to Agent2/coordinator immediately.
- Agent2 preview **b19e0f152165fbb22c56344c9d193dab410807d0** was imported unchanged locally as **6c188f9e4f0bdb1b9f2b0af05bd4fe887bf04cac** to satisfy compilation. Its report creation was retained in the cherry-pick's documentation-only modify/delete conflict. Coordinator should integrate the original Agent2 commit once, not this duplicate local dependency.

With that dependency present, full TypeScript and scoped ESLint pass. Final local domain unit rerun: **332passed,0failed,14files** (304retained+28hierarchy). Full new hierarchy tests include financial totals, reference renderer preservation, issued snapshots, subtree operations, safe reparenting, nested categories, persistence and multi-page number mapping. The minor hierarchy-report formatting cleanup is documentation only.

No `document.ts`, financial calculations, quotation model/repository/schema/storage key, App or Dashboard changes by Agent1. Coordinator's separate PDF alignment remains authoritative. Final integrated production/browser/quotation-PDF/financial gates and PR #1 publishing remain coordinator/Agent3 responsibilities after Agent2 UI integration.
