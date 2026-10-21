# Finance checkpoint 2 — controlled local integration plan

Base: `1e8e2a9c5bfec2b594dc325e24d032a6380c3951` on `codex/azzora-finance-integration`; GitHub `main` remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`. This checkpoint is local only.

**Checkpoint result:** All controlled stages were reviewed and integrated. Frozen source/test SHA: `edf96d31275b84820d2ebff018466ecb3c1c857b`. The exact tests, browser/PDF evidence, limitations and policy gates are in [CHECKPOINT-2-REPORT.md](CHECKPOINT-2-REPORT.md). No real posting or release action was enabled.

## Ownership and merge order

| Stage | Owner | Exclusive files / boundary | Gate |
| --- | --- | --- | --- |
| A | Agent 1 | New `src/accounting/persistence*` synthetic namespace, validator, pure transaction envelope | Saved-data validation, idempotent retry, balanced journals, no legacy posting |
| B | Agent 2 | New `src/finance/document-adapters*`, invoice-type contracts | Read-only invoice/bill/receipt projection, as-of aging and preservation |
| C | Agent 3 | New `src/finance/custody*`, `product-prices*` | Thomas transfer/purchase reconciliation; SKU price comparability |
| D | Agent 4 | New Accountant workspace/report/permission files | Synthetic-only source labels, no login claim, accessible responsive view |
| E | Coordinator | `src/domain/model.ts`, `validation.ts`, repository/store, `App.tsx`, shared report/nav integration | Atomic explicit synthetic writes, no legacy mutation, combined regression |

Agents must not modify existing commercial/operations repositories, central store, domain database/schema, or navigation. The coordinator alone reviews and applies shared-file changes. Each stage is cherry-picked after source review; a failed gate leaves the integration branch at its last passing checkpoint.

## Persistence decision for this checkpoint

The optional `finance` namespace is absent in old records. Loading or viewing reports must not create it or post anything. The namespace, when present, is explicitly marked `synthetic-demo` and validates before render/write. Only an explicit synthetic fixture command may create/persist it. It is stored under the existing `azzora-demo-v1` key in the same cloned-database `store.mutate` transaction; on validation or localStorage failure, the original bytes remain intact. No real CRM invoice, bill, payment or expense is automatically converted into a journal.

Existing sales and procurement documents stay authoritative. Read-only adapters derive legacy AR/AP status and history without altering source snapshots. New many-document settlement input remains a validated draft contract until authorized policy and posting mappings exist. The same distinction applies to invoice-type conversion, expense approval, cash custody, and product-price observations.

## Required evidence before handoff

- Legacy database with no finance namespace loads with original document/payment bytes unchanged; malformed finance namespace produces reachable read-only recovery and original export.
- Explicit synthetic fixture creation survives reload; retry is byte-identical; postings/reversals remain balanced and period-bound; no journal is created on load or report view.
- Read-only AR/AP projection preserves invoice/bill histories and due-date aging after partial payment, reversal and credit/refund; no automatic oldest-first allocation.
- Synthetic Thomas case proves AED 2,000 custody transfer leaves cash holdings intact and AED 350 purchase leaves AED 1,650, counted once as cost.
- Report selectors reconcile to the synthetic journal; P&L/Balance Sheet never use the unrelated commercial dashboard estimate.
- TypeScript, ESLint, all unit/integration tests, production build, relevant CRM/browser/PDF regression and 390/430/768/1024/1440 responsive review run on a frozen combined SHA.

Policy B01–B12 remains open as recorded in [the decision register](DECISION-REGISTER.md). Secure Accountant login and real posting are excluded from this checkpoint.
