-- AZZORA fictional staging boundary proof. Run only on the owner-approved staging project.
-- No auth.users/auth.sessions mutations, credentials, provider calls or permanent fixtures.
-- Every application and temporary change is rolled back. Any failed check raises an error.
-- Evidence establishes DB metadata + unauthenticated role denials, NOT live user login/MFA.
-- Managed SQL-admin preflight must confirm existing ADMIN TRUE membership in azzora_api.
-- A temporary SET permission TO that admin is rolled back; API privileges are never widened.
begin;

do $test_role$
begin
  if not pg_has_role(current_user,'azzora_api','SET') then
    if not exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
      join pg_roles u on u.oid=m.member
      where r.rolname='azzora_api' and u.rolname=current_user and m.admin_option and not m.inherit_option)
    then raise exception 'SQL test administrator lacks reviewed ADMIN-only API role membership'; end if;
    -- GRANT options apply to the SQL test admin, not the restricted API role itself.
    -- Separate commands preserve the reviewed no-inheritance boundary explicitly.
    execute format('grant azzora_api to %I with inherit false',current_user);
    execute format('grant azzora_api to %I with set true',current_user);
    if not pg_has_role(current_user,'azzora_api','SET') then
      raise exception 'Temporary test-only role switching is unavailable';
    end if;
  end if;
end
$test_role$;

create temporary table azzora_security_results (
  check_name text primary key,
  passed boolean not null check (passed)
) on commit drop;

do $proof$
declare
  required_tables text[] := array[
    'companies','memberships','sessions','parties','departments','projects',
    'project_assignments','records','snapshots','attachments','policy_approvals',
    'accounting_periods','accounts','journals','journal_lines','allocations',
    'audit_events','command_receipts','migration_batches'
  ];
  read_tables text[] := array[
    'parties','departments','projects','records','snapshots','attachments',
    'accounts','accounting_periods','journals','journal_lines','allocations'
  ];
  role_name text;
  table_name text;
  table_oid oid;
  function_oid oid;
  fixture_company uuid := gen_random_uuid();
  visible_count bigint;
  denied boolean;
