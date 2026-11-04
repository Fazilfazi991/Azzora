-- Shared fictional staging only. No real-policy approval or production write path.
begin;
alter table azzora.companies add column data_mode text not null default 'fictional-staging' check(data_mode='fictional-staging');
alter table azzora.companies add column version bigint not null default 0 check(version>=0);
alter table azzora.journals add column domain_source jsonb not null default '{}';
alter table azzora.journal_lines add column domain_dimensions jsonb not null default '{}';
alter table azzora.records drop constraint records_entity_type_check;
alter table azzora.records add constraint records_entity_type_check check(entity_type in (
 'quotation','contract','sales_invoice','purchase_order','supplier_bill','receipt','supplier_payment','expense',
 'employee','task','phase','milestone','planning','document','approval','site_update','snag','handover','assignment',
 'cash_account','transfer','expense_ledger','variation','credit_note','refund','budget','material','rfq',
 'supplier_quote','delivery','stock_movement','purchase_request','workspace_metadata'));
insert into azzora.companies(id,name,data_mode)
 values('11111111-1111-4111-8111-111111111111','AZZORA Fictional Staging','fictional-staging');

create function azzora.staging_canonical_data(p_company uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object(
 'parties',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'payload',r.payload) order by r.id) from azzora.parties r where r.company_id=p_company),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'customer_id',r.customer_id,'payload',r.payload) order by r.id) from azzora.projects r where r.company_id=p_company),'[]'::jsonb),
 'departments',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.id) from azzora.departments r where r.company_id=p_company),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(jsonb_build_object('entity_type',r.entity_type,'id',r.id,'project_id',r.project_id,'party_id',r.party_id,'department_id',r.department_id,'payload',r.payload,'status',r.status) order by r.entity_type,r.id) from azzora.records r where r.company_id=p_company),'[]'::jsonb),
 'accounts',coalesce((select jsonb_agg(to_jsonb(r)-'company_id' order by r.id) from azzora.accounts r where r.company_id=p_company),'[]'::jsonb),
 'periods',coalesce((select jsonb_agg(to_jsonb(r)-'company_id' order by r.id) from azzora.accounting_periods r where r.company_id=p_company),'[]'::jsonb),
 'journals',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'posting_key',j.posting_key,'source_type',j.source_type,'source_id',j.source_id,'source_action',j.source_action,
   'domain_source',j.domain_source,'posting_date',j.posting_date,'period_id',j.period_id,'memo',j.memo,'currency',j.currency,
   'recorded_at',to_char(j.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'lines',(select jsonb_agg(jsonb_build_object('line_no',l.line_no,'account_id',l.account_id,'debit_fils',l.debit_fils::text,'credit_fils',l.credit_fils::text,
     'project_id',l.project_id,'party_id',l.party_id,'department_id',l.department_id,'domain_dimensions',l.domain_dimensions) order by l.line_no)
    from azzora.journal_lines l where l.company_id=p_company and l.journal_id=j.id)) order by j.recorded_at,j.id) from azzora.journals j where j.company_id=p_company),'[]'::jsonb),
 'snapshots',coalesce((select jsonb_agg(jsonb_build_object('entity_type',s.entity_type,'entity_id',s.entity_id,'revision',s.revision,'payload',s.payload,'sha256',s.sha256) order by s.entity_type,s.entity_id,s.revision) from azzora.snapshots s where s.company_id=p_company),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function azzora.staging_canonical_data(uuid) from public,anon,authenticated,azzora_api;

create function public.staging_company_read(p_session_hash text,p_workspace text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; c uuid; v bigint;
begin
 a:=public.staging_auth_actor(p_session_hash); c:=(a->>'companyId')::uuid;
 if a->>'workspace'<>p_workspace then raise exception 'Workspace denied' using errcode='PT403'; end if;
 if (p_workspace='accountant' and not (a->'capabilities' ? 'finance.read')) or (p_workspace='manager' and not (a->'capabilities' ? 'project.read')) then
  raise exception 'Read capability revoked' using errcode='PT403'; end if;
 select version into v from azzora.companies where id=c and data_mode='fictional-staging';
 if not found then raise exception 'Fictional company required' using errcode='PT403'; end if;
 return jsonb_build_object('version',v,'data',azzora.staging_canonical_data(c));
end $$;

create function public.staging_company_people(p_session_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.staging_auth_actor(p_session_hash);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',case m.role when 'owner_admin' then 'Staging Owner' when 'project_manager' then 'Staging Project Manager'
 when 'accountant' then 'Staging Accountant' else 'Staging Engineer' end,'role',case m.role when 'site_staff' then 'Site Engineer' else 'Project Manager' end,
 'email',u.email,'phone','','status','Active','capacity',100) order by m.user_id),'[]'::jsonb) into result
 from azzora.memberships m join auth.users u on u.id=m.user_id where m.company_id=(a->>'companyId')::uuid and m.active;
 return result;
