# AZZORA — Agent 3 issue register

> Final verification at **f72e6c1dd7c5914e97c509a635b64de8c6aa9750**: original13 issue IDs and FINAL-01..06 have passing covered regressions; no open blocking issue identified. Earlier counts/statuses below are historical. Complete current evidence and limits: AGENT-3-FINAL-INTEGRATION-QA.md.


> Current integration checkpoint (db6bb1148effb35e32ee39c120013a588b468813): baseline counts/statuses below are historical. FINAL-01..04 now pass fresh regressions; FINAL-05 global search race and FINAL-06 native quotation blank print page remain open. See AGENT-3-FINAL-INTEGRATION-QA.md for exact evidence and limits.


Audited 14 October 2026 (Asia/Dubai), committed baseline `ada782a`. All reproductions use disposable Chromium contexts and fictional records. No actual browser profile or saved user records were accessed.

Severity: P1 = material correctness, data-loss or accessibility defect; P2 = bounded validation, interaction or QA infrastructure defect. There are **13 issues: 9 P1 and 4 P2; 3 fixed and 10 open**. Repeated viewport observations count as one issue.

Agent 1 owns financial changes and the active application shell/styles. Agent 2 owns workforce/delivery forms and the shared UI file. Ownership below is a proposed handoff, not a claim that the other agents have received or fixed an issue.

## A3-001 — Dialogs have no accessible name

- **Module / severity:** Global dialogs and drawers; P1.
- **Reproduction:** Open Quick Add at 1440, 1024, 768 or 390px. Inspect its accessibility tree, or query `getByRole('dialog', {name: 'Quick Add'})`.
- **Expected:** The dialog is named by its visible heading.
- **Actual:** An unnamed dialog exists; the named query returns zero at all four widths.
- **Suggested correction:** Generate a heading ID with `useId` and set `aria-labelledby` on the dialog.
- **Responsible agent:** Agent 2, `src/components/ui.tsx`.
- **Verification status:** Confirmed in baseline and confirmation sweeps; open. Included in the unapplied candidate patch.

## A3-002 — Clicking inside dialog padding discards the form

- **Module / severity:** Customer forms and all shared dialogs; P1.
- **Reproduction:** Customers → Add New Customer → enter `QA Al Quoz Joinery LLC` → click 3px inside the dialog's top-left corner.
- **Expected:** Interior padding retains the dialog and unsaved name. A click outside the dialog may dismiss it.
- **Actual:** The dialog unmounts and the draft is discarded because `event.target === event.currentTarget` also matches interior padding.
- **Suggested correction:** Check pointer coordinates against the dialog bounds before treating the event as a backdrop click.
- **Responsible agent:** Agent 2, `src/components/ui.tsx`.
- **Verification status:** Confirmed twice; open. Included in the unapplied candidate patch.

## A3-003 — Browser harnesses can test another agent's server

- **Module / severity:** Route, commercial boundary and BOQ test infrastructure; P2.
- **Reproduction:** Run a separate worktree on port 5183, set `AZZORA_URL=http://127.0.0.1:5183`, then run the original `browser.mjs`, `commercial-boundaries.mjs` or `boq-visual.mjs`.
- **Expected:** Tests target the selected isolated server.
- **Actual:** The original scripts hard-coded port 5173 and ignored the selected URL.
- **Suggested correction:** Centralize `auditUrl` in the browser helper, keeping 5173 as the backwards-compatible default.
- **Responsible agent:** Agent 3.
- **Verification status:** **Fixed**. All three suites ran successfully against port 5183.

## A3-004 — Boundary suite fails in a fresh worktree

- **Module / severity:** Commercial browser test evidence; P2.
- **Reproduction:** In a fresh checkout, run `commercial-boundaries.mjs` before a suite that creates `docs/commercial-evidence`.
- **Expected:** The suite creates its output directory and saves its results independently.
- **Actual:** The final write throws `ENOENT`, despite its interaction assertions completing.
- **Suggested correction:** Create the directory recursively at startup.
- **Responsible agent:** Agent 3.
- **Verification status:** **Fixed**; rerun passes all 6 boundary checks.

## A3-005 — Discount allocation can produce negative invoice VAT

