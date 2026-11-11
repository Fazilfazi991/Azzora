# Controlled fictional company-lock diagnostic — 11 November 2026

Result: a held company row lock can reproduce the same HTTP 503 / PostgreSQL 57014 class. This **does not establish** the cause of earlier intermittent failures or prove that timeouts are fixed.

Environment: protected Preview `dpl_3YLDaMEwaeY8NoPtNS1LjJbTsufq`; separately authorized fictional staging Supabase project `hkhomrrvxtcxnxvdlkoh`. No live production, role, security or database settings were changed. The Owner-approved temporary Company B grant remained unchanged.

A first synthetic customer command returned HTTP 400 before reaching the lock because the test fixture had conflicting details; that attempt was inconclusive. No record was committed. The fixture was corrected before the following test.

In a SQL-editor transaction on fictional Company B, the company row was selected `FOR UPDATE`, held for 22 seconds, then the transaction rolled back. While the lock was held, a valid authenticated Manager `customer.save` with a private, pre-recorded fixture ID, expected version and idempotency key returned HTTP 503 after 10.832 seconds. Vercel timing diagnostics for request `d8vfl-1794396592385-0d12caf7f5c9` reported `staging_company_commit` PostgreSQL `57014`. After the lock transaction completed, read-only reconciliation showed company version unchanged at 7 and zero rows matching the fixture.

A single deliberate retry of the exact same request and idempotency key after the lock was released returned HTTP 200 in 2.700 seconds. A fresh snapshot showed version 8 and exactly one matching fictional customer. The operation contained no financial posting and no metrics were changed by the probe.

The deliberate sustained lock establishes a **possible mechanism** for this error class and verifies atomic rollback and one-record retry for this nonfinancial test. The previous incident also contained a concurrent read timeout, and there is no captured blocking PID or wait-event evidence for that incident. It is therefore incorrect to attribute that incident to this lock, generalize this test to interrupted financial requests, or declare a production fix. Hosted 503 remains a release blocker; no speculative transaction rewrite or timeout increase was applied.
