# Application security comparison — 12 November 2026

This read-only query covers the AZZORA-owned `azzora` schema and `public.staging_*` functions. It excludes business rows, Auth users/secrets and Supabase-managed internal schema definitions. Client-relevant grants are limited to PUBLIC, anon, authenticated, service_role and azzora_api. It does not test row-policy execution.

The accompanying `application-security-fingerprints.sql` was executed successfully on a fresh isolated PGlite database built from this branch's reviewed staging migrations (source HEAD `41b9608`). Results:

| Component | Count | MD5 of sorted metadata |
| --- | ---: | --- |
| columns | 182 | 370e8b59eea9ef5ace3a7672e63acf5e |
| constraints | 297 | 3d5e5ac616df47a8c7c2a5df59276412 |
| function_grants | 25 | 924c78ac4ed2325a79d9a0390054fed6 |
| functions | 35 | a49b8be172042067c9131b307e7531ad |
| indexes | 35 | a3b072fc4482f6b113513de42650da50 |
| policies | 11 | 3144409777d95cab7b1ed9792008b38e |
| relations | 24 | 59ab66aa61073aa1e44714a5c54126df |
| schema_grants | 1 | 13a280312f97b147689041caad6a4511 |
| table_grants | 11 | 8ae6fb490fcedd71a47075a0a4763b86 |

Hosted execution: **BLOCKED** at this checkpoint. All three available Supabase connector links expose unrelated projects; browser control could not establish the current URL confidently and stopped. No grant was widened or database role impersonated. Earlier hosted comparison of 11 policy declarations remains separate evidence; this query includes schema names, so its policy digest intentionally differs from that earlier query.

Run this exact SELECT on authorized fictional staging when management access is available. A mismatch requires per-object inspection; differences such as the explicitly authorized temporary Company B login allowlist or PostgreSQL deparser formatting must be explained rather than automatically labeled a vulnerability. Do not infer live equality from this local baseline.

Independent recovery privacy checks also executed on the isolated loopback PostgreSQL target against `004_restore_business.sql` SHA-256 `58c36f17744746b5b3f53a7943559520a6e2b6ff3f5f1bc9d8c506da1796e50b`: 3/3 malformed-JSON, invalid-UUID and unknown-authority requests returned generic denials, left business record count unchanged, and exposed no synthetic sentinel in driver fields or PostgreSQL logs. Existing monitoring settings were not changed. These checks do not establish successful restore, post-write rollback or hosted recovery. Binding-aware operator unit tests passed 2/2.