- **Module / severity:** Invoice calculation and issuance; P1.
- **Reproduction:** Create a draft with three Inclusive lines, quantity 1 and AED 0.01 each, VAT 5%, discount AED 0.02. Call `invoiceTotals`. The same distribution flaw occurs near full discounts on larger equal lines.
- **Expected:** AED 0.01 gross with non-negative net/VAT; no line receives a discount larger than its amount.
- **Actual:** The first two rounded-down discount shares are zero and the last absorbs AED 0.02 against a one-fils line. Totals become net AED 0.02, VAT **AED -0.01**, gross AED 0.01. Draft validation does not reject the result.
- **Suggested correction:** Allocate remaining fils with capacity bounds and a deterministic remainder method, then enforce non-negative line bases and taxes. Preserve the agreed invoice tax-rounding policy.
- **Responsible agent:** Agent 1, `src/commercial/calculations.ts` and invoice validation in `repository.ts`.
- **Verification status:** Confirmed; executable `it.fails` regression in `tests/agent-3-financial.test.ts`. **Open**, not counted as a passing financial feature.

## A3-006 — Incomplete saved operational data bypasses fallback protection

- **Module / severity:** Persistence and application bootstrap; P1.
- **Reproduction:** In a disposable context, serialize a complete initialized seed, delete its `people` collection, store it under `azzora-demo-v1`, and reload.
- **Expected:** Loading rejects the incompatible shape; the protected read-only fallback and original-data export remain reachable.
- **Actual:** `load()` accepts the incomplete shape. Rendering throws `Cannot read properties of undefined (reading 'map')` and the body becomes blank. The original value remains stored, but Settings is unreachable.
- **Suggested correction:** Validate all required operational collections and relationship shapes before returning from the repository loader; reject incompatible shapes rather than silently replacing data. Add render-failure recovery as appropriate.
- **Responsible agent:** Agent 2 for operational schema/loader, coordinating with Agent 1's migration work.
- **Verification status:** Unit expected-failure plus independent browser reproduction; open. See `agent-3-evidence/malformed-storage.json`.

## A3-007 — Closed mobile sidebar remains in the tab sequence

- **Module / severity:** Navigation; P1.
- **Reproduction:** At 390px, reload Dashboard with the sidebar closed and press Tab from the initial page state.
- **Expected:** Focus enters a visible control.
- **Actual:** Focus enters the off-screen brand link, whose bounding box runs from x=-268 to x=-13. The sidebar is only translated off screen.
- **Suggested correction:** Make the closed mobile navigation inert/hidden to focus and accessibility APIs; manage open/close focus and Escape in the shell. Keep desktop navigation available.
- **Responsible agent:** Agent 1 for `App.tsx`/`styles.css`, coordinating with Agent 2 where necessary.
- **Verification status:** Browser-confirmed; open. Pointer opening and backdrop closing themselves pass.

## A3-008 — Whitespace-only site update is saved

- **Module / severity:** Site Updates; P2.
- **Reproduction:** Post Site Update → enter three spaces in Work completed → Post Update.
- **Expected:** A useful non-empty description is required after trimming; validation explains the problem.
- **Actual:** Native `required` accepts spaces and the mutation persists them as a completed-work entry.
- **Suggested correction:** Trim and validate in the operational command as well as the form.
- **Responsible agent:** Agent 2, the active Site Updates implementation.
- **Verification status:** Browser-confirmed against the committed baseline; open. Recheck the replacement operational form after integration.

## A3-009 — Closing a drawer loses keyboard trigger focus

- **Module / severity:** Tasks/shared dialog accessibility; P1.
- **Reproduction:** Tasks → focus + Create Task → Enter → Escape.
- **Expected:** Focus returns to + Create Task.
- **Actual:** The trigger is inactive after the React dialog unmount. Reproduced at all four widths.
- **Suggested correction:** Capture the opener before `showModal` and restore it during cleanup if it remains connected; verify nested and successive dialog transitions.
- **Responsible agent:** Agent 2, `src/components/ui.tsx`.
- **Verification status:** Browser-confirmed; open. Focus restoration in the candidate patch is **unverified**.

## A3-010 — Escape in an inline customer form also closes its parent wizard