begin
  if not exists (select 1 from pg_namespace where nspname='azzora') then
    raise exception 'AZZORA private schema is missing';
  end if;
  foreach table_name in array required_tables loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='azzora' and c.relname=table_name and c.relkind='r' and c.relrowsecurity
    ) then raise exception 'Required foundation table missing RLS: %',table_name; end if;
  end loop;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='azzora' and c.relkind in ('r','p') and not c.relrowsecurity
  ) then raise exception 'An AZZORA application table has RLS disabled'; end if;
  insert into azzora_security_results values('foundation_19_tables_and_all_application_tables_rls',true);

  if not exists(select 1 from pg_roles where rolname='azzora_api'
    and not rolsuper and not rolbypassrls and not rolcanlogin and not rolinherit)
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='azzora_api')
  then raise exception 'Restricted API role has unexpected privileges or memberships'; end if;
  insert into azzora_security_results values('api_role_no_login_no_bypass_no_inherited_roles',true);

  foreach role_name in array array['anon','authenticated'] loop
    if has_schema_privilege(role_name,'azzora','USAGE') or has_schema_privilege(role_name,'azzora','CREATE')
    then raise exception 'Browser role unexpectedly has private schema access: %',role_name; end if;
    for table_oid in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='azzora' and c.relkind in ('r','p') loop
      if has_table_privilege(role_name,table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      then raise exception 'Browser role unexpectedly has an application table grant: %',role_name; end if;
    end loop;
    for function_oid in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='azzora' loop
      if has_function_privilege(role_name,function_oid,'EXECUTE') then
        raise exception 'Browser role unexpectedly has private function execution: %',role_name;
      end if;
    end loop;
    insert into azzora_security_results values(role_name||'_no_private_schema_table_or_function_grants',true);
  end loop;

  for table_oid in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='azzora' and c.relkind in ('r','p') loop
    if has_table_privilege('azzora_api',table_oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    then raise exception 'API role unexpectedly has a direct write grant'; end if;
  end loop;
  foreach table_name in array read_tables loop
    if not has_table_privilege('azzora_api',format('azzora.%I',table_name),'SELECT')
    then raise exception 'Expected restricted read grant missing: %',table_name; end if;
  end loop;
  foreach table_name in array array['memberships','sessions','policy_approvals','audit_events','command_receipts','migration_batches'] loop
    if has_table_privilege('azzora_api',format('azzora.%I',table_name),'SELECT')
    then raise exception 'API role can directly read restricted control table: %',table_name; end if;
  end loop;
  insert into azzora_security_results values('api_expected_read_grants_and_no_direct_writes_or_control_reads',true);

  foreach table_name in array array['snapshots','journals','journal_lines','allocations','audit_events','command_receipts'] loop
    if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='azzora' and c.relname=table_name and t.tgname='immutable_history'
        and t.tgenabled in ('O','A') and not t.tgisinternal
        and t.tgfoid='azzora.reject_history_mutation()'::regprocedure)
    then raise exception 'Immutable-history trigger missing or disabled: %',table_name; end if;
  end loop;
  if not exists(select 1 from pg_trigger where tgrelid='azzora.journals'::regclass and tgname='journal_balanced'
    and tgdeferrable and tginitdeferred and tgenabled in ('O','A'))
  or not exists(select 1 from pg_trigger where tgrelid='azzora.journal_lines'::regclass and tgname='journal_lines_balanced'
    and tgdeferrable and tginitdeferred and tgenabled in ('O','A'))
  or not exists(select 1 from pg_trigger where tgrelid='azzora.journals'::regclass and tgname='journal_period_admission' and tgenabled in ('O','A'))
  or not exists(select 1 from pg_trigger where tgrelid='azzora.journal_lines'::regclass and tgname='journal_line_admission' and tgenabled in ('O','A'))
  then raise exception 'Journal balance or admission constraints missing or disabled'; end if;
  insert into azzora_security_results values('six_immutable_tables_and_deferred_journal_admission_guards',true);

  if exists(select 1 from azzora.policy_approvals) then
    raise exception 'Unexpected financial policy approval exists in fictional staging';
  end if;
  if exists(select 1 from azzora.journals) then
    raise exception 'Unexpected posted journal exists in closed-policy staging';
  end if;
  insert into azzora_security_results values('no_policy_approvals_or_posted_journals',true);
  if exists(select 1 from storage.buckets where id like 'azzora%' and public) then
    raise exception 'An AZZORA bucket is public';
  end if;
  insert into azzora_security_results values('no_public_azzora_storage_bucket',true);
  if not exists(select 1 from storage.buckets where id='azzora-private' and not public
    and file_size_limit=2097152
    and allowed_mime_types @> array['application/pdf','image/png','image/jpeg']::text[]
    and allowed_mime_types <@ array['application/pdf','image/png','image/jpeg']::text[])
  then raise exception 'Private staging bucket has incorrect limits or MIME types'; end if;
  insert into azzora_security_results values('private_originals_bucket_2mib_pdf_png_jpeg_only',true);
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relname='objects' and c.relrowsecurity)
  then raise exception 'Storage object RLS is missing or disabled'; end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and permissive='PERMISSIVE'
    and roles && array['public','anon','authenticated']::name[])
  then raise exception 'Unexpected browser-applicable permissive Storage object policy'; end if;
  insert into azzora_security_results values('storage_objects_rls_no_browser_permissive_policy',true);
  if (select count(*) from azzora.environment_config)<>1
    or not exists(select 1 from azzora.environment_config where project_ref='hkhomrrvxtcxnxvdlkoh'
      and environment='synthetic-staging' and not real_financial_posting_enabled and not real_document_processing_enabled)
  then raise exception 'Fictional staging environment guard missing or unsafe'; end if;
  insert into azzora_security_results values('exact_approved_project_fictional_only_real_posting_and_processing_disabled',true);

  -- Fictional nonfinancial rows only; random company key avoids touching any existing row.
  insert into azzora.companies(id,name) values(fixture_company,'Fictional Staging Security Probe');
  insert into azzora.parties(company_id,id,kind,payload) values(fixture_company,'probe-party','customer','{"fictional":true}');
  insert into azzora.projects(company_id,id,customer_id,payload) values(fixture_company,'probe-project','probe-party','{"fictional":true}');
  insert into azzora.records(company_id,entity_type,id,project_id,payload,status)
    values(fixture_company,'sales_invoice','probe-draft','probe-project','{"fictional":true,"amount":0}','draft');

  foreach role_name in array array['anon','authenticated'] loop
    execute format('set local role %I',role_name);
    denied:=false;
    begin execute 'select count(*) from azzora.records'; exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Browser role table read unexpectedly succeeded'; end if;
    denied:=false;
    begin execute 'insert into azzora.companies(name) values (''Forbidden fictional browser write'')'; exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Browser role table write unexpectedly succeeded'; end if;
    reset role;
    insert into azzora_security_results values(role_name||'_actual_select_and_insert_denied',true);
  end loop;

  -- No provider identity or app-session context. Even a trusted API role must see no rows.
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('azzora.session_token_hash','',true);
  set local role azzora_api;
  select count(*) into visible_count from azzora.projects;
  if visible_count<>0 then raise exception 'API without identity sees project records'; end if;
  select count(*) into visible_count from azzora.records;
  if visible_count<>0 then raise exception 'API without identity sees application records'; end if;
  select count(*) into visible_count from azzora.journals;
  if visible_count<>0 then raise exception 'API without identity sees finance records'; end if;
  denied:=false;
  begin insert into azzora.companies(name) values('Forbidden fictional API write'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'API direct company write unexpectedly succeeded'; end if;
  reset role;
  insert into azzora_security_results values('api_without_identity_has_zero_rows_and_no_direct_write',true);
end
$proof$;

-- Execute the exact immutable trigger function without creating managed auth users
-- or financial records. Metadata checks above verify its attachment to the real six tables.
create temporary table azzora_history_probe(id integer primary key, value integer) on commit drop;
create trigger immutable_history before update or delete on azzora_history_probe
  for each row execute function azzora.reject_history_mutation();
insert into azzora_history_probe values(1,1);
do $history$
declare denied boolean;
begin
  denied:=false;
  begin update azzora_history_probe set value=2 where id=1; exception when check_violation then denied:=true; end;
  if not denied then raise exception 'Immutable trigger allowed an update'; end if;
  denied:=false;
  begin delete from azzora_history_probe where id=1; exception when check_violation then denied:=true; end;
  if not denied then raise exception 'Immutable trigger allowed a delete'; end if;
  if (select value from azzora_history_probe where id=1)<>1 then raise exception 'Immutable probe data changed'; end if;
  insert into azzora_security_results values('immutable_history_function_rejects_update_and_delete',true);
end
$history$;

-- Safe aggregate-only evidence. Final ROLLBACK discards all fictional and temporary rows.
select check_name, passed from azzora_security_results order by check_name;
select count(*) as passed_checks from azzora_security_results;
rollback;

-- Compare with the separately recorded preflight snapshot. Expected managed staging
-- baseline: one API->SQL-admin membership, ADMIN TRUE / INHERIT FALSE / SET FALSE.
-- This query contains only aggregate metadata, never user records or credentials.
select count(*) as api_grants_to_sql_admin,
  count(*) filter(where m.admin_option and not m.inherit_option and not m.set_option) as original_admin_only_grants,
  count(*) filter(where m.set_option or m.inherit_option) as unexpected_persisted_set_or_inherit_grants
from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member
where r.rolname='azzora_api' and u.rolname=current_user;
