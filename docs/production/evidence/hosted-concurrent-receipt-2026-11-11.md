# Concurrent fictional receipt — 11 November 2026

Protected fictional staging Preview `dpl_3YLDaMEwaeY8NoPtNS1LjJbTsufq`, application revision `771725f9f1dd5020b78b921dc7f1998722446233`; separate fictional Company B. An Accountant signed in using MFA. Before dispatch, the expected version, action ID, and idempotency key were stored in a temporary owner-restricted directory. No credentials, private identifiers or financial data from a real company were used.

Two concurrent identical requests submitted the same fictional AED 1.00 receipt with the same idempotency key and expected version. Both returned HTTP 200, in 5.003 and 5.032 seconds respectively, including CLI transport overhead. Vercel telemetry shows both reached `staging_company_commit` and returned 200; respective RPC times were 131ms and 38ms.

Read-only reconciliation showed company version 9→10, exactly one matching new receipt, total receipts 2→3, and invoice outstanding AED 74→73. Trial Balance and Balance Sheet remained balanced. This is one successful same-key concurrency check against the small fictional B company; it does not prove production-scale performance, cover different-key financial conflicts, or resolve the prior intermittent 503/57014 incident. No production system was altered.
