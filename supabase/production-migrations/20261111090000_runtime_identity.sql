-- REVIEWED SOURCE PREPARATION ONLY. Apply foundation + this file to a separately approved EMPTY production project.
-- Do NOT apply the synthetic-staging migration chain. No company/user/bucket/policy/balance is seeded here.
begin;
alter table azzora.companies add column data_mode text not null default 'production' check(data_mode='production');
alter table azzora.companies add column version bigint not null default 0 check(version>=0);
alter table azzora.journals add column domain_source jsonb not null default '{}';
alter table azzora.journal_lines add column domain_dimensions jsonb not null default '{}';
alter table azzora.journals add column reversal_of text;
alter table azzora.journals add constraint journal_reversal_source foreign key(company_id,reversal_of) references azzora.journals(company_id,id);
create unique index journal_one_reversal on azzora.journals(company_id,reversal_of) where reversal_of is not null;
alter table azzora.records drop constraint records_entity_type_check;
alter table azzora.records add constraint records_entity_type_check check(entity_type in ('quotation','contract','sales_invoice','purchase_order','supplier_bill','receipt','supplier_payment','expense','employee','task','phase','milestone','planning','document','approval','site_update','snag','handover','assignment','cash_account','transfer','expense_ledger','variation','credit_note','refund','budget','material','rfq','supplier_quote','delivery','stock_movement','purchase_request','workspace_metadata'));
alter function azzora.assert_journal_balance() security definer;
revoke all on function azzora.assert_journal_balance() from public,anon,authenticated,service_role,azzora_api;
create table azzora.production_environment (
 singleton boolean primary key default true check(singleton),
 company_id uuid not null unique references azzora.companies(id) check(company_id<>'11111111-1111-4111-8111-111111111111'::uuid),
 project_ref text not null check(project_ref='zwjiztnsxenluqybxhhz'),
 region text not null check(region='ap-southeast-1'),
 vercel_project_id text not null check(vercel_project_id ~ '^prj_[A-Za-z0-9]+$' and vercel_project_id not in ('prj_inNGMsufKkeDUTS1Sn5whmwIVWuw')),
 configuration_approval_id text not null check(length(configuration_approval_id)>5),
 allowed_origins text[] not null check(cardinality(allowed_origins)>0),
 storage_bucket text not null check(storage_bucket='azzora-private'),
 approved_by uuid not null references auth.users(id),
 approval_evidence_sha256 text not null check(approval_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz not null,
 real_financial_posting_enabled boolean not null default false check(not real_financial_posting_enabled),
 real_document_processing_enabled boolean not null default false check(not real_document_processing_enabled)
);
alter table azzora.production_environment enable row level security;
revoke all on azzora.production_environment from public,anon,authenticated,service_role,azzora_api;
create trigger production_configuration_immutable before update or delete on azzora.production_environment for each row execute function azzora.reject_history_mutation();
create function azzora.assert_production_environment() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from azzora.production_environment e join azzora.companies c on c.id=e.company_id where c.data_mode='production' and not e.real_financial_posting_enabled and not e.real_document_processing_enabled)
 then raise exception 'Approved production configuration required' using errcode='PT503';end if;
 if exists(select 1 from azzora.production_environment e join storage.buckets b on b.id=e.storage_bucket where b.public) or not exists(select 1 from azzora.production_environment e join storage.buckets b on b.id=e.storage_bucket where not b.public and b.file_size_limit=2097152 and b.allowed_mime_types @> array['application/pdf','image/png','image/jpeg']::text[])
 then raise exception 'Approved private storage required' using errcode='PT503';end if;
 if exists(select 1 from azzora.production_environment e, unnest(e.allowed_origins) o where o !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' or o in ('https://azzora-seven.vercel.app','https://azzora-accounts-client-review-faziils-projects.vercel.app')) then raise exception 'Dedicated origins required' using errcode='PT503';end if;
end $$;
revoke all on function azzora.assert_production_environment() from public,anon,authenticated,service_role,azzora_api;
alter table azzora.memberships add column workspaces text[] not null default '{}';
alter table azzora.memberships add column capabilities text[] not null default '{}';
alter table azzora.sessions add column workspace text check(workspace in ('manager','accountant'));
create table azzora.auth_flows (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('pending','active')),
 user_id uuid not null references auth.users(id),
 company_id uuid not null references azzora.companies(id),
 workspace text not null check(workspace in ('manager','accountant')),
 ciphertext text not null check(length(ciphertext)<32768),
 version integer not null default 1,
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create table azzora.auth_login_attempts (
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 bucket bigint not null, attempts integer not null, primary key(key_hash,bucket)
);
alter table azzora.auth_flows enable row level security;
alter table azzora.auth_login_attempts enable row level security;
revoke all on azzora.auth_flows,azzora.auth_login_attempts from public,anon,authenticated,azzora_api;

create function public.azzora_production_auth_grant(p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform azzora.assert_production_environment();
 select jsonb_build_object('userId',m.user_id,'companyId',m.company_id,'role',m.role,'email',u.email,'personId',m.user_id,'workspaces',m.workspaces,'capabilities',m.capabilities)
 into result from azzora.memberships m join auth.users u on u.id=m.user_id join azzora.production_environment e on e.company_id=m.company_id
 where m.user_id=p_user_id and m.active and u.email_confirmed_at is not null and u.raw_app_meta_data->>'azzora_scope'='production'
 and u.id<>'52f925bd-8744-48cc-8781-d20109387d14'::uuid and u.email not like '%@staging.azzora.test'
 and not ('finance.simulate'=any(m.capabilities)) and not ('finance.post'=any(m.capabilities))
 and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
 and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or nullif(to_jsonb(u)->>'banned_until','')::timestamptz<now());
 if result is null then raise exception 'Production membership denied' using errcode='PT403';end if;return result;
end $$;
create function public.azzora_production_auth_rate(p_key_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; b bigint:=floor(extract(epoch from clock_timestamp())/300);
begin
 perform azzora.assert_production_environment();
 insert into azzora.auth_login_attempts(key_hash,bucket,attempts) values(p_key_hash,b,1)
 on conflict(key_hash,bucket) do update set attempts=azzora.auth_login_attempts.attempts+1 returning attempts into n;
 return n<=5;
end $$;
create function public.azzora_production_auth_pending_put(p_hash text,p_user_id uuid,p_company_id uuid,p_workspace text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare g jsonb;
begin
 g:=public.azzora_production_auth_grant(p_user_id);
 if g->>'companyId'<>p_company_id::text or not (g->'workspaces' ? p_workspace) then raise exception 'Workspace denied' using errcode='PT403'; end if;
 insert into azzora.auth_flows(token_hash,kind,user_id,company_id,workspace,ciphertext,expires_at)
 values(p_hash,'pending',p_user_id,p_company_id,p_workspace,p_ciphertext,now()+interval '5 minutes');
end $$;
create function public.azzora_production_auth_pending_get(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r azzora.auth_flows; g jsonb;
begin
 perform azzora.assert_production_environment();
 update azzora.auth_flows set attempts=attempts+1 where token_hash=p_hash and kind='pending'
 and revoked_at is null and expires_at>now() and attempts<5 returning * into r;
 if not found then raise exception 'Pending sign-in expired' using errcode='PT401'; end if;
 g:=public.azzora_production_auth_grant(r.user_id);
 if not (g->'workspaces' ? r.workspace) then raise exception 'Workspace denied' using errcode='PT403'; end if;
 return jsonb_build_object('ciphertext',r.ciphertext,'userId',r.user_id,'companyId',r.company_id,'workspace',r.workspace);
end $$;
create function public.azzora_production_auth_pending_delete(p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin perform azzora.assert_production_environment(); update azzora.auth_flows set revoked_at=now() where token_hash=p_hash and kind='pending'; end $$;
create function public.azzora_production_auth_session_put(p_hash text,p_csrf_hash text,p_user_id uuid,p_provider_session_id uuid,p_company_id uuid,p_workspace text,p_assurance text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare g jsonb;
begin
 g:=public.azzora_production_auth_grant(p_user_id);
 if g->>'companyId'<>p_company_id::text or not (g->'workspaces' ? p_workspace) then raise exception 'Workspace denied' using errcode='PT403'; end if;
 if not exists(select 1 from auth.sessions ps where ps.id=p_provider_session_id and ps.user_id=p_user_id
  and (nullif(to_jsonb(ps)->>'not_after','')::timestamptz is null or nullif(to_jsonb(ps)->>'not_after','')::timestamptz>now()))
 then raise exception 'Provider session revoked' using errcode='PT403'; end if;
 if g->>'role' in ('owner_admin','accountant') and (p_assurance<>'aal2' or not exists(
  select 1 from auth.mfa_factors f where f.user_id=p_user_id and f.status::text='verified' and f.factor_type::text='totp'))
 then raise exception 'Verified MFA is required' using errcode='PT403'; end if;
 insert into azzora.sessions(token_hash,csrf_hash,user_id,provider_session_id,company_id,workspace,assurance,expires_at)
 values(p_hash,p_csrf_hash,p_user_id,p_provider_session_id,p_company_id,p_workspace,p_assurance,now()+interval '8 hours');
 insert into azzora.auth_flows(token_hash,kind,user_id,company_id,workspace,ciphertext,expires_at)
 values(p_hash,'active',p_user_id,p_company_id,p_workspace,p_ciphertext,now()+interval '8 hours');
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id)
 values(p_company_id,p_user_id,'session.created','session',p_provider_session_id::text,p_hash);
end $$;
create function public.azzora_production_auth_session_get(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor jsonb; result jsonb;
begin
 actor:=public.azzora_production_auth_actor(p_hash);
 select jsonb_build_object('actor',actor,'ciphertext',f.ciphertext,'version',f.version) into result
 from azzora.auth_flows f where f.token_hash=p_hash and f.kind='active' and f.revoked_at is null and f.expires_at>now();
 if result is null then raise exception 'Session token storage unavailable' using errcode='PT403'; end if;
 return result;
end $$;
create function public.azzora_production_auth_session_touch(p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.azzora_production_auth_actor(p_hash);
 update azzora.sessions set last_seen_at=now() where token_hash=p_hash and revoked_at is null;
end $$;
create function public.azzora_production_auth_tokens_update(p_hash text,p_expected_version integer,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.azzora_production_auth_actor(p_hash);
 update azzora.auth_flows set ciphertext=p_ciphertext,version=version+1
 where token_hash=p_hash and version=p_expected_version and kind='active' and revoked_at is null;
 if not found then raise exception 'Session refresh conflict' using errcode='40001'; end if;
end $$;
create function public.azzora_production_auth_session_revoke(p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare s azzora.sessions;
begin
 perform azzora.assert_production_environment();
 update azzora.sessions set revoked_at=coalesce(revoked_at,now()) where token_hash=p_hash returning * into s;
 update azzora.auth_flows set revoked_at=coalesce(revoked_at,now()) where token_hash=p_hash;
 if s.user_id is not null then
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id)
 values(s.company_id,s.user_id,'session.revoked','session',s.provider_session_id::text,p_hash);
 end if;
end $$;
create or replace function public.azzora_production_auth_actor(p_session_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s azzora.sessions; g jsonb;
begin
 perform azzora.assert_production_environment();
 select * into s from azzora.sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now()
 and last_seen_at>now()-interval '15 minutes';
 if not found then raise exception 'Session expired or revoked' using errcode='PT401'; end if;
 g:=public.azzora_production_auth_grant(s.user_id);
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
create function azzora.assert_production_reversal() returns trigger language plpgsql security definer set search_path='' as $$
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
revoke all on function azzora.assert_production_reversal() from public,anon,authenticated,service_role,azzora_api;
create constraint trigger production_reversal_checked after insert on azzora.journals deferrable initially deferred for each row execute function azzora.assert_production_reversal();
create function azzora.project_production_allocations(p_company uuid) returns void language plpgsql set search_path='' as $$
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
revoke all on function azzora.project_production_allocations(uuid) from public,anon,authenticated,service_role,azzora_api;
create or replace function azzora.production_canonical_data(p_company uuid) returns jsonb language plpgsql stable set search_path='' as $$
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
revoke all on function azzora.production_canonical_data(uuid) from public,anon,authenticated,service_role,azzora_api;
create function public.azzora_production_company_read(p_session_hash text,p_workspace text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; c uuid; v bigint;
begin
 a:=public.azzora_production_auth_actor(p_session_hash); c:=(a->>'companyId')::uuid;
 if a->>'workspace'<>p_workspace then raise exception 'Workspace denied' using errcode='PT403'; end if;
 if (p_workspace='accountant' and not (a->'capabilities' ? 'finance.read')) or (p_workspace='manager' and not (a->'capabilities' ? 'project.read')) then
  raise exception 'Read capability revoked' using errcode='PT403'; end if;
 select version into v from azzora.companies where id=c and data_mode='production';
 if not found then raise exception 'Fictional company required' using errcode='PT403'; end if;
 return jsonb_build_object('version',v,'data',azzora.production_canonical_data(c));
end $$;
create function public.azzora_production_company_people(p_session_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.azzora_production_auth_actor(p_session_hash);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',case m.role when 'owner_admin' then 'Owner' when 'project_manager' then 'Project Manager'
 when 'accountant' then 'Accountant' else 'Engineer' end,'role',case m.role when 'site_staff' then 'Site Engineer' else 'Project Manager' end,
 'email',u.email,'phone','','status','Active','capacity',100) order by m.user_id),'[]'::jsonb) into result
 from azzora.memberships m join auth.users u on u.id=m.user_id where m.company_id=(a->>'companyId')::uuid and m.active;
 return result;
end $$;
create or replace function public.azzora_production_company_commit(p_session_hash text,p_expected_version bigint,p_idempotency_key text,p_fingerprint text,p_command text,p_scope jsonb,p_data jsonb,p_bootstrap boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; c uuid; actor uuid; v bigint; old_receipt azzora.command_receipts; r jsonb; j jsonb; l jsonb; old_j jsonb; cached_journals jsonb; result jsonb; project text; new_project boolean; needed text;
begin
 a:=public.azzora_production_auth_actor(p_session_hash); c:=(a->>'companyId')::uuid; actor:=(a->>'userId')::uuid;
 -- Lock live authorization and provider-session rows through the commit point.
 perform 1 from azzora.sessions where token_hash=p_session_hash for share;
 perform 1 from azzora.memberships where company_id=c and user_id=actor for share;
 perform 1 from auth.sessions where id=(a->>'providerSessionId')::uuid for share;
 perform 1 from auth.mfa_factors where user_id=actor and status::text='verified' for share;
 a:=public.azzora_production_auth_actor(p_session_hash);
 select version into v from azzora.companies where id=c and data_mode='production' for update;
 if not found then raise exception 'Production company required' using errcode='PT403'; end if;
 if p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid command identity' using errcode='PT400'; end if;
 select * into old_receipt from azzora.command_receipts where company_id=c and idempotency_key=p_idempotency_key;
 if found then
  if old_receipt.actor_id<>actor or old_receipt.request_sha256<>p_fingerprint then raise exception 'Idempotency conflict' using errcode='PT409'; end if;
  return old_receipt.result||jsonb_build_object('replayed',true);
 end if;
 if v<>p_expected_version then raise exception 'Company version conflict' using errcode='PT409'; end if;
 -- Financial activation is intentionally absent from this candidate; metadata cannot bypass the gate.
 if coalesce((p_scope->>'financial')::boolean,false) or exists(select 1 from jsonb_array_elements(coalesce(p_data->'journals','[]'::jsonb)) x where not exists(select 1 from azzora.journals j where j.company_id=c and j.id=x->>'id')) then raise exception 'Approved accounting policy and cutover required' using errcode='PT423';end if;
 if p_data::text ~ '"(mode|dataClass|dataMode)"[[:space:]]*:[[:space:]]*"(fictional-staging|synthetic|fictional)"' then raise exception 'Fictional records cannot enter production' using errcode='PT400';end if;
 if p_bootstrap and (exists(select 1 from azzora.records where company_id=c) or jsonb_array_length(p_data->'parties')<>0 or jsonb_array_length(p_data->'projects')<>0 or exists(select 1 from jsonb_array_elements(p_data->'records') x where x->>'entity_type'<>'workspace_metadata')) then raise exception 'Production initialization must be empty' using errcode='PT403';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'records') x where x->>'entity_type' in ('sales_invoice','supplier_bill','receipt','supplier_payment','expense','transfer','credit_note','refund') and (x->>'status' in ('Issued','issued','Posted','posted','Paid','paid','Cancelled','cancelled') or x->'payload'->'finance'->>'type'='posted') and not exists(select 1 from azzora.records r where r.company_id=c and r.entity_type=x->>'entity_type' and r.id=x->>'id' and r.payload=x->'payload' and r.status=x->>'status')) then raise exception 'Financial document transition requires approved posting' using errcode='PT423';end if;

 if p_bootstrap then
  if v<>0 or a->>'role'<>'owner_admin' or p_command<>'production.initialize' then raise exception 'Initial owner setup required' using errcode='PT403'; end if;
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
   where x->>'entity_type'='workspace_metadata' and x->>'id'='__production_metadata' and x->'payload'->'metadata'->>'mode'='production') then
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
  -- The company row remains locked for the whole transaction. Reuse its
  -- authoritative journal projection until this transaction inserts a journal.
  if cached_journals is null then
   cached_journals:=azzora.production_canonical_data(c)->'journals';
  end if;
  select value into old_j from jsonb_array_elements(cached_journals) where value->>'id'=j->>'id';
  if old_j is not null then
   -- Normalize optional dimension metadata before exact immutable comparison.
   select jsonb_set(j,'{lines}',coalesce(jsonb_agg(value||jsonb_build_object('domain_dimensions',coalesce(value->'domain_dimensions','{}'::jsonb)) order by (value->>'line_no')::integer),'[]'::jsonb)) into j from jsonb_array_elements(j->'lines');
   if old_j<>j then raise exception 'Immutable journal changed' using errcode='PT400'; end if;
  else
   if not p_bootstrap and not coalesce((p_scope->>'financial')::boolean,false) then raise exception 'Nonfinancial command attempted a journal' using errcode='PT403'; end if;
   insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,posting_date,period_id,memo,currency,recorded_at,actor_id,domain_source,reversal_of)
   values(c,j->>'id',j->>'posting_key',j->>'source_type',j->>'source_id',j->>'source_action',(j->>'posting_date')::date,j->>'period_id',j->>'memo',j->>'currency',(j->>'recorded_at')::timestamptz,actor,coalesce(j->'domain_source','{}'::jsonb),nullif(j->>'reversal_of',''));
   cached_journals:=null;
   for l in select value from jsonb_array_elements(j->'lines') loop
    insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,project_id,party_id,department_id,domain_dimensions)
    values(c,j->>'id',(l->>'line_no')::integer,l->>'account_id',(l->>'debit_fils')::numeric,(l->>'credit_fils')::numeric,nullif(l->>'project_id',''),nullif(l->>'party_id',''),nullif(l->>'department_id',''),coalesce(l->'domain_dimensions','{}'::jsonb));
   end loop;
  end if;
 end loop;
 perform azzora.project_production_allocations(c);
 for r in select value from jsonb_array_elements(p_data->'snapshots') loop
  if exists(select 1 from azzora.snapshots s where s.company_id=c and s.entity_type=r->>'entity_type' and s.entity_id=r->>'entity_id' and s.revision=(r->>'revision')::bigint and (s.sha256<>r->>'sha256' or s.payload<>r->'payload')) then raise exception 'Immutable snapshot changed' using errcode='PT400'; end if;
  insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by) values(c,r->>'entity_type',r->>'entity_id',(r->>'revision')::bigint,r->'payload',r->>'sha256',actor) on conflict do nothing;
 end loop;
 update azzora.companies set version=version+1 where id=c returning version into v;
 result:=jsonb_build_object('version',v,'replayed',false);
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
 values(c,actor,p_command,'company',c::text,p_idempotency_key,jsonb_build_object('mode','production','version',v,'workspace',a->>'workspace'));
 insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result) values(c,p_idempotency_key,p_fingerprint,actor,result);
 return result;
end $$;
create function public.azzora_runtime_identity(p_company_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e azzora.production_environment;
begin
 perform azzora.assert_production_environment();select * into e from azzora.production_environment where company_id=p_company_id;
 if not found then raise exception 'Approved company required' using errcode='PT403';end if;
 if exists(select 1 from azzora.records r where r.company_id=e.company_id and r.payload::text ~ '"(mode|dataClass|dataMode)"[[:space:]]*:[[:space:]]*"(fictional-staging|synthetic|fictional)"') then raise exception 'Fictional data detected' using errcode='PT503';end if;
 return jsonb_build_object('schemaVersion',1,'contractVersion','azzora-canonical-production-v1','projectRef',e.project_ref,'companyId',e.company_id,'environment','production','region',e.region,'vercelProjectId',e.vercel_project_id,'configurationApprovalId',e.configuration_approval_id,'financialPostingEnabled',false,'realDocumentProcessingEnabled',false,'fictionalData',false,'privateStorageBucket',e.storage_bucket,'backendCommandsInstalled',not exists(select 1 from (values ('public.azzora_production_company_read(text,text)'),('public.azzora_production_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'),('public.azzora_production_company_people(text)'),('public.azzora_production_auth_grant(uuid)'),('public.azzora_production_auth_actor(text)'),('public.azzora_production_auth_rate(text)'),('public.azzora_production_auth_pending_put(text,uuid,uuid,text,text)'),('public.azzora_production_auth_pending_get(text)'),('public.azzora_production_auth_pending_delete(text)'),('public.azzora_production_auth_session_put(text,text,uuid,uuid,uuid,text,text,text)'),('public.azzora_production_auth_session_get(text)'),('public.azzora_production_auth_session_revoke(text)'),('public.azzora_production_auth_session_touch(text)'),('public.azzora_production_auth_tokens_update(text,integer,text)')) required(signature) where to_regprocedure(required.signature) is null),'allowedOrigins',to_jsonb(e.allowed_origins));
end $$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'azzora_production_%' or p.proname='azzora_runtime_identity') loop
 execute format('revoke all on function %s from public,anon,authenticated,azzora_api',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;
commit;
