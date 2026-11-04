# Final fictional financial API verification

Result: passed against the actual HTTPS BFF at `https://127.0.0.1:5365`, backed by the authorized Supabase fictional-staging database. No production deployment, real-money posting or paid AI was used.

The run created only new fixtures prefixed `finmw27jvgm`; it did not cancel or modify the original staging invoice. Company versions **66–110** cover the financial acceptance sequence. The application was an uncommitted integration worktree based on `3426d409b513a2ffdc5334b35c8223a3e53d8d30`, not a claim that this base commit alone contains the tested implementation. The coordinator records the final frozen revision separately.

## Verified workflows

- Manager customer and project → accepted two-item quotation → contract → issued invoice. Accountant sees the identical invoice number, descriptions, quantities and rates.
- Accountant receipt of AED 250 against the new AED 1,000 invoice updates the same Manager payment/outstanding balance.
- Owner requests an AED 100 credit; the assigned PM independently approves it; Owner issues it. Shared AR becomes AED 650 after the receipt, and shared revenue reduces by AED 100. Prior-date reports retain the pre-credit balance. Accepted quotation and issued-invoice snapshots remain unchanged.
- Owner reverses the receipt, restoring the new invoice's shared outstanding to AED 900 and reversing the cash movement through an append-only journal.
- A separate unpaid AED 200 invoice is issued and cancelled. Its original issued snapshot and journal remain, with one matching reversal; outstanding and net revenue impact become zero.
- Supplier → purchase request → RFQ → supplier quotation → purchase order → delivery → AED 100 bill, with three independent approvals. An AED 40 supplier payment reduces open AP to AED 60. Payment reversal restores AP to AED 100; subsequent bill cancellation removes its remaining AP and cost impact while retaining original cost and journal history.
- An Accountant-origin AED 30 standalone project bill appears as one linked Manager cost, with one shared bill source and journal. A focused domain regression additionally confirms that later payments update the same Manager cost and repeated synchronization creates no duplicate posting.

Exactly one canonical record and original journal were verified for each of seven posted sources. Four corrected sources have one append-only reversal apiece. No issued history was deleted or reset.

## Reconciliation at version 110

| Metric | AED |
| --- | ---: |
| Revenue | 1,900.00 |
| Cost of Sales | 205.00 |
| Operating Expenses | 0.00 |
| Gross Profit | 1,695.00 |
| Net Profit | 1,695.00 |
| Receivables | 1,650.00 |
| Payables | 90.00 |
| Bank | 100,135.00 |
| Cash | 0.00 |

Relative to the captured version-66 baseline: revenue and AR increased by AED 900; cost and AP increased by AED 30; net profit increased by AED 870; bank and cash were unchanged. Trial Balance and Balance Sheet reconcile. Reporting assertions use **2026-11-04**, with a separate **2026-11-03** check proving that the later credit does not reduce earlier AR.

## Concurrency and physical allocation evidence

Two different ledger commands sent simultaneously with the same expected version returned **200/409**, creating one ledger and one version increment. Two simultaneous identical requests without an explicit ID, using the same action key, returned **200/200**, creating one server-generated ledger and one version increment. Financial metrics remained unchanged.

Independent read-only hosted SQL confirmed exactly two immutable allocation rows for this run:

| Settlement | Allocated fils | Original journal |
| --- | ---: | --- |
| `finmw27jvgm-receipt` | 25,000 | `J-finmw27jvgm-receipt` |
| `finmw27jvgm-supplier-payment` | 4,000 | `J-finmw27jvgm-supplier-payment` |

These allocations remain linked to their original journals after reversals; no replacement allocation journal is invented. SQL proof was captured at **2026-11-04 14:37:20.262 UTC** in `docs/backend/evidence/final-auth/physical-allocation-proof.json`.

## Failures retained and resolved

The initial Accountant session had expired and returned 401 before any business mutation. Only Accountant was renewed using its existing verified MFA.

The first VAT-bearing Manager invoice issue was safely rejected but returned generic **400** instead of the required explicit policy response. This diagnostic is retained in `tmp/final-financial-api-qa-first-attempt.json` and the final result history. After the typed policy fix, the **same** draft returned **423**, without a version increment or posting. Existing successful fixtures were reused rather than recreated.

Refund posting, credit exceeding the unpaid balance, and VAT-bearing invoice issue all return **423**. These are deliberately closed policy gates, not unwired functionality or failed acceptance cases. The test did not relax them.

There are **51 recorded status/check entries**, including the retained and resolved VAT diagnostic, two concurrency groups and three actual API PDF downloads. There are no unresolved assertion failures in the completed run. This count is not represented as 51 independent unit tests.

The additional Accountant-bill synchronization regression passed **1/1**. The coordinator runs the complete CRM suite separately.

## Artifacts and limits

- Safe results: ignored `docs/integration-evidence/staging/final-financial-api-qa-results.json`.
- Actual API PDFs: `final-financial-invoice.pdf`, `final-financial-pnl.pdf`, `final-financial-balance.pdf` in that evidence directory, each HTTP 200 with a valid PDF signature.
- Actual issued credit PDF: `final-financial-credit.pdf`, downloaded through the authenticated Owner browser without browser errors or a financial mutation.
- Financial API completion: **2026-11-04 14:33:37.382 UTC**. Later nonfinancial review edits are not claimed to belong to version 110.
- This verifies fictional staging integration, corrections and reconciliation. VAT/TRN, refunds involving credit balances, production opening balances and real-company posting policies remain unapproved. No production-accounting readiness is claimed.

## Final financial concurrency and inverse item bridge

At **2026-11-04 14:54:32.919 UTC**, the actual authenticated BFF ran a dedicated fictional receipt race against source `88306ee0c84d337a1d8fe3a316ecdd424b3ae4af`. Company version advanced **136 → 139**. The existing version110 totals were unchanged before this additional test.

- Accountant issued a two-item invoice: 2 × AED30 plus 1 × AED40. Manager retained both descriptions, quantities and rates, with the same AED100 total and one invoice journal.
- Two simultaneous receipts, AED70 and AED60, used the same expected version137. Responses were **409 and 200**; only AED60 was recorded, with exactly one version increment.
- Retrying the rejected AED70 at the fresh version returned **400 overpayment**. No receipt, journal, metrics or version changed.
- Replaying the winning receipt key returned **200** without another version increment or posting.
- Two simultaneous identical AED10 receipts, using one key and no supplied record ID, both returned **200**. Both responses contained the same generated ID; only one receipt, journal and version increment existed.
- Both workspaces show AED30 outstanding on the dedicated invoice. Trial balance and Balance Sheet remain balanced.

Final figures as of **4 November 2026**, with P&L period **1 January–4 November 2026**:

| Measure | AED |
| --- | ---: |
| Revenue | 2,000.00 |
| Cost of Sales | 205.00 |
| Operating Expenses | 0.00 |
| Gross Profit | 1,795.00 |
| Net Profit | 1,795.00 |
| Receivables | 1,680.00 |
| Payables | 90.00 |
| Bank | 100,205.00 |
| Cash | 0.00 |

Evidence: `docs/integration-evidence/staging/final-financial-receipt-race-results.json`. Actual invoice, P&L and Balance Sheet API PDFs were refreshed, each HTTP200 with a valid PDF signature; the preceding version110 PDFs are preserved with `-checkpoint110` filenames. No real records or paid AI were used.
