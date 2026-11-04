-- Owner-approved existing AZZORA project, fictional-data staging only.
-- No application deployment, individual account, live posting or real data enabled.
begin;

create table azzora.environment_config (
  singleton boolean primary key default true check(singleton),
  project_ref text not null check(project_ref='hkhomrrvxtcxnxvdlkoh'),
  environment text not null check(environment='synthetic-staging'),
  real_financial_posting_enabled boolean not null default false check(not real_financial_posting_enabled),
  real_document_processing_enabled boolean not null default false check(not real_document_processing_enabled),
  approved_scope text not null,
  created_at timestamptz not null default now()
);
insert into azzora.environment_config(project_ref,environment,approved_scope)
 values ('hkhomrrvxtcxnxvdlkoh','synthetic-staging',
 'Owner approved fictional-data staging only; no changes to live Manager CRM or Accounts deployments.');

-- Independent evidence for browser-applied files, NOT Supabase CLI migration history.
-- Populate only after verifying the exact local file hashes and successful cloud results.
create table azzora.schema_migration_audit (
  version text primary key check(version ~ '^[0-9]{14}$'),
  filename text not null,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  git_sha text not null check(git_sha ~ '^[a-f0-9]{40}$'),
  project_ref text not null check(project_ref='hkhomrrvxtcxnxvdlkoh'),
  applied_via text not null check(applied_via='supabase-sql-editor'),
  recorded_at timestamptz not null default now()
);
alter table azzora.environment_config enable row level security;
alter table azzora.schema_migration_audit enable row level security;
revoke all on azzora.environment_config,azzora.schema_migration_audit from public,anon,authenticated,azzora_api;
create trigger staging_scope_immutable before update or delete on azzora.environment_config
 for each row execute function azzora.reject_history_mutation();
create trigger migration_evidence_immutable before update or delete on azzora.schema_migration_audit
 for each row execute function azzora.reject_history_mutation();

-- Do not overwrite a pre-existing bucket with incompatible settings.
-- No Storage object policy/grant is added: all application access stays denied
-- until authenticated object handlers and resource authorization pass staging tests.
do $$ begin
 if exists(select 1 from storage.buckets where id='azzora-private') then
  if not exists(select 1 from storage.buckets where id='azzora-private' and not public
    and file_size_limit=2097152
    and allowed_mime_types @> array['application/pdf','image/png','image/jpeg']::text[]
    and allowed_mime_types <@ array['application/pdf','image/png','image/jpeg']::text[]) then
   raise exception 'Existing AZZORA bucket conflicts with reviewed private staging settings';
  end if;
 else
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('azzora-private','azzora-private',false,2097152,array['application/pdf','image/png','image/jpeg']);
 end if;
end $$;

-- No companies, users, sessions, invoices, journals, approvals or real files seeded.
commit;
