# FIX-A1-02 — Financial compatibility follow-up

14 October 2026. Delivered on `codex/azzora-operational-completion`, starting from **`647762d99fa0837df1c991d17bcd38459ab960f9`**. Corrective source/tests commit: **`857b57cd4e0519606d5be143b6851260b773c0a4`**. The following report/evidence commit is identified in the completion handoff and by `git log -1 --format=%H -- docs/AGENT-1-FINANCIAL-FOLLOWUP.md`.

Only financial code/types, financial tests and this report/evidence changed. No integration schema/loader, domain model, documents, closure, workforce, shell, modal, styles, coordinator files or package configuration was edited. No merge, push, deployment, backend, reset or worktree deletion occurred.

## Completed read-only review

Reviewed integration financial sources at `02fe289f05197e045cf5bc28cdc7af1a9995d98a`, confirmed unchanged financial/closure files through **`93926da798d3a98cc1e1cd1cd6d9fed60bddfdac`**. Used esbuild `write:false`, actual domain exports and disposable in-memory storage. No broad integration suites ran and no integration files were authored.

Two critical gaps reproduced:

1. **Legacy issued line basis silently changed.** Three Inclusive rows AED 10, 10 and 0.01 with AED 0.02 discount had the historical snapshot net **19.04**, VAT **0.95**, gross **19.99**. The corrected allocator reconstructed net **19.03**, VAT **0.96**, gross **19.99**, lowering the second item's credit limit from AED 10 to 9.99. The original snapshot stayed unchanged, but item eligibility used the new basis. All-Exempt rows reproduced the same changed item limit while aggregate net/VAT/gross stayed identical, so aggregate comparison alone cannot detect the invalid historical final-row allocation. Both fixtures passed the integration loader.
2. **Amount-credit VAT exceeded original VAT.** Six AED 0.11 credits against AED 1.00 net + AED 0.05 VAT each posted one VAT fils, totalling **six VAT fils against five original fils**. The final AED 0.39 credit then failed its negative-residual guard. The analogous repeated one-fils pattern can over-credit original net instead.

Targeted closure checks passed: operationally ready with unpaid AED 105 completes when financial blocking is off and is rejected when on; clear finances with pending supervision remains operationally blocked. Closure composition was left to the coordinator and is unchanged by this correction.

## Historical basis correction

New issuance freezes `allocationVersion: 1` and `lineAllocations` inside `InvoiceSnapshot`: stable item ID, tax treatment and integer-fils subtotal, discount, net, VAT and gross. Duplicate line identities are rejected before issuance. Invoice totals continue reading the original aggregate snapshot.

`invoiceCreditLines` uses those posted line amounts for credit eligibility. It verifies identity, version, nonnegative components, arithmetic and exact agreement with the aggregate snapshot. It does not reprice the invoice from later calculation rules or mutate its snapshot.

For an unversioned legacy snapshot, reconstruction is permitted only when the **historical final-row remainder policy** stayed within every row's capacity and the reconstructed components match the posted totals. Otherwise adjustments stop with **“Original invoice allocation requires explicit review before credit adjustments.”** This includes the all-Exempt counterexample. No allocation metadata is added to existing issued documents, and no history is rewritten.

Invoices issued between FIX-A1-01 and FIX-A1-02 have no frozen allocation version. If their inputs would have made the old policy invalid, their provenance cannot be established safely from aggregate totals alone; they require explicit review rather than automatic rebasing, even if their totals happen to be correct.

## Cumulative credits and component capacity

`credit-allocation.ts` builds remaining net/VAT/gross capacity per posted line. New credits freeze their own versioned per-line allocations in the credit record and its issuance snapshot. Both item and amount credits consume the same pools, preventing later item claims from ignoring earlier amount adjustments.

Requested gross is distributed deterministically within remaining line capacity using the shared bounded allocator. For each line, VAT equals its cumulative original VAT entitlement at the newly credited gross, less VAT already credited, bounded by remaining net/VAT. Thus neither component can become negative or exceed the original posting; full credit consumes the exact remaining components. Pending item-specific reservations remain available if an amount credit is issued first.

