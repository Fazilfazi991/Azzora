-- Owner-only provenance capture. No auth.users, credentials, MFA or session rows.
-- Called only by the trusted service BFF and encrypted before leaving it.
begin;
create function public.azzora_production_owner_backup(p_session_hash text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb; c uuid; v bigint; result jsonb;
begin
 a:=public.azzora_production_auth_actor(p_session_hash);
 if a->>'role'<>'owner_admin' or a->>'assurance'<>'aal2' or a->>'workspace'<>'manager' or not(a->'capabilities' ? 'access.manage') then
  raise exception 'Owner MFA required' using errcode='PT403';
 end if;
 c:=(a->>'companyId')::uuid;
 select version into v from azzora.companies where id=c and data_mode='production';
 if not found then raise exception 'Production company required' using errcode='PT403'; end if;
 select jsonb_build_object(
  'version',v,'companyId',c,'data',azzora.production_canonical_data(c),
  'provenance',jsonb_build_object(
   'memberships',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'role',m.role,'active',m.active,'financeAccess',m.finance_access,'workspaces',m.workspaces,'capabilities',m.capabilities) order by m.user_id) from azzora.memberships m where m.company_id=c),'[]'::jsonb),
   'assignments',coalesce((select jsonb_agg(to_jsonb(x)-'company_id' order by x.user_id,x.project_id) from azzora.project_assignments x where x.company_id=c),'[]'::jsonb),
   'journals',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'actorId',j.actor_id) order by j.id) from azzora.journals j where j.company_id=c),'[]'::jsonb),
   'snapshots',coalesce((select jsonb_agg(jsonb_build_object('entityType',s.entity_type,'entityId',s.entity_id,'revision',s.revision,'capturedBy',s.captured_by,'capturedAt',s.captured_at) order by s.entity_type,s.entity_id,s.revision) from azzora.snapshots s where s.company_id=c),'[]'::jsonb),
   'auditEvents',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text,'actorId',e.actor_id,'action',e.action,'entityType',e.entity_type,'entityId',case when e.entity_type='session' or e.action like 'session.%' then '[redacted]' else e.entity_id end,'requestId',case when e.entity_type='session' or e.action like 'session.%' or e.action like 'recovery.%' then '[redacted]' else e.request_id end,'recordedAt',e.recorded_at,'metadata',e.metadata) order by e.id) from azzora.audit_events e where e.company_id=c),'[]'::jsonb),
   'commandReceipts',coalesce((select jsonb_agg(jsonb_build_object('idempotencyKey',r.idempotency_key,'requestSha256',r.request_sha256,'actorId',r.actor_id,'result',r.result,'createdAt',r.created_at) order by r.idempotency_key) from azzora.command_receipts r where r.company_id=c),'[]'::jsonb)
  )) into result;
 return result;
end $$;
revoke all on function public.azzora_production_owner_backup(text) from public,anon,authenticated,azzora_api;
grant execute on function public.azzora_production_owner_backup(text) to service_role;
commit;
