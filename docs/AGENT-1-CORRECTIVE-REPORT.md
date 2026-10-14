# FIX-A1-01 — Agent 1 corrective delivery

14 October 2026. Completed the authorized financial and shell corrections locally on `codex/azzora-operational-completion`.

- Pinned starting delivery: **`8b7992156a2f97e6f8d9d38b98a4b120ad2793a9`**.
- Corrective implementation/test commit: **`a4620eb0fae755bd3be0100386345446e6349ce4`**.
- The subsequent documentation/evidence commit contains this report. Its full SHA is supplied in the completion handoff; obtain it locally with `git log -1 --format=%H -- docs/AGENT-1-CORRECTIVE-REPORT.md`.
- No merge, push, deployment, backend, branch reset or worktree removal occurred. No central coordinator files, workforce files, `components/ui.tsx`, loader or migrations were edited.

## Corrections

**A3-005 — fixed.** `allocateDiscount` floors proportional shares, then distributes remaining fils from the final row backwards within each row's available value. It is deterministic, linear in row count, conserves the discount and never discounts a row below zero. Ordinary valid allocations retain the prior final-row remainder policy; the failing allocations now spread excess across available rows. Zero/trailing-zero rows receive no unsupported discount.

`invoiceLineTotals` is the single discounted net/VAT basis for invoice totals and item-credit eligibility. It rejects invalid tax treatments and negative bases/net/VAT. Invoice save/issue revalidation retains explicit non-negative monetary guards; variation approvals revalidate pricing. Credit save/approval/issue reject a historical negative-net/VAT invoice snapshot with a review message, without changing the original snapshot.

The original reproduction now produces **subtotal 3 fils − discount 2 fils = net 1 fils + VAT 0 fils = gross 1 fils**, and saves/issues successfully. A receipt of one fils, item credit of one fils and valid refund of one fils reconcile to zero through the actual UI and persisted customer statement.

Consumer verification also exposed gross-only variation conversion: a discounted mixed-tax BOQ was being collapsed into one Inclusive line. New variation invoices retain approved quantities, rates, tax treatments and discount. Validation now requires **net, VAT and gross**, as well as customer/project, to match approval. A two-row Exclusive/Exempt AED 200 variation less AED 0.01 now invoices AED 199.99 net + AED 5 VAT = AED 204.99 gross; a gross-equivalent invoice with a different VAT split is rejected.

**A3-007 — fixed.** Closed mobile sidebar is inert, hidden from accessibility APIs and visually hidden. Open navigation focuses its first control, contains Tab/Shift+Tab, makes background content inert, closes on Escape/backdrop/route change and restores the opener. Both header and More triggers expose expanded/control state. Responsive changes restore normal desktop navigation and close the mobile menu. Existing motion is retained; no motion was added.

**A3-011 — fixed.** Warning text changes only from `#9b702f` to ochre `#886027` on the existing `#fbf6ee` surface. Computed contrast is **5.2059845:1**, above 4.5:1 for normal text. All rendered warning badges in the four-width test meet that threshold.

**A3-013 — fixed for the reported forms.** Dialog scroll padding of 88px and field scroll margin of 16px keep native-invalid and keyboard-focused fields clear of sticky headings/actions. At 390px the invalid task-name input is at y=105–148, below the heading ending at y=64. Native validation, subsequent Tab and focus to the lower Notes field pass at all four widths. Modal implementation remains untouched for Agent 2.

Interface-design and the existing Architectural Prestige `DESIGN.md` guided the scoped UI corrections. Rust actions, warm surfaces, typography, spacing, logo and BOQ design remain intact. CSS changes are limited to eight lines; unrelated formatting was removed from the diff.

## Preservation and accounting boundaries

Accepted quotations and issued snapshots are neither migrated nor recalculated. Tests assert unchanged quotation data and exact snapshot preservation, including reads of a pre-existing malformed snapshot. Such invalid historical postings require controlled review; this task does not silently repair them. Older unissued variation drafts with a mismatched approved VAT split now fail validation and need a controlled draft correction/replacement before issue.

Procurement, cost and report regressions retain: received/unbilled quantity bounds; duplicate-post prevention; one actual expense per supplier bill; supplier payments excluded from customer receipts; signed approved net variations; separate credit/receipt/refund balances; and forecast `actual + max(open commitment, remaining estimate)`. No storage key, data schema or migration version changed.

