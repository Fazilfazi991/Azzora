# Larger-company fictional financial concurrency — 11 November 2026

Protected Preview `dpl_3YLDaMEwaeY8NoPtNS1LjJbTsufq`, application revision `771725f9f1dd5020b78b921dc7f1998722446233`; fictional staging Company A. Company A had 1,078 records, 86 journals, 42 snapshots and a 2,163,228-byte canonical projection in the preceding read-only measurement. The Accountant signed in with MFA. Expected version, fixture action and idempotency key were recorded in an owner-restricted temporary directory before dispatch. No production or real-company data was used.

Two simultaneous identical requests submitted a fictional AED 1 receipt with the same expected version and idempotency key. Both returned HTTP 200 in 11.979s and 12.990s, respectively, including CLI/transport overhead. Snapshot reconciliation showed version 514→515, exactly one matching receipt, total receipts 13→14, and invoice outstanding AED 900→899; Trial Balance and Balance Sheet were balanced.

Vercel timing telemetry for requests `jn92c-1794400134801-49f3d52141a6` and `dvdmz-1794400134765-8939d110340f` recorded `staging_company_commit` HTTP 200 in 4.557s and 4.871s, then `staging_company_read` HTTP 200 in 1.743s and 2.703s. These RPC timings include network plus SQL execution and waiting, so they cannot isolate lock contention, server resource pressure or a particular SQL phase. The similar small Company B test showed 131ms and 38ms commit RPCs, but the runs occurred at different times and are not a controlled benchmark.

This single larger-fixture concurrency test verifies one same-key financial replay without duplication. It does not establish worst-case performance, a production load guarantee, or the cause of previous PostgreSQL 57014 incidents. The previous 503 remains a release blocker.
