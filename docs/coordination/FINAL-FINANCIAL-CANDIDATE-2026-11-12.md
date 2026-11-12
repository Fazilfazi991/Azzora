# Final fictional staging financial acceptance — 12 November 2026

Tested application: `b778dd75dc34f4b2101f38a66560b55efcafb60f`.
Protected Preview: `https://azzora-shared-staging-qbw0udtk4-faziils-projects.vercel.app`.
Deployment: `dpl_2p7wUjkt9fzufXJHydp9emJ1BzYs`, `sin1`.

Only existing fictional Company B receipts and Company A supplier payments were used, under an exclusive staging write window. Individual Accountant login and MFA, CSRF, existing idempotency and version checks remained enabled. Native requests used a private deployment-scoped protection cookie; deployment protection was not disabled. No production, stable alias, real-company record or paid AI call was involved.

## Results

| Scenario | Receipt | Supplier payment |
| --- | --- | --- |
| 1. Normal save | PASS — 200; version 11→12; outstanding AED 72→71; one record, journal and allocation, equal 100-fils debit/credit. | PASS — 200; version 527→528; payable AED 17→16; one record, journal and allocation, equal 100-fils debit/credit. |
| 2. Concurrent identical key and changed payload | PASS — 200/200, one committed result; changed amount with same key 409; version 13 and outstanding AED 70 unchanged by rejected request. | PASS — 200/200, one committed result; changed amount with same key 409; version 529 and payable AED 15 unchanged by rejected request. |
| 3. Distinct competing submissions | PASS — two AED 40 requests against AED 70 returned 409/200; only the second committed; version 14, outstanding AED 30, one 4,000-fils allocation and balanced journal. | PASS — two AED 10 requests against AED 15 returned 200/409; only one committed; version 530, payable AED 5, one 1,000-fils allocation and balanced journal. |
| 4. Lock/statement timeout before commit | PASS — 503 and PostgreSQL 57014; before retry zero fixture records/journals/allocations, version 15 and outstanding AED 29 unchanged. One deliberate same-key retry 200; version 16, outstanding AED 28, one balanced 100-fils settlement. | PASS — 503 and PostgreSQL 57014; before retry zero fixture records/journals/allocations, version 531 and payable AED 4 unchanged. One deliberate same-key retry 200; version 532, payable AED 3, one balanced 100-fils settlement. |
| 5. Failure between business and journal writes | PASS, isolated — coordinator executed `src/staging/financial-fault.test.ts` at final source, 1/1 test containing both settlement types. The real receipt command leaves zero records/journals/allocations and identical canonical state after the private journal-write failure. | PASS, isolated — same test verifies the real supplier-payment command, with zero partial records/journals/allocations and identical canonical state. No hosted/public fault endpoint was introduced. |
| 6. Committed result with response lost | PASS, simulated client response-body loss — the client cancelled the body after response headers and did not parse the command result. Before replay, actual hosted SQL showed one record/journal/allocation and equal 100-fils totals. Same-key replay 200 left version 15, outstanding AED 29 and all counts/totals unchanged. | PASS, simulated client response-body loss — same procedure; actual SQL confirmed one balanced settlement before replay. Replay 200 left version 531, payable AED 4 and all counts/totals unchanged. |

Scenario 6 is an intentional client-side response-body discard after headers, not a claim that an unplanned network outage was reproduced. Scenario 5 is an isolated database fault test, not hosted fault injection. The other scenarios exercised the actual protected hosted Accounts API.

## Canonical reconciliation

The coordinator ran the actual hosted SQL editor query for case labels `fin12-r-*` and `fin12-p-*`. Before any writes, all ten cases had zero records, journals, allocations and journal totals. After normal/same/distinct requests, those six cases had exactly one record, journal and allocation. Before and after each lost-response replay, both lost cases had exactly one of each and unchanged 100-fils allocated/debit/credit totals. After lock release and before any timeout retry, both timeout cases still had zero of each.

The final hosted query confirmed **all ten cases have exactly one record, one journal and one allocation**. Receipt distinct totals are 4,000 fils; supplier distinct totals are 1,000 fils; every other case has 100 fils. For every case, allocated amount equals journal debit and credit. Final authenticated snapshots showed balanced Trial Balance and Balance Sheet, Company B version 16 with nine total receipts and AED 28 remaining on the selected invoice, and Company A version 532 with seventeen total supplier payments and AED 3 remaining on the selected bill. The ten new settlements account for AED 44 receivable reduction and AED 14 payable reduction.

## Induced timeout evidence

The coordinator held only the two authorized fictional company rows in a guarded diagnostic transaction for 22 seconds, then rolled back. Lock release was recorded at `2026-11-12 06:09:30.778616+00`. Both requests failed while the lock remained held:

| Settlement | Application request ID | Client result | Correlated Vercel RPC metadata |
| --- | --- | --- | --- |
| Receipt | `ca9fabeb-ecc1-49f0-a276-da6806cc9e5e` | 503, 9,746 ms; completed `06:09:24.101Z` | Platform request `g45zh-1794463754198-a31f8038f85e`; `staging_company_commit`, 8,163 ms, RPC status 500/code `57014` at `06:09:23.616Z`. |
| Supplier payment | `12e86ee1-48dd-441c-9587-bbe4f960eb03` | 503, 11,417 ms; completed `06:09:25.772Z` | Platform request `q5ckn-1794463754195-a4ba00f37ad2`; `staging_company_commit`, 9,205 ms, RPC status 500/code `57014` at `06:09:25.274Z`. |

No application timeout increase or automatic financial retry was introduced. Reconciliation preceded each single controlled same-key retry.

**Original intermittent 503 cause: UNKNOWN.** These results verify transaction-safety behavior under the specified controlled failures; they do not establish or fix the historical incident's cause.

All ten application sessions created for these cases were explicitly logged out, each returning 200. Private pending requests and fixture material remain in restricted local temporary storage and were not committed or deleted. The financial write window was released after logout.
