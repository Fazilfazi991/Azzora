-- Run only after both files have returned success and hosted security checks pass.
-- Exact source-file SHA256 values, not a synthetic Supabase CLI migration ledger.
-- Does not modify supabase_migrations or any business/authentication records.
begin;
do $$ begin
 if not exists(select 1 from azzora.environment_config
  where project_ref='hkhomrrvxtcxnxvdlkoh' and environment='synthetic-staging'
   and not real_financial_posting_enabled and not real_document_processing_enabled) then
  raise exception 'Approved fictional-only staging scope is not established';
 end if;
 if exists(select 1 from azzora.schema_migration_audit where version='20261104081228'
  and (source_sha256<>'c83dd4bdf6e5159af1a49757e85e29199021ecdb6e2e5e3a717e6b28ad607770'
    or project_ref<>'hkhomrrvxtcxnxvdlkoh'))
 or exists(select 1 from azzora.schema_migration_audit where version='20261104113610'
  and (source_sha256<>'d03adb84322210dbe38edb2bd2b55c00b78c57a2f151305664a15dfb285de104'
    or project_ref<>'hkhomrrvxtcxnxvdlkoh')) then
  raise exception 'Existing migration evidence conflicts with verified source';
 end if;
end $$;
insert into azzora.schema_migration_audit(version,filename,source_sha256,git_sha,project_ref,applied_via)
 values ('20261104081228','20261104081228_canonical_backend_foundation.sql',
 'c83dd4bdf6e5159af1a49757e85e29199021ecdb6e2e5e3a717e6b28ad607770',
 'f32ed90524ad46f5e0a8604528beff5e5e10068c','hkhomrrvxtcxnxvdlkoh','supabase-sql-editor'),
 ('20261104113610','20261104113610_synthetic_staging_boundary.sql',
 'd03adb84322210dbe38edb2bd2b55c00b78c57a2f151305664a15dfb285de104',
 'f32ed90524ad46f5e0a8604528beff5e5e10068c','hkhomrrvxtcxnxvdlkoh','supabase-sql-editor')
 on conflict(version) do nothing;
commit;
select version,source_sha256,git_sha,project_ref,applied_via,recorded_at
 from azzora.schema_migration_audit order by version;
