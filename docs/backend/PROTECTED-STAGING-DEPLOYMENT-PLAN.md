# Protected shared staging deployment proposal

Status: prepared for Owner approval; **not published**. This is a separate fictional-data acceptance environment, not production accounting. The existing Manager and Accounts deployments, aliases, GitHub main and mail/DNS settings are out of scope.

## Exact proposed target

| Setting | Proposed value |
| --- | --- |
| New dedicated Vercel project | `azzora-shared-staging` in the existing owner team; no existing live project reused |
| Source branch | `codex/azzora-final-shared-staging`; freeze full tested source SHA before release |
| Deployment target | **Preview only**, using reviewed `vercel.staging.json` explicitly |
| Build | `node scripts/check-staging-build.mjs && npm run build`; both Manager `/index.html` and separate Accounts `/accountant.html` |
| Runtime / region | Node.js 24.x; Singapore `sin1`, matching the authorized database region |
| Database | Only `https://hkhomrrvxtcxnxvdlkoh.supabase.co`, fictional company `11111111-1111-4111-8111-111111111111` |
| Files | Existing private `azzora-private` bucket; fresh role/project authorization before each protected download; no public originals |
| Preview protection | Vercel Authentication enabled **before** first deployment. Owner/accountant review through an owner-controlled deployment share link where supported; application individual login remains mandatory |
| Search engines | `X-Robots-Tag: noindex, nofollow`; no production domain or sitemap change |

Enable system environment variables so the runtime can verify the new exact `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_NAME`, `VERCEL_ENV` and `VERCEL_BRANCH_URL`. Only the system-generated stable branch origin and explicitly reviewed dedicated staging aliases are trusted. The generated per-deployment hostname is not automatically accepted for mutations. Do not derive an allowed origin from user Host/Origin headers. Do not use a shared demo password or an authentication bypass.

## Preview-only environment inventory

Configure through the new project's secret settings; never commit or paste values into reports:

| Variable | Requirement |
| --- | --- |
| `VITE_AZZORA_STAGING` | `1` (build flag only, no secret) |
| `AZZORA_ACCOUNTS_PREVIEW` | unset; both separate entry points must build |
| `AZZORA_STAGING_SUPABASE_URL` | exact authorized fictional project URL above |
| `AZZORA_STAGING_PUBLISHABLE_KEY` | key for that project only; server configuration |
| `AZZORA_STAGING_SERVICE_KEY` | that project's privileged key, server-only; never `VITE_*` |
| `AZZORA_STAGING_AUTH_KEY` | newly generated unique staging encryption secret, server-only; do not reuse live/local secret |
| `AZZORA_STAGING_EXPECTED_PROJECT_ID` | exact ID of newly created dedicated project |
| `AZZORA_STAGING_DEPLOYMENT_APPROVED` | `true` only after Owner approves this publication proposal |
| `AZZORA_AI_ENABLED` | `false`; no provider keys configured |
| `AZZORA_STAGING_ALLOWED_ORIGINS` | optional exact HTTPS dedicated staging aliases after review; default uses system branch URL |

No production credentials, Blob credentials, `DEEPSEEK_API_KEY`, shared-review password/hash, real-data import, real-user invitations or financial policy approvals. Existing Supabase immutable flags keep real financial posting and real document processing disabled. Do not enable production access just because the build passes.

## Publication and acceptance sequence, after approval

1. Verify frozen commit, clean Git tree, unchanged live aliases/main and new exact project identity. Review local secret/artifact scan. Create only this dedicated project, configure Preview-only secrets and protection. Do not connect Git for automatic production releases; use an explicit Preview upload unless separately approved.
2. Deploy the frozen source with the separate staging config, never `--prod`, promotion, existing-project linking or domain reassignment. Capture deployment ID, source SHA and exact protected branch URL; verify Vercel protection before sharing. New schema files are already applied to fictional staging; **do not replay migrations or run `db push/reset`**. Reconcile CLI history separately before any automated migration pipeline.
3. Test from an unauthenticated browser that protection is effective. Verify owner-controlled client access without disclosing project secrets. Use separate application Owner/PM/Accountant/Staff accounts with actual provider MFA where required; no real invitations.
4. Verify individual login, refresh, secure cookies, logout, revocation, Owner-assisted recovery, cross-workspace/API restrictions and private file denial/download at the actual hosted URL.
5. Repeat the same fictional Manager customer/project/commercial issue → Accountant payment → shared outstanding/journal/reports journey, purchasing/corrections, task/site/documents/QA/handover, document-review Save Draft (no posting), PDFs and desktop/mobile checks. Test direct reloads and inspect redacted request-ID logs.
6. Download/verify a fresh Owner backup and exercise host response streaming; test platform function packaging, payload/time limits and staging-only CORS/origins. Only then mark hosted acceptance passed and provide client instructions.

If hosted checks fail, stop sharing/disable this new Preview; retain the frozen prior source/previous deployment as rollback. Neither live alias needs rollback because neither is changed. Back up fictional data before any follow-up schema change; restore only through a separately reviewed controlled rehearsal. No destructive reset.

## Known limits requiring hosted verification

- Hosted workflows, function packaging and protection/share-link behavior are **pending publication**, not inferred from local HTTPS tests.
- Upload originals remain PDF/PNG/JPEG and at most2,000,000bytes (Manager picker retains its existing smaller limit). Multi-file payload and Vercel request limits still apply; no large-file claim.
- Owner business-data backup streams response chunks, but the64MiB original-bytes guard is an application ceiling, not a proven hosted capacity/timeout guarantee. Hosted large-package behavior must be measured; no infrastructure/Auth/PITR backup claim.
- Hosted recovery ignores attacker-supplied client-address headers and uses a conservative shared request limiter; per-client platform identity is not claimed. Owner handoff recovery works without email; SMTP, mailbox delivery, lost-MFA administration and real-user onboarding remain separate approval gates.
- Development dependency advisory exceptions and accounting policies are listed in the final security/policy reports. This is not a real-company cutover.

References: [Vercel protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Singapore regions](https://vercel.com/docs/regions), [function limits](https://vercel.com/docs/functions/limitations), [streaming responses](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).


## Reviewable publication command (not executed)

Only after the new exact project is protected, linked and approved, the reviewed Preview command is:

```powershell
vercel deploy --target=preview --local-config vercel.staging.json --scope faziils-projects
```

Verify the actual CLI/project identity and Git metadata first. If the chosen upload path does not supply the system-generated `VERCEL_BRANCH_URL`, the runtime deliberately refuses access: stop before sharing and resolve the dedicated project/branch configuration. Do not fake a system variable, weaken origin checks or link an existing live project. CLI/Git integration compatibility is a hosted release gate, not an assumed local success. [Official deployment command reference](https://vercel.com/docs/cli/deploy).

Read-only target inspection confirmed that `azzora-shared-staging` does not currently exist in the owner team (project lookup404); no project or deployment was created during preparation. The exact new project ID is established and verified during approved publication setup, never copied from a live project.
