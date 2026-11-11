# AZZORA Free-plan operations

Owner decision: remain on Supabase Free. This runbook does not establish that monitoring or backups are active. No artificial keepalive traffic should be used to avoid inactivity rules.

## Checks and response

| Check | Operator action |
| --- | --- |
| Database size and disk | Review project usage and Database settings regularly. Published Free allowance is 500 MB database per project; disk is fixed at 2 GB. At 95% disk usage the database can be put in read-only mode; WAL also uses space. Investigate unusual growth early, preserve verified backups, and do not delete accounting data to clear space without an approved retention decision. |
| Storage and bandwidth | Review organization usage for Storage and egress. Published Free allowances include 1 GB Storage and 5 GB uncached plus 5 GB cached egress. Daily attachment backups consume bandwidth and Drive capacity; assess actual usage and verify quotas for this organization. |
| Pause notifications | Supabase can pause a Free project after seven days of low activity. Ensure the project owner can receive its warning emails. If paused, stop operations, restore through the Supabase dashboard, verify authentication, storage and backup state, and check a fictional transaction before resuming. Do not generate artificial activity. |
| Backup and Drive capacity | Independently monitor latest completed encrypted archive and manifest; alert on absence, staleness, incomplete uploads, integrity failures and near-full Drive. Retention and warning thresholds require explicit configuration. No automatic job or watchdog is currently established. |
| Failed writes | Monitor application/function errors and 503s without logging records or credentials. For uncertain transaction outcomes, reconcile the authoritative record and idempotency receipt before retrying. Existing intermittent 57014 timeouts remain unresolved. |

GitHub Free lists 2,000 hosted Actions minutes and 500 MB Actions storage monthly, shared at account/organization level; actual remaining quota and zero-spend settings must be checked for the chosen private repository. Scheduled runs may be delayed or dropped. Apps Script consumer accounts have separate quotas and time triggers can vary; monitor reliability cannot be assumed. Do not enable automation before credentials, capacity, scope and offsite recovery are verified.

Sources: [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [database and disk behavior](https://supabase.com/docs/guides/platform/database-size), [egress](https://supabase.com/docs/guides/storage/serving/bandwidth), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [GitHub included usage](https://docs.github.com/en/billing/reference/product-usage-included), [GitHub scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), and [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
