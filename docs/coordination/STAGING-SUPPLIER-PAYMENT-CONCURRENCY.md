# Fictional supplier-payment concurrency — 11 November 2026

Protected fictional staging, application revision 771725f9f1dd5020b78b921dc7f1998722446233. A fictional Accountant authenticated with MFA. Private action identifiers, expected versions and idempotency keys were recorded before dispatch. Canonical database checks counted matching payments, journals and allocations and summed journal debits and credits.

Two simultaneous identical AED 1 supplier-payment requests with the same key both returned 200. One payment, one journal and one allocation were committed, allocation 100 fils and debit/credit 100 fils each; payable fell from AED 60 to 59, and version 517 to 518. A changed AED 2 request using the same key returned 409; subsequent version, payment count, payable and financial reports were unchanged.

Two distinct AED 40 payment requests with separate keys targeted the same bill with AED 59 outstanding, both using version 518. They returned 200 and 409. Reconciliation found one payment, one journal and one allocation of 4,000 fils, with debit and credit 4,000 fils; payable fell to AED 19, version became 519, and reports remained balanced. No partial record or over-allocation was observed for the rejected request.

This covers one normal settlement, one same-key concurrent replay, altered-payload rejection and one competing-payment conflict on fictional staging. It does not establish the historical 503 cause; supplier timeout and lost-response tests were not performed in this check. No production data or deployment was changed.
