-- Isolated fictional staging identity boundary. No live application or real posting.
begin;
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

create function azzora.assert_synthetic_staging() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from azzora.environment_config where project_ref='hkhomrrvxtcxnxvdlkoh'
  and environment='synthetic-staging' and not real_financial_posting_enabled and not real_document_processing_enabled)
 then raise exception 'Fictional staging is not enabled' using errcode='PT403'; end if;
end $$;
revoke all on function azzora.assert_synthetic_staging() from public,anon,authenticated,azzora_api;

create function public.staging_auth_rate(p_key_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; b bigint:=floor(extract(epoch from clock_timestamp())/300);
begin
 perform azzora.assert_synthetic_staging();
 insert into azzora.auth_login_attempts(key_hash,bucket,attempts) values(p_key_hash,b,1)
 on conflict(key_hash,bucket) do update set attempts=azzora.auth_login_attempts.attempts+1 returning attempts into n;
 return n<=5;
end $$;

create function public.staging_auth_grant(p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform azzora.assert_synthetic_staging();
 select jsonb_build_object('userId',m.user_id,'companyId',m.company_id,'role',m.role,
 'email',u.email,'personId',m.user_id,'workspaces',m.workspaces,'capabilities',m.capabilities)
 into result from azzora.memberships m join auth.users u on u.id=m.user_id join azzora.companies c on c.id=m.company_id
 where m.user_id=p_user_id and m.company_id='11111111-1111-4111-8111-111111111111'::uuid
 and c.data_mode='fictional-staging' and m.active and u.email in
 ('owner@staging.azzora.test','manager@staging.azzora.test','accountant@staging.azzora.test','engineer@staging.azzora.test')
 and u.email_confirmed_at is not null and u.raw_app_meta_data->>'azzora_scope'='fictional-staging'
 and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
 and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or nullif(to_jsonb(u)->>'banned_until','')::timestamptz<now());
 if result is null then raise exception 'Staging membership denied' using errcode='PT403'; end if;
 return result;
end $$;

create function public.staging_auth_pending_put(p_hash text,p_user_id uuid,p_company_id uuid,p_workspace text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare g jsonb;
begin
 g:=public.staging_auth_grant(p_user_id);
 if g->>'companyId'<>p_company_id::text or not (g->'workspaces' ? p_workspace) then raise exception 'Workspace denied' using errcode='PT403'; end if;
 insert into azzora.auth_flows(token_hash,kind,user_id,company_id,workspace,ciphertext,expires_at)
 values(p_hash,'pending',p_user_id,p_company_id,p_workspace,p_ciphertext,now()+interval '5 minutes');
end $$;

create function public.staging_auth_pending_get(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r azzora.auth_flows; g jsonb;
begin
 perform azzora.assert_synthetic_staging();
 update azzora.auth_flows set attempts=attempts+1 where token_hash=p_hash and kind='pending'
 and revoked_at is null and expires_at>now() and attempts<5 returning * into r;
 if not found then raise exception 'Pending sign-in expired' using errcode='PT401'; end if;
 g:=public.staging_auth_grant(r.user_id);
 if not (g->'workspaces' ? r.workspace) then raise exception 'Workspace denied' using errcode='PT403'; end if;
 return jsonb_build_object('ciphertext',r.ciphertext,'userId',r.user_id,'companyId',r.company_id,'workspace',r.workspace);
end $$;

create function public.staging_auth_pending_delete(p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin perform azzora.assert_synthetic_staging(); update azzora.auth_flows set revoked_at=now() where token_hash=p_hash and kind='pending'; end $$;

create function public.staging_auth_session_put(p_hash text,p_csrf_hash text,p_user_id uuid,p_provider_session_id uuid,p_company_id uuid,p_workspace text,p_assurance text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare g jsonb;
begin
 g:=public.staging_auth_grant(p_user_id);
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

create function public.staging_auth_actor(p_session_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 'providerSessionId',s.provider_session_id,'projectIds',coalesce((select jsonb_agg(a.project_id) from azzora.project_assignments a
 where a.company_id=s.company_id and a.user_id=s.user_id and a.active),'[]'::jsonb));
end $$;

create function public.staging_auth_session_get(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor jsonb; result jsonb;
begin
 actor:=public.staging_auth_actor(p_hash);
 select jsonb_build_object('actor',actor,'ciphertext',f.ciphertext,'version',f.version) into result
 from azzora.auth_flows f where f.token_hash=p_hash and f.kind='active' and f.revoked_at is null and f.expires_at>now();
 if result is null then raise exception 'Session token storage unavailable' using errcode='PT403'; end if;
 return result;
end $$;

create function public.staging_auth_session_touch(p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.staging_auth_actor(p_hash);
 update azzora.sessions set last_seen_at=now() where token_hash=p_hash and revoked_at is null;
end $$;

create function public.staging_auth_tokens_update(p_hash text,p_expected_version integer,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.staging_auth_actor(p_hash);
 update azzora.auth_flows set ciphertext=p_ciphertext,version=version+1
 where token_hash=p_hash and version=p_expected_version and kind='active' and revoked_at is null;
 if not found then raise exception 'Session refresh conflict' using errcode='40001'; end if;
end $$;

create function public.staging_auth_session_revoke(p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare s azzora.sessions;
begin
 perform azzora.assert_synthetic_staging();
 update azzora.sessions set revoked_at=coalesce(revoked_at,now()) where token_hash=p_hash returning * into s;
 update azzora.auth_flows set revoked_at=coalesce(revoked_at,now()) where token_hash=p_hash;
 if s.user_id is not null then
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id)
 values(s.company_id,s.user_id,'session.revoked','session',s.provider_session_id::text,p_hash);
 end if;
end $$;

-- Fixture bootstrap is narrowly bounded to four known fictional provider identities.
create function public.staging_auth_fixture_membership(p_user_id uuid,p_company_id uuid,p_role text)
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
 insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities)
 values(p_company_id,p_user_id,p_role,true,p_role in ('owner_admin','accountant'),spaces,caps)
 on conflict(company_id,user_id) do nothing;
 if not exists(select 1 from azzora.memberships where company_id=p_company_id and user_id=p_user_id
  and role=p_role and active and finance_access=(p_role in ('owner_admin','accountant'))
  and workspaces=spaces and capabilities=caps)
 then raise exception 'Existing staging membership differs; it was not overwritten' using errcode='PT403'; end if;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'staging_auth_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,azzora_api',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
