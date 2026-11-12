-- Isolated fictional recovery target only. Never apply to hosted or production.
begin;
do $$ begin if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database'; end if; perform azzora.assert_synthetic_staging(); end $$;
create table azzora_recovery_control.owner_confirmations(nonce text primary key check(nonce ~ '^[a-f0-9]{64}$'),target_id uuid not null,company_id uuid not null,operator_id uuid not null,archive_sha256 text not null,approval_sha256 text not null,confirmed_at timestamptz not null default now());
revoke all on azzora_recovery_control.owner_confirmations from public,anon,authenticated,service_role,azzora_api;
create function azzora_recovery_control.confirm_existing(p_context text,p_seal text) returns void language plpgsql set search_path='' as $$
declare c jsonb; a azzora_recovery_control.authority; expected jsonb;
begin
 if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database';end if;perform azzora.assert_synthetic_staging();
 c:=p_context::jsonb;
 select * into a from azzora_recovery_control.authority x where x.target_id=(c->>'targetId')::uuid and x.operator_id=(c->>'operatorId')::uuid and x.active for update;
 if not found or a.seal_key is null or octet_length(a.seal_key)<>32 or p_seal is null or p_seal !~ '^[a-f0-9]{64}$' or encode(extensions.hmac(convert_to(p_context,'utf8'),a.seal_key,'sha256'),'hex')<>p_seal then raise exception 'Untrusted confirmation';end if;
 if c->'binding' is null or c->'binding'->>'authContainerId' is distinct from a.auth_container_id or c->'binding'->>'dbContainerId' is distinct from a.db_container_id or c->'binding'->>'storageContainerId' is distinct from a.storage_container_id or c->'binding'->>'authPort' is distinct from a.auth_port or c->'binding'->>'dbPort' is distinct from a.db_port or c->'binding'->>'storagePort' is distinct from a.storage_port or c->'binding'->>'database' is distinct from a.database_name or a.database_name is distinct from current_database() or c->'binding'->>'dbLoopbackOnly' is distinct from 'true' then raise exception 'Recovery target changed';end if;
 if c->>'tokenExpires' is null or c->>'mfaTimestamp' is null or (c->>'tokenExpires')::bigint<=extract(epoch from now()) or (c->>'mfaTimestamp')::bigint>extract(epoch from now()) or (c->>'mfaTimestamp')::bigint<extract(epoch from now())-900 then raise exception 'Expired confirmation';end if;
 perform 1 from auth.sessions s where s.id=(c->>'sessionId')::uuid and s.user_id=a.operator_id and s.aal::text='aal2' and (s.not_after is null or s.not_after>now()) for update;if not found then raise exception 'Revoked session';end if;
 perform 1 from auth.mfa_factors f where f.user_id=a.operator_id and f.status::text='verified' and f.factor_type::text='totp' for update;if not found then raise exception 'Revoked factor';end if;
 select jsonb_agg(jsonb_build_object('originalUserId',m.original_user_id,'newUserId',m.new_user_id) order by m.original_user_id) into expected from azzora_recovery_control.approvals b join azzora_recovery_control.identity_mappings m on m.nonce=b.nonce where b.target_id=a.target_id and b.operator_id=a.operator_id and b.company_id=(c->>'companyId')::uuid and b.archive_sha256=c->>'archiveSha256' and b.approval_sha256=c->>'priorApprovalDigest';
 if expected is null or expected<>c->'mappings' then raise exception 'Previously restored mappings differ';end if;
 insert into azzora_recovery_control.owner_confirmations(nonce,target_id,company_id,operator_id,archive_sha256,approval_sha256) values(c->>'nonce',a.target_id,(c->>'companyId')::uuid,a.operator_id,c->>'archiveSha256',c->>'priorApprovalDigest');
exception when others then raise exception 'Recovery confirmation rejected; transaction rolled back' using errcode='P0001';end $$;
revoke all on function azzora_recovery_control.confirm_existing(text,text) from public,anon,authenticated,service_role,azzora_api;
commit;