- **Module / severity:** Project creation/Customer creation; P1.
- **Reproduction:** Quick Add → New Project → type a project name → Add New Customer → press Escape.
- **Expected:** Only the customer dialog closes; the project wizard retains the project name and regains focus.
- **Actual:** Both dialogs disappear and the parent project draft is lost, at all four widths.
- **Suggested correction:** Prevent the native default and stop propagation of the shared dialog's React cancel event before closing the intended dialog.
- **Responsible agent:** Agent 2, `src/components/ui.tsx` and inline form integration.
- **Verification status:** Browser-confirmed; open. Cancel-event handling in the candidate patch is **unverified**.

## A3-011 — Warning badges fall below normal-text contrast

- **Module / severity:** Global status badges; P1.
- **Reproduction:** Dashboard → inspect an At Risk badge. Foreground is `#9b702f`, background `#fbf6ee`, font size 9px.
- **Expected:** At least 4.5:1 normal-text contrast.
- **Actual:** Measured contrast is **4.107:1**. Healthy badges and the primary muted-text pair measured above 4.5:1.
- **Suggested correction:** Darken the existing ochre foreground within the approved palette and verify every warning state; avoid a theme redesign.
- **Responsible agent:** Agent 1, active `src/styles.css`.
- **Verification status:** Computed styles and luminance calculation saved in `agent-3-evidence/contrast.json`; open. This is a targeted measurement, not a complete WCAG certification.

## A3-012 — Removing an attachment during another upload resurrects it

- **Module / severity:** Shared attachments in site updates/documents; P2.
- **Reproduction:** Attach QA-first.png. Start reading QA-second.png with a delayed FileReader. While Reading files is shown, remove QA-first.png. Wait for the second read.
- **Expected:** A removed file stays removed; operations using stale attachment state cannot overlap.
- **Actual:** The upload completion applies its captured file list and restores QA-first.png.
- **Suggested correction:** Disable removal during file reading, matching the existing disabled upload input.
- **Responsible agent:** Agent 3, `src/components/uploads.tsx` (outside both observed active feature diffs).
- **Verification status:** **Fixed**. Reproduced before the fix at 1440/390px; after the fix, removal is disabled during reading, works afterwards, oversize rejection preserves the remaining file, and the surviving file persists after a saved update/reload.

## A3-013 — Validation scroll hides the invalid task name under the sticky header

- **Module / severity:** Task drawer/forms; P1.
- **Reproduction:** Open Create Task, tab through the form, leave Task name blank, then click Save Changes at the bottom.
- **Expected:** Browser validation scrolls the invalid field and its message into an unobscured position.
- **Actual:** The invalid input occupies y=1..44 while the sticky heading occupies y=1..51, covering the input. Reproduced at 1440/1024/768/390px; screenshot `agent-3-evidence/drawer-390.png`.
- **Suggested correction:** Provide appropriate dialog scroll padding/field scroll margin, or revise the sticky header arrangement. Verify both native validation and keyboard focus at all widths.
- **Responsible agent:** Agent 1 for active modal CSS, coordinating with Agent 2's task form.
- **Verification status:** Browser geometry and screenshots confirm the defect; open.

## Held changes and integration

`AGENT-3-DIALOG-FIXES.patch` is an **unapplied candidate**, not a shipped or verified fix. Its applicability was checked against `ada782a`; it must be reconciled with Agent 2's evolving `ui.tsx`. The two initial edits were removed from this branch as soon as overlapping ownership was observed. A coordination request was raised; no cross-agent message or source change is assumed authorized by silence.

Promote the two `it.fails` tests to ordinary assertions when their owners fix A3-005/A3-006. Convert diagnostic browser observations into strict assertions as the accessibility/validation issues are resolved. Run all suites against the final integrated commit; this register does not certify unfinished feature branches.


## FINAL-01 — customer-only credit approval fails reload (frozen 19051cc)