Historical item credits consume their recorded line components. Historical amount credits have no posted item identity: their recorded net/VAT is projected deterministically across available component capacity **before** versioned allocations. This read-model projection stays stable as new credits are posted and changes no original credit fields or snapshots. Inconsistent, over-credited or unsupported history stops for explicit review rather than being silently repaired.

The exact six-credit case now posts VAT fils **`1, 0, 1, 0, 1, 0`**. At AED 0.66 credited, net is AED 0.63 and VAT AED 0.03. The final AED 0.39 posts net AED 0.37 and VAT AED 0.02, giving exact full totals **AED 1.00 net / 0.05 VAT / 1.05 gross**.

Refund/customer-credit accounting remains based on immutable invoice and issued-credit gross, actual receipts and refunds. A paid AED 1.05 invoice, six partial credits, an AED 0.66 refund, final AED 0.39 credit and refund reconcile to zero without changing the original receipt or invoice snapshot.

## Fresh verification

| Check | Final result |
|---|---|
| Full standalone unit suite | **192 passed, 0 failed, 0 pending; 7 files** |
| Retained / added tests | All prior **160** retained; **32** ordinary follow-up regressions added |
| Breakdown | Domain 13; quotation 23; commercial 51; discount 14; PDF 4; operations 55; financial follow-up 32 |
| Focused production-browser journey | **14 passed**, no console/page errors, **1440px and 390px** |
| TypeScript / ESLint | `tsc --noEmit` and `eslint src` passed |
| Whitespace | `git diff --check` passed |
| Production build | Passed; main bundle **590.75 kB / 164.41 kB gzip**; existing non-blocking size warning remains |

Regressions cover the exact Inclusive and Exempt legacy counterexamples; trustworthy legacy reconstruction without snapshot additions; malformed/unknown allocation metadata; repeated tiny Exclusive/Inclusive/Exempt/Zero Rated credits; mixed item/amount orderings; pending item reservations; historical amount/item credit preservation; stable mixed-tax legacy projection; already over-credited net/VAT; JSON reload; exact settlement; and receipt/refund/customer-statement reconciliation. Existing financial/procurement/report/cost and PDF unit coverage remains green.

The focused browser test creates and issues an invoice, verifies frozen line metadata, receives AED 1.05, submits/independently approves/issues all seven credits, checks every posting's component bounds, refunds the two valid credit balances, reloads during the sequence and asserts the final statement balance. It uses isolated contexts and the local production build at port 5196. No unrelated broad UI suites were rerun for this follow-up.

Tracked evidence: [unit summary](agent-1-financial-evidence/unit-summary.json), [browser checks](agent-1-financial-evidence/browser-results.json). Raw unit JSON and desktop/mobile statement screenshots are in ignored `tmp/financial-followup/`. Run `node tests/financial-followup-browser.mjs` against a local production preview; `AZZORA_URL` overrides its default `http://127.0.0.1:5196`.

## Integration handoff and limitations

Integrate **`857b57cd4e0519606d5be143b6851260b773c0a4` relative to `647762d`**, followed by the report/evidence commit. Financial changes in `operations/repository.ts` concern credit validation/issuance only; preserve the coordinator's canonical document/workforce approval branches and schema fixes when resolving context.

Optional allocation fields are additions to financial snapshot interfaces, with integer-fils strings and version 1. The database/storage key and version remain unchanged. No loader or schema-validation file changed. The coordinator should preserve these fields through its existing passthrough schemas and review optional nested allocation validation within its own schema boundary.

This standalone branch is verified; **the combined integration SHA is not certified here**. Agent 3's final frozen-SHA gate must run after integration. Explicit review of inconsistent historical postings is intentionally blocking; a manual correction/review workflow is not fabricated by this patch. Already issued malformed notes are preserved, not automatically reversed. Browser-local/demo-identity/storage-quota limitations and the bundle warning remain. No production legal tax certification is claimed.
