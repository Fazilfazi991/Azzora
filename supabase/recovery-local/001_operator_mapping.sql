-- Isolated fictional recovery target only. Never apply to hosted staging or production.
begin;
do $$ begin
 if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database'; end if;
 perform azzora.assert_synthetic_staging();
end $$;
create table azzora_recovery_control.approvals (
 nonce text primary key check(nonce ~ '^[a-f0-9]{64}$'), target_id uuid not null,
 company_id uuid not null, operator_id uuid not null, archive_sha256 text not null check(archive_sha256 ~ '^[a-f0-9]{64}$'),
 approval_sha256 text not null check(approval_sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now()
);
create table azzora_recovery_control.identity_mappings (
 company_id uuid not null, original_user_id uuid not null, new_user_id uuid not null,
 nonce text not null references azzora_recovery_control.approvals(nonce),
 archived_role text not null, archived_finance_access boolean not null,
 archived_workspaces text[] not null, archived_capabilities text[] not null,
 primary key(company_id,original_user_id), unique(company_id,new_user_id), check(original_user_id<>new_user_id)
);
revoke all on azzora_recovery_control.approvals,azzora_recovery_control.identity_mappings from public,anon,authenticated,service_role,azzora_api;
create function azzora_recovery_control.apply_mappings(p_context text,p_seal text)
returns void language plpgsql set search_path='' as $$
declare map jsonb; member jsonb; original uuid; replacement uuid; ctx jsonb; authority azzora_recovery_control.authority;
 p_target uuid; p_company uuid; p_operator uuid; p_provider_session uuid; p_nonce text; p_archive_sha text; p_approval_sha text;
 p_version bigint; p_data jsonb; p_members jsonb; p_mappings jsonb; p_token_expires timestamptz; p_mfa_at timestamptz;
begin
 if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database'; end if;
 perform azzora.assert_synthetic_staging();
 ctx:=p_context::jsonb;
 p_target:=(ctx->>'targetId')::uuid; p_company:=(ctx->>'companyId')::uuid; p_operator:=(ctx->>'operatorId')::uuid;
 p_provider_session:=(ctx->>'sessionId')::uuid; p_nonce:=ctx->>'nonce'; p_archive_sha:=ctx->>'archiveSha256'; p_approval_sha:=ctx->>'approvalDigest';
 p_version:=(ctx->>'version')::bigint; p_data:=ctx->'data'; p_members:=ctx->'memberships'; p_mappings:=ctx->'mappings';
 p_token_expires:=to_timestamp((ctx->>'tokenExpires')::bigint); p_mfa_at:=to_timestamp((ctx->>'mfaTimestamp')::bigint);
 select * into authority from azzora_recovery_control.authority a where a.target_id=p_target and a.operator_id=p_operator and a.active for update;
 if not found or authority.seal_key is null or octet_length(authority.seal_key)<>32 or p_seal is null or p_seal !~ '^[a-f0-9]{64}$' or
    encode(extensions.hmac(convert_to(p_context,'utf8'),authority.seal_key,'sha256'),'hex')<>p_seal then raise exception 'Untrusted recovery approval context'; end if;
 if ctx->'binding' is null or ctx->'binding'->>'authContainerId' is distinct from authority.auth_container_id or ctx->'binding'->>'dbContainerId' is distinct from authority.db_container_id or ctx->'binding'->>'storageContainerId' is distinct from authority.storage_container_id or ctx->'binding'->>'authPort' is distinct from authority.auth_port or ctx->'binding'->>'dbPort' is distinct from authority.db_port or ctx->'binding'->>'storagePort' is distinct from authority.storage_port or ctx->'binding'->>'database' is distinct from authority.database_name or authority.database_name is distinct from current_database() or ctx->'binding'->>'dbLoopbackOnly' is distinct from 'true' then raise exception 'Recovery target changed';end if;
 if p_token_expires is null or p_mfa_at is null or p_token_expires<=now() or p_mfa_at>now() or p_mfa_at<now()-interval '15 minutes' then raise exception 'Recovery operator assurance expired'; end if;
 perform 1 from auth.sessions s where s.id=p_provider_session and s.user_id=p_operator and s.aal::text='aal2' and (s.not_after is null or s.not_after>now()) for update;
 if not found then raise exception 'Recovery operator session expired'; end if;
 perform 1 from auth.mfa_factors f where f.user_id=p_operator and f.status::text='verified' and f.factor_type::text='totp' for update;
 if not found then raise exception 'Recovery operator MFA revoked'; end if;
 perform 1 from azzora.companies where id=p_company and data_mode='fictional-staging' and version=p_version for update;
 if not found or azzora.staging_canonical_data(p_company)<>p_data then raise exception 'Restored company differs from authenticated archive'; end if;
 if p_data is null or p_members is null or p_mappings is null or jsonb_typeof(p_members)<>'array' or jsonb_typeof(p_mappings)<>'array' or jsonb_array_length(p_mappings)=0 then raise exception 'Explicit mappings required'; end if;
 insert into azzora_recovery_control.approvals(nonce,target_id,company_id,operator_id,archive_sha256,approval_sha256)
 values(p_nonce,p_target,p_company,p_operator,p_archive_sha,p_approval_sha);
 for map in select value from jsonb_array_elements(p_mappings) loop
  original:=(map->>'originalUserId')::uuid; replacement:=(map->>'newUserId')::uuid;
  if original=replacement then raise exception 'Replacement identity must be distinct'; end if;
  select value into member from jsonb_array_elements(p_members) where value->>'userId'=original::text and (value->>'active')::boolean;
  if member is null or (select count(*) from jsonb_array_elements(p_members) where value->>'userId'=original::text)<>1 then raise exception 'Mapping is not an active archived membership'; end if;
  perform 1 from auth.users u where u.id=original and u.banned_until>now()+interval '50 years' for update;
  if not found then raise exception 'Historical identity is not disabled'; end if;
  perform 1 from auth.users u where u.id=replacement and u.email_confirmed_at is not null and u.raw_app_meta_data->>'azzora_scope'='fictional-staging' and not u.is_anonymous and (u.banned_until is null or u.banned_until<now()) for update;
  if not found then raise exception 'Replacement identity requires confirmed Auth'; end if;
  perform 1 from auth.mfa_factors f where f.user_id=replacement and f.status::text='verified' and f.factor_type::text='totp' for update;
  if not found then raise exception 'Replacement identity requires MFA'; end if;
  insert into azzora_recovery_control.identity_mappings(company_id,original_user_id,new_user_id,nonce,archived_role,archived_finance_access,archived_workspaces,archived_capabilities)
  values(p_company,original,replacement,p_nonce,member->>'role',(member->>'financeAccess')::boolean,array(select jsonb_array_elements_text(member->'workspaces')),array(select jsonb_array_elements_text(member->'capabilities')));
  insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities)
  values(p_company,replacement,member->>'role',true,(member->>'financeAccess')::boolean,
   array(select jsonb_array_elements_text(member->'workspaces')),array(select jsonb_array_elements_text(member->'capabilities')));
 end loop;
exception when others then
 -- Do not expose archive contents or seals via PostgreSQL's error message/log path.
 raise exception 'Recovery mapping rejected; transaction rolled back' using errcode='P0001';
end $$;
revoke all on function azzora_recovery_control.apply_mappings(text,text) from public,anon,authenticated,service_role,azzora_api;
commit;