## Verification

Final successful checks below have **zero failures**. All 141 prior Agent 1 unit tests remain; 19 ordinary corrective tests were added. No `.fails`, skipped or pending cases are used in the final full unit run. The mixed-tax consumer regression failed before its correction and passed afterwards.

| Check | Exact successful result |
|---|---|
| Full Vitest | **160 passed, 0 failed, 0 pending; 6 files** |
| Unit breakdown | Domain 13; quotation 23; commercial 51; PDF 4; discount 14; operations 55 |
| Discount property coverage | 1,836 small-value/discount combinations, capacity/conservation/determinism assertions |
| New corrective browser suite | **35 passed**, no console/page errors; final run against production build at local port 5194 |
| Operational browser journey | **128 passed**, no browser errors |
| Operational boundaries | **18 passed**, no browser errors |
| Existing commercial browser | **129 passed**, no browser errors |
| Existing route/delivery browser | **66 route/viewport checks plus complete handover journey**, no overflow/errors |
| Commercial boundaries | **6 passed**, no browser errors |
| Quotation browser | **4 complete width journeys passed**, including PDF/print/lifecycle/persistence |
| BOQ visual/interaction | **4 widths passed**, exit 0 |
| TypeScript / ESLint / whitespace | `tsc --noEmit`, `eslint src`, `git diff --check` passed |
| Production build | Passed; main chunk **587.33 kB / 163.27 kB gzip**; existing non-blocking >500 kB warning remains |

Widths: **1440, 1024, 768, 390px**. New browser coverage includes initial visible Tab, desktop/mobile inert state, keyboard containment, Escape/More/backdrop focus restoration, responsive changes, native validation/keyboard geometry, contrast, one-fils invoice/credit/refund/statement and reload. Mobile navigation was checked under both reduced-motion and normal-motion preferences. Test contexts are disposable and do not touch the owner's normal browser data.

Raw generated results are under ignored `docs/agent-1-corrective-evidence/`. Tracked evidence: [35-check results](agent-1-corrective-samples/browser-results.json), [contrast](agent-1-corrective-samples/contrast-390.json), [mobile invalid-field geometry](agent-1-corrective-samples/invalid-field-390.json), [desktop geometry](agent-1-corrective-samples/invalid-field-1440.json), [validation summary](agent-1-corrective-samples/validation.json).

Visually reviewed desktop/mobile validation, mobile navigation, dashboard and invoice captures:

![Unobscured native-invalid task field at 390px](agent-1-corrective-samples/invalid-field-390.png)

![Unobscured native-invalid task field at 1440px](agent-1-corrective-samples/invalid-field-1440.png)

[Mobile navigation](agent-1-corrective-samples/mobile-navigation.png) · [one-fils invoice](agent-1-corrective-samples/one-fils-invoice-390.png) · [dashboard](agent-1-corrective-samples/dashboard-1440.png).

Run with the existing package scripts plus `npm run test:corrective:browser`. Set `AZZORA_URL` to a local production preview to reproduce the final corrective browser run. Operational boundaries still require their UI-created fixture and Vite development-server setup as documented in the Phase 3 report.

## Coordinator handoff and remaining limits

Review the implementation commit **relative to pinned `8b79921`** before integrating it; no original-delivery changes are bundled again. Financial edits in `operations/repository.ts` are limited to variation pricing validation/generation and credit validation. Keep the coordinator's single workforce/document write boundary, shared document-approval adapter and Agent 2 modal work when resolving shared context. Shell focus handling belongs in App; sticky-field accommodation belongs in CSS.

Promote Agent 3's A3-005 expected-failure test to an ordinary assertion on the combined branch. **A3-006 loader/recovery is not fixed here** and remains assigned separately. Agent 2's modal changes and the coordinator's combined application were not imported or certified. Rerun all combined tests at its exact SHA, including operational gates with unpaid invoices/policy off/on and document/supervision approvals.

Browser-local persistence, demo identities, local attachment quota and uncertified commercial-document limitations remain. Visual review and targeted contrast checks are not complete assistive-technology/WCAG certification; physical devices/printers and production load were not tested. The bundle warning remains. No backend/authentication/cloud services were added.
