-- Manual Owner-assisted recovery of the four fictional staging identities only.
-- No SMTP/invitation settings, production account, password or managed Auth row is changed here.
begin;
create table azzora.recovery_flows (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('handoff','pending','verified')),
 parent_hash text unique references azzora.recovery_flows(token_hash),
 owner_session_hash text not null references azzora.sessions(token_hash),
 owner_id uuid not null references auth.users(id), user_id uuid not null references auth.users(id),
 company_id uuid not null references azzora.companies(id), workspace text,
 provider_session_id uuid,
 ciphertext text not null check(length(ciphertext)<32768),
 attempts integer not null default 0,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 consumed_at timestamptz, completed_at timestamptz,
 check(workspace is null or workspace in ('manager','accountant'))
);
alter table azzora.recovery_flows enable row level security;
revoke all on azzora.recovery_flows from public,anon,authenticated,azzora_api;

create function public.staging_auth_recovery_target(p_owner_hash text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_actor jsonb; target_id uuid; target_actor jsonb;
begin
 owner_actor:=public.staging_auth_actor(p_owner_hash);
 if owner_actor->>'role'<>'owner_admin' or owner_actor->>'assurance'<>'aal2'
   or not(owner_actor->'capabilities' ? 'access.manage')
 then raise exception 'Recovery access denied' using errcode='PT403'; end if;
 if p_email not in ('owner@staging.azzora.test','manager@staging.azzora.test','accountant@staging.azzora.test','engineer@staging.azzora.test')
 then raise exception 'Recovery access denied' using errcode='PT403'; end if;
 select id into target_id from auth.users where email=p_email and email_confirmed_at is not null
  and raw_app_meta_data->>'azzora_scope'='fictional-staging';
 if target_id is null then raise exception 'Recovery access denied' using errcode='PT403'; end if;
 target_actor:=public.staging_auth_grant(target_id);
 if target_actor->>'companyId'<>owner_actor->>'companyId' then
  raise exception 'Recovery access denied' using errcode='PT403'; end if;
 return target_actor;
end $$;

create function public.staging_auth_recovery_issue(p_owner_hash text,p_email text,p_code_hash text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare o jsonb; t jsonb;
begin
 o:=public.staging_auth_actor(p_owner_hash);t:=public.staging_auth_recovery_target(p_owner_hash,p_email);
 perform pg_advisory_xact_lock(hashtextextended(o->>'userId',0));
 -- Rolling-hour quota is serialized across concurrent issuance requests.
 if (select count(*) from azzora.recovery_flows where kind='handoff' and owner_id=(o->>'userId')::uuid
  and created_at>now()-interval '1 hour')>=5
 then raise exception 'Recovery issuance limit reached' using errcode='PT429'; end if;
 insert into azzora.recovery_flows(token_hash,kind,owner_session_hash,owner_id,user_id,company_id,ciphertext,expires_at)
 values(p_code_hash,'handoff',p_owner_hash,(o->>'userId')::uuid,(t->>'userId')::uuid,(t->>'companyId')::uuid,p_ciphertext,now()+interval '10 minutes');
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
 values((t->>'companyId')::uuid,(o->>'userId')::uuid,'recovery.issued','identity',t->>'userId',p_code_hash,'{"mode":"manual-fictional-staging","emailSent":false}');
end $$;

create function public.staging_auth_recovery_take(p_code_hash text,p_workspace text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r azzora.recovery_flows; t jsonb;
begin
 perform azzora.assert_synthetic_staging();
 select * into r from azzora.recovery_flows where token_hash=p_code_hash and kind='handoff'
  and consumed_at is null and expires_at>now() for update;
 if not found then raise exception 'Recovery code invalid or expired' using errcode='PT401'; end if;
 perform public.staging_auth_recovery_target(r.owner_session_hash,(select email from auth.users where id=r.user_id));
 t:=public.staging_auth_grant(r.user_id);
 if not(t->'workspaces' ? p_workspace) then raise exception 'Recovery workspace denied' using errcode='PT403'; end if;
 update azzora.recovery_flows set consumed_at=now(),workspace=p_workspace where token_hash=p_code_hash;
 return jsonb_build_object('ciphertext',r.ciphertext,'userId',r.user_id,'companyId',r.company_id,'role',t->>'role');
end $$;

create function public.staging_auth_recovery_pending_put(p_parent_hash text,p_hash text,p_provider_session_id uuid,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare r azzora.recovery_flows; t jsonb;
begin
 perform azzora.assert_synthetic_staging();
 select * into r from azzora.recovery_flows where token_hash=p_parent_hash and kind='handoff'
  and consumed_at is not null and expires_at>now();
 if not found then raise exception 'Recovery exchange invalid' using errcode='PT401'; end if;
 t:=public.staging_auth_grant(r.user_id);
 if not exists(select 1 from auth.sessions where id=p_provider_session_id and user_id=r.user_id)
 then raise exception 'Recovery provider session invalid' using errcode='PT401'; end if;
 insert into azzora.recovery_flows(token_hash,kind,parent_hash,owner_session_hash,owner_id,user_id,company_id,workspace,provider_session_id,ciphertext,expires_at)
 values(p_hash,case when t->>'role' in ('owner_admin','accountant') then 'pending' else 'verified' end,
 p_parent_hash,r.owner_session_hash,r.owner_id,r.user_id,r.company_id,r.workspace,p_provider_session_id,p_ciphertext,now()+interval '5 minutes');
end $$;

create function public.staging_auth_recovery_pending_get(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r azzora.recovery_flows; t jsonb;
begin
 perform azzora.assert_synthetic_staging();
 update azzora.recovery_flows set attempts=attempts+1 where token_hash=p_hash and kind in ('pending','verified')
  and consumed_at is null and expires_at>now() and attempts<10 returning * into r;
 if not found then raise exception 'Recovery session invalid or expired' using errcode='PT401'; end if;
 perform public.staging_auth_recovery_target(r.owner_session_hash,(select email from auth.users where id=r.user_id));
 t:=public.staging_auth_grant(r.user_id);
 if not exists(select 1 from auth.sessions ps where ps.id=r.provider_session_id and ps.user_id=r.user_id
  and (nullif(to_jsonb(ps)->>'not_after','')::timestamptz is null or nullif(to_jsonb(ps)->>'not_after','')::timestamptz>now()))
 then raise exception 'Recovery provider session revoked' using errcode='PT401'; end if;
 return jsonb_build_object('ciphertext',r.ciphertext,'userId',r.user_id,'companyId',r.company_id,'role',t->>'role',
  'kind',r.kind,'workspace',r.workspace,'providerSessionId',r.provider_session_id);
end $$;

create function public.staging_auth_recovery_mfa(p_hash text,p_ciphertext text) returns void
language plpgsql security definer set search_path='' as $$
declare r azzora.recovery_flows;
begin
 perform public.staging_auth_recovery_pending_get(p_hash);
 select * into r from azzora.recovery_flows where token_hash=p_hash;
 if not exists(select 1 from auth.sessions ps where ps.id=r.provider_session_id and ps.user_id=r.user_id and to_jsonb(ps)->>'aal'='aal2')
 or not exists(select 1 from auth.mfa_factors f where f.user_id=r.user_id and f.status::text='verified' and f.factor_type::text='totp')
 then raise exception 'Current MFA is required' using errcode='PT403'; end if;
 update azzora.recovery_flows set kind='verified',ciphertext=p_ciphertext where token_hash=p_hash and consumed_at is null;
end $$;

create function public.staging_auth_recovery_claim(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r azzora.recovery_flows; t jsonb; answer jsonb;
begin
 answer:=public.staging_auth_recovery_pending_get(p_hash);
 select * into r from azzora.recovery_flows where token_hash=p_hash and consumed_at is null and kind='verified' for update;
 if not found then raise exception 'Verified recovery required' using errcode='PT403'; end if;
 t:=public.staging_auth_grant(r.user_id);
 if t->>'role' in ('owner_admin','accountant') and (
  not exists(select 1 from auth.sessions ps where ps.id=r.provider_session_id and ps.user_id=r.user_id and to_jsonb(ps)->>'aal'='aal2')
  or not exists(select 1 from auth.mfa_factors f where f.user_id=r.user_id and f.status::text='verified' and f.factor_type::text='totp'))
 then raise exception 'Current MFA is required' using errcode='PT403'; end if;
 update azzora.recovery_flows set consumed_at=now() where token_hash=p_hash;
 return answer;
end $$;

create function public.staging_auth_recovery_complete(p_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare r azzora.recovery_flows;
begin
 perform azzora.assert_synthetic_staging();
 update azzora.recovery_flows set completed_at=now() where token_hash=p_hash and kind='verified'
  and consumed_at>now()-interval '1 minute' and completed_at is null returning * into r;
 if not found then raise exception 'Recovery completion unavailable' using errcode='PT401'; end if;
 update azzora.sessions set revoked_at=coalesce(revoked_at,now()) where user_id=r.user_id and company_id=r.company_id;
 update azzora.auth_flows set revoked_at=coalesce(revoked_at,now()) where user_id=r.user_id and company_id=r.company_id;
 update azzora.recovery_flows set consumed_at=coalesce(consumed_at,now()) where user_id=r.user_id and company_id=r.company_id;
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
 values(r.company_id,r.owner_id,'recovery.completed','identity',r.user_id::text,p_hash,'{"mode":"manual-fictional-staging","allAppSessionsRevoked":true}');
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'staging_auth_recovery_%' loop
 execute format('revoke all on function %s from public,anon,authenticated,azzora_api',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
