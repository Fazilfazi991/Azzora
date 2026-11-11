# Fictional receipt concurrency — 11 November 2026

Protected fictional staging, application revision 771725f9f1dd5020b78b921dc7f1998722446233. Accountant MFA authenticated. IDs, keys and expected versions were privately persisted before requests; only fictional records were used. Canonical database queries independently counted receipt records, linked journals and allocations and summed debit, credit and allocation amounts.

Two distinct AED 600 receipts with separate keys targeted the same AED 897 outstanding invoice at version 523. They returned 200 and 409. Exactly one receipt, journal and allocation were recorded, the allocation and both journal sides were 60,000 fils, outstanding became AED 297, version 524, and reports balanced. No partial loser or over-allocation was observed.

Two identical AED 1 requests with one key at version 524 both returned 200. A changed-amount request reusing that key returned 409. Reconciliation showed exactly one fixture receipt, journal and allocation, 100 fils allocated and on each journal side, outstanding AED 296, version 525, and balanced reports.

These controlled fictional tests do not explain the earlier intermittent 503 or prove production readiness. Synthetic fixtures and private identifiers remain preserved.
