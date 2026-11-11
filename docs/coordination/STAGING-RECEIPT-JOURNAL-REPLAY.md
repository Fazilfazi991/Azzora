# Interrupted receipt and journal reconciliation — 11 November 2026

On the authorized fictional staging project and protected Preview, an Accountant submitted one AED 1 fictional receipt using a privately persisted action identifier, company version and idempotency key. The uniquely named fixture had zero canonical receipt records and zero journals before dispatch. The client was terminated after 2.555 seconds without observing a response.

Before any retry, a read-only application snapshot confirmed the receipt had committed: company version 516→517, total receipts 15→16, exactly one fixture receipt, the selected fictional invoice outstanding AED 898→897, and balanced Trial Balance and Balance Sheet. Independent read-only canonical database queries found exactly one fixture receipt and one journal linked to that receipt. The journal identity was recorded as a digest for comparison, without publishing the identifier.

One deliberate replay of the exact action, expected version and persisted idempotency key returned HTTP 200. The subsequent application snapshot and canonical database query still showed one fixture receipt, one linked journal, the same journal identity digest, version 517, unchanged outstanding balance, and balanced reports. No duplicate receipt or journal was observed in this test.

The interruption simulates a client losing its response; it does not demonstrate every possible network failure or prove the cause of earlier HTTP 503 errors. No production deployment or real-company data was changed. The fictional transaction and private test identifiers were preserved.