- **Module / severity:** Credits, approval schema and persistence; critical.
- **Exact reproduction:** Fresh context → customer-only AED 1.00 net invoice → issue AED 1.05 gross → receipt AED 1.05 → six approved/issued AED 0.11 amount credits → AED 0.66 refund → reload → attempt final AED 0.39 credit.
- **Expected:** Valid persisted records hydrate; final credit/refund remain available and statement reconciles to zero.
- **Actual:** Read-only recovery fallback reports incompatible operations.approvals.0.projectId. Approvals written by the application contain empty projectId; original saved data remains intact, but the fallback has no issued invoice options.
- **Suggested correction:** Reconcile optional project relationships for customer-only credit approvals with structural/reference validation; add repository→migration/hydration round-trip and browser absence-of-recovery assertions.
- **Responsible agent:** Agent 1; coordinate Agent 2 if shared approval validation ownership requires it. Agent 3 has not edited domain files.
- **Verification status:** Reproduced twice at exact frozen 19051cc1f5f70770142f116ecc4edb239099e708 on dev 5195. Blocks final certification. Details and evidence paths in AGENT-3-FINAL-INTEGRATION-QA.md.

## FINAL-02 / FINAL-03 — final harness strict locator ambiguity

- **Module / severity:** QA harness; certification blockers.
- **Exact reproduction:** Critical A3-010 uses unscoped + New Project after Quick Add (both main/dialog match), at four widths. Commercial recovery uses unscoped role alert when recovery banner and error toast both exist.
- **Expected:** Scope intended dialog/banner; assert actual behavior.
- **Actual:** Strict locator errors prevent four nested Escape groups and the last commercial write-protection assertion; no application regression established by those locator errors.
- **Suggested correction:** Scope dialog and named Saved data recovery region; obtain coordinator refreeze before source/test edit and rerun full affected suites.
- **Responsible agent:** Agent 3 QA harness; coordinator owns current freeze.
- **Verification status:** Confirmed dev final suite failures; no frozen tests edited.


## FINAL-04 — financial rejection feedback is outside the active modal

- **Module / severity:** Credit Note Draft and Customer Refund forms; P1 accessibility/usability.
- **Exact reproduction:** Use valid operational fixture with issued invoice105/receipt80/credits50; credit dialog enter999 and save. Separately use same fictional fixture without its refund, leaving25 customer credit; refund dialog enter25.01 with required reference/reason and post. Repeat at1440/390px.
- **Expected:** Rejection appears as an accessible alert inside the retained dialog, with entered values and saved data preserved.
- **Actual:** Stored bytes unchanged and native dialog remains open, but zero alerts/errors inside it; only external toast says Credit exceeds eligible billed value / Refund exceeds eligible customer credit balance. Chrome CDP Accessibility.getPartialAXTree marks the toast ignored for activeModalDialog. Programmatic focus of its dismiss button fails and focus stays on dialog submit. Playwright getByRole(alert) still locates the global node; that alone is inadequate accessibility proof.
- **Suggested correction:** Consume Store error or equivalent WorkflowError within both financial forms (and relevant reversal forms); render persistent role=alert inside native dialog, preserve values, and assert inside-dialog feedback for over-credit/over-refund/legacy-review rejection.
- **Responsible agent:** Agent1 financial UI; coordinator has assigned a scoped correction.
- **Verification status:** Confirmed in production5203 at frozen19051cc, four fresh contexts, no browser errors, CDP AX/focus/screenshot evidence in integration-evidence/final/19051cc-run1/modal-diagnostic/results.json. No source edits by Agent3.


## FINAL-05 — global search query cleared by a late route event

- Module/severity: Global Search/navigation, P2; required production boundary failure.
- Reproduction: freshly generated production fixture, rapid Supplier→Variation→Request→PO→Bill→Credit searches, fill next query after URL and empty input assertions; bounded repeated journey.
- Expected: fresh query survives and finds typed record.
- Actual: original Bill lookup failed after9 checks; strict replay18 passes, but diagnostic repeats fail after52 checks. Captured CN-00001 input4706.700ms→old hashchange4706.900 seesCN→settled4708.900 empty. Data/IDs intact, no console errors.
- Suggested correction: prevent old navigation clear from erasing new input; retain modal/same-route dismissal; assert settled destination and deliberately exercise delayed-route race in regression.
- Responsible agent: Agent1/coordinator shell; coordinator/Agent3 harness.
- Verification: confirmed on frozen db6bb114, open; exact events/results/screenshot in integration-evidence/final/db6bb114-run1/boundary-search-stress/search-failure.json. No source edit.

