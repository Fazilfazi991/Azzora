-- Additive final fictional Manager integration. Existing records/history are retained.
begin;
alter table azzora.journals add column reversal_of text;
alter table azzora.journals add constraint journal_reversal_source foreign key(company_id,reversal_of) references azzora.journals(company_id,id);
create unique index journal_one_reversal on azzora.journals(company_id,reversal_of) where reversal_of is not null;

-- This is a read-only deferred constraint check, owner-scoped because it fires
-- after the public command has restored its caller. No direct execution grant.
create function azzora.assert_staging_reversal() returns trigger language plpgsql security definer set search_path='' as $$
declare o azzora.journals; expected jsonb; actual jsonb;
begin
 if new.reversal_of is null then return null; end if;
 select * into o from azzora.journals where company_id=new.company_id and id=new.reversal_of;
 if not found or o.reversal_of is not null or new.posting_date<o.posting_date then raise exception 'Invalid original reversal source' using errcode='23514'; end if;
 select jsonb_agg(jsonb_build_array(account_id,credit_fils,debit_fils,project_id,party_id,department_id) order by line_no) into expected from azzora.journal_lines where company_id=new.company_id and journal_id=o.id;
 select jsonb_agg(jsonb_build_array(account_id,debit_fils,credit_fils,project_id,party_id,department_id) order by line_no) into actual from azzora.journal_lines where company_id=new.company_id and journal_id=new.id;
 if expected is distinct from actual then raise exception 'Reversal must mirror immutable original lines' using errcode='23514'; end if;
 return null;
end $$;
revoke all on function azzora.assert_staging_reversal() from public,anon,authenticated,service_role,azzora_api;
create constraint trigger staging_reversal_checked after insert on azzora.journals deferrable initially deferred for each row execute function azzora.assert_staging_reversal();

-- Immutable relational allocations project the canonical settlement events;
-- they do not calculate or post a second journal.
create function azzora.project_staging_allocations(p_company uuid) returns void language plpgsql set search_path='' as $$
declare r record; a jsonb; jid text; aid text; dtype text; amount numeric;
begin
 for r in select entity_type,id,payload->'finance' f from azzora.records where company_id=p_company and entity_type in ('receipt','supplier_payment') and payload->'finance'->>'type'='posted' loop
  select id into jid from azzora.journals where company_id=p_company and source_type=r.entity_type and source_id=r.id and reversal_of is null;
  if jid is null then raise exception 'Settlement requires its shared journal' using errcode='23514'; end if;
  dtype:=case r.entity_type when 'receipt' then 'sales_invoice' else 'supplier_bill' end;
  for a in select value from jsonb_array_elements(r.f->'allocations') loop
   aid:=r.entity_type||':'||r.id||':'||(a->>'documentId');
   amount:=coalesce(a->'amountFils'->>'$fils',a->>'amountFils')::numeric;
   if exists(select 1 from azzora.allocations x where company_id=p_company and id=aid and
     (settlement_type<>r.entity_type or settlement_id<>r.id or document_type<>dtype or document_id<>a->>'documentId' or amount_fils<>amount or journal_id<>jid))
   then raise exception 'Immutable allocation changed' using errcode='23514'; end if;
   insert into azzora.allocations(company_id,id,settlement_type,settlement_id,document_type,document_id,amount_fils,journal_id)
    values(p_company,aid,r.entity_type,r.id,dtype,a->>'documentId',amount,jid) on conflict do nothing;
  end loop;
 end loop;
end $$;
revoke all on function azzora.project_staging_allocations(uuid) from public,anon,authenticated,service_role,azzora_api;

