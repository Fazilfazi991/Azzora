# Fictional financial lock timeout — 11 November 2026

On authorized fictional staging, a fictional Accountant prepared one AED 1 receipt with a privately persisted action, expected company version and idempotency key. The fixture had zero canonical receipt records and zero associated journals before the test. An independently guarded transaction held only fictional Company B's company row lock for 22 seconds and rolled back.

During that lock the receipt request returned HTTP 503 after 15.401 seconds measured by the client, including transport. After the lock was released and before any retry, read-only reconciliation showed version 10 unchanged, total receipts 3 unchanged, zero fixture receipts, zero fixture journals, invoice outstanding AED 73 unchanged, and balanced Trial Balance and Balance Sheet. This verifies no partial receipt or journal was observed after this induced failure.

A single deliberate retry of the identical request and original idempotency key returned HTTP 200. Reconciliation showed version 11, total receipts 4, exactly one fixture receipt and one associated journal, invoice outstanding AED 72, and balanced reports. The synthetic transaction and private test identifiers were preserved.

The intentional row lock and observed 503 demonstrate a controlled failure with safe reconciliation in this case. The HTTP response alone does not identify the database error or prove the historical intermittent 503 had the same cause. No production system or real-company financial data was altered.