## FINAL-06 — quotation native print adds a blank page

- Module/severity: Quotation print layout, P2.
- Reproduction: reference preview→Print→native Chromium A4 print output,1440/390.
- Expected:7 pages matching7 .sheet elements and downloaded PDF.
- Actual:8 pages, final page zero text and visually blank, both contexts. Existing browser test only counts DOM sheets.
- Suggested correction: print-scoped svg display:block and actual printed-page/no-blank regression. Disposable popup prototype fixes7 pages; not applied to source.
- Responsible agent: Agent1/coordinator quotation UI or explicitly coordinated isolated Agent3 fix.
- Verification: reproduced twice at db6bb114; PDFs/page counts/blank render/inline-vs-block geometry in integration-evidence/final/db6bb114-run1/print-keyboard. Open, no source change.


## Final integrated issue verification — f72e6c1

All rows refer to fresh dev+production evidence at the exact frozenSHA. Historical failed reproductions remain unchanged above.

| Issue | Defect | Correction owner | Current verification |
|---|---|---|---|
| A3-001 | Named dialogs/drawers | Agent2 | Fixed / verified: Critical38, dialog64, audit5 targets |
| A3-002 | Interior dialog padding discarded draft | Agent2 | Fixed / verified: Critical/dialog padding and real-backdrop checks at4 widths |
| A3-003 | Harness targeted another server | Agent3 | Fixed / verified: URL resolver9 unit cases; aliases consistent in all40 invocations |
| A3-004 | Boundary output directory absent | Agent3 | Fixed / verified: mkdir source fix retained;6 boundary checks each target; original fresh-folder failure not re-induced |
| A3-005 | Discount could create negative VAT | Agent1 | Fixed / verified: Ordinary financial/discount cases and corrective35 each target |
| A3-006 | Invalid storage could blank the workspace | Agent2/coordinator | Fixed / verified: Storage/recovery units, recovery25 and critical malformed fixtures |
| A3-007 | Off-screen mobile sidebar remained focusable | Agent1 | Fixed / verified: Critical mobile keyboard and corrective navigation checks |
| A3-008 | Whitespace-only site update saved | Agent2 | Fixed / verified: Four-width strict site-validation/interaction checks |
| A3-009 | Drawer opener focus not restored | Agent2 | Fixed / verified: Four-width critical/dialog focus assertions |
| A3-010 | Nested Escape discarded parent draft | Agent2 | Fixed / verified: Four-width child-only close, retained parent data and focus |
| A3-011 | Warning badge contrast below4.5 | Agent1 | Fixed / verified: Four-width targeted computed contrast assertions |
| A3-012 | Attachment removal/upload race resurrected file | Agent3 | Fixed / verified: Upload2 each target; oversize rejection/save/reload checks |
| A3-013 | Invalid field hidden by sticky drawer heading | Agents1/2 | Fixed / verified: Four-width critical/interactions/corrective geometry checks |
| FINAL-01 | Customer-only credit approval failed hydration | Coordinator/Agent1 | Fixed / verified: 304 units include lossless valid roundtrip and wrong-project rejection; financial14 each target |
| FINAL-02 | Critical Quick Add selector ambiguous | Coordinator | Fixed / verified: Critical38 each target, nesting reached normally |
| FINAL-03 | Recovery banner selector ambiguous | Coordinator | Fixed / verified: Commercial129 each target; protected raw-byte guard reached |
| FINAL-04 | Financial rejection feedback outside modal | Agent1 | Fixed / verified: Financial-modal38 each target: visible/focused nonignored AX alert and retained bytes/values |
| FINAL-05 | Late route event erased fresh search query | Agent1/coordinator | Fixed / verified: Rapid166 each target, including144 unwrapped selections; settled-destination boundary18 |
| FINAL-06 | Quotation native print added blank page | Agent2 | Fixed / verified: Native print4 each target: actual7/3 pages, no blank tail, A4/page text/totals and raw invariance |

Nonblocking observations:main bundle618.46kB, and intentional supplied historical words/milestone overrides. No source/test/config edits or commits during finalgate. See finalcertificate for limits; passing coverage is not exhaustive UI/accessibility/security/regulatory certification.