end $$;

-- Server-only compare-and-swap. Domain validators run in the BFF; this transaction
-- rechecks current identity/scope and atomically writes the canonical projections,
-- append-only journals/snapshots, audit and idempotency result.
create function public.staging_company_commit(p_session_hash text,p_expected_version bigint,p_idempotency_key text,p_fingerprint text,p_command text,p_scope jsonb,p_data jsonb,p_bootstrap boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; c uuid; actor uuid; v bigint; old_receipt azzora.command_receipts; r jsonb; j jsonb; l jsonb; old_j jsonb; result jsonb; project text; new_project boolean;
begin
 a:=public.staging_auth_actor(p_session_hash); c:=(a->>'companyId')::uuid; actor:=(a->>'userId')::uuid;
 -- Lock live authorization and provider-session rows through the commit point.
 perform 1 from azzora.sessions where token_hash=p_session_hash for share;
 perform 1 from azzora.memberships where company_id=c and user_id=actor for share;
 perform 1 from auth.sessions where id=(a->>'providerSessionId')::uuid for share;
 perform 1 from auth.mfa_factors where user_id=actor and status::text='verified' for share;
 a:=public.staging_auth_actor(p_session_hash);
 select version into v from azzora.companies where id=c and data_mode='fictional-staging' for update;
 if not found then raise exception 'Fictional staging company required' using errcode='PT403'; end if;
 if p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid command identity' using errcode='PT400'; end if;
 select * into old_receipt from azzora.command_receipts where company_id=c and idempotency_key=p_idempotency_key;
 if found then
  if old_receipt.actor_id<>actor or old_receipt.request_sha256<>p_fingerprint then raise exception 'Idempotency conflict' using errcode='PT409'; end if;
  return old_receipt.result||jsonb_build_object('replayed',true);
 end if;
 if v<>p_expected_version then raise exception 'Company version conflict' using errcode='PT409'; end if;
 if p_bootstrap then
  if v<>0 or a->>'role'<>'owner_admin' or p_command<>'fixture.initialize' then raise exception 'Initial owner setup required' using errcode='PT403'; end if;
 else
  if a->>'workspace'<>p_scope->>'workspace' then raise exception 'Workspace denied' using errcode='PT403'; end if;
  if a->>'workspace'='accountant' then
   if not (a->'capabilities' ? 'finance.draft') or a->>'role' not in ('owner_admin','accountant') then raise exception 'Finance scope denied' using errcode='PT403'; end if;
   if coalesce((p_scope->>'financial')::boolean,false) and not (a->'capabilities' ? 'finance.simulate') then raise exception 'Fictional simulation denied' using errcode='PT403'; end if;
  else
   if not (a->'capabilities' ? case when p_command='expense.submit' then 'expense.submit' when p_command='expense.approve' then 'expense.approve' else 'project.write' end) then
    raise exception 'Command capability revoked' using errcode='PT403'; end if;
   if a->>'role'='site_staff' and p_command<>'expense.submit' then raise exception 'Staff command denied' using errcode='PT403'; end if;
   if a->>'role' not in ('owner_admin','project_manager','site_staff') then raise exception 'Manager scope denied' using errcode='PT403'; end if;
   project:=nullif(p_scope->>'projectId','');
   if project is not null then
    perform 1 from azzora.project_assignments where company_id=c and project_id=project and user_id=actor and active for share;
    if not found then raise exception 'Assigned project required' using errcode='PT403'; end if;
   elsif a->>'role'='site_staff' then raise exception 'Assigned project required' using errcode='PT403'; end if;
  end if;
 end if;
 if jsonb_typeof(p_data)<>'object' or not exists(select 1 from jsonb_array_elements(p_data->'records') x
   where x->>'entity_type'='workspace_metadata' and x->>'id'='__staging_metadata' and x->'payload'->'metadata'->>'mode'='fictional-staging') then
  raise exception 'Explicit fictional canonical data required' using errcode='PT400'; end if;
 -- No removed financial records or overwritten immutable history.
 if exists(select 1 from azzora.records o where o.company_id=c and not exists(select 1 from jsonb_array_elements(p_data->'records') x where x->>'entity_type'=o.entity_type and x->>'id'=o.id)
  and not(o.entity_type='quotation' and o.status='draft' and p_command='quotation.delete')) then raise exception 'Canonical records cannot be discarded' using errcode='PT400'; end if;
 if exists(select 1 from azzora.journals o where o.company_id=c and not exists(select 1 from jsonb_array_elements(p_data->'journals') x where x->>'id'=o.id)) then raise exception 'Journal history cannot be discarded' using errcode='PT400'; end if;

 for r in select value from jsonb_array_elements(p_data->'parties') loop
  insert into azzora.parties(company_id,id,kind,payload) values(c,r->>'id',r->>'kind',r->'payload')
  on conflict(company_id,id) do update set kind=excluded.kind,payload=excluded.payload,version=azzora.parties.version+1 where (azzora.parties.kind,azzora.parties.payload) is distinct from (excluded.kind,excluded.payload);
 end loop;
 for r in select value from jsonb_array_elements(p_data->'departments') loop
  insert into azzora.departments(company_id,id,name) values(c,r->>'id',r->>'name') on conflict(company_id,id) do update set name=excluded.name;
 end loop;
 for r in select value from jsonb_array_elements(p_data->'projects') loop
  new_project:=not exists(select 1 from azzora.projects where company_id=c and id=r->>'id');
  insert into azzora.projects(company_id,id,customer_id,payload) values(c,r->>'id',nullif(r->>'customer_id',''),r->'payload')
  on conflict(company_id,id) do update set customer_id=excluded.customer_id,payload=excluded.payload,version=azzora.projects.version+1 where (azzora.projects.customer_id,azzora.projects.payload) is distinct from (excluded.customer_id,excluded.payload);
  if p_command='project.create' and new_project then
   insert into azzora.project_assignments(company_id,project_id,user_id,active) values(c,r->>'id',actor,true) on conflict do nothing;
   if exists(select 1 from azzora.memberships where company_id=c and user_id=nullif(r->'payload'->'manager'->>'managerId','')::uuid and active) then
    insert into azzora.project_assignments(company_id,project_id,user_id,active)
    values(c,r->>'id',(r->'payload'->'manager'->>'managerId')::uuid,true) on conflict do nothing;
   end if;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(p_data->'records') loop
  insert into azzora.records(company_id,entity_type,id,project_id,party_id,department_id,payload,status)
  values(c,r->>'entity_type',r->>'id',nullif(r->>'project_id',''),nullif(r->>'party_id',''),nullif(r->>'department_id',''),r->'payload',coalesce(r->>'status','draft'))
  on conflict(company_id,entity_type,id) do update set project_id=excluded.project_id,party_id=excluded.party_id,department_id=excluded.department_id,payload=excluded.payload,status=excluded.status,version=azzora.records.version+1
  where (azzora.records.project_id,azzora.records.party_id,azzora.records.department_id,azzora.records.payload,azzora.records.status) is distinct from (excluded.project_id,excluded.party_id,excluded.department_id,excluded.payload,excluded.status);
 end loop;
 -- Trusted assignment records project onto identity grants only for actual active members.
 for r in select value from jsonb_array_elements(p_data->'records') where value->>'entity_type'='assignment' loop
  if exists(select 1 from azzora.memberships where company_id=c and user_id=nullif(r->'payload'->'manager'->>'personId','')::uuid and active) then
   insert into azzora.project_assignments(company_id,project_id,user_id,active)
   values(c,r->>'project_id',(r->'payload'->'manager'->>'personId')::uuid,coalesce(r->'payload'->'manager'->>'status','Active')='Active')
   on conflict(company_id,project_id,user_id) do update set active=excluded.active;
  end if;
 end loop;
 if p_command='quotation.delete' then delete from azzora.records o where company_id=c and entity_type='quotation' and status='draft'
  and not exists(select 1 from jsonb_array_elements(p_data->'records') x where x->>'entity_type'='quotation' and x->>'id'=o.id); end if;
 for r in select value from jsonb_array_elements(p_data->'accounts') loop
  insert into azzora.accounts(company_id,id,code,name,type,postable,active) values(c,r->>'id',r->>'code',r->>'name',r->>'type',(r->>'postable')::boolean,(r->>'active')::boolean)
  on conflict(company_id,id) do update set name=excluded.name,postable=excluded.postable,active=excluded.active where azzora.accounts.type=excluded.type and azzora.accounts.code=excluded.code;
 end loop;
 for r in select value from jsonb_array_elements(p_data->'periods') loop
  insert into azzora.accounting_periods(company_id,id,start_date,end_date,locked) values(c,r->>'id',(r->>'start_date')::date,(r->>'end_date')::date,(r->>'locked')::boolean)
  on conflict(company_id,id) do update set locked=excluded.locked where azzora.accounting_periods.start_date=excluded.start_date and azzora.accounting_periods.end_date=excluded.end_date;
 end loop;
 for j in select value from jsonb_array_elements(p_data->'journals') loop
  select value into old_j from jsonb_array_elements(azzora.staging_canonical_data(c)->'journals') where value->>'id'=j->>'id';
  if old_j is not null then
   -- Normalize optional dimension metadata before exact immutable comparison.
   select jsonb_set(j,'{lines}',coalesce(jsonb_agg(value||jsonb_build_object('domain_dimensions',coalesce(value->'domain_dimensions','{}'::jsonb)) order by (value->>'line_no')::integer),'[]'::jsonb)) into j from jsonb_array_elements(j->'lines');
   if old_j<>j then raise exception 'Immutable journal changed' using errcode='PT400'; end if;
  else
   if not p_bootstrap and not coalesce((p_scope->>'financial')::boolean,false) then raise exception 'Nonfinancial command attempted a journal' using errcode='PT403'; end if;
   insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,posting_date,period_id,memo,currency,recorded_at,actor_id,domain_source)
   values(c,j->>'id',j->>'posting_key',j->>'source_type',j->>'source_id',j->>'source_action',(j->>'posting_date')::date,j->>'period_id',j->>'memo',j->>'currency',(j->>'recorded_at')::timestamptz,actor,coalesce(j->'domain_source','{}'::jsonb));
   for l in select value from jsonb_array_elements(j->'lines') loop
    insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,project_id,party_id,department_id,domain_dimensions)
    values(c,j->>'id',(l->>'line_no')::integer,l->>'account_id',(l->>'debit_fils')::numeric,(l->>'credit_fils')::numeric,nullif(l->>'project_id',''),nullif(l->>'party_id',''),nullif(l->>'department_id',''),coalesce(l->'domain_dimensions','{}'::jsonb));
   end loop;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(p_data->'snapshots') loop
  if exists(select 1 from azzora.snapshots s where s.company_id=c and s.entity_type=r->>'entity_type' and s.entity_id=r->>'entity_id' and s.revision=(r->>'revision')::bigint and (s.sha256<>r->>'sha256' or s.payload<>r->'payload')) then raise exception 'Immutable snapshot changed' using errcode='PT400'; end if;
  insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by) values(c,r->>'entity_type',r->>'entity_id',(r->>'revision')::bigint,r->'payload',r->>'sha256',actor) on conflict do nothing;
 end loop;
 update azzora.companies set version=version+1 where id=c returning version into v;
 result:=jsonb_build_object('version',v,'replayed',false);
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
 values(c,actor,p_command,'company',c::text,p_idempotency_key,jsonb_build_object('mode','fictional-staging','version',v,'workspace',a->>'workspace'));
 insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result) values(c,p_idempotency_key,p_fingerprint,actor,result);
 return result;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'staging_company_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,azzora_api',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
