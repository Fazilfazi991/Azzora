# Accounts production hosting decision — 11 November 2026

Recommendation: **Supabase Pro for real accounting**, with separate verified backup of Storage attachments and independent monitoring. No upgrade or expenditure is authorized by this document; check the organization's current invoice, projects, region, tax and usage before purchase.

| | Pro | Free temporarily |
| --- | --- | --- |
| Published starting cost | USD 25/month per organization before tax, additional projects or excess usage. The included USD 10 compute credit covers one default Micro/Nano project. A second continuously running default project generally adds about USD 10/month, making an illustrative two-project total about USD 35/month before tax and other usage; confirm actual project sizes and billing. | USD 0 subscription while within Free allowances; independent backup, monitoring or storage may have their own costs. |
| Database recovery | Automated daily database backups, 7 days' retention on Pro; point-in-time recovery is a separately priced add-on. | No automatic daily backups. A separately verified scheduled export, offsite copy, independent monitoring and tested restore are essential. |
| Availability | Projects are not paused for inactivity. | Projects may pause after a 7-day period of low activity; restoration and other Free-tier limitations must be accepted explicitly. |
| Attachments | Database backups do not include Storage object bytes. Back up and test attachments separately. | Same separate attachment and integrity requirements. |

Pro applies at organization level, not to one project in isolation. Additional projects each consume compute; do not assume staging stays free if it is in the upgraded organization. Pro is not a substitute for application-level reconciliation, access controls, offsite attachment recovery, policy approvals or launch testing. Free with independent backups is not equivalent to Pro's managed operational service.

Sources: [Supabase compute billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [database backups](https://supabase.com/docs/guides/platform/backups), [billing organizations](https://supabase.com/docs/guides/platform/billing-on-supabase), and [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
