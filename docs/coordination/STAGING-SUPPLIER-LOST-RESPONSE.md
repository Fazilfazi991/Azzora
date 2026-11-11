# Fictional supplier payment — lost response — 11 November 2026

Protected fictional staging, application revision 771725f9f1dd5020b78b921dc7f1998722446233. An Accountant prepared an AED 1 supplier payment with privately persisted action, expected version and idempotency key. Initially its unique fixture had no payment, journal or allocation.

The client was terminated after 2.548 seconds without observing a response. Before replay, read-only reconciliation established the transaction committed: version 521→522, one matching payment, one linked journal and one allocation of 100 fils; journal debit and credit each 100 fils; payable AED 19→18; trial balance and balance sheet balanced.

One deliberate replay with the identical request and original idempotency key returned 200. A second read-only application and database reconciliation confirmed the same version, one payment, one journal, one allocation, unchanged 100-fils totals, unchanged payable and balanced reports. The fictional record and private test identifiers were preserved.

This simulates losing the client response after dispatch; the actual commit was independently confirmed before replay. It does not prove the cause of earlier 503s or production readiness.
