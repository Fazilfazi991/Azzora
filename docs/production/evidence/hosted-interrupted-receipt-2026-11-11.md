# Interrupted fictional receipt — 11 November 2026

Protected staging Preview `dpl_3YLDaMEwaeY8NoPtNS1LjJbTsufq` / application `771725f9f1dd5020b78b921dc7f1998722446233`; separate fictional Company B only. A fictional Accountant signed in with MFA. The action ID, original company version and idempotency key were recorded before dispatch in a temporary owner-restricted directory; no credential or identifier is included here.

An AED 1.00 fictional receipt against an existing fictional open invoice was submitted. The local client process was terminated with SIGTERM after 2.557 seconds, so it did not observe a response. Safe Vercel telemetry shows the original request `sl7vd-1794396918476-9fd03323aa51` reached `staging_company_commit` and received HTTP 200. A read-only snapshot before retry showed version 8→9, receipt count 1→2 with exactly one matching fixture receipt, and invoice outstanding AED 75→74. Trial Balance and Balance Sheet were balanced.

One explicit retry used the exact original action, expected version and idempotency key. It returned HTTP 200 in 2.518 seconds. A second read-only snapshot still showed version 9, exactly one matching fixture receipt, total receipt count 2, outstanding AED 74, and balanced Trial Balance and Balance Sheet. Telemetry for retry `724g8-1794396956110-f0c1a8bfbcd4` recorded commit HTTP 200. This is one verified idempotent replay, not proof of every interrupted transaction or of production readiness. No real-company financial data, settings or deployments were changed.

The earlier intermittent 503 / PostgreSQL 57014 remains unresolved. See `hosted-company-lock-diagnostic-2026-11-11.md` for a separately induced lock timeout; do not infer that it caused the historical incidents.
