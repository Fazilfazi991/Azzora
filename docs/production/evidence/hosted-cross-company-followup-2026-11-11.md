# Hosted fictional cross-company follow-up — 11 November 2026

Scope: protected Preview application `93ab132b7d6d3a6e13773b71a6c276a7daa6f585`, fictional staging project `hkhomrrvxtcxnxvdlkoh`, not production. Test credentials, session cookies and identity secrets were excluded from this record. The temporary Company B grant expires 12 November 2026 at 07:43:38 UTC. Company A and B are fictional fixtures.

## Reverse-direction financial visibility and reconciliation

The Company B Manager issued a zero-VAT fictional AED 100 invoice; its Accountant recorded one AED 25 fictional receipt. Authenticated B snapshot showed that invoice and receipt, with AED 75 outstanding. Compared with B's preceding snapshot, receivables increased AED 75 and bank increased AED 25; B Trial Balance and Balance Sheet were balanced.

The authenticated Company A Accountant snapshot contained neither Company B invoice nor receipt. Company A financial metrics were unchanged. Earlier testing had shown Company B could not see Company A invoices and receipts. These checks cover BFF snapshots; they do not by themselves prove every report field or every table is tenant-safe.

## Foreign invoice mutation denial

Each Accountant submitted a uniquely keyed fictional receipt against the other company's known invoice. Both operations returned HTTP 400. Subsequent snapshots showed both company versions, all exposed financial metrics, and receipt counts unchanged. Neither request created a receipt. These are BFF checks using the Accountant role; they do not establish every possible operation or role.

## Direct provider exposure checks

Using the Supabase publishable key and a Company B Manager provider access token, unauthenticated `staging_auth_grant` returned 401, authenticated `staging_auth_grant` returned 403, authenticated `staging_company_read` returned 403, and a direct `azzora` schema REST request returned 406. The authenticated Storage bucket-list endpoint returned 200 with an empty list; it is accurately recorded as an empty result, not a denied request. This confirms these specific exposed endpoints do not yield the targeted data for the tested identities. It is not a full RLS audit, a privileged-role test, nor a direct test of every Storage policy.

No production records, deployment, real posting settings or live aliases were changed. The staged tests used uniquely keyed fictional records. Combined with previous BFF private-file and project-denial tests, these results extend but do not complete the full security acceptance matrix.
