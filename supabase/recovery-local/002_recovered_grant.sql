-- Isolated fictional recovery targets only. Do not apply to hosted staging or production.
begin;
do $$ begin
 if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database'; end if;
 perform azzora.assert_synthetic_staging();
 if to_regprocedure('public.staging_auth_grant_before_local_recovery(uuid)') is not null then raise exception 'Recovery grant already exists'; end if;
end $$;
alter function public.staging_auth_grant(uuid) rename to staging_auth_grant_before_local_recovery;
revoke all on function public.staging_auth_grant_before_local_recovery(uuid) from public,anon,authenticated,service_role,azzora_api;
create function public.staging_auth_grant(p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; matches integer;
begin
 perform azzora.assert_synthetic_staging();
 begin
  return public.staging_auth_grant_before_local_recovery(p_user_id);
 exception when sqlstate 'PT403' then null;
 end;
 select count(*),min(x.grant_text)::jsonb into matches,result from (
  select jsonb_build_object('userId',m.user_id,'companyId',m.company_id,'role',m.role,'email',u.email,'personId',m.user_id,'workspaces',m.workspaces,'capabilities',m.capabilities)::text grant_text
  from azzora.memberships m join azzora_recovery_control.identity_mappings map on map.company_id=m.company_id and map.new_user_id=m.user_id
  join azzora_recovery_control.approvals approval on approval.nonce=map.nonce and approval.company_id=m.company_id
  join azzora_recovery_control.authority authority on authority.target_id=approval.target_id and authority.operator_id=approval.operator_id and authority.active
  join auth.users u on u.id=m.user_id join azzora.companies c on c.id=m.company_id
  -- The existing session path enforces AAL2 only for these roles.
  where m.user_id=p_user_id and m.active and m.role in ('owner_admin','accountant') and c.data_mode='fictional-staging'
   and exists(select 1 from azzora_recovery_control.owner_confirmations confirmation where confirmation.target_id=approval.target_id and confirmation.company_id=approval.company_id and confirmation.operator_id=approval.operator_id and confirmation.archive_sha256=approval.archive_sha256 and confirmation.approval_sha256=approval.approval_sha256)
   and m.role=map.archived_role and m.finance_access=map.archived_finance_access and m.workspaces=map.archived_workspaces and m.capabilities=map.archived_capabilities
   and u.email_confirmed_at is not null and u.raw_app_meta_data->>'azzora_scope'='fictional-staging' and not u.is_anonymous and (u.banned_until is null or u.banned_until<now())
   and exists(select 1 from auth.users old where old.id=map.original_user_id and old.banned_until>now()+interval '50 years')
   -- The grant permits starting MFA enrollment only; the existing session path
   -- independently requires a verified TOTP factor and AAL2 for both roles.
 ) x;
 if matches<>1 then raise exception 'Staging membership denied' using errcode='PT403'; end if;
 return result;
end $$;
revoke all on function public.staging_auth_grant(uuid) from public,anon,authenticated,azzora_api;
grant execute on function public.staging_auth_grant(uuid) to service_role;
commit;