create or replace function azzora.staging_canonical_data(p_company uuid) returns jsonb language plpgsql stable set search_path='' as $$
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
    from azzora.journal_lines l where l.company_id=p_company and l.journal_id=j.id)) || case when j.reversal_of is null then '{}'::jsonb else jsonb_build_object('reversal_of',j.reversal_of) end order by j.recorded_at,j.id) from azzora.journals j where j.company_id=p_company),'[]'::jsonb),
 'snapshots',coalesce((select jsonb_agg(jsonb_build_object('entity_type',s.entity_type,'entity_id',s.entity_id,'revision',s.revision,'payload',s.payload,'sha256',s.sha256) order by s.entity_type,s.entity_id,s.revision) from azzora.snapshots s where s.company_id=p_company),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.staging_auth_actor(p_session_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s azzora.sessions; g jsonb;
begin
 perform azzora.assert_synthetic_staging();
 select * into s from azzora.sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now()
 and last_seen_at>now()-interval '15 minutes';
 if not found then raise exception 'Session expired or revoked' using errcode='PT401'; end if;
 g:=public.staging_auth_grant(s.user_id);
 if g->>'companyId'<>s.company_id::text or not (g->'workspaces' ? s.workspace) then raise exception 'Workspace revoked' using errcode='PT403'; end if;
 if not exists(select 1 from auth.sessions ps where ps.id=s.provider_session_id and ps.user_id=s.user_id
  and (nullif(to_jsonb(ps)->>'not_after','')::timestamptz is null or nullif(to_jsonb(ps)->>'not_after','')::timestamptz>now())
  and (g->>'role' not in ('owner_admin','accountant') or (to_jsonb(ps)->>'aal')='aal2'))
 then raise exception 'Provider session revoked or downgraded' using errcode='PT403'; end if;
 if g->>'role' in ('owner_admin','accountant') and (s.assurance<>'aal2' or not exists(
  select 1 from auth.mfa_factors f where f.user_id=s.user_id and f.status::text='verified' and f.factor_type::text='totp'))
 then raise exception 'Current verified MFA is required' using errcode='PT403'; end if;
 return g || jsonb_build_object('workspace',s.workspace,'sessionHash',s.token_hash,'assurance',s.assurance,
 'providerSessionId',s.provider_session_id,'projectIds',case when g->>'role'='owner_admin' then coalesce((select jsonb_agg(p.id order by p.id) from azzora.projects p where p.company_id=s.company_id),'[]'::jsonb) else coalesce((select jsonb_agg(a.project_id order by a.project_id) from azzora.project_assignments a where a.company_id=s.company_id and a.user_id=s.user_id and a.active),'[]'::jsonb) end);
end $$;


create or replace function public.staging_company_commit(p_session_hash text,p_expected_version bigint,p_idempotency_key text,p_fingerprint text,p_command text,p_scope jsonb,p_data jsonb,p_bootstrap boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; c uuid; actor uuid; v bigint; old_receipt azzora.command_receipts; r jsonb; j jsonb; l jsonb; old_j jsonb; result jsonb; project text; new_project boolean; needed text;
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
   needed:=case
    when p_command in ('employee.save','employee.status','settings.save','approval.reassign') then 'access.manage'
    when p_command in ('task.save','task.progress') then 'task.update'
    when p_command='site.save' then 'site.submit'
    when p_command in ('document.save','document.revise','document.review') then 'document.submit'
    when p_command='snag.save' then 'qa.update'
    when p_command='expense.submit' then 'expense.submit'
    when p_command='expense.approve' then 'expense.approve' else 'project.write' end;
   if not (a->'capabilities' ? needed) then raise exception 'Command capability revoked' using errcode='PT403'; end if;
   if needed='access.manage' and (a->>'role'<>'owner_admin' or a->>'assurance'<>'aal2') then raise exception 'Owner administration required' using errcode='PT403'; end if;
   if a->>'role'='site_staff' and p_command not in ('expense.submit','task.save','task.progress','site.save','document.save','document.revise','document.review','snag.save') then raise exception 'Staff command denied' using errcode='PT403'; end if;
   if a->>'role' not in ('owner_admin','project_manager','site_staff') then raise exception 'Manager scope denied' using errcode='PT403'; end if;
   if p_command in ('credit.issue','refund.post','refund.reverse','invoice.cancel','payment.reverse','procurement.cancel-bill','procurement.reverse-payment')
    and (a->>'role'<>'owner_admin' or a->>'assurance'<>'aal2' or not(a->'capabilities' ? 'finance.simulate')) then raise exception 'Privileged fictional correction required' using errcode='PT403'; end if;
   project:=nullif(p_scope->>'projectId','');
   if project is not null then
    if a->>'role'='owner_admin' then
     if not exists(select 1 from azzora.projects where company_id=c and id=project) then raise exception 'Company project required' using errcode='PT403'; end if;
    else
    perform 1 from azzora.project_assignments where company_id=c and project_id=project and user_id=actor and active for share;
    if not found then raise exception 'Assigned project required' using errcode='PT403'; end if;
    end if;
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
  if p_command in ('project.create','project.assign') and nullif(r->'payload'->'manager'->>'managerId','') is not null
   and not exists(select 1 from azzora.memberships m where m.company_id=c and m.user_id::text=r->'payload'->'manager'->>'managerId'
    and m.active and m.role in ('owner_admin','project_manager') and 'manager'=any(m.workspaces))
  then raise exception 'Designated manager requires an active Manager identity' using errcode='PT403'; end if;
  insert into azzora.projects(company_id,id,customer_id,payload) values(c,r->>'id',nullif(r->>'customer_id',''),r->'payload')
  on conflict(company_id,id) do update set customer_id=excluded.customer_id,payload=excluded.payload,version=azzora.projects.version+1 where (azzora.projects.customer_id,azzora.projects.payload) is distinct from (excluded.customer_id,excluded.payload);
  if p_command='project.create' and new_project then
   insert into azzora.project_assignments(company_id,project_id,user_id,active) values(c,r->>'id',actor,true) on conflict do nothing;
   if exists(select 1 from azzora.memberships where company_id=c and user_id::text=r->'payload'->'manager'->>'managerId' and active) then
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
 -- Project authorization is the projection of current canonical workforce assignments.
 -- Only assignment/identity commands may change these grants, never arbitrary profile edits.
 if p_command in ('project.create','project.assign','assignment.remove','employee.status') then
  if p_command='employee.status' then
   if exists(select 1 from azzora.memberships m join azzora.records e on e.company_id=m.company_id and e.entity_type='employee' and e.id=m.user_id::text
      where m.company_id=c and m.role='owner_admin' and e.payload->'manager'->>'status'='Inactive'
      and not exists(select 1 from azzora.memberships another where another.company_id=c and another.role='owner_admin' and another.active and another.user_id<>m.user_id))
   then raise exception 'The last Owner cannot be deactivated' using errcode='PT403'; end if;
   update azzora.memberships m set active=(e.payload->'manager'->>'status'<>'Inactive') from azzora.records e
    where m.company_id=c and e.company_id=c and e.entity_type='employee' and e.id=m.user_id::text;
   update azzora.sessions s set revoked_at=coalesce(s.revoked_at,now()) from azzora.memberships m
    where s.company_id=c and m.company_id=c and s.user_id=m.user_id and not m.active;
  end if;
  update azzora.project_assignments g set active=false where g.company_id=c and not exists(
    select 1 from azzora.projects p join azzora.memberships m on m.company_id=p.company_id and m.user_id=g.user_id and m.active
    where p.company_id=c and p.id=g.project_id and (
     p.payload->'manager'->>'managerId'=g.user_id::text or exists(select 1 from azzora.records r
      where r.company_id=c and r.entity_type='assignment' and r.project_id=g.project_id
       and r.payload->'manager'->>'personId'=g.user_id::text and r.payload->'manager'->>'status'='Active')));
  insert into azzora.project_assignments(company_id,project_id,user_id,active)
   select c,p.id,m.user_id,true from azzora.projects p join azzora.memberships m on m.company_id=p.company_id and m.active
   where p.company_id=c and (p.payload->'manager'->>'managerId'=m.user_id::text or exists(select 1 from azzora.records r
     where r.company_id=c and r.entity_type='assignment' and r.project_id=p.id and r.payload->'manager'->>'personId'=m.user_id::text and r.payload->'manager'->>'status'='Active'))
   on conflict(company_id,project_id,user_id) do update set active=true;
 end if;
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
   insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,posting_date,period_id,memo,currency,recorded_at,actor_id,domain_source,reversal_of)
   values(c,j->>'id',j->>'posting_key',j->>'source_type',j->>'source_id',j->>'source_action',(j->>'posting_date')::date,j->>'period_id',j->>'memo',j->>'currency',(j->>'recorded_at')::timestamptz,actor,coalesce(j->'domain_source','{}'::jsonb),nullif(j->>'reversal_of',''));
   for l in select value from jsonb_array_elements(j->'lines') loop
    insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,project_id,party_id,department_id,domain_dimensions)
    values(c,j->>'id',(l->>'line_no')::integer,l->>'account_id',(l->>'debit_fils')::numeric,(l->>'credit_fils')::numeric,nullif(l->>'project_id',''),nullif(l->>'party_id',''),nullif(l->>'department_id',''),coalesce(l->'domain_dimensions','{}'::jsonb));
   end loop;
  end if;
 end loop;
 perform azzora.project_staging_allocations(c);
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

create or replace function public.staging_auth_fixture_membership(p_user_id uuid,p_company_id uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare expected_email text; spaces text[]; caps text[];
begin
 perform azzora.assert_synthetic_staging();
 expected_email:=case p_role when 'owner_admin' then 'owner' when 'project_manager' then 'manager'
 when 'accountant' then 'accountant' when 'site_staff' then 'engineer' else null end || '@staging.azzora.test';
 if expected_email is null or not exists(select 1 from auth.users where id=p_user_id and email=expected_email
  and email_confirmed_at is not null and raw_app_meta_data->>'azzora_scope'='fictional-staging')
 then raise exception 'Only known fictional staging accounts may be bootstrapped' using errcode='PT403'; end if;
 if p_company_id<>'11111111-1111-4111-8111-111111111111'::uuid or not exists(select 1 from azzora.companies where id=p_company_id and name='AZZORA Fictional Staging')
 then raise exception 'Fictional staging company is required' using errcode='PT403'; end if;
 spaces:=case p_role when 'owner_admin' then array['manager','accountant'] when 'accountant' then array['accountant'] else array['manager'] end;
 caps:=case p_role when 'owner_admin' then array['project.read','project.write','expense.submit','expense.approve','finance.read','finance.draft','finance.simulate','access.manage']
 when 'project_manager' then array['project.read','project.write','expense.submit','expense.approve']
 when 'accountant' then array['finance.read','finance.draft','finance.simulate'] else array['project.read','expense.submit'] end;
 if p_role<>'accountant' then caps:=caps||array['task.update','site.submit','document.submit','qa.update']; end if;
 insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities)
 values(p_company_id,p_user_id,p_role,true,p_role in ('owner_admin','accountant'),spaces,caps)
 on conflict(company_id,user_id) do nothing;
 if not exists(select 1 from azzora.memberships where company_id=p_company_id and user_id=p_user_id
  and role=p_role and active and finance_access=(p_role in ('owner_admin','accountant'))
  and workspaces=spaces and capabilities=caps)
 then raise exception 'Existing staging membership differs; it was not overwritten' using errcode='PT403'; end if;
end $$;

update azzora.memberships m set capabilities=array(select cap from unnest(m.capabilities||array['task.update','site.submit','document.submit','qa.update']) with ordinality x(cap,n) group by cap order by min(n))
 where m.company_id='11111111-1111-4111-8111-111111111111' and m.role in ('owner_admin','project_manager','site_staff')
 and exists(select 1 from auth.users u where u.id=m.user_id and u.email in ('owner@staging.azzora.test','manager@staging.azzora.test','engineer@staging.azzora.test') and u.raw_app_meta_data->>'azzora_scope'='fictional-staging');
select azzora.project_staging_allocations('11111111-1111-4111-8111-111111111111');
commit;
