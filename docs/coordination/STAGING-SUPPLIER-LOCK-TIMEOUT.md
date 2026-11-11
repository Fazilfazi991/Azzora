# Fictional supplier payment — induced lock failure — 11 November 2026

In authorized fictional staging, a fictional Accountant prepared an AED 1 supplier payment using a privately recorded action, company version and idempotency key. Canonical baseline: zero matching payments, journals and allocations. A bounded, guarded transaction locked the fictional company's row for 22 seconds and then rolled back.

During the lock, the payment request returned HTTP 503 after 13.968 seconds including transport. After lock release and before replay, application reconciliation showed version 522 unchanged, payable AED 18 unchanged and balanced financial reports. Database reconciliation showed zero matching payments, journals and allocations, with no allocated, debit or credit amounts. Thus this test observed no partial posting.

A single deliberate replay of the same action and original key returned 200. Application version became 523, payable AED 17, and reports remained balanced. Canonical reconciliation found one payment, one journal and one allocation of 100 fils, with equal debit and credit of 100 fils. Synthetic records and private test identifiers were retained.

The deliberate lock and HTTP 503 do not by themselves establish the precise database error, identify the original intermittent 503's cause, or prove production readiness. No production system or real-company data was changed.
