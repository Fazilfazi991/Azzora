# Agent 1 — BOQ hierarchy domain handoff

Worktree: `C:/Users/USER/Desktop/Projects/Azzora/azzora-accounts-navigation`; branch `codex/agent-1-accounts-navigation`; published base `aebd0688853e3fff416939ae8227946d690c211e`.

`Quotations.tsx` live-preview wiring was committed separately as `f0b5abec01a86a33168952483d02fe3f1cbebd91` and explicitly transferred to Agent2. Agent1 will not edit that file after the transfer. Agent2 exclusively owns the hierarchy UI and preview component/styles. Coordinator owns `document.ts` alignment. This domain change edits none of those files, no engine/model/repository/schema/storage keys, and no old worktree.

## Pure API contract

All commands return a new quotation and leave their argument unchanged. Call inside the existing editor update callback, for example `const result = addBoqRow(n, sectionId, {kind:"heading"}); Object.assign(n, result.quotation);`, then select `result.rowId` after a successful save. Deletion/movement/reparenting return the quotation directly. Commands reject every non-Draft quotation.

| Export                                         | Return                   |
| ---------------------------------------------- | ------------------------ |
| `addBoqCategory(q,{title?,parentId?})`         | `{quotation,categoryId}` |
| `addBoqRow(q,sectionId,options)`               | `{quotation,rowId}`      |
| `duplicateBoqRow(q,sectionId,rowId)`           | `{quotation,rowId}`      |
| `deleteBoqRow(q,sectionId,rowId)`              | `Quotation`              |
| `moveBoqRow(q,sectionId,rowId,direction)`      | `Quotation`              |
| `duplicateBoqCategory(q,categoryId)`           | `{quotation,categoryId}` |
| `deleteBoqCategory(q,categoryId)`              | `Quotation`              |
| `moveBoqCategory(q,categoryId,direction)`      | `Quotation`              |
| `setBoqRowParent(q,sectionId,rowId,parentId?)` | `Quotation`              |
| `setBoqCategoryParent(q,categoryId,parentId?)` | `Quotation`              |
| `renumberBoq(q)`                               | `Quotation`              |
| `numberingMode(q)`                             | automatic or preserve    |
| `boqTree(section)`                             | `{row,children,depth}[]` |
| `boqGroupAmount(section,rowId)`                | `bigint`                 |

Moves are among siblings and carry the complete descendant subtree. Reparenting carries the complete group, accepts `undefined` to lift to the root, and rejects cycles/unknown parents; row targets must be Heading. Category duplicate/move/delete include subcategories and their complete row hierarchies. Duplicates remap every copied row/category ID and internal parent link; original IDs are retained. Missing parents, duplicate stable IDs and cycles reject without changing the source object.

New parent descriptions use the existing `Heading` type with blank quantity/rate/unit. They contribute zero using the unchanged `lineAmount`; ordinary children use quantity×rate, and FOC/By Client/Excluded/Included remain supported. Adding children to a billable parent rejects with an explicit instruction instead of silently removing its price. Existing historical billable parent/child calculations remain unchanged; `boqGroupAmount` sums the actual existing engine amounts once per row.

## Numbering and historical protection

Automatic numbering applies only to new unissued drafts. Visible categories follow displayed order, with consecutive root category numbers; row siblings and descendants recurse beneath each category (2.1,2.1.1,2.1.2,2.2,2.2.1). Stable IDs and parentId relations define identity; visible numbers never define parentage. Structural commands consistently renumber automatic drafts; child-only and category-only simple paths remain valid.

Preserve mode applies to the authoritative reference (ID/family or Reference imported history), revisions/duplicates with a sourceId, previously finalized drafts, any issued snapshot in history, and every non-Draft record. `renumberBoq` returns an unchanged copy for preserve mode. Explicit Draft edits preserve every existing manual number and allocate unique numbers only for inserted/duplicated rows. Historical gaps such as 10.1.1,10.1.3 remain intact. No load/render effect or migration calls renumbering. Issued record commands reject; issued snapshot JSON/history and source objects remain unchanged.

## Verification

28 focused tests pass in `src/quotation/hierarchy.test.ts`: requested Painting 2.1.1–2.1.3/2.2.1, exact AED2975 subtotal/AED3123.75 grand total, all special pricing types, sibling insert/delete/reorder, nested headings, complete row/category subtree duplication/move/delete, safe reparenting, cycle/orphan/ID guards, immutable issued/history/reference data, unique manual insertions/duplicates, save/decode round trip and multi-page renderer number mapping. Reference Demolition/Tiling/Gypsum Ceiling/Plumbing trees and reference renderer commands remain intact. Tests use the actual existing financial and PDF engine.

ESLint and Prettier pass for the new module/tests. Full TypeScript remains dependent on Agent2's `QuotationLivePreview` component integration: the known missing-module diagnostic from the preceding wiring commit must be cleared during combined integration. Agent1 does not claim a combined application build before that dependency lands. Full unit rerun result will be recorded separately after completion. Coordinator/Agent3 own final browser, alignment and pushed-source certification.

Full unit rerun: **328 passed, 0 failed, 14 test files** (304 retained tests plus24focused hierarchy tests). The only TypeScript diagnostic is the previously reported missing preview component dependency.

## Nested-category correction

Automatic numbering now follows category parentId recursively. Empty root1 → subcategory1.1 → nestedsubcategory1.1.1. Direct row roots occupy the first child ordinal slots; child categories follow them, so a category with rows1.1 and1.2 gives its first subcategory1.3. This shared namespace prevents row/category number collisions. Each subcategory applies the same rule recursively. Flattened section storage follows the resulting preorder, with all stable IDs, parent links and financial calculations unchanged. Four additional focused tests cover nested category numbers, mixed row/category uniqueness, complete nested category move/duplicate and reparenting. **28 focused tests pass.** API signatures and preserve-mode behavior are unchanged.

Preview dependency integration now clears full TypeScript and scoped ESLint; Agent2 preview source was imported unchanged as local6c188f9e4f0bdb1b9f2b0af05bd4fe887bf04cac (originalb19e0f152165fbb22c56344c9d193dab410807d0).
